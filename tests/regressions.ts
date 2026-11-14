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
import { createVerifiedBackup } from '../src/main/server/backup'
import { returnableSale } from '../src/main/server/returns'
import { returnAmount } from '../src/shared/returns'
import { getQbConfig, saveQbConfig, saveQbLists, listExports } from '../src/main/server/quickbooks/store'
import { individualSummaries } from '../src/main/server/quickbooks/summary'
import { rq, parseResponse } from '../src/main/server/quickbooks/qbxml'
import { parseXml, child, text, esc } from '../src/main/server/quickbooks/xml'
import { api, configureApi } from '../src/renderer/src/api'
import type { SaleRequest } from '../src/shared/types'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diamondpos-regression-'))
let checks = 0
const check = (name: string, fn: () => void) => { fn(); checks++; console.log(`PASS ${name}`) }
async function main() {
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
  await sync(true)
  const firstAdded = added
  await sync()
  check('Web Connector recovers a lost add response by querying the receipt before retrying', () => {
    assert.ok(firstAdded > 0)
    assert.ok(listExports(db).some((e) => e.status === 'sent'))
    assert.equal(new Set(receiptIds.values()).size, added)
    assert.ok(listExports(db).filter((e) => e.status === 'sent').every((e) => e.txnId))
  })
  const before = added
  await sync()
  check('a completed second sync adds no duplicate transactions', () => assert.equal(added, before))
  const collided = createSale(db, request())
  const collisionRef = `DP${collided.id.toString(36).toUpperCase()}`
  receiptIds.set(collisionRef, 'UNRELATED')
  receiptDetails.set(collisionRef, '<Memo>Unrelated receipt</Memo><TotalAmount>0.11</TotalAmount>')
  await sync()
  check('an unrelated QuickBooks receipt number collision is flagged, not marked sent', () => {
    assert.equal(listExports(db).find((e) => e.saleId === collided.id)!.status, 'error')
    assert.equal(added, before)
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
