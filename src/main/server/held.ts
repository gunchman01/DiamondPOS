/**
 * Held receipts: a sale built ahead of time (e.g. a part was ordered) and put on hold until
 * the customer comes back to pay. Any till can recall it. Prices are worked out again when it's rung up.
 */
import type express from 'express'
import type { DB } from './db'
import { customerDisplayName } from '../../shared/types'
import type { HeldItemInput, HeldReceipt, HeldReceiptInput, HeldSummary } from '../../shared/held'
import { toProduct, type ProductRow } from './products'

class HeldError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}
const iso = (s: string) => s.replace(' ', 'T') + 'Z'

type Row = {
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

function clean(b: Partial<HeldReceiptInput>): { customerId: number | null; note: string; taxExempt: boolean; tillName: string; items: HeldItemInput[] } {
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 300).map((i) => {
    const qty = Number(i?.qty)
    if (!Number.isInteger(Number(i?.productId)) || !Number.isInteger(qty) || qty <= 0) throw new HeldError(400, 'Each held item needs an item and a quantity above 0')
    const serial = String(i?.serial ?? '').trim().slice(0, 80)
    return { productId: Number(i.productId), qty, ...(serial ? { serial } : {}) }
  })
  if (items.length === 0) throw new HeldError(400, 'There is nothing on the sale to hold')
  return {
    customerId: b.customerId ? Number(b.customerId) : null,
    note: String(b.note ?? '').trim().slice(0, 500),
    taxExempt: b.taxExempt === true,
    tillName: String(b.tillName ?? '').slice(0, 60),
    items
  }
}

export function registerHeldRoutes(app: express.Express, db: DB) {
  const getProduct = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1')
  const select = `SELECT h.*, c.first_name, c.last_name, c.company, c.track_as_company FROM held_sales h LEFT JOIN customers c ON c.id = h.customer_id`

  const summary = (r: Row): HeldSummary & { _items: { product: ReturnType<typeof toProduct>; qty: number; serial?: string }[]; _missing: number } => {
    const raw = parseItems(r.items_json)
    const items: { product: ReturnType<typeof toProduct>; qty: number; serial?: string }[] = []
    let missing = 0
    for (const i of raw) {
      const p = getProduct.get(i.productId) as ProductRow | undefined
      if (p) items.push({ product: toProduct(p), qty: i.qty, ...(i.serial ? { serial: i.serial } : {}) })
      else missing++
    }
    return {
      id: r.id,
      customerId: r.customer_id,
      customerName:
        r.customer_id === null
          ? null
          : customerDisplayName({ firstName: r.first_name, lastName: r.last_name, company: r.company, trackAsCompany: r.track_as_company === 1 }),
      note: r.note,
      tillName: r.till_name,
      itemCount: items.reduce((n, i) => n + i.qty, 0),
      totalCents: items.reduce((n, i) => n + i.product.priceCents * i.qty, 0),
      itemsText: items
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
    return { ...s, taxExempt: r.tax_exempt === 1, items: _items, missing: _missing }
  }
  const wrap = (fn: (req: express.Request, res: express.Response) => void) => (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      fn(req, res)
    } catch (e) {
      if (e instanceof HeldError) res.status(e.status).json({ error: e.message })
      else next(e)
    }
  }

  app.get('/api/held', (_req, res) => {
    const rows = db.prepare(`${select} WHERE h.status = 'held' ORDER BY h.id DESC LIMIT 300`).all() as Row[]
    res.json(rows.map((r) => {
      const { _items, _missing, ...s } = summary(r)
      void _items
      void _missing
      return s
    }))
  })

  app.get('/api/held/count', (_req, res) => {
    res.json((db.prepare("SELECT COUNT(*) AS n FROM held_sales WHERE status = 'held'").get() as { n: number }).n)
  })

  app.get('/api/held/:id', wrap((req, res) => {
    const h = full(Number(req.params.id))
    if (!h) throw new HeldError(404, 'That held receipt was not found (it may have been rung up already)')
    res.json(h)
  }))

  app.post('/api/held', wrap((req, res) => {
    const c = clean(req.body ?? {})
    const info = db
      .prepare('INSERT INTO held_sales (customer_id, note, items_json, tax_exempt, till_name) VALUES (?, ?, ?, ?, ?)')
      .run(c.customerId, c.note, JSON.stringify(c.items), c.taxExempt ? 1 : 0, c.tillName)
    res.status(201).json(full(Number(info.lastInsertRowid)))
  }))

  app.put('/api/held/:id', wrap((req, res) => {
    const id = Number(req.params.id)
    if (!full(id)) throw new HeldError(404, 'That held receipt was not found')
    const c = clean(req.body ?? {})
    db.prepare(
      "UPDATE held_sales SET customer_id = ?, note = ?, items_json = ?, tax_exempt = ?, till_name = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(c.customerId, c.note, JSON.stringify(c.items), c.taxExempt ? 1 : 0, c.tillName, id)
    res.json(full(id))
  }))

  app.delete('/api/held/:id', wrap((req, res) => {
    const r = db.prepare("UPDATE held_sales SET status = 'deleted', updated_at = datetime('now') WHERE id = ? AND status = 'held'").run(Number(req.params.id))
    if (r.changes === 0) throw new HeldError(404, 'That held receipt was not found')
    res.json({ ok: true })
  }))
}

/** Called inside the sale transaction: the held receipt is done */
export function completeHeld(db: DB, heldId: number, saleId: number) {
  db.prepare("UPDATE held_sales SET status = 'completed', sale_id = ?, updated_at = datetime('now') WHERE id = ? AND status = 'held'").run(saleId, heldId)
}
