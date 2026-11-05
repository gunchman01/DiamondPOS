/**
 * Returns / refunds on the store server.
 *  - What can still be returned from a receipt (GET /api/sales/:id/returnable)
 *  - Receipts a customer has bought on (GET /api/customers/:id/receipts)
 *  - Turning the till's return request into negative sale lines (used by createSale)
 */
import type express from 'express'
import type { DB } from './db'
import { customerDisplayName } from '../../shared/types'
import {
  returnAmount,
  type CustomerReceipt,
  type ReturnableLine,
  type ReturnableSale,
  type ReturnRequestLine
} from '../../shared/returns'

export class ReturnError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

interface ItemRow {
  id: number
  sale_id: number
  product_id: number | null
  name: string
  unit_price_cents: number
  qty: number
  line_total_cents: number
  taxable: number | null
  department: string | null
  serial: string | null
  kind: string
  sku: string | null
  ptype: string | null
  ptaxable: number | null
}

const iso = (s: string) => s.replace(' ', 'T') + 'Z'

/** Quantity of each original line already returned (on any sale) */
function returnedQty(db: DB, saleItemIds: number[]): Map<number, number> {
  if (saleItemIds.length === 0) return new Map()
  const rows = db
    .prepare(
      `SELECT return_of_item_id AS id, COALESCE(SUM(-qty), 0) AS n FROM sale_items
       WHERE kind = 'return' AND return_of_item_id IN (${saleItemIds.map(() => '?').join(',')}) GROUP BY return_of_item_id`
    )
    .all(...saleItemIds) as { id: number; n: number }[]
  return new Map(rows.map((r) => [r.id, r.n]))
}

/** Total already refunded against a receipt (positive cents) */
function refundedAgainst(db: DB, saleId: number): number {
  const r = db
    .prepare(
      `SELECT COALESCE(SUM(-r.line_total_cents), 0) AS n FROM sale_items r JOIN sale_items o ON o.id = r.return_of_item_id
       WHERE r.kind = 'return' AND o.sale_id = ?`
    )
    .get(saleId) as { n: number }
  // Fee kept on an earlier return lowers what was refunded
  const kept = db
    .prepare(`SELECT COALESCE(SUM(line_total_cents), 0) AS n FROM sale_items WHERE kind = 'feekept' AND return_of_sale_id = ?`)
    .get(saleId) as { n: number }
  return r.n - kept.n
}

export function returnableSale(db: DB, saleId: number): ReturnableSale | null {
  const s = db
    .prepare(
      `SELECT s.*, c.id AS cid, c.first_name, c.last_name, c.company, c.track_as_company
       FROM sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = ? AND s.status = 'completed'`
    )
    .get(saleId) as Record<string, unknown> | undefined
  if (!s) return null
  const items = db
    .prepare(
      `SELECT si.*, p.sku, p.type AS ptype, p.taxable AS ptaxable FROM sale_items si LEFT JOIN products p ON p.id = si.product_id
       WHERE si.sale_id = ? ORDER BY si.id`
    )
    .all(saleId) as ItemRow[]
  const sold = items.filter((i) => i.kind !== 'return' && i.kind !== 'feekept')
  const done = returnedQty(db, sold.map((i) => i.id))
  const lines: ReturnableLine[] = sold.map((i) => {
    const qtyReturned = done.get(i.id) ?? 0
    let whyNot: string | null = null
    if (i.kind === 'wo') whyNot = 'Work order charge (not returnable here)'
    else if (i.kind === 'credit' || i.product_id === null) whyNot = 'Credit line'
    else if (i.qty <= 0) whyNot = 'Not a sold item'
    else if (qtyReturned >= i.qty) whyNot = 'Already returned'
    return {
      saleItemId: i.id,
      productId: i.product_id,
      sku: i.sku,
      name: i.name,
      serial: i.serial,
      qtySold: i.qty,
      qtyReturned,
      unitPaidCents: i.unit_price_cents,
      taxable: (i.taxable ?? i.ptaxable ?? 1) === 1,
      tracksStock: i.ptype === 'inventory',
      returnable: whyNot === null,
      whyNot
    }
  })
  const refunded = refundedAgainst(db, saleId)
  const total = s.total_cents as number
  const payments = db.prepare('SELECT method, amount_cents, reference FROM payments WHERE sale_id = ? ORDER BY id').all(saleId) as {
    method: 'cash' | 'card'
    amount_cents: number
    reference: string | null
  }[]
  return {
    saleId,
    createdAt: iso(s.created_at as string),
    tillName: s.till_name as string,
    customerId: (s.cid as number | null) ?? null,
    customerName:
      s.cid === null || s.cid === undefined
        ? null
        : customerDisplayName({
            firstName: s.first_name as string | null,
            lastName: s.last_name as string | null,
            company: s.company as string | null,
            trackAsCompany: s.track_as_company === 1
          }),
    taxExempt: s.tax_exempt === 1,
    totalCents: total,
    refundedCents: refunded,
    refundableCents: Math.max(0, total - refunded),
    lines,
    payments: payments.map((p) => ({ method: p.method, amountCents: p.amount_cents, reference: p.reference ?? undefined }))
  }
}

/** A line to add to the new sale for an item coming back */
export interface PreparedReturnLine {
  productId: number | null
  serial: string
  name: string
  unitPriceCents: number // negative
  qty: number // negative
  lineTotalCents: number // negative
  taxCents: number // negative
  taxable: boolean
  department: string | null
  kind: 'return' | 'feekept'
  returnOfItemId: number | null
  returnOfSaleId: number | null
  reason: string | null
  restock: boolean
  tracksStock: boolean
}

export interface PreparedReturns {
  lines: PreparedReturnLine[]
  /** Customer of the original receipt(s), if any */
  customerId: number | null
  noReceipt: boolean
}

/**
 * Check a return request and build its (negative) lines.
 * Refunds use the price paid on the original receipt; no-receipt returns use today's price.
 */
export function prepareReturns(db: DB, req: ReturnRequestLine[], taxRate: number): PreparedReturns {
  const out: PreparedReturnLine[] = []
  let customerId: number | null = null
  let noReceipt = false
  const want = new Map<number, number>() // saleItemId -> qty asked for in this request
  const bySale = new Map<number, { info: ReturnableSale; amount: number }>()

  for (const r of req) {
    const qty = Number(r.qty)
    if (!Number.isInteger(qty) || qty <= 0) throw new ReturnError(400, 'Return quantity must be a whole number above 0')
    const reason = String(r.reason ?? '').trim().slice(0, 120)
    if (!reason) throw new ReturnError(400, 'Choose a reason for each returned item')
    const restock = r.restock === true

    if (r.saleItemId !== undefined && r.saleItemId !== null) {
      const row = db.prepare('SELECT sale_id FROM sale_items WHERE id = ?').get(Number(r.saleItemId)) as { sale_id: number } | undefined
      if (!row) throw new ReturnError(400, 'That receipt line was not found')
      let entry = bySale.get(row.sale_id)
      if (!entry) {
        const info = returnableSale(db, row.sale_id)
        if (!info) throw new ReturnError(400, `Receipt #${row.sale_id} was not found`)
        entry = { info, amount: 0 }
        bySale.set(row.sale_id, entry)
      }
      const { info } = entry
      const line = info.lines.find((l) => l.saleItemId === Number(r.saleItemId))!
      if (!line.returnable) throw new ReturnError(400, `${line.name} (receipt #${info.saleId}) can't be returned: ${line.whyNot}`)
      const asked = (want.get(line.saleItemId) ?? 0) + qty
      const left = line.qtySold - line.qtyReturned
      if (asked > left)
        throw new ReturnError(
          400,
          `${line.name}: only ${left} of the ${line.qtySold} bought on receipt #${info.saleId} can still be returned`
        )
      want.set(line.saleItemId, asked)
      if (info.customerId !== null) {
        if (customerId !== null && customerId !== info.customerId)
          throw new ReturnError(400, 'These receipts are for different customers. Do one return per customer.')
        customerId = info.customerId
      }
      const { amountCents, taxCents } = returnAmount(line.unitPaidCents, qty, line.taxable, info.taxExempt, taxRate)
      entry.amount += amountCents
      const dept = db.prepare('SELECT department FROM sale_items WHERE id = ?').get(line.saleItemId) as { department: string | null }
      out.push({
        productId: line.productId,
        serial: line.serial ?? '',
        name: line.name,
        unitPriceCents: -line.unitPaidCents,
        qty: -qty,
        lineTotalCents: -amountCents,
        taxCents: -taxCents,
        taxable: line.taxable && !info.taxExempt,
        department: dept.department,
        kind: 'return',
        returnOfItemId: line.saleItemId,
        returnOfSaleId: info.saleId,
        reason,
        restock: restock && line.tracksStock,
        tracksStock: line.tracksStock
      })
    } else if (r.productId !== undefined && r.productId !== null) {
      // No receipt: today's price, flagged on the sale for a manager to check
      const p = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(r.productId)) as
        | { id: number; name: string; price_cents: number; taxable: number; department: string | null; type: string }
        | undefined
      if (!p) throw new ReturnError(400, 'Returned item not found')
      noReceipt = true
      const { amountCents, taxCents } = returnAmount(p.price_cents, qty, p.taxable === 1, false, taxRate)
      out.push({
        productId: p.id,
        serial: '',
        name: p.name,
        unitPriceCents: -p.price_cents,
        qty: -qty,
        lineTotalCents: -amountCents,
        taxCents: -taxCents,
        taxable: p.taxable === 1,
        department: p.department,
        kind: 'return',
        returnOfItemId: null,
        returnOfSaleId: null,
        reason,
        restock: restock && p.type === 'inventory',
        tracksStock: p.type === 'inventory'
      })
    } else throw new ReturnError(400, 'Each returned item needs its receipt line, or the item for a no-receipt return')
  }

  // A receipt that had an estimate fee credit can't refund more than was paid; the rest is kept
  for (const { info, amount } of bySale.values()) {
    const kept = Math.max(0, amount - info.refundableCents)
    if (kept > 0)
      out.push({
        productId: null,
        serial: '',
        name: `Not refunded: estimate fee credit on receipt #${info.saleId} is kept`,
        unitPriceCents: kept,
        qty: 1,
        lineTotalCents: kept,
        taxCents: 0,
        taxable: false,
        department: 'Estimate Fees',
        kind: 'feekept',
        returnOfItemId: null,
        returnOfSaleId: info.saleId,
        reason: null,
        restock: false,
        tracksStock: false
      })
  }
  return { lines: out, customerId, noReceipt }
}

/** After the sale is saved (same transaction): stock back, and returned serial units off the customer's list */
export function finishReturns(db: DB, lines: PreparedReturnLine[]) {
  const addStock = db.prepare('UPDATE products SET on_hand = on_hand + ? WHERE id = ?')
  const dropUnit = db.prepare(
    "UPDATE customer_units SET active = 0, notes = TRIM(notes || ' Returned.') WHERE sale_id = ? AND serial = ? AND active = 1"
  )
  for (const l of lines) {
    if (l.kind !== 'return') continue
    if (l.restock && l.productId !== null) addStock.run(-l.qty, l.productId)
    if (l.serial && l.returnOfSaleId) dropUnit.run(l.returnOfSaleId, l.serial)
  }
}

export function registerReturnRoutes(app: express.Express, db: DB) {
  app.get('/api/sales/:id/returnable', (req, res) => {
    const id = Number(String(req.params.id).replace(/^#/, ''))
    const info = Number.isInteger(id) ? returnableSale(db, id) : null
    if (!info) return res.status(404).json({ error: `Receipt #${req.params.id} was not found` })
    res.json(info)
  })

  // Recent receipts for a customer (to find the one being returned)
  app.get('/api/customers/:id/receipts', (req, res) => {
    const rows = db
      .prepare(
        `SELECT s.id, s.created_at, s.total_cents,
                (SELECT GROUP_CONCAT(name, ', ') FROM (SELECT name FROM sale_items WHERE sale_id = s.id AND kind = 'item' LIMIT 4)) AS items
         FROM sales s WHERE s.customer_id = ? AND s.status = 'completed'
           AND EXISTS (SELECT 1 FROM sale_items WHERE sale_id = s.id AND kind = 'item' AND qty > 0)
         ORDER BY s.id DESC LIMIT 60`
      )
      .all(Number(req.params.id)) as { id: number; created_at: string; total_cents: number; items: string | null }[]
    const list: CustomerReceipt[] = rows.map((r) => ({ id: r.id, createdAt: iso(r.created_at), totalCents: r.total_cents, itemsText: r.items ?? '' }))
    res.json(list)
  })
}
