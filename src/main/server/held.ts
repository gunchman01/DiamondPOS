import { saleInstant } from '../../shared/saleDates'
import crypto from 'node:crypto'
/**
 * Held receipts: a sale built ahead of time (e.g. a part was ordered) and put on hold until
 * the customer comes back to pay. Any till can recall it. Prices are worked out again when it's rung up.
 */
import type express from 'express'
import type { DB } from './db'
import { customerDisplayName } from '../../shared/types'
import type { HeldItemInput, HeldReceipt, HeldReceiptInput, HeldSummary } from '../../shared/held'
import { toProduct, type ProductRow } from './products'
import { MAX_PRICE_CENTS } from '../../shared/pricing'

export class HeldError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}
const iso = (s: string) => s.replace(' ', 'T') + 'Z'

type Row = {
  sale_at: string | null
  id: number
  customer_id: number | null
  note: string
  items_json: string
  tax_exempt: number
  till_name: string
  status: string
  created_at: string
  updated_at: string
  first_name: string | null
  last_name: string | null
  company: string | null
  track_as_company: number | null
}

function parseItems(json: string): HeldItemInput[] {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function clean(b: Partial<HeldReceiptInput>): {
  saleAt: string | null
  customerId: number | null
  note: string
  taxExempt: boolean
  tillName: string
  items: HeldItemInput[]
} {
  let saleAt: string | null
  try { saleAt = saleInstant(b.saleAt) } catch(e) { throw new HeldError(400, (e as Error).message) }
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 300).map((i) => {
    const qty = Number(i?.qty)
    if (!Number.isInteger(Number(i?.productId)) || !Number.isSafeInteger(qty) || qty <= 0 || qty > 10000)
      throw new HeldError(400, 'Each held item needs an item and a quantity above 0')
    const serial = String(i?.serial ?? '')
      .trim()
      .slice(0, 80)
    const price = i?.priceCents === undefined || i?.priceCents === null ? undefined : Number(i.priceCents)
    if (price !== undefined && !(Number.isInteger(price) && price >= 0 && price <= MAX_PRICE_CENTS))
      throw new HeldError(400, 'A changed price must be $0.00 or more')
    return { productId: Number(i.productId), qty, ...(serial ? { serial } : {}), ...(price !== undefined ? { priceCents: price } : {}) }
  })
  if (items.length === 0) throw new HeldError(400, 'There is nothing on the sale to hold')
  return {
    saleAt,
    customerId: b.customerId ? Number(b.customerId) : null,
    note: String(b.note ?? '')
      .trim()
      .slice(0, 500),
    taxExempt: b.taxExempt === true,
    tillName: String(b.tillName ?? '').slice(0, 60),
    items
  }
}

/** Adjust the reserved quantities by delta. Runs inside each caller's transaction. */
export function reserveHeldStock(db: DB, id: number, items: HeldItemInput[]) {
  const desired = new Map<number, number>()
  for (const item of items) {
    const p = db.prepare('SELECT type,active FROM products WHERE id=?').get(item.productId) as { type: string; active: number } | undefined
    if (!p || !p.active) throw new HeldError(400, 'A held item is missing or inactive')
    if (p.type === 'inventory') desired.set(item.productId, (desired.get(item.productId) ?? 0) + item.qty)
  }
  const previous = db.prepare('SELECT product_id,qty FROM held_stock WHERE held_id=?').all(id) as { product_id: number; qty: number }[]
  for (const old of previous) {
    db.prepare('UPDATE products SET on_hand=on_hand+? WHERE id=?').run(old.qty - (desired.get(old.product_id) ?? 0), old.product_id)
    desired.delete(old.product_id)
  }
  for (const [productId, qty] of desired) db.prepare('UPDATE products SET on_hand=on_hand-? WHERE id=?').run(qty, productId)
  db.prepare('DELETE FROM held_stock WHERE held_id=?').run(id)
  const all = new Map<number, number>()
  for (const item of items) {
    const p = db.prepare('SELECT type FROM products WHERE id=?').get(item.productId) as { type: string }
    if (p.type === 'inventory') all.set(item.productId, (all.get(item.productId) ?? 0) + item.qty)
  }
  for (const [productId, qty] of all) db.prepare('INSERT INTO held_stock VALUES (?,?,?)').run(id, productId, qty)
}
export function releaseHeldStock(db: DB, id: number) {
  const rows = db.prepare('SELECT product_id,qty FROM held_stock WHERE held_id=?').all(id) as { product_id: number; qty: number }[]
  for (const row of rows) db.prepare('UPDATE products SET on_hand=on_hand+? WHERE id=?').run(row.qty, row.product_id)
  db.prepare('DELETE FROM held_stock WHERE held_id=?').run(id)
}

export function registerHeldRoutes(app: express.Express, db: DB) {
  const getProduct = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1')
  const select = `SELECT h.*, c.first_name, c.last_name, c.company, c.track_as_company FROM held_sales h LEFT JOIN customers c ON c.id = h.customer_id`

  const summary = (
    r: Row
  ): HeldSummary & {
    _items: { product: ReturnType<typeof toProduct>; qty: number; serial?: string; priceCents?: number }[]
    _missing: number
  } => {
    const raw = parseItems(r.items_json)
    const items: { product: ReturnType<typeof toProduct>; qty: number; serial?: string; priceCents?: number }[] = []
    let missing = 0
    for (const i of raw) {
      const p = getProduct.get(i.productId) as ProductRow | undefined
      if (p)
        items.push({
          product: toProduct(p),
          qty: i.qty,
          ...(i.serial ? { serial: i.serial } : {}),
          ...(i.priceCents !== undefined ? { priceCents: i.priceCents } : {})
        })
      else missing++
    }
    return {
      id: r.id,
      customerId: r.customer_id,
      customerName:
        r.customer_id === null
          ? null
          : customerDisplayName({
              firstName: r.first_name,
              lastName: r.last_name,
              company: r.company,
              trackAsCompany: r.track_as_company === 1
            }),
      note: r.note,
      tillName: r.till_name,
      itemCount: items.reduce((n, i) => n + i.qty, 0),
      totalCents: items.reduce((n, i) => n + (i.priceCents ?? i.product.priceCents) * i.qty, 0),
      itemsText:
        items
          .slice(0, 4)
          .map((i) => (i.qty > 1 ? `${i.qty} x ${i.product.name}` : i.product.name))
          .join(', ') + (items.length > 4 ? '…' : ''),
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
      _items: items,
      _missing: missing
    }
  }
  const full = (id: number): HeldReceipt | null => {
    const r = db.prepare(`${select} WHERE h.id = ? AND h.status = 'held'`).get(id) as Row | undefined
    if (!r) return null
    const { _items, _missing, ...s } = summary(r)
    return { ...s, saleAt: r.sale_at, taxExempt: r.tax_exempt === 1, items: _items, missing: _missing }
  }
  const wrap =
    (fn: (req: express.Request, res: express.Response) => void) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      try {
        fn(req, res)
      } catch (e) {
        if (e instanceof HeldError) res.status(e.status).json({ error: e.message })
        else next(e)
      }
    }

  app.get('/api/held', (_req, res) => {
    const rows = db.prepare(`${select} WHERE h.status = 'held' ORDER BY h.id DESC LIMIT 300`).all() as Row[]
    res.json(
      rows.map((r) => {
        const { _items, _missing, ...s } = summary(r)
        void _items
        void _missing
        return s
      })
    )
  })

  app.get('/api/held/count', (_req, res) => {
    res.json((db.prepare("SELECT COUNT(*) AS n FROM held_sales WHERE status = 'held'").get() as { n: number }).n)
  })

  app.get(
    '/api/held/:id',
    wrap((req, res) => {
      const h = full(Number(req.params.id))
      if (!h) throw new HeldError(404, 'That held receipt was not found (it may have been rung up already)')
      res.json(h)
    })
  )

  app.post(
    '/api/held',
    wrap((req, res) => {
      const c = clean(req.body ?? {})
      const requestId = req.body?.requestId
      if (requestId !== undefined && (typeof requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(requestId)))
        throw new HeldError(400, 'Invalid hold request ID')
      const hash = crypto.createHash('sha256').update(JSON.stringify(c)).digest('hex')
      const id = db.transaction(() => {
        if (requestId) {
          const old = db.prepare('SELECT id,request_hash,status FROM held_sales WHERE request_id=?').get(requestId) as any
          if (old) {
            if (old.request_hash !== hash && !(req.body?.saleAt === undefined && c.saleAt === null && old.request_hash === crypto.createHash('sha256').update(JSON.stringify((({saleAt: _date, ...legacy}) => legacy)(c))).digest('hex'))) throw new HeldError(409, 'Hold request ID was reused with different items')
            if (old.status !== 'held') throw new HeldError(409, 'That hold was already completed or deleted')
            return old.id
          }
        }
        const info = db
          .prepare('INSERT INTO held_sales (customer_id, note, items_json, tax_exempt, till_name, sale_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(c.customerId, c.note, JSON.stringify(c.items), c.taxExempt ? 1 : 0, c.tillName, c.saleAt)
        const id = Number(info.lastInsertRowid)
        if (requestId) db.prepare('UPDATE held_sales SET request_id=?,request_hash=? WHERE id=?').run(requestId, hash, id)
        reserveHeldStock(db, id, c.items)
        return id
      })()
      res.status(201).json(full(id))
    })
  )

  app.put(
    '/api/held/:id',
    wrap((req, res) => {
      const id = Number(req.params.id)
      if (!full(id)) throw new HeldError(404, 'That held receipt was not found')
      const c = clean(req.body ?? {})
      db.transaction(() => {
        db.prepare(
          "UPDATE held_sales SET customer_id = ?, note = ?, items_json = ?, tax_exempt = ?, till_name = ?, sale_at = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(c.customerId, c.note, JSON.stringify(c.items), c.taxExempt ? 1 : 0, c.tillName, req.body?.saleAt === undefined ? (full(id)?.saleAt ?? null) : c.saleAt, id)
        reserveHeldStock(db, id, c.items)
      })()
      res.json(full(id))
    })
  )

  app.delete(
    '/api/held/:id',
    wrap((req, res) => {
      db.transaction(() => {
        const r = db
          .prepare("UPDATE held_sales SET status = 'deleted', updated_at = datetime('now') WHERE id = ? AND status = 'held'")
          .run(Number(req.params.id))
        if (r.changes === 0) throw new HeldError(404, 'That held receipt was not found')
        releaseHeldStock(db, Number(req.params.id))
      })()
      res.json({ ok: true })
    })
  )
}

/** Called inside the sale transaction: the held receipt is done */
export function completeHeld(db: DB, heldId: number, saleId: number) {
  const result = db
    .prepare("UPDATE held_sales SET status = 'completed', sale_id = ?, updated_at = datetime('now') WHERE id = ? AND status = 'held'")
    .run(saleId, heldId)
  if (result.changes !== 1)
    throw new HeldError(409, 'That held receipt was already completed or deleted. Reload held receipts before checkout.')
}
