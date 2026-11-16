import type { DB } from '../db'
import type { QbConfig, QbDailySummary } from '../../../shared/quickbooks'
import { individualSummaries } from './summary'
import { getQbLists, saveQbLists, qbLog } from './store'
import { rq, type QbResult } from './qbxml'
import { child, childrenNamed, esc, text, type XmlNode } from './xml'
import { recordQbBalance } from '../accounts'
export type AccountStep =
  | { kind: 'rq'; label: string; xml: string; onOk?: (r: QbResult) => void; onFail?: (message: string) => void }
  | { kind: 'plan'; label: string; run: () => void }
const money = (n: number) => (n / 100).toFixed(2)
const ref = (tag: string, name: string) => `<${tag}><FullName>${esc(name)}</FullName></${tag}>`
export function invoiceQuery(value: string, byId = false) {
  return `<InvoiceQueryRq requestID="1"><${byId ? 'TxnID' : 'RefNumber'}>${esc(value)}</${byId ? 'TxnID' : 'RefNumber'}></InvoiceQueryRq>`
}
export function paymentQuery(value: string) {
  return `<ReceivePaymentQueryRq requestID="1"><RefNumber>${esc(value)}</RefNumber><IncludeLineItems>true</IncludeLineItems></ReceivePaymentQueryRq>`
}
export function invoiceAdd(s: QbDailySummary, cfg: QbConfig, due: string) {
  const lines = s.lines
    .map(
      (l) =>
        `<InvoiceLineAdd>${ref('ItemRef', l.itemName)}<Desc>${esc(l.description ?? l.itemName)}</Desc><Amount>${money(l.amountCents)}</Amount>${ref('SalesTaxCodeRef', l.taxable ? cfg.taxableCode : cfg.nonTaxableCode)}</InvoiceLineAdd>`
    )
    .join('')
  return `<InvoiceAddRq requestID="1"><InvoiceAdd>${ref('CustomerRef', s.customerName!)}<TxnDate>${s.saleDate}</TxnDate><RefNumber>${esc(s.refNumber)}</RefNumber><DueDate>${due}</DueDate>${ref('ItemSalesTaxRef', cfg.salesTaxItem)}<Memo>${esc(`DiamondPOS account sale #${s.saleId}; unpaid invoice`)}</Memo><IsToBePrinted>false</IsToBePrinted><IsToBeEmailed>false</IsToBeEmailed>${lines}</InvoiceAdd></InvoiceAddRq>`
}
export function receivePaymentAdd(p: any, allocations: any[], customer: string, cfg: QbConfig) {
  const m = cfg.methods[p.method as 'cash' | 'card' | 'check'],
    method = p.method === 'card' ? cfg.cardBrands?.[p.card_brand as keyof typeof cfg.cardBrands] || m.paymentMethod : m.paymentMethod
  return `<ReceivePaymentAddRq requestID="1"><ReceivePaymentAdd>${ref('CustomerRef', customer)}<TxnDate>${p.date}</TxnDate><RefNumber>AP${p.id.toString(36).toUpperCase()}</RefNumber><TotalAmount>${money(p.amount_cents)}</TotalAmount>${method ? ref('PaymentMethodRef', method) : ''}<Memo>${esc(`DiamondPOS account payment #${p.id}; request ${p.request_id}${p.reference ? '; check/reference ' + p.reference : ''}`)}</Memo>${ref('DepositToAccountRef', m.depositAccount)}${allocations.map((a) => `<AppliedToTxnAdd><TxnID>${esc(a.txn_id)}</TxnID><PaymentAmount>${money(a.amount_cents)}</PaymentAmount></AppliedToTxnAdd>`).join('')}</ReceivePaymentAdd></ReceivePaymentAddRq>`
}
const cents = (n: XmlNode | undefined, key: string) => {
  const value = text(n, key)
  if (!value.trim() || !Number.isFinite(Number(value))) throw new Error(`QuickBooks returned no valid ${key}`)
  return Math.round(Number(value) * 100)
}
function single(r: QbResult, tag: string) {
  const rows = childrenNamed(r.node, tag)
  if (rows.length > 1) throw new Error('Multiple QuickBooks transactions match this reference')
  return rows[0]
}
function invoiceValues(node: XmlNode) {
  return {
    id: text(node, 'TxnID'),
    customer: text(child(node, 'CustomerRef'), 'FullName'),
    memo: text(node, 'Memo'),
    total: text(node, 'TotalAmount') ? cents(node, 'TotalAmount') : cents(node, 'Subtotal') + cents(node, 'SalesTaxTotal'),
    balance: cents(node, 'BalanceRemaining')
  }
}
export function accountSteps(
  db: DB,
  cfg: QbConfig,
  storeRate: number,
  qbRate: number | null,
  enqueue: (steps: AccountStep[]) => void,
  failed: (message: string) => void
): AccountStep[] {
  const error = (table: 'account_invoices' | 'account_payments', key: number, message: string) => {
    db.prepare(`UPDATE ${table} SET status='error',error=? WHERE ${table === 'account_invoices' ? 'sale_id' : 'id'}=?`).run(
      message.slice(0, 1000),
      key
    )
    qbLog(db, 'error', message)
    failed(message)
  }
  const failInvoice = (id: number) => (message: string) => error('account_invoices', id, `Account invoice #${id}: ${message}`)
  const checkInvoice = (row: any, node: XmlNode) => {
    const value = invoiceValues(node)
    if (
      !value.id ||
      !value.memo.startsWith(`DiamondPOS account sale #${row.sale_id};`) ||
      value.customer.toLowerCase() !== row.customer_name.toLowerCase() ||
      value.total !== row.total_cents ||
      (row.txn_id && row.txn_id !== value.id) ||
      value.balance < 0 ||
      value.balance > value.total
    )
      throw new Error(
        'Invoice identity, customer, amount or balance conflicts with the original POS invoice. Review in QuickBooks before retrying.'
      )
    return value
  }
  const invoices = db
    .prepare(
      `SELECT i.*,s.total_cents,date(s.created_at,'localtime') AS date FROM account_invoices i JOIN sales s ON s.id=i.sale_id WHERE i.status='pending' ORDER BY i.sale_id LIMIT 40`
    )
    .all() as any[]
  const steps: AccountStep[] = invoices.map((original) => ({
    kind: 'plan',
    label: `Plan account invoice ${original.ref_number}`,
    run: () => {
      const row = { ...original },
        fail = failInvoice(row.sale_id)
      if (row.date < cfg.startDate) {
        fail('Before the configured sync start date; review the date setting.')
        return
      }
      if (db.prepare('SELECT 1 FROM qb_exports WHERE sale_date=?').get(row.date)) {
        fail('An older daily export covers this date. Reconcile it before exporting an invoice.')
        return
      }
      const summary = individualSummaries(db, row.date, cfg, storeRate, qbRate, [row.sale_id], true).find((s) => s.saleId === row.sale_id)
      if (!summary) {
        fail('The completed account sale was not found')
        return
      }
      summary.refNumber = row.ref_number
      summary.customerName = row.customer_name || summary.customerName
      row.customer_name = summary.customerName
      db.prepare('UPDATE account_invoices SET customer_name=? WHERE sale_id=?').run(row.customer_name, row.sale_id)
      const mark = (node: XmlNode) => {
        const v = checkInvoice(row, node)
        db.prepare("UPDATE account_invoices SET status='sent',txn_id=?,error=NULL WHERE sale_id=?").run(v.id, row.sale_id)
        recordQbBalance(db, row.sale_id, v.balance)
        qbLog(db, 'info', `Confirmed account invoice ${row.ref_number}`)
      }
      const add = () =>
        enqueue([
          {
            kind: 'rq',
            label: `Add Invoice ${row.ref_number}`,
            xml: invoiceAdd(summary, cfg, row.due_date),
            onOk: (r) => {
              const node = single(r, 'InvoiceRet')
              if (!node) throw new Error('QuickBooks returned no invoice')
              mark(node)
            },
            onFail: fail
          }
        ])
      const check: AccountStep = {
        kind: 'rq',
        label: `Check Invoice ${row.ref_number}`,
        xml: invoiceQuery(row.txn_id || row.ref_number, !!row.txn_id),
        onOk: (r) => {
          const found = single(r, 'InvoiceRet')
          if (found) {
            mark(found)
            return
          }
          if (row.txn_id) {
            fail('Previously confirmed invoice is missing. Check the company file; it will not be recreated automatically.')
            return
          }
          enqueue([
            {
              kind: 'rq',
              label: `Account customer ${row.customer_name}`,
              xml: rq.customer(row.customer_name),
              onOk: (r) => {
                if (child(r.node, 'CustomerRet')) add()
                else
                  enqueue([{ kind: 'rq', label: `Add account customer`, xml: rq.addCustomer(row.customer_name), onOk: add, onFail: fail }])
              },
              onFail: fail
            }
          ])
        },
        onFail: fail
      }
      const have = new Set(getQbLists(db).otherChargeItems.map((n) => n.toLowerCase())),
        needed = new Map<string, string>()
      for (const line of summary.lines) if (!have.has(line.itemName.toLowerCase())) needed.set(line.itemName, line.account)
      let ok = true
      enqueue([
        ...Array.from(
          needed,
          ([name, account]): AccountStep => ({
            kind: 'rq',
            label: `Account item ${name}`,
            xml: rq.addOtherChargeItem(name, account),
            onOk: () => saveQbLists(db, { otherChargeItems: [...getQbLists(db).otherChargeItems, name] }),
            onFail: (msg) => {
              ok = false
              fail(msg)
            }
          })
        ),
        {
          kind: 'plan',
          label: 'Check account invoice',
          run: () => {
            if (ok) enqueue([check])
          }
        }
      ])
    }
  }))
  steps.push({
    kind: 'plan',
    label: 'Plan account payments',
    run: () => {
      const payments = db
        .prepare("SELECT *,date(created_at,'localtime') AS date FROM account_payments WHERE status='pending' ORDER BY id LIMIT 40")
        .all() as any[]
      const plans: AccountStep[] = payments.map((p) => ({
        kind: 'plan',
        label: `Account payment ${p.id}`,
        run: () => {
          const allocations = db
            .prepare(
              'SELECT a.*,i.txn_id,i.status,i.customer_name,i.ref_number,s.total_cents FROM account_allocations a JOIN account_invoices i ON i.sale_id=a.sale_id JOIN sales s ON s.id=i.sale_id WHERE a.payment_id=? ORDER BY a.sale_id'
            )
            .all(p.id) as any[]
          if (!allocations.length || allocations.some((a) => a.status !== 'sent' || !a.txn_id)) return
          const customer = allocations[0].customer_name,
            fail = (message: string) => error('account_payments', p.id, `Account payment #${p.id}: ${message}`)
          const mark = () => {
            db.prepare("UPDATE account_payments SET status='sent',error=NULL WHERE id=?").run(p.id)
            qbLog(db, 'info', `Confirmed account payment AP${p.id.toString(36).toUpperCase()}`)
          }
          const checkPayment: AccountStep = {
            kind: 'rq',
            label: `Check account payment ${p.id}`,
            xml: paymentQuery('AP' + p.id.toString(36).toUpperCase()),
            onOk: (r) => {
              const existing = single(r, 'ReceivePaymentRet')
              if (existing) {
                const applied = childrenNamed(existing, 'AppliedToTxnRet').filter((a) => Number(text(a, 'PaymentAmount')) !== 0)
                if (
                  !text(existing, 'TxnID') ||
                  !text(existing, 'Memo').startsWith(`DiamondPOS account payment #${p.id}; request ${p.request_id}`) ||
                  text(child(existing, 'CustomerRef'), 'FullName').toLowerCase() !== customer.toLowerCase() ||
                  cents(existing, 'TotalAmount') !== p.amount_cents ||
                  applied.length !== allocations.length ||
                  allocations.some(
                    (a) => !applied.some((x) => text(x, 'TxnID') === a.txn_id && cents(x, 'PaymentAmount') === a.amount_cents)
                  )
                )
                  throw new Error(
                    'Existing QuickBooks payment conflicts with its POS identity or invoice allocations. Review before retrying.'
                  )
                db.prepare('UPDATE account_payments SET txn_id=? WHERE id=?').run(text(existing, 'TxnID'), p.id)
                mark()
                return
              }
              let ok = true
              const checks: AccountStep[] = allocations.map((a) => ({
                kind: 'rq',
                label: `Check invoice balance ${a.ref_number}`,
                xml: invoiceQuery(a.txn_id, true),
                onOk: (r) => {
                  const node = single(r, 'InvoiceRet')
                  if (!node) {
                    ok = false
                    fail('Original invoice is missing')
                    return
                  }
                  const value = checkInvoice({ ...a, customer_name: customer }, node)
                  if (value.balance < a.amount_cents) {
                    ok = false
                    fail(
                      'QuickBooks balance is lower than this payment allocation. It may already have been paid in the back office. Reconcile before retrying.'
                    )
                  }
                },
                onFail: (message) => {
                  ok = false
                  fail(message)
                }
              }))
              checks.push({
                kind: 'plan',
                label: 'Apply account payment',
                run: () => {
                  if (ok)
                    enqueue([
                      {
                        kind: 'rq',
                        label: `Receive account payment ${p.id}`,
                        xml: receivePaymentAdd(p, allocations, customer, cfg),
                        onOk: (r) => {
                          const node = single(r, 'ReceivePaymentRet')
                          const txn = text(node, 'TxnID')
                          if (!txn) throw new Error('No payment transaction ID returned; retry will query the original payment')
                          db.prepare('UPDATE account_payments SET txn_id=? WHERE id=?').run(txn, p.id)
                          enqueue([checkPayment])
                        },
                        onFail: fail
                      }
                    ])
                }
              })
              enqueue(checks)
            },
            onFail: fail
          }
          enqueue([checkPayment])
        }
      }))
      enqueue(plans)
    }
  })
  steps.push({
    kind: 'plan',
    label: 'Refresh account balances',
    run: () => {
      const rows = db
        .prepare(
          `SELECT i.*,s.total_cents FROM account_invoices i JOIN sales s ON s.id=i.sale_id WHERE i.status='sent' ORDER BY COALESCE(i.qb_checked_at,'') LIMIT 100`
        )
        .all() as any[]
      enqueue(
        rows.map((row) => ({
          kind: 'rq',
          label: `Refresh balance ${row.ref_number}`,
          xml: invoiceQuery(row.txn_id, true),
          onOk: (r) => {
            const node = single(r, 'InvoiceRet')
            if (!node) throw new Error('Confirmed account invoice missing from this company file')
            const v = checkInvoice(row, node)
            recordQbBalance(db, row.sale_id, v.balance)
          },
          onFail: failInvoice(row.sale_id)
        }))
      )
    }
  })
  return steps
}
