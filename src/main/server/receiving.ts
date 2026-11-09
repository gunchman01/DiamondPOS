/**
 * Receiving on the store server: drafts, posting (stock up, average cost, order cost / price updates),
 * history per receiving and per item.
 */
import type express from 'express'
import type { DB } from './db'
import {
  landedCosts,
  newAverageCost,
  receivingNumber,
  receivingTotals,
  type ItemReceipt,
  type PostLineChoice,
  type Receiving,
  type ReceivingInput,
  type ReceivingLine,
  type ReceivingSummary
} from '../../shared/receiving'

class RvError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}
const iso = (s: string | null) => (s ? s.replace(' ', 'T') + 'Z' : null)
const str = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n)

type RvRow = {
  id: number
  status: 'draft' | 'posted'
  vendor: string
  invoice_no: string
  po_number: string
  invoice_date: string | null
  received_by: string
  freight_cents: number
  freight_to_cost: number
  notes: string
  till_name: string
  created_at: string
  posted_at: string | null
}

export function loadReceiving(db: DB, id: number): Receiving | null {
  const r = db.prepare('SELECT * FROM receivings WHERE id = ?').get(id) as RvRow | undefined
  if (!r) return null
  const rows = db
    .prepare(
      `SELECT l.*, p.sku, p.name, p.department, p.type, p.on_hand, p.cost_cents, p.order_cost_cents, p.price_cents
       FROM receiving_lines l JOIN products p ON p.id = l.product_id WHERE l.receiving_id = ? ORDER BY l.id`
    )
    .all(id) as Record<string, unknown>[]
  const posted = r.status === 'posted'
  const lines: ReceivingLine[] = rows.map((l) => ({
    id: l.id as number,
    productId: l.product_id as number,
    sku: (l.sku as string) ?? null,
    name: l.name as string,
    department: (l.department as string) ?? null,
    type: l.type as string,
    qty: l.qty as number,
    unitCostCents: l.unit_cost_cents as number,
    note: (l.note as string) ?? '',
    // a posted receiving shows the item as it was before
    onHand: (posted ? l.prev_on_hand : l.on_hand) as number,
    avgCostCents: ((posted ? l.prev_avg_cents : l.cost_cents) as number | null) ?? null,
    orderCostCents: ((posted ? l.prev_order_cents : l.order_cost_cents) as number | null) ?? null,
    priceCents: (posted ? l.prev_price_cents : l.price_cents) as number,
    landedCostCents: (l.landed_cost_cents as number | null) ?? null,
    newAvgCostCents: (l.new_avg_cents as number | null) ?? null,
    newPriceCents: (l.new_price_cents as number | null) ?? null,
    costUpdated: l.cost_updated === 1
  }))
  return {
    id: r.id,
    number: receivingNumber(r.id),
    status: r.status,
    vendor: r.vendor,
    invoiceNo: r.invoice_no,
    poNumber: r.po_number,
    invoiceDate: r.invoice_date,
    receivedBy: r.received_by,
    freightCents: r.freight_cents,
    freightToCost: r.freight_to_cost === 1,
    notes: r.notes,
    tillName: r.till_name,
    createdAt: iso(r.created_at)!,
    postedAt: iso(r.posted_at),
    lines,
    totals: receivingTotals(lines, r.freight_cents)
  }
}

function clean(b: Partial<ReceivingInput>) {
  const lines = (Array.isArray(b.lines) ? b.lines : []).slice(0, 2000).map((l) => {
    const qty = Number(l?.qty)
    const cost = Math.round(Number(l?.unitCostCents))
    if (!Number.isInteger(Number(l?.productId))) throw new RvError(400, 'Each line needs an item')
    if (!Number.isFinite(qty) || qty <= 0) throw new RvError(400, 'Quantities must be above 0')
    if (!Number.isFinite(cost) || cost < 0) throw new RvError(400, 'Costs must be 0 or more')
    return { productId: Number(l.productId), qty: Math.round(qty * 1000) / 1000, unitCostCents: cost, note: str(l.note, 200) }
  })
  const freight = Math.round(Number(b.freightCents ?? 0))
  if (!Number.isFinite(freight) || freight < 0) throw new RvError(400, 'Freight must be 0 or more')
  const date = b.invoiceDate ? str(b.invoiceDate, 10) : null
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RvError(400, 'Invoice date must be a date')
  return {
    vendor: str(b.vendor, 80),
    invoiceNo: str(b.invoiceNo, 40),
    poNumber: str(b.poNumber, 40),
    invoiceDate: date,
    receivedBy: str(b.receivedBy, 60),
    freightCents: freight,
    freightToCost: b.freightToCost !== false,
    notes: str(b.notes, 2000),
    tillName: str(b.tillName, 60),
    lines
  }
}

export function registerReceivingRoutes(app: express.Express, db: DB) {
  const wrap = (fn: (req: express.Request, res: express.Response) => void) => (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      fn(req, res)
    } catch (e) {
      if (e instanceof RvError) res.status(e.status).json({ error: e.message })
      else next(e)
    }
  }
  const need = (id: number) => {
    const r = loadReceiving(db, id)
    if (!r) throw new RvError(404, 'Receiving not found')
    return r
  }
  const productExists = db.prepare('SELECT id FROM products WHERE id = ?')
  function saveLines(id: number, lines: ReturnType<typeof clean>['lines']) {
    db.prepare('DELETE FROM receiving_lines WHERE receiving_id = ?').run(id)
    const add = db.prepare('INSERT INTO receiving_lines (receiving_id, product_id, qty, unit_cost_cents, note) VALUES (?, ?, ?, ?, ?)')
    for (const l of lines) {
      if (!productExists.get(l.productId)) throw new RvError(400, 'An item on this receiving no longer exists')
      add.run(id, l.productId, l.qty, l.unitCostCents, l.note)
    }
  }

  // List (drafts first), with search by number, vendor, invoice, PO or item
  app.get(
    '/api/receivings',
    wrap((req, res) => {
      const q = str(req.query.search, 60)
      const where: string[] = []
      const params: unknown[] = []
      if (req.query.status === 'draft' || req.query.status === 'posted') {
        where.push('r.status = ?')
        params.push(req.query.status)
      }
      if (q) {
        const like = `%${q}%`
        const num = Number(q.replace(/^RV-?/i, ''))
        where.push(`(r.vendor LIKE ? OR r.invoice_no LIKE ? OR r.po_number LIKE ? OR r.notes LIKE ? OR r.id = ?
          OR EXISTS (SELECT 1 FROM receiving_lines l JOIN products p ON p.id = l.product_id WHERE l.receiving_id = r.id AND (p.name LIKE ? OR p.sku LIKE ? OR p.alu LIKE ? OR p.barcode = ?)))`)
        params.push(like, like, like, like, Number.isInteger(num) ? num : -1, like, like, like, q)
      }
      const rows = db
        .prepare(
          `SELECT r.*, (SELECT COUNT(*) FROM receiving_lines l WHERE l.receiving_id = r.id) AS n,
                  (SELECT COALESCE(SUM(qty), 0) FROM receiving_lines l WHERE l.receiving_id = r.id) AS q,
                  (SELECT COALESCE(SUM(ROUND(qty * unit_cost_cents)), 0) FROM receiving_lines l WHERE l.receiving_id = r.id) AS v
           FROM receivings r ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
           ORDER BY CASE r.status WHEN 'draft' THEN 0 ELSE 1 END, r.id DESC LIMIT 300`
        )
        .all(...params) as (RvRow & { n: number; q: number; v: number })[]
      const list: ReceivingSummary[] = rows.map((r) => ({
        id: r.id,
        number: receivingNumber(r.id),
        status: r.status,
        vendor: r.vendor,
        invoiceNo: r.invoice_no,
        poNumber: r.po_number,
        receivedBy: r.received_by,
        createdAt: iso(r.created_at)!,
        postedAt: iso(r.posted_at),
        lineCount: r.n,
        qty: r.q,
        totalCents: r.v + r.freight_cents
      }))
      res.json(list)
    })
  )

  app.get('/api/receivings/:id', wrap((req, res) => res.json(need(Number(req.params.id)))))

  app.post(
    '/api/receivings',
    wrap((req, res) => {
      const c = clean(req.body ?? {})
      const id = db.transaction(() => {
        const info = db
          .prepare(
            `INSERT INTO receivings (vendor, invoice_no, po_number, invoice_date, received_by, freight_cents, freight_to_cost, notes, till_name)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(c.vendor, c.invoiceNo, c.poNumber, c.invoiceDate, c.receivedBy, c.freightCents, c.freightToCost ? 1 : 0, c.notes, c.tillName)
        const id = Number(info.lastInsertRowid)
        saveLines(id, c.lines)
        return id
      })()
      res.status(201).json(need(id))
    })
  )

  app.put(
    '/api/receivings/:id',
    wrap((req, res) => {
      const id = Number(req.params.id)
      const r = need(id)
      if (r.status !== 'draft') throw new RvError(409, `${r.number} has been received already and can't be changed`)
      const c = clean(req.body ?? {})
      db.transaction(() => {
        db.prepare(
          `UPDATE receivings SET vendor = ?, invoice_no = ?, po_number = ?, invoice_date = ?, received_by = ?, freight_cents = ?, freight_to_cost = ?,
                  notes = ?, till_name = ?, updated_at = datetime('now') WHERE id = ?`
        ).run(c.vendor, c.invoiceNo, c.poNumber, c.invoiceDate, c.receivedBy, c.freightCents, c.freightToCost ? 1 : 0, c.notes, c.tillName, id)
        saveLines(id, c.lines)
      })()
      res.json(need(id))
    })
  )

  app.delete(
    '/api/receivings/:id',
    wrap((req, res) => {
      const id = Number(req.params.id)
      const r = need(id)
      if (r.status !== 'draft') throw new RvError(409, `${r.number} has been received already and can't be deleted`)
      db.transaction(() => {
        db.prepare('DELETE FROM receiving_lines WHERE receiving_id = ?').run(id)
        db.prepare('DELETE FROM receivings WHERE id = ?').run(id)
      })()
      res.json({ ok: true })
    })
  )

  // Receive (post): stock up, new average cost, optional order cost / price updates
  app.post(
    '/api/receivings/:id/post',
    wrap((req, res) => {
      const id = Number(req.params.id)
      const r = need(id)
      if (r.status !== 'draft') throw new RvError(409, `${r.number} has been received already`)
      if (r.lines.length === 0) throw new RvError(400, 'Add the items that came in first')
      const choices = new Map<number, PostLineChoice>()
      for (const c of (Array.isArray(req.body?.lines) ? req.body.lines : []) as PostLineChoice[]) choices.set(Number(c.lineId), c)
      const landed = landedCosts(r.lines, r.freightCents, r.freightToCost)
      db.transaction(() => {
        const getP = db.prepare('SELECT type, on_hand, cost_cents, order_cost_cents, price_cents FROM products WHERE id = ?')
        const setLine = db.prepare(
          `UPDATE receiving_lines SET prev_on_hand = ?, prev_avg_cents = ?, prev_order_cents = ?, prev_price_cents = ?, landed_cost_cents = ?,
                  new_avg_cents = ?, new_price_cents = ?, cost_updated = ? WHERE id = ?`
        )
        r.lines.forEach((l, i) => {
          const p = getP.get(l.productId) as { type: string; on_hand: number; cost_cents: number | null; order_cost_cents: number | null; price_cents: number }
          const choice = choices.get(l.id)
          const unit = landed[i]
          const tracks = p.type === 'inventory'
          // Same item twice on one receiving: each line averages in turn, using the stock after the line before
          const avg = newAverageCost(tracks ? p.on_hand : 0, p.cost_cents, l.qty, unit)
          const updateCost = choice ? choice.updateCost !== false : true
          const newPrice = choice && choice.newPriceCents !== null && choice.newPriceCents !== undefined ? Math.round(Number(choice.newPriceCents)) : null
          if (newPrice !== null && (!Number.isFinite(newPrice) || newPrice < 0)) throw new RvError(400, `${l.name}: the new price isn't valid`)
          setLine.run(p.on_hand, p.cost_cents, p.order_cost_cents, p.price_cents, unit, avg, newPrice !== null && newPrice !== p.price_cents ? newPrice : null, updateCost ? 1 : 0, l.id)
          db.prepare(
            `UPDATE products SET on_hand = on_hand + ?, cost_cents = ?, order_cost_cents = ?, price_cents = ?, last_received_at = datetime('now'),
                    updated_at = datetime('now') WHERE id = ?`
          ).run(tracks ? l.qty : 0, avg, updateCost ? unit : p.order_cost_cents, newPrice ?? p.price_cents, l.productId)
        })
        db.prepare("UPDATE receivings SET status = 'posted', posted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(id)
      })()
      res.json(need(id))
    })
  )

  // An item's receiving history (item window)
  app.get(
    '/api/products/:id/receivings',
    wrap((req, res) => {
      const rows = db
        .prepare(
          `SELECT l.*, r.posted_at, r.vendor, r.invoice_no FROM receiving_lines l JOIN receivings r ON r.id = l.receiving_id
           WHERE l.product_id = ? AND r.status = 'posted' ORDER BY r.posted_at DESC, l.id DESC LIMIT 20`
        )
        .all(Number(req.params.id)) as Record<string, unknown>[]
      const list: ItemReceipt[] = rows.map((l) => ({
        receivingId: l.receiving_id as number,
        number: receivingNumber(l.receiving_id as number),
        postedAt: iso(l.posted_at as string)!,
        vendor: l.vendor as string,
        invoiceNo: l.invoice_no as string,
        qty: l.qty as number,
        unitCostCents: l.unit_cost_cents as number,
        landedCostCents: (l.landed_cost_cents as number) ?? (l.unit_cost_cents as number),
        newAvgCostCents: (l.new_avg_cents as number) ?? (l.unit_cost_cents as number)
      }))
      res.json(list)
    })
  )
}
