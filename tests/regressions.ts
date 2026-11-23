import {testQbTaxMapping} from './qb-tax-mapping'
import {testReceiptAddress} from './receipt-address'
import {testQbGeneral} from './qb-general'
import {testServiceTexts} from './service-texts'
import { testFeeBillingAndCustomerSearch } from './fee-billing-customer-search'
import { testCardTypes } from './card-types'
import { testReceivingAlerts } from './receiving-alerts'
import { displayScale,normaliseDisplayZoom } from '../src/shared/display'
import { costCell, SALE_COLUMNS, DEFAULT_SALE_COLUMNS, visibleColumns } from '../src/renderer/src/saleColumns'
import { testLifecycle } from './lifecycle'
import { testCampaignAnalytics } from './marketing-analytics'
import { testResubscribe } from './marketing-resubscribe'
import { testServiceAudience } from './marketing-service-audience'
import { testMarketingTracking } from './marketing-tracking'
import { testMarketingConsent } from './marketing-consent'
import { testCustomerEquipment } from './customer-equipment'
import { testEndOfDay } from './end-of-day'
import { testSaleDates } from './sale-dates'
import { testBackupSettings } from './backup-settings'
import { testItemTools } from './item-tools'
import { testAccountsStock } from './accounts-stock'
import { testRetiredStage } from './retired-stage'
import { testReportingVoids } from './reporting-voids'
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
import { getWoSettings, saveWoSettings } from '../src/main/server/workorders'
import { STAGES, DEFAULT_STAGE_COLORS, normaliseStageColors, stageStyle } from '../src/shared/workorders'
import { cleanVendor, saveVendor, vendorDetail, vendorIdForName } from '../src/main/server/vendors'
import { getProduct } from '../src/main/server/products'
import { returnAmount } from '../src/shared/returns'
import { getQbConfig, saveQbConfig, saveQbLists, listExports } from '../src/main/server/quickbooks/store'
import { transactionQueue, queueTransactions } from '../src/main/server/quickbooks/queue'
import { individualSummaries } from '../src/main/server/quickbooks/summary'
import { rq, parseResponse } from '../src/main/server/quickbooks/qbxml'
import { parseXml, child, text, esc } from '../src/main/server/quickbooks/xml'
import { api, configureApi } from '../src/renderer/src/api'
import { CARD_BRANDS, paymentLabel } from '../src/shared/types'
import { DEFAULT_DRAWER, drawerConfig, drawerCommand } from '../src/shared/drawer'
import { openCashDrawer } from '../src/main/drawer'
import { receiptHtml } from '../src/renderer/src/receipt'
import type { SaleRequest } from '../src/shared/types'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diamondpos-regression-'))
let checks = 0
const check = (name: string, fn: () => void) => { fn(); checks++; console.log(`PASS ${name}`) }
async function main() {
  testQbTaxMapping(check,dir)
  testReceiptAddress(check,dir)
  testQbGeneral(check,dir)
  testCardTypes(check,dir)
  await testReceivingAlerts(check,dir)
  await testServiceTexts(check,dir)
  await testFeeBillingAndCustomerSearch(check,dir)
  check('auto fit uses available window size rather than physical monitor pixels and avoids excessive shrinking',()=>{
    assert.equal(displayScale(1536,800),.94);assert.equal(displayScale(1920,1080),1)
    assert.equal(displayScale(1024,600),.85);assert.equal(displayScale(8000,4000),1)
    assert.equal(displayScale(1536,800,1.1),1.1)
  })
  check('invalid display preferences fall back to auto fit and invalid geometry stays at normal scale',()=>{
    assert.equal(normaliseDisplayZoom(0),'auto');assert.equal(normaliseDisplayZoom(Number.NaN),'auto')
    assert.equal(displayScale(0,0),1);assert.equal(displayScale(1536,800,'bad'),.94)
  })

  const costRow:any={kind:'item',hasCostItem:true,costInfo:{orderCostCents:1200,lastReceivedCostCents:1400,currentAvgCents:1350}}
  check('sale column menu offers three distinct unit costs without exposing them in default columns',()=>{
    assert.ok(['cost','lastReceivedCost','averageCost'].every(id=>SALE_COLUMNS.some(c=>c.id===id)))
    assert.ok(['cost','lastReceivedCost','averageCost'].every(id=>!DEFAULT_SALE_COLUMNS.includes(id)))
    assert.ok(visibleColumns(['sku','lastReceivedCost','averageCost']).some(c=>c.id==='lastReceivedCost'))
    assert.equal(costCell(costRow,'orderCostCents'),'$12.00');assert.equal(costCell(costRow,'lastReceivedCostCents'),'$14.00');assert.equal(costCell(costRow,'currentAvgCents'),'$13.50')
  })
  check('cost columns distinguish zero cost, no history, unavailable data and non-product rows',()=>{
    assert.equal(costCell({...costRow,costInfo:{...costRow.costInfo,lastReceivedCostCents:0}},'lastReceivedCostCents'),'$0.00')
    assert.equal(costCell({...costRow,costInfo:{...costRow.costInfo,lastReceivedCostCents:null}},'lastReceivedCostCents'),'—')
    assert.equal(costCell({...costRow,costInfo:null},'currentAvgCents'),'Unavailable')
    assert.equal(costCell({...costRow,costInfo:undefined},'currentAvgCents'),'…')
    assert.equal(costCell({hasCostItem:false} as any,'currentAvgCents'),'')
    assert.equal(costCell({...costRow,kind:'return'},'currentAvgCents'),'$13.50')
  })

  await testLifecycle(check, dir)
  await testCampaignAnalytics(check, dir)
  await testResubscribe(check, dir)
  testServiceAudience(check, dir)
  await testMarketingTracking(check, dir)
  await testMarketingConsent(check, dir)
  await testCustomerEquipment(check, dir)
  await testEndOfDay(check, dir)
  await testSaleDates(check, dir)
  await testBackupSettings(check, dir)
  await testItemTools(check, dir)
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
  check('drawer defaults match the existing COM3 hello trigger and start disabled', () => {
    assert.equal(drawerConfig().enabled, false)
    assert.equal(drawerConfig({ port: 'com3' }).port, 'COM3')
    assert.equal(drawerCommand(), 'echo(hello>COM3')
    assert.equal(drawerCommand({ port: 'COM10' }), 'echo(hello>\\\\.\\COM10')
  })
  check('drawer validation rejects executable paths, shell operators and reserved POS keys', () => {
    for (const port of ['COM0','COM257','COM3 & whoami','C:\\file']) assert.throws(() => drawerConfig({ port }))
    for (const triggerText of ['hello&whoami','%PATH%','a>file','x\nshutdown','a|b','"quoted"']) assert.throws(() => drawerConfig({ triggerText }))
    assert.throws(() => drawerConfig({ shortcut: 'F7' as any }))
  })
  await assert.rejects(openCashDrawer(), /Enable/)
  await assert.rejects(openCashDrawer({ ...DEFAULT_DRAWER, enabled: true }, { platform: 'linux', run: async () => {} }), /Windows/)
  let finishSignal: (() => void) | undefined
  let emittedCommand = ''
  const signal = openCashDrawer({ ...DEFAULT_DRAWER, enabled: true }, { platform: 'win32', run: async (command) => {
    emittedCommand = command; await new Promise<void>((resolve) => { finishSignal = resolve })
  } })
  await assert.rejects(openCashDrawer({ ...DEFAULT_DRAWER, enabled: true }, { platform: 'win32', run: async () => {} }), /wait/)
  finishSignal!(); await signal
  check('drawer command is gated by enable/platform and blocks overlapping open requests', () => assert.equal(emittedCommand, 'echo(hello>COM3'))
  const file = path.join(dir, 'store.db')
  // Start at the uploaded v21 schema, with an enabled existing integration.
  let db = new Database(file)
  db.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)')
  for (const m of migrations.filter((m) => m.version <= 21)) {
    db.exec(m.up); db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name)
  }
  db.prepare("INSERT INTO settings VALUES ('qb_config', ?)").run(JSON.stringify({ enabled: true, startDate: '2026-01-01', customerName: 'DiamondPOS Daily Sales' }))
  const legacyCardSale = Number(db.prepare("INSERT INTO sales (till_name,total_cents,tax_cents,status) VALUES ('Legacy',10,0,'void')").run().lastInsertRowid)
  db.prepare("INSERT INTO payments (sale_id,method,amount_cents,reference) VALUES (?,'card',10,'OLD-CARD-REF')").run(legacyCardSale)
  db.prepare("UPDATE products SET vendor = 'LEGACY SUPPLIER' WHERE id = 1").run()
  const legacyReceiving = Number(db.prepare("INSERT INTO receivings (vendor) VALUES (' legacy supplier ')").run().lastInsertRowid)
  db.close()
  db = openDatabase(file)
  check('v21 upgrade backs up first and disables the changed QuickBooks format', () => {
    assert.equal(db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v, 43)
    assert.equal(getQbConfig(db).enabled, false)
    assert.ok(fs.readdirSync(path.join(dir, 'backups')).some((n) => n.startsWith('store-before-v22')))
  })
  check('vendor migration deduplicates supplier names and preserves receiving snapshots', () => {
    const id = vendorIdForName(db,'legacy supplier')!
    assert.ok(id)
    assert.equal(db.prepare('SELECT vendor_id FROM products WHERE id=1').get().vendor_id,id)
    const row=db.prepare('SELECT vendor,vendor_id FROM receivings WHERE id=?').get(legacyReceiving)
    assert.equal(row.vendor,' legacy supplier '); assert.equal(row.vendor_id,id)
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM vendors WHERE company_name='legacy supplier' COLLATE NOCASE").get().n,1)
  })
  check('vendor validation rejects missing company, invalid contacts and payment terms', () => {
    for (const value of [{}, {companyName:'A',email:'bad'}, {companyName:'A',website:'javascript:alert(1)'}, {companyName:'A',netDays:-1}, {companyName:'A',discountDays:1.5}, {companyName:'A',discountPercent:101}]) assert.throws(()=>cleanVendor(value))
    assert.equal(cleanVendor({companyName:'A',website:'example.com'}).website,'https://example.com/')
  })
  const supplier=saveVendor(db,{companyName:'Diamond Parts',firstName:'Pat',postcode:'00123',netDays:30,discountPercent:2,discountDays:10,accountNumber:'AC-1',notes:'Order units here'})
  const vendorRv=Number(db.prepare("INSERT INTO receivings (vendor,vendor_id,status,freight_cents) VALUES (?,?, 'posted',25)").run(supplier.companyName,supplier.id).lastInsertRowid)
  db.prepare('INSERT INTO receiving_lines (receiving_id,product_id,qty,unit_cost_cents) VALUES (?,1,2,100)').run(vendorRv)
  db.prepare('UPDATE products SET vendor=?,vendor_id=? WHERE id=1').run(supplier.companyName,supplier.id)
  const renamed=saveVendor(db,{companyName:'Diamond Parts & Units',active:false},supplier.id)
  check('vendor rename preserves contacts and history while updating item vendor names', () => {
    assert.equal(renamed.postcode,'00123');assert.equal(renamed.netDays,30);assert.equal(renamed.notes,'Order units here')
    assert.equal(db.prepare('SELECT vendor FROM products WHERE id=1').get().vendor,renamed.companyName)
    assert.equal(db.prepare('SELECT vendor FROM receivings WHERE id=?').get(vendorRv).vendor,'Diamond Parts')
    const detail=vendorDetail(db,supplier.id)!
    assert.equal(detail.postedTotalCents,225);assert.equal(detail.postedCount,1);assert.equal(detail.history[0].id,vendorRv)
    assert.equal(vendorIdForName(db,' diamond parts & units '),supplier.id)
    assert.throws(()=>saveVendor(db,{companyName:'DIAMOND PARTS & UNITS'}),/already exists/)
    assert.throws(()=>saveVendor(db,{companyName:'Missing'},999999),/not found/)
  })
  db.prepare("UPDATE settings SET value = '0.0725' WHERE key = 'tax_rate'").run()
  db.prepare('UPDATE products SET price_cents = 5, on_hand = 100, taxable = 1 WHERE id = 1').run()
  const request = (extra: Partial<SaleRequest> = {}): SaleRequest => ({ requestId: crypto.randomUUID(), tillName: 'Till A',
    items: [{ productId: 1, qty: 2 }], payments: [{ method: 'cash', amountCents: 11 }], ...extra })
  check('migration preserves legacy card references without inventing historical brands', () => {
    const row = db.prepare('SELECT reference,card_brand FROM payments WHERE sale_id = ?').get(legacyCardSale)
    assert.equal(row.reference, 'OLD-CARD-REF'); assert.equal(row.card_brand, null)
  })
  const visaRequest = request({ payments: [{ method: 'card', amountCents: 11, cardBrand: 'visa' }] })
  const visaSale = createSale(db, visaRequest)
  const unknownSale = createSale(db, request({ payments: [{ method: 'card', amountCents: 11 }] }))
  check('optional card brands persist and checkout retries retain the original receipt', () => {
    assert.equal(visaSale.payments[0].cardBrand, 'visa')
    assert.equal(visaSale.payments[0].reference, undefined)
    assert.equal(createSale(db, visaRequest).id, visaSale.id)
    assert.equal(unknownSale.payments[0].cardBrand, 'unknown')
    assert.equal(paymentLabel(visaSale.payments[0]), 'Card · Visa')
    assert.ok(receiptHtml(visaSale, readSettings(db), 80).includes('Card · Visa'))
  })
  const visaReturnInfo = returnableSale(db, visaSale.id)!
  const visaRefund = createSale(db, request({ items: [], returns: [{ saleItemId: visaReturnInfo.lines[0].saleItemId, qty: 2, reason: 'Other', restock: true }], payments: [{ method: 'card', amountCents: -11, cardBrand: 'visa' }] }))
  check('card refunds and original returnable receipts retain brand without requiring terminal reference', () => {
    assert.equal(visaReturnInfo.payments[0].cardBrand, 'visa')
    assert.equal(visaRefund.payments[0].cardBrand, 'visa')
    assert.equal(visaRefund.payments[0].reference, undefined)
  })
  const checkSale = createSale(db, request({ payments: [{ method: 'check', amountCents: 11, reference: 'CHECK123' }] }))
  check('check payments still store check numbers with no card brand', () => {
    assert.equal(checkSale.payments[0].reference, 'CHECK123')
    assert.equal(checkSale.payments[0].cardBrand, undefined)
  })
  check('invalid brands and brands on noncard payments are rejected without recording a sale', () => {
    assert.throws(() => createSale(db, request({ payments: [{ method: 'card', amountCents: 11, cardBrand: 'invalid' as any }] })), /valid card type/)
    assert.throws(() => createSale(db, request({ payments: [{ method: 'cash', amountCents: 11, cardBrand: 'visa' }] })), /valid card type/)
    assert.throws(() => createSale(db, request({ payments: [{ method: 'card', amountCents: 5, cardBrand: 'visa' }, { method: 'card', amountCents: 6, cardBrand: 'mastercard' }] })), /one card type/)
    assert.throws(() => createSale(db, request({ payments: [{ method: 'check', amountCents: 11 }] })), /check number/)
  })
  db.prepare('UPDATE products SET on_hand = 100 WHERE id = 1').run()
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
  const equipmentCustomer = Number(db.prepare("INSERT INTO customers (first_name,last_name) VALUES ('Equipment','Buyer')").run().lastInsertRowid)
  const serialSale = createSale(db, request({ customerId: equipmentCustomer, items: [{ productId: 2, qty: 1, serial: 'MOWER-123' }], payments: [{ method: 'cash', amountCents: 100 }] }))
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
  check('serialized sales require both serial and customer on the server', () => {
    const count = db.prepare('SELECT COUNT(*) AS n FROM sales').get().n
    assert.throws(() => createSale(db, request({ customerId: equipmentCustomer, items: [{ productId: 2, qty: 1 }], payments: [{ method: 'cash', amountCents: 100 }] })), /serial number/)
    assert.throws(() => createSale(db, request({ items: [{ productId: 2, qty: 1, serial: 'NEW-SERIAL' }], payments: [{ method: 'cash', amountCents: 100 }] })), /select a customer/)
    assert.throws(() => createSale(db, request({ items: [{ productId: 1, qty: 1, serial: 'OPTIONAL-SERIAL' }] })), /select a customer/)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sales').get().n, count)
  })
  check('serial duplicates are rejected within checkout and against sold history, ignoring letter case', () => {
    const stock = db.prepare('SELECT on_hand AS n FROM products WHERE id = 2').get().n
    assert.throws(() => createSale(db, request({ customerId: equipmentCustomer, items: [{ productId: 2, qty: 1, serial: 'DUP-1' }, { productId: 2, qty: 1, serial: ' dup-1 ' }], payments: [{ method: 'cash', amountCents: 200 }] })), /already on this sale/)
    // The earlier damaged no-receipt return cannot release an unrelated original sale's ownership link.
    assert.throws(() => createSale(db, request({ customerId: equipmentCustomer, items: [{ productId: 2, qty: 1, serial: ' mower-123 ' }], payments: [{ method: 'cash', amountCents: 100 }] })), /already sold/)
    assert.throws(() => createSale(db, request({ customerId: equipmentCustomer, items: [{ productId: 2, qty: 1, serial: 'x'.repeat(81) }], payments: [{ method: 'cash', amountCents: 100 }] })), /80 characters/)
    assert.equal(db.prepare('SELECT on_hand AS n FROM products WHERE id = 2').get().n, stock)
  })
  const originalUnit = db.prepare('SELECT * FROM customer_units WHERE sale_id = ?').get(serialSale.id) as any
  check('serialized sale creates an equipment record linked to customer and receipt', () => {
    assert.equal(originalUnit.customer_id, equipmentCustomer)
    assert.equal(originalUnit.serial, 'MOWER-123')
    assert.equal(originalUnit.active, 1)
  })
  createSale(db, request({ items: [], returns: [{ saleItemId: serialReceipt.lines[0].saleItemId, qty: 1, reason: 'Other', restock: true }], payments: [{ method: 'cash', amountCents: -100 }] }))
  const nextEquipmentCustomer = Number(db.prepare("INSERT INTO customers (first_name,last_name) VALUES ('Resale','Buyer')").run().lastInsertRowid)
  const resaleRequest = request({ customerId: nextEquipmentCustomer, items: [{ productId: 2, qty: 1, serial: 'MOWER-123' }], payments: [{ method: 'cash', amountCents: 100 }] })
  const resale = createSale(db, resaleRequest)
  check('receipt-linked return allows legitimate resale while retaining previous equipment history', () => {
    assert.equal(db.prepare('SELECT active FROM customer_units WHERE id = ?').get(originalUnit.id).active, 0)
    assert.equal(db.prepare('SELECT customer_id FROM customer_units WHERE sale_id = ?').get(resale.id).customer_id, nextEquipmentCustomer)
    assert.equal(createSale(db, resaleRequest).id, resale.id)
  })
  const resaleReceipt = returnableSale(db, resale.id)!
  const exchangedSerial = createSale(db, request({ customerId: nextEquipmentCustomer,
    items: [{ productId: 2, qty: 1, serial: 'MOWER-123' }],
    returns: [{ saleItemId: resaleReceipt.lines[0].saleItemId, qty: 1, reason: 'Other', restock: true }], payments: [] }))
  check('a receipt-linked return and resale on the same exchange keeps only the new equipment record active', () => {
    assert.equal(exchangedSerial.totalCents, 0)
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM customer_units WHERE serial = 'MOWER-123' AND active = 1").get().n, 1)
    assert.equal(db.prepare('SELECT active FROM customer_units WHERE sale_id = ?').get(exchangedSerial.id).active, 1)
  })
  check('work-order colors default for existing settings and validate known stage hex colors', () => {
    assert.deepEqual(getWoSettings(db).stageColors, DEFAULT_STAGE_COLORS)
    const settings = saveWoSettings(db, { stageColors: { ...DEFAULT_STAGE_COLORS, approved: '#FFFFFF', ready_review: '#000000' } })
    assert.equal(settings.stageColors.approved, '#ffffff')
    assert.equal(stageStyle('approved', settings.stageColors).color, '#000000')
    assert.equal(stageStyle('ready_review', settings.stageColors).color, '#ffffff')
    assert.throws(() => saveWoSettings(db, { stageColors: { approved: 'red' } as any }), /valid/)
    assert.throws(() => saveWoSettings(db, { stageColors: { invented: '#ffffff' } as any }), /valid/)
    assert.equal(normaliseStageColors({ approved: 'bad' }).approved, DEFAULT_STAGE_COLORS.approved)
  })
  check('partial settings updates preserve shared colors and do not alter stage transitions', () => {
    saveWoSettings(db, { laborRateCents: 12300 })
    assert.equal(getWoSettings(db).stageColors.approved, '#ffffff')
    assert.ok(STAGES.find((s) => s.status === 'approved')!.next.includes('waiting_parts'))
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
    assert.equal(getWoSettings(db).stageColors.approved, '#ffffff')
  })
  const cust1 = Number(db.prepare("INSERT INTO customers (first_name,last_name) VALUES ('Greg & Co','Barnes')").run().lastInsertRowid)
  const cust2 = Number(db.prepare("INSERT INTO customers (first_name,last_name) VALUES ('Greg & Co','Barnes')").run().lastInsertRowid)
  const named = createSale(db, request({ customerId: cust1 }))
  const other = createSale(db, request({ customerId: cust2 }))
  const date = db.prepare("SELECT date(created_at, 'localtime') AS d FROM sales WHERE id = ?").get(named.id).d
  saveQbConfig(db, { enabled: true, startDate: date, defaultIncomeAccount: 'Sales', salesTaxItem: 'State Tax', refreshLists: false })
  saveQbLists(db, { fetchedAt: new Date().toISOString(), salesTaxItems: [{ name: 'State Tax', rate: 7.25 }], otherChargeItems: ['POS General', 'POS Tax Rounding'] })
  const cfg = getQbConfig(db)
  check('card-brand mappings preserve defaults and survive old-client partial updates', () => {
    assert.equal(getQbConfig(db).cardBrands.visa, '')
    saveQbConfig(db, { cardBrands: { ...getQbConfig(db).cardBrands, visa: 'Visa Payment' }, methods: { ...getQbConfig(db).methods, card: { ...getQbConfig(db).methods.card, paymentMethod: 'General Card' } } })
    saveQbConfig(db, { refreshLists: false })
    const mapping = getQbConfig(db)
    assert.equal(mapping.cardBrands.visa, 'Visa Payment')
    const dateSummaries = individualSummaries(db, date, mapping, 0.0725, 0.0725)
    const v = dateSummaries.find((s) => s.saleId === visaSale.id)!
    assert.equal(v.cardBrand, 'visa')
    const xml = rq.addSalesReceipt(v, mapping)
    assert.ok(xml.includes('<FullName>Visa Payment</FullName>'))
    assert.ok(xml.includes('Card brand: Visa'))
    const fallback = rq.addSalesReceipt(dateSummaries.find((s) => s.saleId === unknownSale.id)!, mapping)
    assert.ok(fallback.includes('<FullName>General Card</FullName>'))
  })
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
  const vendorHeaders={'X-Api-Key':'test','Content-Type':'application/json'}
  const mechanicRequest=async(url:string,body:unknown)=>fetch(base+url,{method:'POST',headers:vendorHeaders,body:JSON.stringify(body)})
  await mechanicRequest('/api/workorders/mechanics',{name:'Bench Mechanic'})
  const mechanics=await (await fetch(base+'/api/workorders/mechanics',{headers:vendorHeaders})).json()
  const mechanic=mechanics.find((m:any)=>m.name==='Bench Mechanic')
  const benchCustomer=Number(db.prepare("INSERT INTO customers(first_name,last_name) VALUES ('Bench','Test')").run().lastInsertRowid)
  const benchUnit=Number(db.prepare("INSERT INTO customer_units(customer_id,model) VALUES (?,'Test')").run(benchCustomer).lastInsertRowid)
  const benchWo=Number(db.prepare('INSERT INTO work_orders(customer_id,unit_id) VALUES (?,?)').run(benchCustomer,benchUnit).lastInsertRowid)
  const unapproved=await mechanicRequest(`/api/workorders/${benchWo}/status`,{status:'on_bench'})
  const assigned=await (await mechanicRequest(`/api/workorders/${benchWo}/mechanic`,{mechanicId:mechanic.id,by:'Test staff'})).json()
  await mechanicRequest(`/api/workorders/mechanics/${mechanic.id}/remove`,{})
  const removed=await (await fetch(base+`/api/workorders/${benchWo}`,{headers:vendorHeaders})).json()
  const rejected=await mechanicRequest(`/api/workorders/${benchWo}/mechanic`,{mechanicId:mechanic.id})
  db.prepare("UPDATE work_orders SET status='approved' WHERE id=?").run(benchWo)
  db.prepare('UPDATE products SET on_hand=-1 WHERE id=1').run()
  db.prepare("INSERT INTO work_order_lines(work_order_id,kind,product_id,description,qty,stock_taken) VALUES (?,'part',1,'Bench part',1,1)").run(benchWo)
  const shortBench=await mechanicRequest(`/api/workorders/${benchWo}/status`,{status:'on_bench'})
  db.prepare('UPDATE products SET on_hand=2 WHERE id=1').run()
  const benched=await (await mechanicRequest(`/api/workorders/${benchWo}/status`,{status:'on_bench'})).json()
  check('bench requires approval and available parts, and does not deduct reserved stock again',()=>{
    assert.equal(unapproved.status,409);assert.equal(shortBench.status,409)
    assert.equal(benched.status,'on_bench');assert.equal(db.prepare('SELECT on_hand FROM products WHERE id=1').get().on_hand,2)
  })
  check('removed mechanics remain on assigned tickets and history but cannot receive new assignments',()=>{
    assert.equal(assigned.mechanicId,mechanic.id);assert.equal(removed.mechanicName,'Bench Mechanic')
    assert.equal(rejected.status,400);assert.ok(removed.history.some((h:any)=>h.note.includes('Bench Mechanic')&&h.by==='Test staff'))
  })
  await mechanicRequest('/api/workorders/mechanics',{name:'bench mechanic'})
  const restoredMechanics=await (await fetch(base+'/api/workorders/mechanics',{headers:vendorHeaders})).json()
  check('adding a removed mechanic again restores the original identity',()=>assert.equal(restoredMechanics.find((m:any)=>m.id===mechanic.id).active,true))
  const groupGet=async(id:number)=> (await fetch(base+`/api/workorders/${id}`,{headers:vendorHeaders})).json()
  const groupNew=async(linkToId?:number)=>{
    const u=Number(db.prepare("INSERT INTO customer_units(customer_id,unit_type,brand,model,serial) VALUES (?,'Chainsaw','Test','Saw',?)").run(benchCustomer,crypto.randomUUID()).lastInsertRowid)
    const res=await mechanicRequest('/api/workorders',{customerId:benchCustomer,unitId:u,problem:'Repair saw',feeCents:0,linkToId,by:'Group staff'})
    assert.equal(res.status,201);return res.json()
  }
  const groupA=await groupNew(benchWo),groupB=await groupNew(),groupC=await groupNew(groupB.id)
  const unrelated=await groupNew()
  const stockBeforeGroup=db.prepare('SELECT on_hand FROM products WHERE id=1').get().on_hand
  const totalsBeforeGroup=(await groupGet(benchWo)).totals
  const merged=await (await mechanicRequest(`/api/workorders/${benchWo}/group`,{otherId:groupB.id,by:'Group staff'})).json()
  await mechanicRequest(`/api/workorders/${benchWo}/group`,{otherId:groupB.id,by:'Group staff'})
  const allGrouped=await Promise.all([benchWo,groupA.id,groupB.id,groupC.id].map(groupGet))
  const unrelatedState=await groupGet(unrelated.id)
  check('a visit can join two groups into four ordered tickets while leaving unrelated visits separate',()=>{
    assert.equal(merged.group.count,4)
    assert.deepEqual(allGrouped.map(w=>w.group.position),[1,2,3,4])
    assert.ok(allGrouped.every(w=>w.group.count===4&&w.group.id===merged.group.id))
    assert.equal(unrelatedState.group,null)
    assert.equal(merged.relatedOrders.filter((w:any)=>w.linked).length,4)
  })
  check('grouping preserves statuses, stock reservations and ticket totals',()=>{
    assert.equal(merged.status,'on_bench');assert.deepEqual(merged.totals,totalsBeforeGroup)
    assert.equal(db.prepare('SELECT on_hand FROM products WHERE id=1').get().on_hand,stockBeforeGroup)
    assert.equal(allGrouped[1].status,'needs_estimate')
    assert.ok(merged.history.some((h:any)=>h.note.includes('Grouped customer visit')&&h.by==='Group staff'))
  })
  const otherCustomer=Number(db.prepare("INSERT INTO customers(first_name,last_name) VALUES ('Other','Group')").run().lastInsertRowid)
  const otherUnit=Number(db.prepare('INSERT INTO customer_units(customer_id) VALUES (?)').run(otherCustomer).lastInsertRowid)
  const otherTicket=Number(db.prepare('INSERT INTO work_orders(customer_id,unit_id) VALUES (?,?)').run(otherCustomer,otherUnit).lastInsertRowid)
  const crossGroup=await mechanicRequest(`/api/workorders/${benchWo}/group`,{otherId:otherTicket})
  const beforeBadCreate=db.prepare('SELECT COUNT(*) AS n FROM work_orders').get().n
  const badCreate=await mechanicRequest('/api/workorders',{customerId:otherCustomer,unitId:otherUnit,problem:'Different customer',linkToId:benchWo})
  check('grouping rejects different customers and rolls back a new ticket if linking fails',()=>{
    assert.equal(crossGroup.status,400);assert.equal(badCreate.status,400)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM work_orders').get().n,beforeBadCreate)
  })
  db.prepare("UPDATE work_orders SET status='closed' WHERE id=?").run(groupC.id)
  const withClosed=await groupGet(benchWo)
  await mechanicRequest(`/api/workorders/${groupA.id}/ungroup`,{by:'Group staff'})
  const detached=await groupGet(groupA.id),remaining=await groupGet(benchWo)
  check('completed equipment remains in visit counts and detaching renumbers remaining tickets without deleting repairs',()=>{
    assert.equal(withClosed.group.count,4);assert.ok(withClosed.relatedOrders.some((w:any)=>w.id===groupC.id&&w.linked&&w.status==='closed'))
    assert.equal(detached.group,null);assert.equal(remaining.group.count,3)
    assert.equal(detached.status,'needs_estimate');assert.equal(remaining.status,'on_bench')
    assert.ok(detached.history.some((h:any)=>h.note.includes('removed from customer visit group')))
  })
  await mechanicRequest(`/api/workorders/${groupB.id}/ungroup`,{})
  await mechanicRequest(`/api/workorders/${benchWo}/ungroup`,{})
  check('removing the last pair dissolves a group cleanly',()=>{
    assert.equal(db.prepare('SELECT group_id FROM work_orders WHERE id=?').get(benchWo).group_id,null)
    assert.equal(db.prepare('SELECT group_id FROM work_orders WHERE id=?').get(groupC.id).group_id,null)
  })
  const activeVendors=await (await fetch(`${base}/api/vendors`,{headers:vendorHeaders})).json()
  const allVendors=await (await fetch(`${base}/api/vendors?includeInactive=1`,{headers:vendorHeaders})).json()
  const vendorUnauthorized=await fetch(`${base}/api/vendors`)
  const duplicateVendor=await fetch(`${base}/api/vendors`,{method:'POST',headers:vendorHeaders,body:JSON.stringify({companyName:renamed.companyName})})
  check('paired vendor API hides inactive suppliers by default and rejects duplicates',()=>{
    assert.equal(vendorUnauthorized.status,401);assert.equal(duplicateVendor.status,409)
    assert.ok(!activeVendors.some((v:any)=>v.id===supplier.id));assert.ok(allVendors.some((v:any)=>v.id===supplier.id))
  })
  const newVendorResponse=await fetch(`${base}/api/vendors`,{method:'POST',headers:vendorHeaders,body:JSON.stringify({companyName:'API Supplier',email:'orders@example.com'})})
  const apiVendor=await newVendorResponse.json()
  const newRvResponse=await fetch(`${base}/api/receivings`,{method:'POST',headers:vendorHeaders,body:JSON.stringify({vendor:apiVendor.companyName,lines:[{productId:1,qty:1,unitCostCents:50}]})})
  const newRv=await newRvResponse.json()
  const editVendorResponse=await fetch(`${base}/api/vendors/${apiVendor.id}`,{method:'PUT',headers:vendorHeaders,body:JSON.stringify({companyName:'API Supplier Renamed'})})
  const vendorHistory=await (await fetch(`${base}/api/vendors/${apiVendor.id}`,{headers:vendorHeaders})).json()
  check('vendor API creates and edits suppliers and receiving links survive renames',()=>{
    assert.equal(newVendorResponse.status,201);assert.equal(newRvResponse.status,201);assert.equal(editVendorResponse.status,200)
    assert.equal(db.prepare('SELECT vendor_id FROM receivings WHERE id=?').get(newRv.id).vendor_id,apiVendor.id)
    assert.equal(vendorHistory.vendor.email,'orders@example.com');assert.equal(vendorHistory.history[0].id,newRv.id)
    assert.equal(vendorHistory.postedCount,0)
  })
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
  const equipmentResponse = await fetch(`${base}/api/equipment/serial?serial=mower-123`, { headers: { 'X-Api-Key': 'test' } })
  const equipmentMatches = await equipmentResponse.json() as any[]
  const equipmentUnauthorized = await fetch(`${base}/api/equipment/serial?serial=MOWER-123`)
  check('serial lookup is paired and includes current/prior customer equipment and sale links', () => {
    assert.equal(equipmentUnauthorized.status, 401)
    assert.equal(equipmentMatches.length, 3)
    assert.equal(equipmentMatches[0].unit.customerId, nextEquipmentCustomer)
    assert.equal(equipmentMatches[0].unit.saleId, exchangedSerial.id)
    assert.equal(equipmentMatches[1].unit.active, false)
  })
  const colorRead = await fetch(`${base}/api/workorders/settings`, { headers: { 'X-Api-Key': 'test' } }).then((r) => r.json())
  check('shared settings API supplies saved stage colors to every till', () => assert.equal(colorRead.stageColors.approved, '#ffffff'))
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
  check('server starts after a failed startup and safely stops before closing', () => assert.equal(isServerRunning(), false))
  db.close()
  testRetiredStage(check,dir)
  await testReportingVoids(check,dir)
  await testAccountsStock(check,dir)
  console.log(`\n${checks} regression checks passed.`)
}
main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => fs.rmSync(dir, { recursive: true, force: true }))
