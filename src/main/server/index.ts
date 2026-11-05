/**
 * The STORE SERVER.
 *
 * Runs inside the app on the one computer set up as "Store Server".
 * Every till (including the server PC itself) talks to it over HTTP on the
 * local network. It owns the database, so all tills see the same products and
 * sales. This file has no Electron imports, so it can also be run/tested with
 * plain Node.
 */
import express, { NextFunction, Request, Response } from 'express'
import type { Server } from 'http'
import { openDatabase, getSchemaVersion, DB } from './db'
import {
  DEFAULTS,
  ProductRow,
  ValidationError,
  getProduct,
  importProducts,
  insertProduct,
  toProduct,
  updateProduct,
  validateProduct
} from './products'
import {
  CUSTOMER_DEFAULTS,
  customerDetail,
  getCustomer,
  insertCustomer,
  searchCustomers,
  updateCustomer,
  validateCustomer
} from './customers'
import { registerKioskRoutes } from './kiosk'
import { registerQuickBooksRoutes } from './quickbooks/qbwc'
import { registerMarketingRoutes } from './marketing/routes'
import { startMarketingSender, stopMarketingSender } from './marketing/mailer'
import {
  addUnitFromSale,
  feeCreditLine,
  finishWorkOrderSale,
  prepareWorkOrderSale,
  registerWorkOrderRoutes,
  type PreparedWoSale
} from './workorders'
import { priceWithFeeCredit } from '../../shared/workorders'
import { ReturnError, finishReturns, prepareReturns, registerReturnRoutes, type PreparedReturns } from './returns'
import { MIN_CLIENT_VERSION } from '../../shared/constants'
import { customerDisplayName, taxExemptState } from '../../shared/types'
import { priceSale } from '../../shared/pricing'
import type {
  DailyReport,
  Health,
  PaymentInput,
  Sale,
  SaleRequest,
  SaleSummary,
  StoreSettings
} from '../../shared/types'

export interface ServerOptions {
  dbFile: string
  apiKey: string
  port: number
  appVersion: string
  host?: string
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

let httpServer: Server | null = null
let db: DB | null = null

export function isServerRunning(): boolean {
  return httpServer !== null
}

export async function startServer(opts: ServerOptions): Promise<void> {
  if (httpServer) return
  db = openDatabase(opts.dbFile)
  const app = createApp(db, opts)
  await new Promise<void>((resolve, reject) => {
    const s = app.listen(opts.port, opts.host ?? '0.0.0.0', () => resolve())
    s.on('error', reject)
    httpServer = s
  })
  console.log(`[server] Listening on port ${opts.port}`)
  startMarketingSender(db, readSettings) // sends mailers in the background (and resumes after a restart)
}

export async function stopServer(): Promise<void> {
  stopMarketingSender()
  if (httpServer) await new Promise<void>((r) => httpServer!.close(() => r()))
  httpServer = null
  db?.close()
  db = null
}

// ---------------------------------------------------------------------------

export function createApp(db: DB, opts: ServerOptions): express.Express {
  const app = express()
  // The QuickBooks Web Connector sends SOAP (XML), not JSON
  app.use('/qbwc', express.text({ type: () => true, limit: '20mb' }))
  app.use(express.json({ limit: '20mb' })) // large enough for bulk item imports

  // Allow the UI (loaded from a local file) to call this server
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })

  // Health check is public so a till can test the connection before pairing
  app.get('/api/health', (_req, res) => {
    const body: Health = {
      ok: true,
      serverVersion: opts.appVersion,
      schemaVersion: getSchemaVersion(db),
      minClientVersion: MIN_CLIENT_VERSION
    }
    res.json(body)
  })

  // Everything else needs the store's pairing code
  app.use('/api', (req, _res, next) => {
    if (req.header('X-Api-Key') !== opts.apiKey) throw new HttpError(401, 'Invalid pairing code')
    next()
  })

  // ----- Settings ----------------------------------------------------------
  app.get('/api/settings', (_req, res) => res.json(readSettings(db)))

  app.put('/api/settings', (req, res) => {
    const s = req.body as Partial<StoreSettings>
    const put = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    db.transaction(() => {
      if (s.storeName !== undefined) put.run('store_name', String(s.storeName))
      if (s.taxRate !== undefined) {
        const rate = Number(s.taxRate)
        if (!(rate >= 0 && rate < 1)) throw new HttpError(400, 'Tax rate must be between 0 and 1 (e.g. 0.15)')
        put.run('tax_rate', String(rate))
      }
      if (s.receiptFooter !== undefined) put.run('receipt_footer', String(s.receiptFooter))
      if (s.kioskWelcome !== undefined) put.run('kiosk_welcome', String(s.kioskWelcome).slice(0, 200))
      if (s.storeAddress !== undefined) put.run('store_address', String(s.storeAddress).trim().slice(0, 300))
    })()
    res.json(readSettings(db))
  })

  // ----- Products (items) -------------------------------------------------
  app.get('/api/products', (req, res) => {
    const search = String(req.query.search ?? '').trim()
    const includeInactive = req.query.includeInactive === '1'
    const where: string[] = []
    const params: string[] = []
    if (!includeInactive) where.push('active = 1')
    if (req.query.quickPick === '1') where.push('quick_pick = 1')
    if (search) {
      where.push('(name LIKE ? OR sku LIKE ? OR barcode = ? OR alu = ? OR department LIKE ?)')
      params.push(`%${search}%`, `%${search}%`, search, search, `%${search}%`)
    }
    const limit = req.query.all === '1' ? '' : 'LIMIT 500' // all=1 is used by Export to Excel
    const sql = `SELECT * FROM products ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY name ${limit}`
    res.json((db.prepare(sql).all(...params) as ProductRow[]).map(toProduct))
  })

  // Scanner / item # lookup: UPC (barcode), Item No. (sku) or ALU
  app.get('/api/products/lookup/:code', (req, res) => {
    const c = req.params.code
    const row = db
      .prepare('SELECT * FROM products WHERE active = 1 AND (barcode = ? OR sku = ? OR alu = ?) LIMIT 1')
      .get(c, c, c) as ProductRow | undefined
    if (!row) throw new HttpError(404, 'Item not found')
    res.json(toProduct(row))
  })

  app.post('/api/products', (req, res) => {
    const id = insertProduct(db, validateProduct(req.body, DEFAULTS))
    res.status(201).json(getProduct(db, id))
  })

  // Bulk import from a spreadsheet. dryRun=true returns a preview without saving.
  app.post('/api/products/import', (req, res) => {
    const { items, dryRun, updateExisting } = (req.body ?? {}) as {
      items?: Record<string, unknown>[]
      dryRun?: boolean
      updateExisting?: boolean
    }
    if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, 'No rows to import')
    if (items.length > 10000) throw new HttpError(400, 'Too many rows (maximum 10,000 per import)')
    res.json(importProducts(db, items, { dryRun: dryRun === true, updateExisting: updateExisting !== false }))
  })

  app.put('/api/products/:id', (req, res) => {
    const id = Number(req.params.id)
    const existing = getProduct(db, id)
    if (!existing) throw new HttpError(404, 'Item not found')
    updateProduct(db, id, validateProduct(req.body, existing))
    res.json(getProduct(db, id))
  })

  // ----- Customers ---------------------------------------------------------
  app.get('/api/customers', (req, res) => {
    res.json(searchCustomers(db, String(req.query.search ?? ''), req.query.includeInactive === '1'))
  })

  app.get('/api/customers/:id', (req, res) => {
    const detail = customerDetail(db, Number(req.params.id))
    if (!detail) throw new HttpError(404, 'Customer not found')
    res.json(detail)
  })

  app.post('/api/customers', (req, res) => {
    const id = insertCustomer(db, validateCustomer(req.body, CUSTOMER_DEFAULTS))
    res.status(201).json(getCustomer(db, id))
  })

  app.put('/api/customers/:id', (req, res) => {
    const id = Number(req.params.id)
    const existing = getCustomer(db, id)
    if (!existing) throw new HttpError(404, 'Customer not found')
    updateCustomer(db, id, validateCustomer(req.body, existing))
    res.json(getCustomer(db, id))
  })

  // ----- Customer kiosk (iPad): /kiosk page + /api/kiosks… --------------------
  registerKioskRoutes(app, db, readSettings)

  // ----- QuickBooks Desktop (Web Connector) --------------------------------
  registerQuickBooksRoutes(app, db, readSettings)

  // ----- Marketing mailers (email) -----------------------------------------
  registerMarketingRoutes(app, db, readSettings)

  // ----- Work orders (repairs) + customer units -----------------------------
  registerWorkOrderRoutes(app, db, readSettings)

  // ----- Returns / refunds (look up a receipt, a customer's receipts) -----------
  registerReturnRoutes(app, db)

  // ----- Sales -------------------------------------------------------------
  app.post('/api/sales', (req, res) => {
    const sale = createSale(db, req.body as SaleRequest)
    res.status(201).json(sale)
  })

  app.get('/api/sales', (req, res) => {
    const date = String(req.query.date ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'date=YYYY-MM-DD is required')
    const rows = db
      .prepare(
        `SELECT s.id, s.created_at, s.till_name, s.total_cents, c.id AS cid,
                c.first_name, c.last_name, c.company, c.track_as_company,
                EXISTS (SELECT 1 FROM sale_items r WHERE r.sale_id = s.id AND r.kind = 'return') AS has_return
         FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
         WHERE date(s.created_at, 'localtime') = ? ORDER BY s.id DESC`
      )
      .all(date) as SaleListRow[]
    const list: SaleSummary[] = rows.map((r) => ({
      id: r.id,
      createdAt: sqliteToIso(r.created_at),
      tillName: r.till_name,
      totalCents: r.total_cents,
      customerName: rowCustomerName(r),
      hasReturn: r.has_return === 1
    }))
    res.json(list)
  })

  app.get('/api/sales/:id', (req, res) => {
    const sale = getSale(db, Number(req.params.id))
    if (!sale) throw new HttpError(404, 'Sale not found')
    res.json(sale)
  })

  // ----- Reports -----------------------------------------------------------
  app.get('/api/reports/daily', (req, res) => {
    const date = String(req.query.date ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'date=YYYY-MM-DD is required')
    const totals = db
      .prepare(
        `SELECT COUNT(*) AS n, COALESCE(SUM(total_cents),0) AS total, COALESCE(SUM(tax_cents),0) AS tax,
                COALESCE(SUM(change_cents),0) AS change,
                COALESCE(SUM(tax_exempt),0) AS exemptN, COALESCE(SUM(tax_exempt_cents),0) AS exemptCents
         FROM sales WHERE status = 'completed' AND date(created_at, 'localtime') = ?`
      )
      .get(date) as { n: number; total: number; tax: number; change: number; exemptN: number; exemptCents: number }
    const byMethod = db
      .prepare(
        `SELECT p.method, COALESCE(SUM(p.amount_cents),0) AS amount
         FROM payments p JOIN sales s ON s.id = p.sale_id
         WHERE s.status = 'completed' AND date(s.created_at, 'localtime') = ?
         GROUP BY p.method`
      )
      .all(date) as { method: string; amount: number }[]
    const amt = (m: string) => byMethod.find((r) => r.method === m)?.amount ?? 0
    const refunds = db
      .prepare(
        `SELECT COUNT(DISTINCT si.sale_id) AS n, COALESCE(SUM(-si.line_total_cents),0) AS cents
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE si.kind = 'return' AND s.status = 'completed' AND date(s.created_at, 'localtime') = ?`
      )
      .get(date) as { n: number; cents: number }
    const report: DailyReport = {
      date,
      saleCount: totals.n,
      totalCents: totals.total,
      taxCents: totals.tax,
      cashCents: amt('cash') - totals.change, // net cash kept in the drawer
      cardCents: amt('card'),
      taxExemptCount: totals.exemptN,
      taxExemptCents: totals.exemptCents,
      refundCount: refunds.n,
      refundCents: refunds.cents
    }
    res.json(report)
  })

  // ----- Errors ------------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message })
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message })
    if (err instanceof ReturnError) return res.status(err.status).json({ error: err.message })
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('UNIQUE constraint failed: customers.customer_no'))
      return res.status(409).json({ error: 'That Customer ID is already used by another customer' })
    if (msg.includes('UNIQUE constraint failed')) return res.status(409).json({ error: 'Item No. or UPC already used by another item' })
    console.error('[server]', err)
    res.status(500).json({ error: msg })
  })

  return app
}

// ---------------------------------------------------------------------------
// Helpers

/** Today's date (YYYY-MM-DD) in the store's local time */
function localDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface SaleListRow {
  id: number
  created_at: string
  till_name: string
  total_cents: number
  cid: number | null
  first_name: string | null
  last_name: string | null
  company: string | null
  track_as_company: number | null
  has_return?: number
}

/** Customer display name from a sales ⟕ customers join row (null = no customer) */
function rowCustomerName(r: Pick<SaleListRow, 'cid' | 'first_name' | 'last_name' | 'company' | 'track_as_company'>) {
  if (r.cid === null || r.cid === undefined) return null
  return customerDisplayName({
    firstName: r.first_name,
    lastName: r.last_name,
    company: r.company,
    trackAsCompany: r.track_as_company === 1
  })
}

/** SQLite's datetime('now') gives "2026-11-04 23:17:49" in UTC -> "2026-11-04T23:17:49Z" */
function sqliteToIso(s: string): string {
  return s.replace(' ', 'T') + 'Z'
}

export function readSettings(db: DB): StoreSettings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return {
    storeName: map.store_name ?? 'My Store',
    taxRate: Number(map.tax_rate ?? 0.15),
    receiptFooter: map.receipt_footer ?? '',
    storeAddress: map.store_address ?? '',
    kioskWelcome: map.kiosk_welcome ?? '',
    hasLogo: !!map.store_logo
  }
}

/**
 * Create a sale. Prices and totals are always worked out HERE on the server
 * (never trusted from the till) so every till charges the same price.
 * Prices are tax-inclusive (e.g. NZ GST); tax is the GST portion of the taxable items.
 */
function createSale(db: DB, req: SaleRequest): Sale {
  if (!req || !Array.isArray(req.items)) throw new HttpError(400, 'Sale has no items')
  if (!Array.isArray(req.payments)) throw new HttpError(400, 'Sale has no payment')
  const tillName = String(req.tillName || 'Unknown till').slice(0, 60)
  const { taxRate } = readSettings(db)

  // Paying for a work order (estimate fee, repair pick-up, or fee credited on a new purchase)
  let woSale: PreparedWoSale | null = null
  if (req.workOrder) {
    try {
      woSale = prepareWorkOrderSale(db, Number(req.workOrder.id), req.workOrder.mode, taxRate)
    } catch (e) {
      throw new HttpError(400, (e as Error).message)
    }
    if (req.customerId && Number(req.customerId) !== woSale.wo.customerId)
      throw new HttpError(400, `${woSale.wo.number} belongs to a different customer`)
    if (woSale.mode === 'credit' && req.items.length === 0)
      throw new HttpError(400, 'Add the new item(s) the estimate fee is being credited toward')
  }
  // Items coming back (refund / exchange)
  const returnReq = Array.isArray(req.returns) ? req.returns : []
  if (returnReq.length && woSale) throw new HttpError(400, 'Do returns on their own sale, not on a work order payment')
  if (req.items.length === 0 && !woSale && returnReq.length === 0) throw new HttpError(400, 'Sale has no items')
  const returns: PreparedReturns | null = returnReq.length ? prepareReturns(db, returnReq, taxRate) : null

  let customerId: number | null = woSale ? woSale.wo.customerId : null
  let customer: ReturnType<typeof getCustomer> = null
  if (!woSale && req.customerId !== undefined && req.customerId !== null) customerId = Number(req.customerId)
  if (returns?.customerId) {
    // A return goes on the customer of the original receipt
    if (customerId !== null && customerId !== returns.customerId)
      throw new HttpError(400, 'The receipt being returned is for a different customer than the one on this sale')
    customerId = returns.customerId
  }
  if (customerId !== null) {
    customer = getCustomer(db, customerId)
    if (!customer) throw new HttpError(400, 'The selected customer no longer exists')
  }

  // Tax exemption: only for a tax-exempt customer whose Farm Tax ID is on file and current
  const taxExempt = req.taxExempt === true
  if (taxExempt) {
    if (!customer || !customer.taxExempt) throw new HttpError(400, 'Only a tax-exempt customer can have a tax-exempt sale')
    if (!customer.taxExemptId) throw new HttpError(400, "The customer's Farm Tax ID is missing. Add it to the customer first.")
    if (taxExemptState(customer, localDate()).kind === 'expired')
      throw new HttpError(400, "The customer's Farm Tax ID has expired. Update it with their new card, or charge tax.")
  }

  const getActive = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1')
  const lines = req.items.map((it) => {
    const qty = Number(it.qty)
    if (!Number.isInteger(qty) || qty <= 0) throw new HttpError(400, 'Quantity must be a whole number above 0')
    const row = getActive.get(it.productId) as ProductRow | undefined
    if (!row) throw new HttpError(400, `Item ${it.productId} not found or inactive`)
    const p = toProduct(row)
    const serial = String((it as { serial?: string }).serial ?? '').trim().slice(0, 80)
    if (serial && qty !== 1) throw new HttpError(400, `${p.name}: a serial-numbered item must be one per line`)
    return {
      productId: p.id,
      serial,
      manufacturer: p.manufacturer,
      name: p.name,
      unitPriceCents: p.priceCents,
      qty,
      lineTotalCents: p.priceCents * qty,
      taxable: p.taxable,
      department: p.department,
      tracksStock: p.type === 'inventory',
      kind: 'item' as 'item' | 'wo' | 'credit'
    }
  })

  // Work order lines: priced from the ticket; parts were already taken from stock when it was approved
  if (woSale)
    for (const l of woSale.lines)
      lines.push({
        productId: l.productId as number,
        serial: '',
        manufacturer: null,
        name: l.description,
        unitPriceCents: l.unitPriceCents,
        qty: l.qty,
        lineTotalCents: l.unitPriceCents * l.qty,
        taxable: l.taxable,
        department: l.department,
        tracksStock: false,
        kind: 'wo'
      })

  // Prices are tax inclusive; tax applies to taxable items only, and is removed for exempt sales.
  // A paid estimate fee is credited last (never more than the sale total).
  const priced = priceWithFeeCredit(lines, taxRate, taxExempt, woSale?.creditAvailableCents ?? 0)
  const creditCents = priced.creditCents
  if (woSale && creditCents > 0) {
    const c = feeCreditLine(woSale.wo, creditCents)
    lines.push({
      productId: null as unknown as number,
      serial: '',
      manufacturer: null,
      name: c.description,
      unitPriceCents: c.unitPriceCents,
      qty: 1,
      lineTotalCents: c.unitPriceCents,
      taxable: false,
      department: c.department,
      tracksStock: false,
      kind: 'credit'
    })
  }
  lines.forEach((l, i) => {
    l.unitPriceCents = priced.lines[i].unitPriceCents
    l.lineTotalCents = priced.lines[i].lineTotalCents
  })
  // Returned items (negative) are added on top of what's being bought
  const retLines = returns?.lines ?? []
  const totalCents = priced.totalCents + retLines.reduce((s, l) => s + l.lineTotalCents, 0)
  const taxCents = priced.taxCents + retLines.reduce((s, l) => s + l.taxCents, 0)
  const { taxExemptCents } = priced
  if (totalCents !== 0 && req.payments.length === 0) throw new HttpError(400, totalCents < 0 ? 'Choose how the refund is given' : 'Sale has no payment')

  const refund = totalCents < 0
  const payments: PaymentInput[] = req.payments.map((p) => {
    const amountCents = Number(p.amountCents)
    if (p.method !== 'cash' && p.method !== 'card') throw new HttpError(400, 'Unknown payment method')
    if (!Number.isInteger(amountCents) || amountCents === 0 || (refund ? amountCents > 0 : amountCents < 0))
      throw new HttpError(400, refund ? 'A refund is entered as money given back (a negative amount)' : 'Payment amount must be above 0')
    return { method: p.method, amountCents, reference: p.reference ? String(p.reference).slice(0, 60) : undefined }
  })
  const paid = payments.reduce((s, p) => s + p.amountCents, 0)
  let changeCents = 0
  if (refund) {
    if (paid !== totalCents) throw new HttpError(400, `The refund must be exactly $${(-totalCents / 100).toFixed(2)}`)
  } else {
    if (paid < totalCents) throw new HttpError(400, 'Payment is less than the sale total')
    changeCents = paid - totalCents
    const cashPaid = payments.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amountCents, 0)
    if (changeCents > cashPaid) throw new HttpError(400, 'Card payments cannot be more than the amount owed')
  }

  const id = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO sales (till_name, total_cents, tax_cents, change_cents, customer_id, tax_exempt, tax_exempt_id, tax_exempt_cents, work_order_id, no_receipt_return)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        tillName,
        totalCents,
        taxCents,
        changeCents,
        customerId,
        taxExempt ? 1 : 0,
        taxExempt ? customer!.taxExemptId : null,
        taxExemptCents,
        woSale ? woSale.wo.id : null,
        returns?.noReceipt ? 1 : 0
      )
    const saleId = Number(info.lastInsertRowid)
    const addItem = db.prepare(
      `INSERT INTO sale_items (sale_id, product_id, name, unit_price_cents, qty, line_total_cents, department, taxable, serial,
                               kind, return_of_item_id, return_of_sale_id, return_reason, restocked, tax_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const takeStock = db.prepare(`UPDATE products SET on_hand = on_hand - ? WHERE id = ?`)
    for (const l of lines) {
      addItem.run(saleId, l.productId, l.name, l.unitPriceCents, l.qty, l.lineTotalCents, l.department, l.taxable ? 1 : 0, l.serial || null,
        l.kind, null, null, null, 0, null)
      // A serial-numbered item sold to a customer is saved as one of their units (for repairs later)
      if (l.serial && customerId && l.kind === 'item')
        addUnitFromSale(db, { customerId, saleId, serial: l.serial, name: l.name, department: l.department, manufacturer: l.manufacturer })
      if (l.tracksStock) takeStock.run(l.qty, l.productId) // on-hand quantity for inventory items
    }
    for (const r of retLines)
      addItem.run(saleId, r.productId, r.name, r.unitPriceCents, r.qty, r.lineTotalCents, r.department, r.taxable ? 1 : 0, r.serial || null,
        r.kind, r.returnOfItemId, r.returnOfSaleId, r.reason, r.restock ? 1 : 0, r.taxCents)
    finishReturns(db, retLines)
    const addPay = db.prepare('INSERT INTO payments (sale_id, method, amount_cents, reference) VALUES (?, ?, ?, ?)')
    for (const p of payments) addPay.run(saleId, p.method, p.amountCents, p.reference ?? null)
    if (woSale) finishWorkOrderSale(db, woSale, saleId, creditCents, tillName)
    return saleId
  })()

  return getSale(db, id)!
}

function getSale(db: DB, id: number): Sale | null {
  const s = db
    .prepare(
      `SELECT s.*, c.id AS cid, c.first_name, c.last_name, c.company, c.track_as_company
       FROM sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = ?`
    )
    .get(id) as
    | ({
        id: number
        created_at: string
        till_name: string
        total_cents: number
        tax_cents: number
        change_cents: number
        tax_exempt: number
        tax_exempt_id: string | null
        tax_exempt_cents: number
        work_order_id: number | null
        no_receipt_return: number
      } & Pick<
        SaleListRow,
        'cid' | 'first_name' | 'last_name' | 'company' | 'track_as_company'
      >)
    | undefined
  if (!s) return null
  const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id').all(id) as {
    id: number
    kind: 'item' | 'wo' | 'credit' | 'return' | 'feekept'
    return_of_sale_id: number | null
    return_reason: string | null
    restocked: number
    product_id: number | null
    name: string
    unit_price_cents: number
    qty: number
    line_total_cents: number
    serial: string | null
  }[]
  const payments = db.prepare('SELECT * FROM payments WHERE sale_id = ? ORDER BY id').all(id) as {
    method: 'cash' | 'card'
    amount_cents: number
    reference: string | null
  }[]
  return {
    id: s.id,
    createdAt: sqliteToIso(s.created_at),
    tillName: s.till_name,
    totalCents: s.total_cents,
    taxCents: s.tax_cents,
    changeCents: s.change_cents,
    customerId: s.cid ?? null,
    customerName: rowCustomerName(s),
    taxExempt: s.tax_exempt === 1,
    taxExemptId: s.tax_exempt_id,
    taxExemptCents: s.tax_exempt_cents,
    workOrderId: s.work_order_id ?? null,
    refundCents: -items.filter((i) => i.kind === 'return').reduce((n, i) => n + i.line_total_cents, 0),
    noReceiptReturn: s.no_receipt_return === 1,
    items: items.map((i) => ({
      id: i.id,
      kind: i.kind,
      returnOfSaleId: i.return_of_sale_id,
      returnReason: i.return_reason,
      restocked: i.restocked === 1,
      productId: i.product_id,
      name: i.name,
      unitPriceCents: i.unit_price_cents,
      qty: i.qty,
      lineTotalCents: i.line_total_cents,
      serial: i.serial
    })),
    payments: payments.map((p) => ({ method: p.method, amountCents: p.amount_cents, reference: p.reference ?? undefined }))
  }
}
