import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import Database from 'better-sqlite3'
import { createApp, createSale, startServer, stopServer, isServerRunning, readSettings } from '../src/main/server'
import { openDatabase } from '../src/main/server/db'
import { migrations } from '../src/main/server/migrations'
import { operationsStatus, recordBackup } from '../src/main/server/operations'
import { createVerifiedBackup, startBackupScheduler } from '../src/main/server/backup'
import { returnableSale } from '../src/main/server/returns'
import { parseQuantity, quantityError } from '../src/renderer/src/quantity'
import { inlineReturnLine, matchingReturnLines } from '../src/renderer/src/inlineReturn'
import { getProduct } from '../src/main/server/products'
import { returnAmount } from '../src/shared/returns'
import { getQbConfig, saveQbConfig, saveQbLists, listExports } from '../src/main/server/quickbooks/store'
import { transactionQueue, queueTransactions } from '../src/main/server/quickbooks/queue'
import { individualSummaries } from '../src/main/server/quickbooks/summary'
import { rq, parseResponse } from '../src/main/server/quickbooks/qbxml'
import { parseXml, child, text, esc } from '../src/main/server/quickbooks/xml'
import { api, configureApi } from '../src/renderer/src/api'
import type { SaleRequest } from '../src/shared/types'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diamondpos-regression-'))
let checks = 0
const check = (name: string, fn: () => void) => { fn(); checks++; console.log(`PASS ${name}`) }
async function main() {
  check('quantity typing accepts explicit signs and rejects blank, decimal and scanner-like input', () => {
    assert.equal(parseQuantity(' +3 '), 3)
    assert.equal(parseQuantity('-2'), -2)
    assert.equal(parseQuantity('0'), 0)
    for (const text of ['', ' ', '1.5', '1e3', 'Infinity', '12abc', '--2']) assert.equal(parseQuantity(text), null)
    assert.ok(quantityError(10000)); assert.ok(quantityError(-10000)); assert.ok(quantityError(null))
  })
  check('quantity rules permit zero removal and negative return conversion but restrict serialized units', () => {
    assert.equal(quantityError(0, { serialized: true }), null)
    assert.equal(quantityError(-1, { serialized: true }), null)
    assert.equal(quantityError(1, { serialized: true }), null)
    assert.ok(quantityError(2, { serialized: true }))
    assert.ok(quantityError(-2, { serialized: true }))
    assert.equal(quantityError(-3), null)
  })
  check('editing return quantity respects original-receipt availability and cannot become a sale', () => {
    assert.equal(quantityError(-2, { returning: true, maxReturn: 2 }), null)
    assert.ok(quantityError(-3, { returning: true, maxReturn: 2 }))
    assert.ok(quantityError(1, { returning: true }))
    assert.equal(quantityError(0, { returning: true, maxReturn: 0 }), null)
    assert.equal(quantityError(-10, { returning: true }), null)
  })
  const file = path.join(dir, 'store.db')
  // Start at the uploaded v21 schema, with an enabled existing integration.
  let db = new Database(file)
  db.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)')
  for (const m of migrations.filter((m) => m.version <= 21)) {
    db.exec(m.up); db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name)
  }
  db.prepare("INSERT INTO settings VALUES ('qb_config', ?)").run(JSON.stringify({ enabled: true, startDate: '2026-01-01', customerName: 'DiamondPOS Daily Sales' }))
  db.close()
  db = openDatabase(file)
  check('v21 upgrade backs up first and disables the changed QuickBooks format', () => {
    assert.equal(db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v, 22)
    assert.equal(getQbConfig(db).enabled, false)
    assert.ok(fs.readdirSync(path.join(dir, 'backups')).some((n) => n.startsWith('store-before-v22')))
  })
  db.prepare("UPDATE settings SET value = '0.0725' WHERE key = 'tax_rate'").run()
  db.prepare('UPDATE products SET price_cents = 5, on_hand = 100, taxable = 1 WHERE id = 1').run()
  const request = (extra: Partial<SaleRequest> = {}): SaleRequest => ({ requestId: crypto.randomUUID(), tillName: 'Till A',
    items: [{ productId: 1, qty: 2 }], payments: [{ method: 'cash', amountCents: 11 }], ...extra })
  const original = request()
  const sale = createSale(db, original)
  check('lost-response retry returns the original receipt and only reduces stock once', () => {
    const retry = createSale(db, JSON.parse(JSON.stringify(original)))
    assert.equal(retry.id, sale.id)
    assert.equal(db.prepare('SELECT on_hand AS n FROM products WHERE id = 1').get().n, 98)
    assert.throws(() => createSale(db, { ...original, tillName: 'Changed' }), /reused/)
  })
  const heldId = Number(db.prepare("INSERT INTO held_sales (note, items_json, till_name) VALUES ('Part', '[]', 'A')").run().lastInsertRowid)
  createSale(db, request({ heldId }))
  check('a second till cannot complete a held receipt; all second-sale writes roll back', () => {
    const before = db.prepare('SELECT COUNT(*) AS n FROM sales').get().n
    const stock = db.prepare('SELECT on_hand AS n FROM products WHERE id = 1').get().n
    assert.throws(() => createSale(db, request({ heldId, tillName: 'Till B' })), /already completed/)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sales').get().n, before)
    assert.equal(db.prepare('SELECT on_hand AS n FROM products WHERE id = 1').get().n, stock)
  })
  const line = returnableSale(db, sale.id)!.lines[0]
  const refund1 = createSale(db, request({ items: [], returns: [{ saleItemId: line.saleItemId, qty: 1, reason: 'Other', restock: true }],
    payments: [{ method: 'cash', amountCents: -6 }] }))
  const refund2 = createSale(db, request({ items: [], returns: [{ saleItemId: line.saleItemId, qty: 1, reason: 'Other', restock: true }],
    payments: [{ method: 'cash', amountCents: -5 }] }))
  check('partial returns refund every original tax penny exactly once', () => {
    assert.equal(refund1.totalCents + refund2.totalCents, -sale.totalCents)
    assert.equal(refund1.taxCents + refund2.taxCents, -sale.taxCents)
    assert.equal(returnableSale(db, sale.id)!.refundableCents, 0)
    assert.throws(() => createSale(db, request({ items: [], returns: [{ saleItemId: line.saleItemId, qty: 1, reason: 'Other', restock: true }], payments: [] })), /already returned/i)
  })
  const twoLines = createSale(db, request({ items: [{ productId: 1, qty: 1 }, { productId: 1, qty: 1 }] }))
  check('tax allocation across multiple receipt lines matches the charged tax', () => {
    assert.equal(returnableSale(db, twoLines.id)!.lines.reduce((n, l) => n + l.taxPaidCents!, 0), twoLines.taxCents)
    assert.equal(returnAmount(100, 1, true, false, 0.15, 'inclusive').amountCents, 100)
  })
  const product = getProduct(db, 1)!
  const inlineInput = { product, negativeQty: -1, reason: 'Changed mind', restock: true, existing: [] }
  check('negative quantity converts to a return without mutating the scanned product', () => {
    const before = JSON.stringify(product)
    const line = inlineReturnLine(inlineInput)
    assert.equal(line.qty, 1)
    assert.equal(line.saleId, null)
    assert.equal(line.unitCents, product.priceCents)
    assert.equal(JSON.stringify(product), before)
    for (const negativeQty of [0, 1, -1.5, -10000]) assert.throws(() => inlineReturnLine({ ...inlineInput, negativeQty }))
    assert.throws(() => inlineReturnLine({ ...inlineInput, reason: '' }), /reason/)
  })
  const linkedSale = createSale(db, request())
  const linkedReceipt = returnableSale(db, linkedSale.id)!
  const linkedLine = inlineReturnLine({ ...inlineInput, receipt: linkedReceipt, saleItemId: linkedReceipt.lines[0].saleItemId })
  check('inline receipt link preserves original price, tax and quantity limits', () => {
    assert.equal(linkedLine.unitCents, 5)
    assert.equal(linkedLine.originalTax!.taxCents, 1)
    assert.throws(() => inlineReturnLine({ ...inlineInput, receipt: linkedReceipt, saleItemId: 999999 }), /matching item/)
    assert.throws(() => inlineReturnLine({ ...inlineInput, negativeQty: -2, receipt: linkedReceipt,
      saleItemId: linkedLine.saleItemId, existing: [linkedLine] }), /already/)
  })
  db.prepare('UPDATE products SET price_cents = 100, taxable = 0, on_hand = 50 WHERE id = 2').run()
  const unlinked = inlineReturnLine(inlineInput)
  const exchange = createSale(db, request({ items: [{ productId: 2, qty: 1 }],
    returns: [{ productId: unlinked.productId!, qty: unlinked.qty, reason: unlinked.reason, restock: unlinked.restock }],
    payments: [{ method: 'cash', amountCents: 95 }] }))
  check('positive sale and negative return share one exchange receipt with correct stock', () => {
    assert.equal(exchange.totalCents, 95)
    assert.equal(exchange.noReceiptReturn, true)
    assert.equal(exchange.items.filter((l) => l.kind === 'return')[0].qty, -1)
    assert.equal(db.prepare('SELECT on_hand AS n FROM products WHERE id = 2').get().n, 49)
  })
  db.prepare('UPDATE products SET use_serial = 1 WHERE id = 2').run()
  const equipment = getProduct(db, 2)!
  const serialSale = createSale(db, request({ items: [{ productId: 2, qty: 1, serial: 'MOWER-123' }], payments: [{ method: 'cash', amountCents: 100 }] }))
  const serialReceipt = returnableSale(db, serialSale.id)!
  check('serialized inline return matches its original serial and requires one unit', () => {
    assert.equal(matchingReturnLines(serialReceipt, equipment, 'MOWER-123').length, 1)
    assert.equal(matchingReturnLines(serialReceipt, equipment, 'WRONG').length, 0)
    assert.throws(() => inlineReturnLine({ ...inlineInput, product: equipment, serial: 'MOWER-123', negativeQty: -2 }), /one unit/)
  })
  const damaged = inlineReturnLine({ ...inlineInput, product: equipment, serial: 'MOWER-123', restock: false })
  const stockBeforeDamaged = db.prepare('SELECT on_hand AS n FROM products WHERE id = 2').get().n
  const damagedSale = createSale(db, request({ items: [], returns: [{ productId: equipment.id, serial: damaged.serial!, qty: 1, reason: damaged.reason, restock: false }], payments: [{ method: 'cash', amountCents: -100 }] }))
  check('no-receipt equipment return retains the serial and does not restock damaged equipment', () => {
    assert.equal(damagedSale.items[0].serial, 'MOWER-123')
    assert.equal(db.prepare('SELECT on_hand AS n FROM products WHERE id = 2').get().n, stockBeforeDamaged)
    assert.throws(() => createSale(db, request({ items: [], returns: [{ productId: equipment.id, serial: 'MOWER-123', qty: 2, reason: 'Other', restock: false }], payments: [{ method: 'cash', amountCents: -200 }] })), /one unit/)
  })
  const backup = await createVerifiedBackup(db, path.join(dir, 'backups'))
  const restored = new Database(backup, { readonly: true, fileMustExist: true })
  check('online backup contains committed WAL sales and passes integrity checking', () => {
    assert.equal(restored.pragma('integrity_check', { simple: true }), 'ok')
    assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM sales').get().n, db.prepare('SELECT COUNT(*) AS n FROM sales').get().n)
  })
  restored.close()
  const verified = spawnSync(process.execPath, [path.join(process.cwd(), 'scripts/verify-backup.cjs'), backup],
    { encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
  check('Windows-compatible verification command checks a restore copy with Electron SQLite', () => {
    assert.equal(verified.status, 0, verified.stderr)
    assert.match(verified.stdout, /Integrity check: ok/)
    assert.match(verified.stdout, /live database was not changed/)
  })
  check('status starts unknown instead of inferring a verified backup from a file', () => {
    assert.equal(operationsStatus(db).backup.lastVerifiedAt, null)
    assert.equal(operationsStatus(db).quickbooks.lastSyncAt, null)
  })
  const stopGoodBackup = startBackupScheduler(db, path.join(dir, 'backups'))
  await stopGoodBackup()
  const lastGood = operationsStatus(db).backup.lastVerifiedAt
  check('scheduled backup status is saved only after verification completes', () => {
    assert.ok(lastGood)
    assert.equal(operationsStatus(db).backup.running, false)
    assert.equal(operationsStatus(db).backup.error, null)
  })
  const failedDb = new Proxy(db, { get(target, property) {
    if (property === 'backup') return async () => { throw new Error('Simulated backup write failure') }
    const value = Reflect.get(target, property)
    return typeof value === 'function' ? value.bind(target) : value
  } })
  const stopBadBackup = startBackupScheduler(failedDb, path.join(dir, 'backups'))
  await stopBadBackup()
  check('failed backup preserves last verified time and records the actual failure', () => {
    const state = operationsStatus(db).backup
    assert.equal(state.lastVerifiedAt, lastGood)
    assert.match(state.error!, /Simulated/)
    assert.ok(state.lastFailureAt)
    assert.equal(state.running, false)
  })
  db.close(); db = openDatabase(file)
  check('backup history survives reopening the store database', () => {
    assert.equal(operationsStatus(db).backup.lastVerifiedAt, lastGood)
    assert.match(operationsStatus(db).backup.error!, /Simulated/)
  })
  const cust1 = Number(db.prepare("INSERT INTO customers (first_name,last_name) VALUES ('Greg & Co','Barnes')").run().lastInsertRowid)
  const cust2 = Number(db.prepare("INSERT INTO customers (first_name,last_name) VALUES ('Greg & Co','Barnes')").run().lastInsertRowid)
  const named = createSale(db, request({ customerId: cust1 }))
  const other = createSale(db, request({ customerId: cust2 }))
  const date = db.prepare("SELECT date(created_at, 'localtime') AS d FROM sales WHERE id = ?").get(named.id).d
  saveQbConfig(db, { enabled: true, startDate: date, defaultIncomeAccount: 'Sales', salesTaxItem: 'State Tax', refreshLists: false })
  saveQbLists(db, { fetchedAt: new Date().toISOString(), salesTaxItems: [{ name: 'State Tax', rate: 7.25 }], otherChargeItems: ['POS General', 'POS Tax Rounding'] })
  const cfg = getQbConfig(db)
  let summaries = individualSummaries(db, date, cfg, 0.0725, 0.0725)
  const summary = summaries.find((s) => s.saleId === named.id)!
  check('individual exports preserve customer identity, sale totals and XML escaping', () => {
    assert.notEqual(summary.customerName, summaries.find((s) => s.saleId === other.id)!.customerName)
    assert.ok(summary.customerName!.includes('Greg & Co'))
    assert.ok(rq.addSalesReceipt(summary, cfg).includes('Greg &amp; Co'))
    assert.equal(summary.lines.reduce((n, l) => n + l.amountCents, 0) + summary.taxCents - summary.roundingCents, named.totalCents)
    assert.equal(summary.saleCount, 1)
    assert.ok(summaries.find((s) => s.saleId === refund1.id)!.manualReason)
  })
  db.prepare("INSERT INTO qb_exports (sale_date, method, ref_number, total_cents, sale_count) VALUES (?, 'cash', 'OLDDAY', 11, 1)").run(date)
  check('legacy daily export prevents automatic reposting of its individual sales', () => {
    assert.ok(individualSummaries(db, date, cfg, 0.0725, 0.0725).every((s) => s.manualReason?.includes('daily export')))
  })
  db.prepare("DELETE FROM qb_exports WHERE ref_number = 'OLDDAY'").run()
  const split = createSale(db, request({ payments: [{ method: 'cash', amountCents: 5 }, { method: 'card', amountCents: 6 }] }))
  check('split payments are flagged instead of posted to an incorrect deposit account', () => {
    assert.match(individualSummaries(db, date, cfg, 0.0725, 0.0725).find((s) => s.saleId === split.id)!.manualReason!, /Split/)
  })
  const app = createApp(db, { dbFile: file, apiKey: 'test', port: 0, appVersion: '0.3.22' })
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const port = (server.address() as any).port
  const base = `http://127.0.0.1:${port}`
  const soap = async (method: string, args: Record<string,string> = {}) => {
    const response = await fetch(`${base}/qbwc`, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body:
      `<Envelope><Body><${method}>${Object.entries(args).map(([k,v]) => `<${k}>${esc(v)}</${k}>`).join('')}</${method}></Body></Envelope>` })
    assert.equal(response.status, 200)
    return child(child(parseXml(await response.text()), 'Body'), `${method}Response`)!
  }
  const statusResponse = await fetch(`${base}/api/operations/status`, { headers: { 'X-Api-Key': 'test' } })
  const statusPayload = await statusResponse.json()
  const unauthorizedStatus = await fetch(`${base}/api/operations/status`)
  check('operations endpoint requires pairing and does not expose connector credentials', () => {
    assert.equal(statusResponse.status, 200)
    assert.equal(unauthorizedStatus.status, 401)
    assert.ok(!JSON.stringify(statusPayload).includes(cfg.password))
  })
  const exportCountBeforeQueue = db.prepare('SELECT COUNT(*) AS n FROM qb_sale_exports').get().n
  const initialQueue = transactionQueue(db)
  check('queue includes unexamined POS sales and classifies manual exceptions without modifying exports', () => {
    assert.equal(initialQueue.rows.find((r) => r.saleId === named.id)!.status, 'waiting')
    assert.equal(initialQueue.rows.find((r) => r.saleId === named.id)!.exportId, null)
    assert.equal(initialQueue.rows.find((r) => r.saleId === split.id)!.status, 'manual')
    assert.equal(initialQueue.rows.find((r) => r.saleId === refund1.id)!.status, 'manual')
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM qb_sale_exports').get().n, exportCountBeforeQueue)
  })
  check('selected waiting sales are queued idempotently, preserving stable export references', () => {
    assert.equal(queueTransactions(db, [named.id, other.id], 0.0725, 0.0725), 2)
    const first = transactionQueue(db, { ids: [named.id] }).rows[0]
    assert.equal(first.queued, true)
    queueTransactions(db, [named.id], 0.0725, 0.0725)
    assert.equal(transactionQueue(db, { ids: [named.id] }).rows[0].exportId, first.exportId)
  })
  db.prepare("UPDATE qb_sale_exports SET status = 'error', error = 'Network interrupted' WHERE sale_id = ?").run(named.id)
  check('failed exports can be selected and retried with the same reference', () => {
    const row = transactionQueue(db, { ids: [named.id] }).rows[0]
    assert.equal(row.status, 'failed'); assert.equal(row.eligible, true)
    queueTransactions(db, [named.id], 0.0725, 0.0725)
    assert.equal(transactionQueue(db, { ids: [named.id] }).rows[0].refNumber, row.refNumber)
  })
  check('mixed invalid selection rolls back instead of queuing its eligible subset', () => {
    db.prepare("UPDATE qb_sale_exports SET status = 'error', error = 'Keep this' WHERE sale_id = ?").run(named.id)
    assert.throws(() => queueTransactions(db, [named.id, split.id], 0.0725, 0.0725), /Selection/)
    assert.equal(transactionQueue(db, { ids: [named.id] }).rows[0].status, 'failed')
    queueTransactions(db, [named.id], 0.0725, 0.0725)
  })
  check('synced transactions are protected even when selected using a stale page', () => {
    db.prepare("UPDATE qb_sale_exports SET status = 'sent', txn_id = 'TEMP' WHERE sale_id = ?").run(named.id)
    assert.equal(transactionQueue(db, { ids: [named.id] }).rows[0].eligible, false)
    assert.throws(() => queueTransactions(db, [named.id], 0.0725, 0.0725), /Selection/)
    db.prepare("UPDATE qb_sale_exports SET status = 'pending', txn_id = NULL WHERE sale_id = ?").run(named.id)
  })
  check('start-date exclusions cannot be bypassed by queue selection', () => {
    saveQbConfig(db, { startDate: '2099-01-01' })
    assert.equal(transactionQueue(db, { ids: [named.id] }).rows[0].status, 'excluded')
    assert.throws(() => queueTransactions(db, [named.id], 0.0725, 0.0725), /Selection/)
    saveQbConfig(db, { startDate: date })
  })
  check('queue filtering and counts include waiting and failed transactions correctly', () => {
    const page = transactionQueue(db, { status: 'waiting', search: String(named.id), from: date, to: date })
    assert.ok(page.rows.some((r) => r.saleId === named.id))
    assert.ok(page.rows.every((r) => r.status === 'waiting'))
    assert.ok(page.counts.waiting >= 1)
  })
  saveQbConfig(db, { enabled: false })
  check('preparing a queue never enables automatic sending', () => {
    queueTransactions(db, [other.id], 0.0725, 0.0725)
    assert.equal(getQbConfig(db).enabled, false)
  })
  saveQbConfig(db, { enabled: true })
  const changeSale = createSale(db, request({ payments: [{ method: 'card', amountCents: 11 }, { method: 'cash', amountCents: 20 }] }))
  check('queue agrees with export eligibility when cash is entirely given back as change', () => {
    assert.equal(transactionQueue(db, { ids: [changeSale.id] }).rows[0].status, 'waiting')
    assert.equal(queueTransactions(db, [changeSale.id], 0.0725, 0.0725), 1)
  })
  check('legacy daily overlap remains manual even when an individual export previously failed', () => {
    db.prepare("INSERT INTO qb_exports (sale_date, method, ref_number, total_cents, sale_count) VALUES (?, 'cash', 'QUEUETEST', 11, 1)").run(date)
    db.prepare("UPDATE qb_sale_exports SET status = 'error', error = 'Interrupted' WHERE sale_id = ?").run(named.id)
    assert.equal(transactionQueue(db, { ids: [named.id] }).rows[0].status, 'manual')
    assert.throws(() => queueTransactions(db, [named.id], 0.0725, 0.0725), /Selection/)
    db.prepare("DELETE FROM qb_exports WHERE ref_number = 'QUEUETEST'").run()
    queueTransactions(db, [named.id], 0.0725, 0.0725)
  })
  const pageDb = openDatabase(path.join(dir, 'queue-pages.db'))
  pageDb.transaction(() => { for (let n = 0; n < 55; n++) pageDb.prepare("INSERT INTO sales (till_name,total_cents,tax_cents,status) VALUES ('Page test',0,0,'void')").run() })()
  check('queue paginates all POS transactions, including excluded noncompleted receipts', () => {
    const first = transactionQueue(pageDb, { status: 'excluded' })
    const second = transactionQueue(pageDb, { status: 'excluded', page: 2 })
    assert.equal(first.total, 55); assert.equal(first.rows.length, 50); assert.equal(second.rows.length, 5)
    assert.ok(second.rows.every((r) => !first.rows.some((f) => f.saleId === r.saleId)))
  })
  pageDb.close()
  const queueUnauthorized = await fetch(`${base}/api/qb/queue`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ saleIds: [named.id] }) })
  const queueBad = await fetch(`${base}/api/qb/queue`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'test' }, body: JSON.stringify({ saleIds: [] }) })
  const heldLogin = await soap('authenticate', { strUserName: cfg.username, strPassword: cfg.password })
  const heldTicket = child(child(heldLogin, 'authenticateResult'), 'string')!.text
  const queueDuringSync = await fetch(`${base}/api/qb/queue`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'test' }, body: JSON.stringify({ saleIds: [named.id] }) })
  await soap('closeConnection', { ticket: heldTicket })
  check('queue API requires pairing, valid IDs and no active connector session', () => {
    assert.equal(queueUnauthorized.status, 401)
    assert.equal(queueBad.status, 400)
    assert.equal(queueDuringSync.status, 409)
  })
  const receiptIds = new Map<string,string>()
  const receiptDetails = new Map<string,string>()
  const customers = new Set<string>()
  let added = 0
  async function sync(dropLastResponse = false) {
    const login = await soap('authenticate', { strUserName: cfg.username, strPassword: cfg.password })
    const ticket = child(child(login, 'authenticateResult'), 'string')!.text
    for (let n = 0; n < 200; n++) {
      const xml = text(await soap('sendRequestXML', { ticket }), 'sendRequestXMLResult')
      if (!xml) break
      const reqNode = child(parseXml(xml), 'QBXMLMsgsRq')!.children[0]
      const name = reqNode.name
      let inner = '', code = '0'
      if (name === 'CompanyQueryRq') inner = '<CompanyRet><CompanyName>Diamond P</CompanyName></CompanyRet>'
      else if (name === 'SalesReceiptQueryRq') {
        const id = receiptIds.get(text(reqNode, 'RefNumber'))
        if (id) inner = `<SalesReceiptRet><TxnID>${id}</TxnID>${receiptDetails.get(text(reqNode, 'RefNumber'))}</SalesReceiptRet>`
        else code = '500'
      } else if (name === 'CustomerQueryRq') {
        const customer = text(reqNode, 'FullName')
        if (customers.has(customer)) inner = `<CustomerRet><FullName>${esc(customer)}</FullName></CustomerRet>`
        else code = '500'
      } else if (name === 'CustomerAddRq') {
        const customer = text(child(reqNode, 'CustomerAdd'), 'Name')
        customers.add(customer)
        inner = `<CustomerRet><FullName>${esc(customer)}</FullName></CustomerRet>`
      } else if (name === 'SalesReceiptAddRq') {
        const receipt = child(reqNode, 'SalesReceiptAdd')!
        assert.ok(customers.has(text(child(receipt, 'CustomerRef'), 'FullName')))
        const ref = text(receipt, 'RefNumber')
        assert.ok(!receiptIds.has(ref), 'duplicate receipt add')
        const id = `TXN${++added}`; receiptIds.set(ref, id)
        const exportRow = db.prepare('SELECT * FROM qb_sale_exports WHERE ref_number = ?').get(ref) as any
        receiptDetails.set(ref, `<CustomerRef><FullName>${esc(exportRow.customer_name)}</FullName></CustomerRef><TotalAmount>${(exportRow.total_cents / 100).toFixed(2)}</TotalAmount><Memo>${esc(text(receipt, 'Memo'))}</Memo>`)
        inner = `<SalesReceiptRet><TxnID>${id}</TxnID></SalesReceiptRet>`
        if (dropLastResponse) {
          await soap('closeConnection', { ticket })
          return
        }
      } else throw new Error(`Unexpected mock request ${name}`)
      const response = `<QBXML><QBXMLMsgsRs><${name.replace(/Rq$/, 'Rs')} statusCode="${code}">${inner}</${name.replace(/Rq$/, 'Rs')}></QBXMLMsgsRs></QBXML>`
      const progress = text(await soap('receiveResponseXML', { ticket, response }), 'receiveResponseXMLResult')
      if (progress === '100') break
    }
    await soap('closeConnection', { ticket })
  }
  await soap('serverVersion')
  check('generic Web Connector contact is not recorded as successful sync', () => assert.equal(operationsStatus(db).quickbooks.lastSyncAt, null))
  await sync(true)
  check('interrupted connector session is not recorded as successful sync', () => assert.equal(operationsStatus(db).quickbooks.lastSyncAt, null))
  const firstAdded = added
  await sync()
  check('Web Connector recovers a lost add response by querying the receipt before retrying', () => {
    assert.ok(firstAdded > 0)
    assert.ok(listExports(db).some((e) => e.status === 'sent'))
    assert.equal(new Set(receiptIds.values()).size, added)
    assert.ok(listExports(db).filter((e) => e.status === 'sent').every((e) => e.txnId))
  })
  const lastSync = operationsStatus(db).quickbooks.lastSyncAt
  check('completed connector session records successful connection and sync separately', () => {
    assert.ok(lastSync)
    assert.ok(operationsStatus(db).quickbooks.lastConnectionAt)
    assert.equal(transactionQueue(db, { ids: [named.id] }).rows[0].status, 'synced')
  })
  const before = added
  await sync()
  check('a completed second sync adds no duplicate transactions', () => assert.equal(added, before))
  const beforeFailureSync = operationsStatus(db).quickbooks.lastSyncAt
  const collided = createSale(db, request())
  const collisionRef = `DP${collided.id.toString(36).toUpperCase()}`
  receiptIds.set(collisionRef, 'UNRELATED')
  receiptDetails.set(collisionRef, '<Memo>Unrelated receipt</Memo><TotalAmount>0.11</TotalAmount>')
  await sync()
  check('an unrelated QuickBooks receipt number collision is flagged, not marked sent', () => {
    assert.equal(listExports(db).find((e) => e.saleId === collided.id)!.status, 'error')
    assert.equal(added, before)
  })
  check('failed sync retains the last successful time and shows unresolved export counts', () => {
    const state = operationsStatus(db).quickbooks
    assert.equal(state.lastSyncAt, beforeFailureSync)
    assert.ok(state.error)
    assert.ok(state.problems > 0)
    assert.ok(state.manual > 0)
  })
  configureApi(base, 'test')
  // A valid checkout over the actual API behaves the same as the direct service.
  const httpRequest = request()
  const httpSale = await api.createSale(httpRequest)
  const httpRetry = await api.createSale(httpRequest)
  check('checkout API repeats the original receipt', () => assert.equal(httpRetry.id, httpSale.id))
  await assert.rejects(api.createSale(request({ heldId })), (e: any) => e.definite === true && /already completed/.test(e.message))
  checks++; console.log('PASS held receipt conflicts are definite HTTP rejections, not uncertain network failures')
  const nativeFetch = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response('{truncated', { status: 200 })
    await assert.rejects(api.createSale(request()), /incomplete/)
    checks++; console.log('PASS incomplete success response is an uncertain checkout, not an empty saved sale')
  } finally { globalThis.fetch = nativeFetch }
  await assert.rejects(startServer({ dbFile: path.join(dir, 'busy.db'), apiKey: 'test', port, host: '127.0.0.1', appVersion: '0.3.22' }), /EADDRINUSE/)
  check('occupied port does not leave the store server marked running', () => assert.equal(isServerRunning(), false))
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await startServer({ dbFile: path.join(dir, 'retry.db'), apiKey: 'test', port, host: '127.0.0.1', appVersion: '0.3.22' })
  await stopServer()
  check('server starts after a failed startup and waits for backup before closing', () => assert.equal(isServerRunning(), false))
  db.close()
  console.log(`\n${checks} regression checks passed.`)
}
main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => fs.rmSync(dir, { recursive: true, force: true }))
