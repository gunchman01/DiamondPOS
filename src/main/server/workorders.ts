/**
 * WORK ORDERS (repairs) and CUSTOMER UNITS (equipment).
 *
 * Stock rule: parts on a ticket only come out of inventory while the ticket
 * is in a stage with `partsTaken` (Approved to Fix and later). Moving back to
 * Needs Estimate, or to NOT FIXED, puts them back. `reconcileStock()` makes
 * the stock match the stage every time a ticket or its parts change, so the
 * numbers can never drift.
 */
import type express from 'express'
import type { DB } from './db'
import { customerDisplayName, taxExemptState, type StoreSettings } from '../../shared/types'
import {
  DEFAULT_WO_SETTINGS,
  STAGES,
  guessCategory,
  isEmailable,
  stage,
  unitLabel,
  woTotals,
  type CustomerUnit,
  type UnitCategory,
  type WoLine,
  type WoLineKind,
  type WoSettings,
  type WoStatus,
  type WoSummary,
  type WorkOrder
} from '../../shared/workorders'
import { fillTemplate, woEmailHtml, woEmailText } from '../../shared/workOrderEmail'
import { sendEmail } from './marketing/mailer'

class WoError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

const iso = (t: string | null) => (t ? t.replace(' ', 'T') + 'Z' : null)
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const woNumber = (id: number) => `WO-${String(id).padStart(6, '0')}`
const CATEGORIES: UnitCategory[] = ['handheld', 'mower', 'other']
const KINDS: WoLineKind[] = ['part', 'labor', 'shop', 'misc']

// ---------------- Settings ----------------

export function getWoSettings(db: DB): WoSettings {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'wo_settings'").get() as { value: string } | undefined
  let saved: Partial<WoSettings> = {}
  try {
    saved = row ? JSON.parse(row.value) : {}
  } catch {
    /* use defaults */
  }
  const d = DEFAULT_WO_SETTINGS
  return {
    laborRateCents: saved.laborRateCents ?? d.laborRateCents,
    laborTaxable: saved.laborTaxable ?? d.laborTaxable,
    shopTaxable: saved.shopTaxable ?? d.shopTaxable,
    shopSupplies: {
      handheld: { ...d.shopSupplies.handheld, ...(saved.shopSupplies?.handheld ?? {}) },
      mower: { ...d.shopSupplies.mower, ...(saved.shopSupplies?.mower ?? {}) },
      other: { ...d.shopSupplies.other, ...(saved.shopSupplies?.other ?? {}) }
    },
    templates: Object.fromEntries(
      Object.entries(d.templates).map(([k, t]) => [k, { ...t, ...((saved.templates as Record<string, object>)?.[k] ?? {}) }])
    ) as WoSettings['templates']
  }
}

function saveWoSettings(db: DB, input: Partial<WoSettings>): WoSettings {
  const cur = getWoSettings(db)
  const cents = (v: unknown, label: string) => {
    const n = Number(v)
    if (!Number.isInteger(n) || n < 0) throw new WoError(400, `${label} must be a positive amount`)
    return n
  }
  const next: WoSettings = {
    laborRateCents: input.laborRateCents !== undefined ? cents(input.laborRateCents, 'Labor rate') : cur.laborRateCents,
    laborTaxable: input.laborTaxable ?? cur.laborTaxable,
    shopTaxable: input.shopTaxable ?? cur.shopTaxable,
    shopSupplies: { ...cur.shopSupplies },
    templates: { ...cur.templates }
  }
  for (const c of CATEGORIES) {
    const s = input.shopSupplies?.[c]
    if (s)
      next.shopSupplies[c] = {
        description: String(s.description ?? '').trim().slice(0, 120) || cur.shopSupplies[c].description,
        priceCents: cents(s.priceCents, 'Shop supplies price')
      }
  }
  for (const k of Object.keys(cur.templates) as (keyof WoSettings['templates'])[]) {
    const t = input.templates?.[k]
    if (t)
      next.templates[k] = {
        subject: String(t.subject ?? '').slice(0, 200),
        body: String(t.body ?? '').slice(0, 5000),
        includeBill: t.includeBill === true
      }
  }
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('wo_settings', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(JSON.stringify(next))
  return next
}

// ---------------- Units ----------------

type UnitRow = {
  id: number
  customer_id: number
  category: UnitCategory
  unit_type: string
  brand: string
  model: string
  serial: string
  hours: number | null
  purchased_here: number
  purchase_date: string | null
  sale_id: number | null
  notes: string
  active: number
}

const toUnit = (r: UnitRow): CustomerUnit => ({
  id: r.id,
  customerId: r.customer_id,
  category: CATEGORIES.includes(r.category) ? r.category : 'other',
  unitType: r.unit_type,
  brand: r.brand,
  model: r.model,
  serial: r.serial,
  hours: r.hours,
  purchasedHere: r.purchased_here === 1,
  purchaseDate: r.purchase_date,
  saleId: r.sale_id,
  notes: r.notes,
  active: r.active === 1
})

export function getUnit(db: DB, id: number): CustomerUnit | null {
  const r = db.prepare('SELECT * FROM customer_units WHERE id = ?').get(id) as UnitRow | undefined
  return r ? toUnit(r) : null
}

function readUnitInput(b: Record<string, unknown>, base?: CustomerUnit) {
  const str = (k: string, max = 100) =>
    b[k] === undefined && base ? String((base as unknown as Record<string, unknown>)[k] ?? '') : String(b[k] ?? '').trim().slice(0, max)
  const category = (b.category ?? base?.category ?? 'other') as UnitCategory
  if (!CATEGORIES.includes(category)) throw new WoError(400, 'Unknown unit category')
  let hours: number | null = base?.hours ?? null
  if (b.hours !== undefined) {
    if (b.hours === null || b.hours === '') hours = null
    else {
      hours = Number(b.hours)
      if (!Number.isFinite(hours) || hours < 0) throw new WoError(400, 'Hours must be a positive number')
    }
  }
  const u = {
    category,
    unitType: str('unitType', 60),
    brand: str('brand', 60),
    model: str('model', 80),
    serial: str('serial', 80),
    hours: category === 'mower' ? hours : null, // only mowers have an hour meter
    notes: str('notes', 1000),
    purchaseDate: b.purchaseDate === undefined ? (base?.purchaseDate ?? null) : String(b.purchaseDate || '') || null,
    active: b.active === undefined ? (base?.active ?? true) : b.active === true
  }
  if (!u.unitType) throw new WoError(400, 'Choose what kind of unit it is (e.g. Blower)')
  if (!u.brand) throw new WoError(400, 'Enter the brand')
  if (u.purchaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(u.purchaseDate)) throw new WoError(400, 'Purchase date must be a date')
  return u
}

/** Called by createSale: a serialized item sold to a customer becomes one of their units */
export function addUnitFromSale(
  db: DB,
  a: { customerId: number; saleId: number; serial: string; name: string; department: string | null; manufacturer: string | null }
) {
  db.prepare(
    `INSERT INTO customer_units (customer_id, category, unit_type, brand, model, serial, purchased_here, purchase_date, sale_id)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(
    a.customerId,
    guessCategory(`${a.department ?? ''} ${a.name}`),
    a.department || a.name,
    a.manufacturer || '',
    a.name,
    a.serial,
    today(),
    a.saleId
  )
}

// ---------------- Work orders ----------------

type WoRow = {
  id: number
  customer_id: number
  unit_id: number
  status: WoStatus
  problem: string
  diagnosis: string
  work_done: string
  internal_notes: string
  hours_in: number | null
  last_emailed_at: string | null
  last_emailed_status: WoStatus | null
  created_at: string
  updated_at: string
}
type LineRow = {
  id: number
  work_order_id: number
  kind: WoLineKind
  product_id: number | null
  description: string
  qty: number
  unit_price_cents: number
  taxable: number
  stock_taken: number
  on_hand: number | null
  ptype: string | null
  sku: string | null
}

export function registerWorkOrderRoutes(app: express.Express, db: DB, readSettings: (db: DB) => StoreSettings) {
  const linesFor = (woId: number): LineRow[] =>
    db
      .prepare(
        `SELECT l.*, p.on_hand, p.type AS ptype, p.sku FROM work_order_lines l LEFT JOIN products p ON p.id = l.product_id
         WHERE l.work_order_id = ? ORDER BY CASE l.kind WHEN 'part' THEN 0 WHEN 'labor' THEN 1 WHEN 'shop' THEN 2 ELSE 3 END, l.id`
      )
      .all(woId) as LineRow[]

  const toLine = (l: LineRow): WoLine => {
    const tracks = l.kind === 'part' && l.product_id !== null && l.ptype === 'inventory'
    const onHand = tracks ? (l.on_hand ?? 0) : null
    const stillNeeded = Math.max(0, l.qty - l.stock_taken)
    return {
      id: l.id,
      kind: l.kind,
      productId: l.product_id,
      description: l.description,
      sku: l.sku,
      qty: l.qty,
      unitPriceCents: l.unit_price_cents,
      taxable: l.taxable === 1,
      stockTaken: l.stock_taken,
      onHand,
      // red: not enough on the shelf for what this ticket still needs, or we took more than we had
      short: tracks && ((stillNeeded > 0 && (onHand ?? 0) < stillNeeded) || (l.stock_taken > 0 && (onHand ?? 0) < 0))
    }
  }

  /** Make the stock match the ticket's stage (see top of file) */
  function reconcileStock(woId: number) {
    const wo = db.prepare('SELECT status FROM work_orders WHERE id = ?').get(woId) as { status: WoStatus } | undefined
    if (!wo) return
    const take = stage(wo.status).partsTaken
    for (const l of linesFor(woId)) {
      if (l.kind !== 'part' || l.product_id === null || l.ptype !== 'inventory') continue
      const target = take ? l.qty : 0
      const delta = target - l.stock_taken
      if (delta !== 0) {
        db.prepare('UPDATE products SET on_hand = on_hand - ? WHERE id = ?').run(Math.round(delta), l.product_id)
        db.prepare('UPDATE work_order_lines SET stock_taken = ? WHERE id = ?').run(target, l.id)
      }
    }
  }

  const addHistory = (woId: number, note: string, by: string, status: WoStatus | null = null) =>
    db.prepare('INSERT INTO work_order_history (work_order_id, status, note, by_name) VALUES (?, ?, ?, ?)').run(
      woId,
      status,
      note.slice(0, 500),
      by.slice(0, 60)
    )
  const touch = (woId: number) => db.prepare("UPDATE work_orders SET updated_at = datetime('now') WHERE id = ?").run(woId)

  function getWo(id: number): WorkOrder | null {
    const r = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id) as WoRow | undefined
    if (!r) return null
    const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(r.customer_id) as Record<string, unknown>
    const customer = {
      firstName: (c.first_name as string) ?? null,
      lastName: (c.last_name as string) ?? null,
      company: (c.company as string) ?? null,
      trackAsCompany: c.track_as_company === 1,
      taxExempt: c.tax_exempt === 1,
      taxExemptExpires: (c.tax_exempt_expires as string) ?? null,
      taxExemptId: (c.tax_exempt_id as string) ?? null
    }
    const st = taxExemptState(customer, today())
    const exempt = customer.taxExempt && !!customer.taxExemptId && st.kind !== 'expired'
    const lines = linesFor(id).map(toLine)
    const history = (
      db.prepare('SELECT * FROM work_order_history WHERE work_order_id = ? ORDER BY id DESC').all(id) as {
        at: string
        status: WoStatus | null
        note: string
        by_name: string
      }[]
    ).map((h) => ({ at: iso(h.at)!, status: h.status, note: h.note, by: h.by_name }))
    return {
      id: r.id,
      number: woNumber(r.id),
      status: r.status,
      customerId: r.customer_id,
      customerName: customerDisplayName(customer),
      customerEmail: (c.email as string) || null,
      customerPhone: ((c.mobile as string) || (c.phone as string)) ?? null,
      unit: getUnit(db, r.unit_id)!,
      problem: r.problem,
      diagnosis: r.diagnosis,
      workDone: r.work_done,
      internalNotes: r.internal_notes,
      hoursIn: r.hours_in,
      lines,
      totals: woTotals(lines, readSettings(db).taxRate, exempt),
      createdAt: iso(r.created_at)!,
      updatedAt: iso(r.updated_at)!,
      lastEmailedAt: iso(r.last_emailed_at),
      lastEmailedStatus: r.last_emailed_status,
      history
    }
  }

  const need = (id: number) => {
    const wo = getWo(id)
    if (!wo) throw new WoError(404, 'Work order not found')
    return wo
  }
  const wrap =
    (fn: (req: express.Request, res: express.Response) => unknown) => async (req: express.Request, res: express.Response) => {
      try {
        await fn(req, res)
      } catch (e) {
        if (res.headersSent) return
        if (e instanceof WoError) res.status(e.status).json({ error: e.message })
        else res.status(400).json({ error: (e as Error).message })
      }
    }
  const by = (req: express.Request) => String((req.body as Record<string, unknown>)?.by ?? req.header('X-Till') ?? 'Staff')

  // ================= Settings =================
  app.get('/api/workorders/settings', (_req, res) => res.json(getWoSettings(db)))
  app.put(
    '/api/workorders/settings',
    wrap((req, res) => res.json(saveWoSettings(db, req.body ?? {})))
  )

  // ================= Units =================
  app.get('/api/customers/:id/units', (req, res) => {
    const rows = db
      .prepare('SELECT * FROM customer_units WHERE customer_id = ? ORDER BY active DESC, id DESC')
      .all(Number(req.params.id)) as UnitRow[]
    res.json(rows.map(toUnit))
  })

  app.post(
    '/api/customers/:id/units',
    wrap((req, res) => {
      const customerId = Number(req.params.id)
      if (!db.prepare('SELECT id FROM customers WHERE id = ?').get(customerId)) throw new WoError(404, 'Customer not found')
      const u = readUnitInput(req.body ?? {})
      const info = db
        .prepare(
          `INSERT INTO customer_units (customer_id, category, unit_type, brand, model, serial, hours, notes, purchase_date, active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(customerId, u.category, u.unitType, u.brand, u.model, u.serial, u.hours, u.notes, u.purchaseDate, u.active ? 1 : 0)
      res.status(201).json(getUnit(db, Number(info.lastInsertRowid)))
    })
  )

  app.put(
    '/api/units/:id',
    wrap((req, res) => {
      const cur = getUnit(db, Number(req.params.id))
      if (!cur) throw new WoError(404, 'Unit not found')
      const u = readUnitInput(req.body ?? {}, cur)
      db.prepare(
        `UPDATE customer_units SET category = ?, unit_type = ?, brand = ?, model = ?, serial = ?, hours = ?, notes = ?, purchase_date = ?, active = ?
         WHERE id = ?`
      ).run(u.category, u.unitType, u.brand, u.model, u.serial, u.hours, u.notes, u.purchaseDate, u.active ? 1 : 0, cur.id)
      res.json(getUnit(db, cur.id))
    })
  )

  // Find a unit by serial number (any customer)
  app.get('/api/units', (req, res) => {
    const serial = String(req.query.serial ?? '').trim()
    if (!serial) return res.json([])
    const rows = db.prepare('SELECT * FROM customer_units WHERE serial = ? COLLATE NOCASE').all(serial) as UnitRow[]
    res.json(rows.map(toUnit))
  })

  // ================= Work orders =================
  app.get('/api/workorders', (req, res) => {
    const status = String(req.query.status ?? 'open')
    const search = String(req.query.search ?? '').trim()
    const params: (string | number)[] = []
    let where = '1=1'
    if (status === 'open') where += " AND w.status <> 'closed'"
    else if (status !== 'all') {
      where += ' AND w.status = ?'
      params.push(status)
    }
    if (search) {
      const like = `%${search}%`
      const num = Number(search.replace(/^WO-?/i, ''))
      where += ` AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.company LIKE ? OR u.serial LIKE ? OR u.brand LIKE ? OR u.model LIKE ? OR u.unit_type LIKE ? OR c.phone LIKE ? OR c.mobile LIKE ?${Number.isInteger(num) && num > 0 ? ' OR w.id = ?' : ''})`
      params.push(like, like, like, like, like, like, like, like, like)
      if (Number.isInteger(num) && num > 0) params.push(num)
    }
    const rows = db
      .prepare(
        `SELECT w.*, c.first_name, c.last_name, c.company, c.track_as_company, c.tax_exempt, c.tax_exempt_id, c.tax_exempt_expires,
                u.brand, u.model, u.unit_type, u.serial
         FROM work_orders w JOIN customers c ON c.id = w.customer_id JOIN customer_units u ON u.id = w.unit_id
         WHERE ${where} ORDER BY w.id DESC LIMIT 500`
      )
      .all(...params) as (WoRow & Record<string, unknown>)[]
    const rate = readSettings(db).taxRate
    const list: WoSummary[] = rows.map((r) => {
      const lines = linesFor(r.id).map(toLine)
      const exempt =
        r.tax_exempt === 1 &&
        !!r.tax_exempt_id &&
        taxExemptState({ taxExempt: true, taxExemptExpires: (r.tax_exempt_expires as string) ?? null }, today()).kind !== 'expired'
      return {
        id: r.id,
        number: woNumber(r.id),
        status: r.status,
        customerName: customerDisplayName({
          firstName: r.first_name as string,
          lastName: r.last_name as string,
          company: r.company as string,
          trackAsCompany: r.track_as_company === 1
        }),
        unitLabel: unitLabel({ brand: r.brand as string, model: r.model as string, unitType: r.unit_type as string }),
        serial: r.serial as string,
        createdAt: iso(r.created_at)!,
        updatedAt: iso(r.updated_at)!,
        totalCents: woTotals(lines, rate, exempt).totalCents,
        shortParts: lines.filter((l) => l.short).length
      }
    })
    res.json(list)
  })

  app.get('/api/workorders/counts', (_req, res) => {
    const rows = db.prepare('SELECT status, COUNT(*) AS n FROM work_orders GROUP BY status').all() as { status: WoStatus; n: number }[]
    res.json(Object.fromEntries(STAGES.map((s) => [s.status, rows.find((r) => r.status === s.status)?.n ?? 0])))
  })

  app.get(
    '/api/workorders/:id',
    wrap((req, res) => res.json(need(Number(req.params.id))))
  )

  // Check in a unit: new ticket in "Needs Estimate", with the default shop supplies line
  app.post(
    '/api/workorders',
    wrap((req, res) => {
      const b = (req.body ?? {}) as Record<string, unknown>
      const unit = getUnit(db, Number(b.unitId))
      if (!unit) throw new WoError(400, 'Choose the unit being repaired')
      if (unit.customerId !== Number(b.customerId)) throw new WoError(400, 'That unit belongs to a different customer')
      let hoursIn: number | null = null
      if (b.hoursIn !== undefined && b.hoursIn !== null && b.hoursIn !== '') {
        hoursIn = Number(b.hoursIn)
        if (!Number.isFinite(hoursIn) || hoursIn < 0) throw new WoError(400, 'Hours must be a positive number')
      }
      const problem = String(b.problem ?? '').trim().slice(0, 4000)
      if (!problem) throw new WoError(400, "Describe what's wrong with the unit")
      const settings = getWoSettings(db)
      const id = db.transaction(() => {
        const info = db
          .prepare('INSERT INTO work_orders (customer_id, unit_id, problem, hours_in) VALUES (?, ?, ?, ?)')
          .run(unit.customerId, unit.id, problem, unit.category === 'mower' ? hoursIn : null)
        const woId = Number(info.lastInsertRowid)
        const shop = settings.shopSupplies[unit.category]
        if (shop.priceCents > 0)
          db.prepare(
            "INSERT INTO work_order_lines (work_order_id, kind, description, qty, unit_price_cents, taxable) VALUES (?, 'shop', ?, 1, ?, ?)"
          ).run(woId, shop.description, shop.priceCents, settings.shopTaxable ? 1 : 0)
        if (unit.category === 'mower' && hoursIn !== null)
          db.prepare('UPDATE customer_units SET hours = ? WHERE id = ?').run(hoursIn, unit.id)
        addHistory(woId, 'Checked in', by(req), 'needs_estimate')
        return woId
      })()
      res.status(201).json(need(id))
    })
  )

  // Notes and hour reading
  app.put(
    '/api/workorders/:id',
    wrap((req, res) => {
      const wo = need(Number(req.params.id))
      const b = (req.body ?? {}) as Record<string, unknown>
      const txt = (k: string, cur: string) => (b[k] === undefined ? cur : String(b[k] ?? '').slice(0, 8000))
      let hoursIn = wo.hoursIn
      if (b.hoursIn !== undefined) {
        hoursIn = b.hoursIn === null || b.hoursIn === '' ? null : Number(b.hoursIn)
        if (hoursIn !== null && (!Number.isFinite(hoursIn) || hoursIn < 0)) throw new WoError(400, 'Hours must be a positive number')
      }
      db.prepare(
        "UPDATE work_orders SET problem = ?, diagnosis = ?, work_done = ?, internal_notes = ?, hours_in = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(
        txt('problem', wo.problem),
        txt('diagnosis', wo.diagnosis),
        txt('workDone', wo.workDone),
        txt('internalNotes', wo.internalNotes),
        wo.unit.category === 'mower' ? hoursIn : null,
        wo.id
      )
      res.json(need(wo.id))
    })
  )

  // Move to another stage (stock follows the stage)
  app.post(
    '/api/workorders/:id/status',
    wrap((req, res) => {
      const wo = need(Number(req.params.id))
      const to = String((req.body as Record<string, unknown>)?.status ?? '') as WoStatus
      if (!STAGES.some((s) => s.status === to)) throw new WoError(400, 'Unknown stage')
      if (to === wo.status) return res.json(wo)
      db.transaction(() => {
        db.prepare("UPDATE work_orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(to, wo.id)
        reconcileStock(wo.id)
        const was = stage(wo.status), now = stage(to)
        let note = `${was.label} → ${now.label}`
        if (!was.partsTaken && now.partsTaken && wo.lines.some((l) => l.kind === 'part')) note += ' (parts taken from stock)'
        if (was.partsTaken && !now.partsTaken && wo.lines.some((l) => l.kind === 'part' && l.stockTaken > 0))
          note += ' (parts returned to stock)'
        addHistory(wo.id, note, by(req), to)
      })()
      res.json(need(wo.id))
    })
  )

  // ----- Lines (parts, labor, shop supplies, other) -----
  app.post(
    '/api/workorders/:id/lines',
    wrap((req, res) => {
      const wo = need(Number(req.params.id))
      if (wo.status === 'closed') throw new WoError(409, 'This work order is closed')
      const b = (req.body ?? {}) as Record<string, unknown>
      const kind = String(b.kind) as WoLineKind
      if (!KINDS.includes(kind)) throw new WoError(400, 'Unknown line type')
      const settings = getWoSettings(db)
      let description = String(b.description ?? '').trim()
      let price = b.unitPriceCents === undefined ? null : Number(b.unitPriceCents)
      let taxable = b.taxable === undefined ? null : b.taxable === true
      let productId: number | null = null
      if (kind === 'part') {
        const p = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(b.productId)) as
          | { id: number; name: string; price_cents: number; taxable: number }
          | undefined
        if (!p) throw new WoError(400, 'Choose a part from the item list')
        productId = p.id
        description ||= p.name
        price ??= p.price_cents
        taxable ??= p.taxable === 1
      } else if (kind === 'labor') {
        description ||= 'Labor'
        price ??= settings.laborRateCents
        taxable ??= settings.laborTaxable
      } else if (kind === 'shop') {
        const s = settings.shopSupplies[wo.unit.category]
        description ||= s.description
        price ??= s.priceCents
        taxable ??= settings.shopTaxable
      } else {
        if (!description) throw new WoError(400, 'Enter a description')
        taxable ??= true
      }
      const qty = b.qty === undefined ? 1 : Number(b.qty)
      if (!Number.isFinite(qty) || qty <= 0) throw new WoError(400, kind === 'labor' ? 'Hours must be above 0' : 'Quantity must be above 0')
      if (kind === 'part' && !Number.isInteger(qty)) throw new WoError(400, 'Part quantity must be a whole number')
      if (!Number.isInteger(price) || (price ?? 0) < 0) throw new WoError(400, 'Price must be a positive amount')
      db.transaction(() => {
        db.prepare(
          'INSERT INTO work_order_lines (work_order_id, kind, product_id, description, qty, unit_price_cents, taxable) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(wo.id, kind, productId, description.slice(0, 200), qty, price, taxable ? 1 : 0)
        reconcileStock(wo.id)
        touch(wo.id)
      })()
      res.status(201).json(need(wo.id))
    })
  )

  app.put(
    '/api/workorders/:id/lines/:lineId',
    wrap((req, res) => {
      const wo = need(Number(req.params.id))
      if (wo.status === 'closed') throw new WoError(409, 'This work order is closed')
      const line = wo.lines.find((l) => l.id === Number(req.params.lineId))
      if (!line) throw new WoError(404, 'Line not found')
      const b = (req.body ?? {}) as Record<string, unknown>
      const qty = b.qty === undefined ? line.qty : Number(b.qty)
      const price = b.unitPriceCents === undefined ? line.unitPriceCents : Number(b.unitPriceCents)
      if (!Number.isFinite(qty) || qty <= 0) throw new WoError(400, 'Quantity must be above 0')
      if (line.kind === 'part' && !Number.isInteger(qty)) throw new WoError(400, 'Part quantity must be a whole number')
      if (!Number.isInteger(price) || price < 0) throw new WoError(400, 'Price must be a positive amount')
      const description = b.description === undefined ? line.description : String(b.description).trim().slice(0, 200) || line.description
      const taxable = b.taxable === undefined ? line.taxable : b.taxable === true
      db.transaction(() => {
        db.prepare('UPDATE work_order_lines SET qty = ?, unit_price_cents = ?, description = ?, taxable = ? WHERE id = ?').run(
          qty,
          price,
          description,
          taxable ? 1 : 0,
          line.id
        )
        reconcileStock(wo.id)
        touch(wo.id)
      })()
      res.json(need(wo.id))
    })
  )

  app.post(
    '/api/workorders/:id/lines/:lineId/remove',
    wrap((req, res) => {
      const wo = need(Number(req.params.id))
      if (wo.status === 'closed') throw new WoError(409, 'This work order is closed')
      const line = wo.lines.find((l) => l.id === Number(req.params.lineId))
      if (!line) throw new WoError(404, 'Line not found')
      db.transaction(() => {
        // give back anything this line took from stock
        if (line.stockTaken && line.productId)
          db.prepare('UPDATE products SET on_hand = on_hand + ? WHERE id = ?').run(Math.round(line.stockTaken), line.productId)
        db.prepare('DELETE FROM work_order_lines WHERE id = ?').run(line.id)
        touch(wo.id)
      })()
      res.json(need(wo.id))
    })
  )

  // ----- Email the customer the current stage -----
  function buildEmail(wo: WorkOrder) {
    if (!isEmailable(wo.status)) throw new WoError(400, `There is no customer email for "${stage(wo.status).label}"`)
    const store = readSettings(db)
    const t = getWoSettings(db).templates[wo.status]
    const values: Record<string, string> = {
      first_name: wo.customerName.split(' ')[0] || 'there',
      customer: wo.customerName,
      wo_number: wo.number,
      unit: unitLabel(wo.unit),
      serial: wo.unit.serial,
      status: stage(wo.status).label,
      total: `$${(wo.totals.totalCents / 100).toFixed(2)}`,
      diagnosis: wo.diagnosis.trim(),
      work_done: wo.workDone.trim() || '(see the list below)',
      store: store.storeName
    }
    const content = {
      storeName: store.storeName,
      storeAddress: store.storeAddress,
      body: fillTemplate(t.body, values),
      bill: t.includeBill ? { lines: wo.lines, totals: wo.totals } : null,
      woNumber: wo.number,
      unit: unitLabel(wo.unit),
      serial: wo.unit.serial,
      statusLabel: stage(wo.status).label
    }
    return { subject: fillTemplate(t.subject, values), html: woEmailHtml(content), text: woEmailText(content) }
  }

  app.get(
    '/api/workorders/:id/email-preview',
    wrap((req, res) => res.json(buildEmail(need(Number(req.params.id)))))
  )

  app.post(
    '/api/workorders/:id/email',
    wrap(async (req, res) => {
      const wo = need(Number(req.params.id))
      if (!wo.customerEmail) throw new WoError(400, `${wo.customerName} has no email address. Add one on their customer record.`)
      const mail = buildEmail(wo)
      await sendEmail(db, readSettings(db), { to: wo.customerEmail, ...mail })
      db.prepare("UPDATE work_orders SET last_emailed_at = datetime('now'), last_emailed_status = ? WHERE id = ?").run(wo.status, wo.id)
      addHistory(wo.id, `Emailed customer: ${stage(wo.status).label} (${wo.customerEmail})`, by(req), wo.status)
      res.json(need(wo.id))
    })
  )
}
