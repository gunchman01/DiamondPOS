import assert from 'node:assert/strict'
import path from 'node:path'
import crypto from 'node:crypto'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/server/migrations'
import { openDatabase } from '../src/main/server/db'
import { createApp, createSale, readSettings } from '../src/main/server'
import { customerAccount, receiveAccountPayment, invoiceDue } from '../src/main/server/accounts'
import { reviewVoid, voidSale } from '../src/main/server/voids'
import { returnableSale } from '../src/main/server/returns'
import { getQbConfig, saveQbConfig, saveQbLists } from '../src/main/server/quickbooks/store'
import { transactionQueue } from '../src/main/server/quickbooks/queue'
import { individualSummaries } from '../src/main/server/quickbooks/summary'
import { child, childrenNamed, esc, parseXml, text } from '../src/main/server/quickbooks/xml'
import { receiptHtml } from '../src/renderer/src/receipt'
import { operationsStatus } from '../src/main/server/operations'

type Check = (name: string, fn: () => void) => void
export async function testAccountsStock(check: Check, dir: string) {
  const legacyFile = path.join(dir, 'reserve-v27.db')
  let legacy = new Database(legacyFile)
  legacy.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT,applied_at TEXT DEFAULT CURRENT_TIMESTAMP)')
  for (const m of migrations.filter((m) => m.version <= 27)) {
    legacy.exec(m.up)
    legacy.prepare('INSERT INTO schema_migrations(version,name) VALUES (?,?)').run(m.version, m.name)
  }
  const lc = Number(legacy.prepare("INSERT INTO customers(first_name,last_name) VALUES ('Legacy','Stock')").run().lastInsertRowid)
  const lu = Number(legacy.prepare("INSERT INTO customer_units(customer_id,model) VALUES (?,'Unit')").run(lc).lastInsertRowid)
  for (const [status, qty, taken] of [
    ['needs_estimate', 3, 0],
    ['approved', 4, 4],
    ['not_fixed', 2, 0],
    ['closed', 2, 2]
  ] as const) {
    const id = Number(
      legacy.prepare('INSERT INTO work_orders(customer_id,unit_id,status) VALUES (?,?,?)').run(lc, lu, status).lastInsertRowid
    )
    legacy
      .prepare("INSERT INTO work_order_lines(work_order_id,kind,product_id,description,qty,stock_taken) VALUES (?,'part',1,'Old part',?,?)")
      .run(id, qty, taken)
  }
  legacy.prepare("INSERT INTO held_sales(items_json,till_name) VALUES (?,'Legacy')").run(JSON.stringify([{ productId: 1, qty: 2 }]))
  legacy.prepare('UPDATE products SET on_hand=20 WHERE id=1').run()
  legacy.close()
  legacy = openDatabase(legacyFile)
  check('v28 migration reserves existing holds and unallocated open work-order parts exactly once', () => {
    assert.equal(legacy.prepare('SELECT on_hand FROM products WHERE id=1').get().on_hand, 15)
    assert.equal(legacy.prepare('SELECT qty FROM held_stock').get().qty, 2)
    assert.equal(
      legacy
        .prepare("SELECT stock_taken FROM work_order_lines l JOIN work_orders w ON w.id=l.work_order_id WHERE w.status='needs_estimate'")
        .get().stock_taken,
      3
    )
    assert.equal(
      legacy
        .prepare("SELECT stock_taken FROM work_order_lines l JOIN work_orders w ON w.id=l.work_order_id WHERE w.status='approved'")
        .get().stock_taken,
      4
    )
    assert.equal(legacy.prepare('SELECT on_account_enabled FROM customers WHERE id=?').get(lc).on_account_enabled, 0)
  })
  legacy.close()
  legacy = openDatabase(legacyFile)
  check('restarting after reservation upgrade does not reserve stock again', () =>
    assert.equal(legacy.prepare('SELECT on_hand FROM products WHERE id=1').get().on_hand, 15)
  )
  legacy.close()
  const file = path.join(dir, 'accounts-stock.db'),
    db = openDatabase(file)
  db.prepare("UPDATE settings SET value='0' WHERE key='tax_rate'").run()
  db.prepare('UPDATE products SET price_cents=100,taxable=0,on_hand=100 WHERE id=1').run()
  const stockCustomer = Number(db.prepare("INSERT INTO customers(first_name,last_name) VALUES ('Stock','Customer')").run().lastInsertRowid)
  const unit = Number(
    db.prepare("INSERT INTO customer_units(customer_id,model) VALUES (?,'Stock unit')").run(stockCustomer).lastInsertRowid
  )
  const customer = Number(
    db.prepare("INSERT INTO customers(first_name,last_name,on_account_enabled,account_terms_days) VALUES ('Account','Customer',1,30)").run()
      .lastInsertRowid
  )
  const app = createApp(db, { dbFile: file, apiKey: 'test', port: 0, appVersion: '0.3.37' }),
    server = app.listen(0, '127.0.0.1')
  await new Promise<void>((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${(server.address() as any).port}`,
    headers = { 'X-Api-Key': 'test', 'Content-Type': 'application/json' }
  const call = async (url: string, method = 'GET', body?: unknown) => {
    const r = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: r.status, data: await r.json() }
  }
  const req = (extra: any = {}) => ({
    requestId: crypto.randomUUID(),
    tillName: 'Account test till',
    items: [{ productId: 1, qty: 2 }],
    payments: [{ method: 'cash', amountCents: 200 }],
    ...extra
  })
  try {
    const holdBody = {
        requestId: crypto.randomUUID(),
        customerId: stockCustomer,
        items: [{ productId: 1, qty: 2 }],
        tillName: 'Hold till'
      },
      held = await call('/api/held', 'POST', holdBody),
      again = await call('/api/held', 'POST', holdBody)
    check('placing a sale on hold deducts stock, with idempotent lost-response recovery', () => {
      assert.equal(held.status, 201)
      assert.equal(again.data.id, held.data.id)
      assert.equal(db.prepare('SELECT on_hand FROM products WHERE id=1').get().on_hand, 98)
    })
    const edited = { ...holdBody, items: [{ productId: 1, qty: 3 }] }
    await call(`/api/held/${held.data.id}`, 'PUT', edited)
    await call(`/api/held/${held.data.id}`, 'PUT', edited)
    check('editing a held quantity adjusts only the inventory difference', () =>
      assert.equal(db.prepare('SELECT on_hand FROM products WHERE id=1').get().on_hand, 97)
    )
    const checkout = req({ heldId: held.data.id, items: [{ productId: 1, qty: 4 }], payments: [{ method: 'cash', amountCents: 400 }] }),
      heldSale = createSale(db, checkout)
    createSale(db, checkout)
    check('recalled sale checkout accounts for changed quantities without double deduction', () => {
      assert.equal(db.prepare('SELECT on_hand FROM products WHERE id=1').get().on_hand, 96)
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM held_stock').get().n, 0)
    })
    assert.throws(() => createSale(db, req({ heldId: held.data.id })), /already completed/)
    assert.equal(db.prepare('SELECT on_hand FROM products WHERE id=1').get().on_hand, 96)
    voidSale(db, heldSale.id, {
      reason: 'Test cancellation',
      by: 'Tester',
      till: 'Till',
      paymentNote: 'Cash returned',
      paymentConfirmed: true,
      legacyStockConfirmed: false
    })
    check('voiding a sale originally held restores the sold quantity once', () =>
      assert.equal(db.prepare('SELECT on_hand FROM products WHERE id=1').get().on_hand, 100)
    )
    const deleted = await call('/api/held', 'POST', { ...holdBody, requestId: crypto.randomUUID() })
    await call(`/api/held/${deleted.data.id}`, 'DELETE')
    const deletedAgain = await call(`/api/held/${deleted.data.id}`, 'DELETE')
    check('deleting a held receipt restores inventory exactly once', () => {
      assert.equal(deletedAgain.status, 404)
      assert.equal(db.prepare('SELECT on_hand FROM products WHERE id=1').get().on_hand, 100)
    })
    const onlyHold = Number(
      db.prepare("INSERT INTO products(name,type,price_cents,on_hand) VALUES ('Hold only','inventory',100,5)").run().lastInsertRowid
    )
    const only = await call('/api/held', 'POST', { items: [{ productId: onlyHold, qty: 1 }] })
    const delProduct = await call('/api/products/delete', 'POST', { ids: [onlyHold] })
    await call(`/api/held/${only.data.id}`, 'DELETE')
    check('deleting an item still on hold deactivates it and cancellation restores its reserved stock', () => {
      assert.equal(delProduct.status, 200)
      assert.equal(db.prepare('SELECT on_hand FROM products WHERE id=?').get(onlyHold).on_hand, 5)
      assert.equal(db.prepare('SELECT active FROM products WHERE id=?').get(onlyHold).active, 0)
    })
    const work = await call('/api/workorders', 'POST', { customerId: stockCustomer, unitId: unit, problem: 'Stock test', noFee: true })
    const line = await call(`/api/workorders/${work.data.id}/lines`, 'POST', { kind: 'part', productId: 1, qty: 2, unitPriceCents: 100 })
    check('parts leave inventory when added to an initial work order', () => {
      assert.equal(line.status, 201)
      assert.equal(db.prepare('SELECT on_hand FROM products WHERE id=1').get().on_hand, 98)
      assert.equal(line.data.lines.find((l: any) => l.kind === 'part').stockTaken, 2)
    })
    const lineId = line.data.lines.find((l: any) => l.kind === 'part').id
    await call(`/api/workorders/${work.data.id}/lines/${lineId}`, 'PUT', { qty: 3 })
    await call(`/api/workorders/${work.data.id}/status`, 'POST', { status: 'waiting_customer', by: 'Test' })
    await call(`/api/workorders/${work.data.id}/status`, 'POST', { status: 'approved', by: 'Test' })
    check('quantity edits reserve only the difference and approval does not take parts twice', () =>
      assert.equal(db.prepare('SELECT on_hand FROM products WHERE id=1').get().on_hand, 97)
    )
    await call(`/api/workorders/${work.data.id}/status`, 'POST', { status: 'not_fixed', by: 'Test' })
    await call(`/api/workorders/${work.data.id}/lines/${lineId}/remove`, 'POST')
    check('declining a repair or removing its parts restores stock without double returns', () =>
      assert.equal(db.prepare('SELECT on_hand FROM products WHERE id=1').get().on_hand, 100)
    )
    const charge = req({ customerId: customer, onAccount: true, payments: [] }),
      sale = createSale(db, charge)
    const due = customerAccount(db, customer)
    check('charge to account creates one customer invoice, no cash tender and the expected balance', () => {
      assert.equal(due.balanceCents, 200)
      assert.equal(due.invoices.length, 1)
      assert.equal(sale.onAccount, true)
      assert.equal(sale.payments.length, 0)
      assert.equal(createSale(db, charge).id, sale.id)
      assert.equal(customerAccount(db, customer).invoices.length, 1)
      assert.ok(due.invoices[0].dueDate > due.invoices[0].date.slice(0, 10))
      assert.ok(receiptHtml(sale, readSettings(db), 80).includes('CHARGED TO CUSTOMER ACCOUNT'))
    })
    check('account sales require an enabled customer and cannot mix cash or create cash returns', () => {
      assert.throws(() => createSale(db, req({ onAccount: true, payments: [] })), /customer/)
      assert.throws(() => createSale(db, req({ customerId: stockCustomer, onAccount: true, payments: [] })), /approved for account/)
      assert.throws(() => createSale(db, req({ customerId: customer, onAccount: true })), /without other tenders/)
      assert.equal(returnableSale(db, sale.id, 0), null)
      assert.equal(reviewVoid(db, sale.id).allowed, false)
    })
    const payRequest = { requestId: crypto.randomUUID(), amountCents: 50, method: 'cash' as const, by: 'Test', till: 'Test' }
    const payment = receiveAccountPayment(db, customer, payRequest),
      paymentRetry = receiveAccountPayment(db, customer, payRequest)
    check('payment on account reduces debt without another sale or stock movement and retries are idempotent', () => {
      assert.equal(payment.paymentId, paymentRetry.paymentId)
      assert.equal(customerAccount(db, customer).balanceCents, 150)
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sales WHERE on_account=1').get().n, 1)
      assert.throws(() => receiveAccountPayment(db, customer, { ...payRequest, amountCents: 60 }), /different details/)
      assert.throws(
        () => receiveAccountPayment(db, customer, { ...payRequest, requestId: crypto.randomUUID(), amountCents: 1000 }),
        /exceeds/
      )
    })
    const day = db.prepare("SELECT date(created_at,'localtime') AS d FROM sales WHERE id=?").get(sale.id).d
    const daily = await call('/api/reports/daily?date=' + day)
    check('daily cash takings include account payments and exclude unpaid account charges', () => {
      assert.equal(daily.status, 200)
      assert.equal(daily.data.accountChargesCents, 200)
      assert.equal(daily.data.accountPaymentsCents, 50)
      assert.equal(daily.data.totalCents, 50)
      assert.equal(daily.data.cashCents, 50)
      assert.equal(daily.data.salesTotalCents, 200)
    })
    const cfg0 = getQbConfig(db)
    saveQbConfig(db, { enabled: true, startDate: day, defaultIncomeAccount: 'Sales', salesTaxItem: 'State Tax', refreshLists: false })
    saveQbLists(db, {
      fetchedAt: new Date().toISOString(),
      salesTaxItems: [{ name: 'State Tax', rate: 0 }],
      otherChargeItems: ['POS General', 'POS Tax Rounding']
    })
    const cfg = getQbConfig(db)
    check('account invoices are excluded from paid Sales Receipt exports and use a separate queue', () => {
      assert.ok(individualSummaries(db, day, cfg, 0, 0).every((s) => s.saleId !== sale.id))
      const q = transactionQueue(db, { ids: [sale.id] }).rows[0]
      assert.equal(q.status, 'waiting')
      assert.equal(q.eligible, false)
    })
    const remoteInvoices = new Map<string, any>(),
      remotePayments = new Map<string, any>(),
      customers = new Set<string>()
    let mockTaxRate = 0,
      invoiceAdds = 0,
      paymentAdds = 0,
      dropInvoice = false,
      dropPayment = false,
      rejectInvoice = false,
      rejectPayment = false
    const soap = async (method: string, args: Record<string, string> = {}) => {
      const r = await fetch(base + '/qbwc', {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml' },
        body: `<Envelope><Body><${method}>${Object.entries(args)
          .map(([k, v]) => `<${k}>${esc(v)}</${k}>`)
          .join('')}</${method}></Body></Envelope>`
      })
      assert.equal(r.status, 200)
      return child(child(parseXml(await r.text()), 'Body'), method + 'Response')!
    }
    const invXml = (r: any) =>
      `<InvoiceRet><TxnID>${r.id}</TxnID><CustomerRef><FullName>${esc(r.customer)}</FullName></CustomerRef><RefNumber>${r.ref}</RefNumber><Subtotal>${((r.net ?? r.total) / 100).toFixed(2)}</Subtotal><SalesTaxTotal>${((r.tax ?? 0) / 100).toFixed(2)}</SalesTaxTotal><BalanceRemaining>${(r.balance / 100).toFixed(2)}</BalanceRemaining><Memo>${esc(r.memo)}</Memo></InvoiceRet>`
    const payXml = (r: any) =>
      `<ReceivePaymentRet><TxnID>${r.id}</TxnID><CustomerRef><FullName>${esc(r.customer)}</FullName></CustomerRef><TotalAmount>${(r.amount / 100).toFixed(2)}</TotalAmount><Memo>${esc(r.memo)}</Memo>${r.applied.map((a: any) => `<AppliedToTxnRet><TxnID>${a.id}</TxnID><PaymentAmount>${(a.amount / 100).toFixed(2)}</PaymentAmount></AppliedToTxnRet>`).join('')}</ReceivePaymentRet>`
    async function sync() {
      const auth = await soap('authenticate', { strUserName: cfg.username, strPassword: cfg.password }),
        ticket = child(child(auth, 'authenticateResult'), 'string')!.text
      try {
        for (let n = 0; n < 250; n++) {
          const xml = text(await soap('sendRequestXML', { ticket }), 'sendRequestXMLResult')
          if (!xml) break
          const r = child(parseXml(xml), 'QBXMLMsgsRq')!.children[0],
            name = r.name
          let inner = '',
            code = '0'
          if (name === 'CompanyQueryRq') inner = '<CompanyRet><CompanyName>Diamond P test</CompanyName></CompanyRet>'
          else if (name === 'ItemOtherChargeAddRq') {
            inner = '<ItemOtherChargeRet><ListID>ITEM</ListID></ItemOtherChargeRet>'
          } else if (name === 'CustomerQueryRq') {
            const name = text(r, 'FullName')
            if (customers.has(name)) inner = `<CustomerRet><FullName>${esc(name)}</FullName></CustomerRet>`
            else code = '500'
          } else if (name === 'CustomerAddRq') {
            const name = text(child(r, 'CustomerAdd'), 'Name')
            customers.add(name)
            inner = `<CustomerRet><FullName>${esc(name)}</FullName></CustomerRet>`
          } else if (name === 'InvoiceQueryRq') {
            const id = text(r, 'TxnID'),
              found = id ? [...remoteInvoices.values()].find((i) => i.id === id) : remoteInvoices.get(text(r, 'RefNumber'))
            if (found) inner = invXml(found)
            else code = '500'
          } else if (name === 'InvoiceAddRq') {
            const add = child(r, 'InvoiceAdd')!,
              ref = text(add, 'RefNumber')
            assert.ok(!remoteInvoices.has(ref), 'Duplicate InvoiceAdd')
            if (rejectInvoice) code = '3170'
            else {
              const tags = add.children.map((c) => c.name)
              assert.ok(tags.indexOf('DueDate') < tags.indexOf('ItemSalesTaxRef'))
              assert.ok(tags.indexOf('Memo') < tags.indexOf('InvoiceLineAdd'))
              assert.equal(text(add, 'IsToBeEmailed'), 'false')
              const net = childrenNamed(add, 'InvoiceLineAdd').reduce((n, l) => n + Math.round(Number(text(l, 'Amount')) * 100), 0),
                taxable = childrenNamed(add, 'InvoiceLineAdd')
                  .filter((l) => text(child(l, 'SalesTaxCodeRef'), 'FullName') === cfg.taxableCode)
                  .reduce((n, l) => n + Math.round(Number(text(l, 'Amount')) * 100), 0),
                tax = Math.round(taxable * mockTaxRate),
                total = net + tax,
                row = {
                  id: 'INV' + ++invoiceAdds,
                  customer: text(child(add, 'CustomerRef'), 'FullName'),
                  ref,
                  total,
                  net,
                  tax,
                  balance: total,
                  memo: text(add, 'Memo')
                }
              assert.ok(customers.has(row.customer))
              remoteInvoices.set(ref, row)
              inner = invXml(row)
              if (dropInvoice) {
                dropInvoice = false
                return
              }
            }
          } else if (name === 'ReceivePaymentQueryRq') {
            assert.equal(text(r, 'IncludeLineItems'), 'true')
            const found = remotePayments.get(text(r, 'RefNumber'))
            if (found) inner = payXml(found)
            else code = '500'
          } else if (name === 'ReceivePaymentAddRq') {
            const add = child(r, 'ReceivePaymentAdd')!,
              ref = text(add, 'RefNumber')
            assert.ok(!remotePayments.has(ref), 'Duplicate ReceivePaymentAdd')
            if (rejectPayment) code = '3170'
            else {
              const applied = childrenNamed(add, 'AppliedToTxnAdd').map((a) => ({
                id: text(a, 'TxnID'),
                amount: Math.round(Number(text(a, 'PaymentAmount')) * 100)
              }))
              assert.equal(new Set(applied.map((a) => a.id)).size, applied.length)
              const amount = Math.round(Number(text(add, 'TotalAmount')) * 100)
              assert.equal(
                applied.reduce((n, a) => n + a.amount, 0),
                amount
              )
              for (const a of applied) {
                const inv = [...remoteInvoices.values()].find((i) => i.id === a.id)
                assert.ok(inv)
                assert.ok(inv.balance >= a.amount)
                inv.balance -= a.amount
              }
              const row = {
                id: 'PAY' + ++paymentAdds,
                customer: text(child(add, 'CustomerRef'), 'FullName'),
                amount,
                memo: text(add, 'Memo'),
                applied
              }
              remotePayments.set(ref, row)
              inner = payXml(row)
              if (dropPayment) {
                dropPayment = false
                return
              }
            }
          } else throw new Error('Unexpected account sync request ' + name)
          const response = `<QBXML><QBXMLMsgsRs><${name.replace(/Rq$/, 'Rs')} statusCode="${code}" statusMessage="${code === '0' ? 'OK' : 'Rejected'}">${inner}</${name.replace(/Rq$/, 'Rs')}></QBXMLMsgsRs></QBXML>`
          if (text(await soap('receiveResponseXML', { ticket, response }), 'receiveResponseXMLResult') === '100') break
        }
      } finally {
        await soap('closeConnection', { ticket })
      }
    }
    dropInvoice = true
    await sync()
    assert.equal(db.prepare('SELECT status FROM account_invoices WHERE sale_id=?').get(sale.id).status, 'pending')
    await sync()
    check('lost invoice response recovers the same invoice and applies the waiting account payment', () => {
      assert.equal(invoiceAdds, 1)
      assert.equal(paymentAdds, 1)
      assert.equal(db.prepare('SELECT status FROM account_invoices WHERE sale_id=?').get(sale.id).status, 'sent')
      assert.equal(db.prepare('SELECT status FROM account_payments WHERE id=?').get(payment.paymentId).status, 'sent')
      assert.equal(customerAccount(db, customer).balanceCents, 150)
      assert.equal(transactionQueue(db, { ids: [sale.id] }).rows[0].status, 'synced')
    })
    await sync()
    check('repeated account sync creates neither duplicate invoices nor duplicate payments', () => {
      assert.equal(invoiceAdds, 1)
      assert.equal(paymentAdds, 1)
    })
    const remote = remoteInvoices.get(due.invoices[0].refNumber)
    remote.balance -= 30
    await sync()
    check('a payment recorded in QuickBooks reduces the refreshed POS invoice balance', () =>
      assert.equal(customerAccount(db, customer).balanceCents, 120)
    )
    const card = receiveAccountPayment(db, customer, {
      requestId: crypto.randomUUID(),
      amountCents: 40,
      method: 'card',
      cardBrand: 'visa',
      by: 'Test',
      till: 'Test'
    })
    dropPayment = true
    await sync()
    const beforeRecover = paymentAdds
    await sync()
    check('lost account payment reply is queried and verified without applying it twice', () => {
      assert.equal(paymentAdds, beforeRecover)
      assert.equal(customerAccount(db, customer).balanceCents, 80)
      assert.equal(db.prepare('SELECT status FROM account_payments WHERE id=?').get(card.paymentId).status, 'sent')
    })
    const partial = receiveAccountPayment(db, customer, {
      requestId: crypto.randomUUID(),
      amountCents: 50,
      method: 'check',
      reference: 'CHK1',
      by: 'Test',
      till: 'Test'
    })
    remote.balance = 20
    const beforeConflict = paymentAdds
    await sync()
    check('back-office balance conflict prevents an over-applied QB payment and remains visible', () => {
      assert.equal(paymentAdds, beforeConflict)
      assert.equal(db.prepare('SELECT status FROM account_payments WHERE id=?').get(partial.paymentId).status, 'error')
      assert.ok(operationsStatus(db).quickbooks.problems > 0)
    })
    // Restore the test back-office amount and explicitly retry this blocked payment.
    remote.balance = 80
    await call('/api/accounts/retry', 'POST', { customerId: customer })
    await sync()
    check('explicit account retry applies a corrected allocation after reconciliation', () => {
      assert.equal(db.prepare('SELECT status FROM account_payments WHERE id=?').get(partial.paymentId).status, 'sent')
      assert.equal(customerAccount(db, customer).balanceCents, 30)
    })
    const second = createSale(db, req({ customerId: customer, onAccount: true, payments: [], items: [{ productId: 1, qty: 1 }] }))
    await sync()
    const multi = receiveAccountPayment(db, customer, {
      requestId: crypto.randomUUID(),
      amountCents: 60,
      method: 'cash',
      by: 'Test',
      till: 'Test'
    })
    check('payments allocate to oldest outstanding invoices before newer invoices', () => {
      const allocations = db
        .prepare('SELECT sale_id,amount_cents FROM account_allocations WHERE payment_id=? ORDER BY sale_id')
        .all(multi.paymentId) as any[]
      assert.deepEqual(
        allocations.map((a) => [a.sale_id, a.amount_cents]),
        [
          [sale.id, 30],
          [second.id, 30]
        ]
      )
    })
    await sync()
    check('one QB customer payment can be applied explicitly across multiple invoices', () => {
      assert.equal(customerAccount(db, customer).balanceCents, 70)
      assert.equal(remotePayments.get('AP' + multi.paymentId.toString(36).toUpperCase()).applied.length, 2)
    })
    const failed = createSale(db, req({ customerId: customer, onAccount: true, payments: [] }))
    rejectInvoice = true
    await sync()
    rejectInvoice = false
    check('QuickBooks invoice rejection remains retryable and cannot be marked paid by the ordinary queue', () => {
      assert.equal(db.prepare('SELECT status FROM account_invoices WHERE sale_id=?').get(failed.id).status, 'error')
      assert.equal(transactionQueue(db, { ids: [failed.id] }).rows[0].eligible, false)
    })
    await call('/api/accounts/retry', 'POST', { customerId: customer })
    await sync()
    const apiAccount = await call(`/api/customers/${customer}/account`)
    const unauthorized = await fetch(base + `/api/customers/${customer}/account`)
    check('customer account API is paired and exposes confirmed invoice/payment states', () => {
      assert.equal(unauthorized.status, 401)
      assert.equal(apiAccount.status, 200)
      assert.ok(apiAccount.data.invoices.every((i: any) => i.status === 'sent'))
      assert.equal(apiAccount.data.balanceCents, 270)
    })
    const missingCheck = await call(`/api/customers/${customer}/account-payments`, 'POST', {
      requestId: crypto.randomUUID(),
      amountCents: 1,
      method: 'check',
      by: 'Test',
      till: 'Test'
    })
    check('on-account payment validation retains check-number and card-brand requirements', () => assert.equal(missingCheck.status, 400))
    db.prepare("UPDATE settings SET value='0.1' WHERE key='tax_rate'").run()
    db.prepare('UPDATE products SET taxable=1 WHERE id=1').run()
    mockTaxRate = 0.1
    saveQbLists(db, { salesTaxItems: [{ name: 'State Tax', rate: 10 }] })
    const taxed = createSale(db, req({ customerId: customer, onAccount: true, payments: [], items: [{ productId: 1, qty: 1 }] }))
    await sync()
    check('account invoice preserves charged sales tax and its total in QuickBooks', () => {
      assert.equal(taxed.totalCents, 110)
      const i = db.prepare('SELECT ref_number,status FROM account_invoices WHERE sale_id=?').get(taxed.id) as any
      assert.equal(i.status, 'sent')
      assert.equal(remoteInvoices.get(i.ref_number).net, 100)
      assert.equal(remoteInvoices.get(i.ref_number).tax, 10)
    })
    db.prepare("UPDATE customers SET tax_exempt=1,tax_exempt_id='TEST' WHERE id=?").run(customer)
    const exempt = createSale(
      db,
      req({ customerId: customer, onAccount: true, taxExempt: true, payments: [], items: [{ productId: 1, qty: 1 }] })
    )
    await sync()
    check('tax-exempt account invoices retain the exemption rather than charging QB tax again', () => {
      assert.equal(exempt.totalCents, 100)
      const i = db.prepare('SELECT ref_number,status FROM account_invoices WHERE sale_id=?').get(exempt.id) as any
      assert.equal(i.status, 'sent')
      assert.equal(remoteInvoices.get(i.ref_number).tax, 0)
    })
    db.prepare('UPDATE customers SET on_account_enabled=1 WHERE id=?').run(stockCustomer)
    const beforeHeld = db.prepare('SELECT on_hand FROM products WHERE id=1').get().on_hand
    const accountHeld = await call('/api/held', 'POST', {
      requestId: crypto.randomUUID(),
      customerId: stockCustomer,
      items: [{ productId: 1, qty: 2 }]
    })
    const heldCharge = createSale(db, req({ customerId: stockCustomer, onAccount: true, payments: [], heldId: accountHeld.data.id }))
    check('a held sale can be charged to account without a second inventory deduction', () => {
      assert.equal(heldCharge.onAccount, true)
      assert.equal(db.prepare('SELECT on_hand FROM products WHERE id=1').get().on_hand, beforeHeld - 2)
    })
    const repair = await call('/api/workorders', 'POST', {
      customerId: stockCustomer,
      unitId: unit,
      problem: 'Complete repair',
      noFee: true
    })
    await call(`/api/workorders/${repair.data.id}/lines`, 'POST', { kind: 'part', productId: 1, qty: 2, unitPriceCents: 100 })
    await call(`/api/workorders/${repair.data.id}/status`, 'POST', { status: 'ready_pickup', by: 'Tester' })
    const beforeRepair = db.prepare('SELECT on_hand FROM products WHERE id=1').get().on_hand
    const accountRepair = createSale(
      db,
      req({ items: [], customerId: stockCustomer, onAccount: true, payments: [], workOrder: { id: repair.data.id, mode: 'repair' } })
    )
    check('work-order checkout can create an account invoice while preserving earlier part deductions', () => {
      assert.equal(accountRepair.onAccount, true)
      assert.equal(db.prepare('SELECT on_hand FROM products WHERE id=1').get().on_hand, beforeRepair)
      assert.equal(db.prepare('SELECT status FROM work_orders WHERE id=?').get(repair.data.id).status, 'closed')
    })
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
    db.close()
  }
}
