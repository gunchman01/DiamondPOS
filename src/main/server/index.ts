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
  insertProduct,
  toProduct,
  updateProduct,
  validateProduct
} from './products'
import { MIN_CLIENT_VERSION } from '../../shared/constants'
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
}

export async function stopServer(): Promise<void> {
  if (httpServer) await new Promise<void>((r) => httpServer!.close(() => r()))
  httpServer = null
  db?.close()
  db = null
}

// ---------------------------------------------------------------------------

export function createApp(db: DB, opts: ServerOptions): express.Express {
  const app = express()
  app.use(express.json({ limit: '1mb' }))

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
    const sql = `SELECT * FROM products ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY name LIMIT 500`
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

  app.put('/api/products/:id', (req, res) => {
    const id = Number(req.params.id)
    const existing = getProduct(db, id)
    if (!existing) throw new HttpError(404, 'Item not found')
    updateProduct(db, id, validateProduct(req.body, existing))
    res.json(getProduct(db, id))
  })

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
        `SELECT id, created_at, till_name, total_cents FROM sales
         WHERE date(created_at, 'localtime') = ? ORDER BY id DESC`
      )
      .all(date) as { id: number; created_at: string; till_name: string; total_cents: number }[]
    const list: SaleSummary[] = rows.map((r) => ({
      id: r.id,
      createdAt: sqliteToIso(r.created_at),
      tillName: r.till_name,
      totalCents: r.total_cents
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
                COALESCE(SUM(change_cents),0) AS change
         FROM sales WHERE status = 'completed' AND date(created_at, 'localtime') = ?`
      )
      .get(date) as { n: number; total: number; tax: number; change: number }
    const byMethod = db
      .prepare(
        `SELECT p.method, COALESCE(SUM(p.amount_cents),0) AS amount
         FROM payments p JOIN sales s ON s.id = p.sale_id
         WHERE s.status = 'completed' AND date(s.created_at, 'localtime') = ?
         GROUP BY p.method`
      )
      .all(date) as { method: string; amount: number }[]
    const amt = (m: string) => byMethod.find((r) => r.method === m)?.amount ?? 0
    const report: DailyReport = {
      date,
      saleCount: totals.n,
      totalCents: totals.total,
      taxCents: totals.tax,
      cashCents: amt('cash') - totals.change, // net cash kept in the drawer
      cardCents: amt('card')
    }
    res.json(report)
  })

  // ----- Errors ------------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message })
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message })
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('UNIQUE constraint failed')) return res.status(409).json({ error: 'Item No. or UPC already used by another item' })
    console.error('[server]', err)
    res.status(500).json({ error: msg })
  })

  return app
}

// ---------------------------------------------------------------------------
// Helpers

/** SQLite's datetime('now') gives "2026-11-04 23:17:49" in UTC -> "2026-11-04T23:17:49Z" */
function sqliteToIso(s: string): string {
  return s.replace(' ', 'T') + 'Z'
}

function readSettings(db: DB): StoreSettings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return {
    storeName: map.store_name ?? 'My Store',
    taxRate: Number(map.tax_rate ?? 0.15),
    receiptFooter: map.receipt_footer ?? ''
  }
}

/**
 * Create a sale. Prices and totals are always worked out HERE on the server
 * (never trusted from the till) so every till charges the same price.
 * Prices are tax-inclusive (e.g. NZ GST); tax is the GST portion of the taxable items.
 */
function createSale(db: DB, req: SaleRequest): Sale {
  if (!req || !Array.isArray(req.items) || req.items.length === 0) throw new HttpError(400, 'Sale has no items')
  if (!Array.isArray(req.payments) || req.payments.length === 0) throw new HttpError(400, 'Sale has no payment')
  const tillName = String(req.tillName || 'Unknown till').slice(0, 60)

  const getActive = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1')
  const lines = req.items.map((it) => {
    const qty = Number(it.qty)
    if (!Number.isInteger(qty) || qty <= 0) throw new HttpError(400, 'Quantity must be a whole number above 0')
    const row = getActive.get(it.productId) as ProductRow | undefined
    if (!row) throw new HttpError(400, `Item ${it.productId} not found or inactive`)
    const p = toProduct(row)
    return {
      productId: p.id,
      name: p.name,
      unitPriceCents: p.priceCents,
      qty,
      lineTotalCents: p.priceCents * qty,
      taxable: p.taxable,
      tracksStock: p.type === 'inventory'
    }
  })

  const totalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0)
  const { taxRate } = readSettings(db)
  // GST is only on taxable items (prices are GST inclusive)
  const taxableCents = lines.filter((l) => l.taxable).reduce((s, l) => s + l.lineTotalCents, 0)
  const taxCents = Math.round((taxableCents * taxRate) / (1 + taxRate))

  const payments: PaymentInput[] = req.payments.map((p) => {
    const amountCents = Number(p.amountCents)
    if (p.method !== 'cash' && p.method !== 'card') throw new HttpError(400, 'Unknown payment method')
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw new HttpError(400, 'Payment amount must be above 0')
    return { method: p.method, amountCents, reference: p.reference ? String(p.reference).slice(0, 60) : undefined }
  })
  const paid = payments.reduce((s, p) => s + p.amountCents, 0)
  if (paid < totalCents) throw new HttpError(400, 'Payment is less than the sale total')
  const changeCents = paid - totalCents
  const cashPaid = payments.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amountCents, 0)
  if (changeCents > cashPaid) throw new HttpError(400, 'Card payments cannot be more than the amount owed')

  const id = db.transaction(() => {
    const info = db
      .prepare('INSERT INTO sales (till_name, total_cents, tax_cents, change_cents) VALUES (?, ?, ?, ?)')
      .run(tillName, totalCents, taxCents, changeCents)
    const saleId = Number(info.lastInsertRowid)
    const addItem = db.prepare(
      'INSERT INTO sale_items (sale_id, product_id, name, unit_price_cents, qty, line_total_cents) VALUES (?, ?, ?, ?, ?, ?)'
    )
    const takeStock = db.prepare(`UPDATE products SET on_hand = on_hand - ? WHERE id = ?`)
    for (const l of lines) {
      addItem.run(saleId, l.productId, l.name, l.unitPriceCents, l.qty, l.lineTotalCents)
      if (l.tracksStock) takeStock.run(l.qty, l.productId) // on-hand quantity for inventory items
    }
    const addPay = db.prepare('INSERT INTO payments (sale_id, method, amount_cents, reference) VALUES (?, ?, ?, ?)')
    for (const p of payments) addPay.run(saleId, p.method, p.amountCents, p.reference ?? null)
    return saleId
  })()

  return getSale(db, id)!
}

function getSale(db: DB, id: number): Sale | null {
  const s = db.prepare('SELECT * FROM sales WHERE id = ?').get(id) as
    | { id: number; created_at: string; till_name: string; total_cents: number; tax_cents: number; change_cents: number }
    | undefined
  if (!s) return null
  const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id').all(id) as {
    product_id: number | null
    name: string
    unit_price_cents: number
    qty: number
    line_total_cents: number
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
    items: items.map((i) => ({
      productId: i.product_id,
      name: i.name,
      unitPriceCents: i.unit_price_cents,
      qty: i.qty,
      lineTotalCents: i.line_total_cents
    })),
    payments: payments.map((p) => ({ method: p.method, amountCents: p.amount_cents, reference: p.reference ?? undefined }))
  }
}
