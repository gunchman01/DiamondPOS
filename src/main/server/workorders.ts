import { serviceText,textSettings,textSettingsView,saveTextSettings,sendServiceText,type ChannelResult } from './serviceNotifications'
import {enrichWarranty} from './warranty'
import {customerWarrantyView} from '../../shared/warranty'
import { smsPhone,smsLength } from '../../shared/serviceSms'
import { groupInfo,relatedOrders,linkOrders,unlinkOrder } from './workOrderGroups'
import type { CustomerEquipment } from '../../shared/customerEquipment'
import { estimateIsSending,approvalConfig,approvalView,saveApprovalConfig,testApprovalConnection,syncApprovals,estimateInfo,estimateHash,sendEstimate,applyDecision,approvalRequest } from './approvals'
/**
 * WORK ORDERS (repairs) and CUSTOMER UNITS (equipment).
 *
 * Stock rule: inventory parts are reserved immediately, including estimate/customer-wait stages.
 * Removing parts or moving to NOT FIXED puts them back. `reconcileStock()` makes
 * the stock match the stage every time a ticket or its parts change, so the
 * numbers can never drift.
 */
import {cancelWorkOrderKioskSessions} from './kiosk'
import {cancelWorkOrder,workOrderCancellation} from './workOrderCancellation'
import {PENDING_REPAIR_ISSUE} from '../../shared/repairIntake'
import {workOrderIntakes,withLatestIntakeIssue} from './repairIntake'
import type express from 'express'
import type { DB } from './db'
import { customerDisplayName, taxExemptState, type StoreSettings } from '../../shared/types'
import {
  DEFAULT_WO_SETTINGS,
  normaliseStageColors,
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
  type FeeStatus,
  type WoSaleLine,
  type WoSaleMode,
  type WoSettings,
  type WoStatus,
  type WoSummary,
  type WorkOrder,
  WO_DEPARTMENTS,
  woSaleProblem,
  workOrderSaleLines
} from '../../shared/workorders'
import { fillTemplate, partsOrderingNotice, woEmailHtml, woEmailText } from '../../shared/workOrderEmail'
import { getSmtp,smtpProblems,sendEmail } from './marketing/mailer'

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
    stageColors: normaliseStageColors(saved.stageColors),
    estimateFee: {
      cents: { ...d.estimateFee.cents, ...(saved.estimateFee?.cents ?? {}) },
      description: saved.estimateFee?.description ?? d.estimateFee.description,
      taxable: saved.estimateFee?.taxable ?? d.estimateFee.taxable
    },
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

export function saveWoSettings(db: DB, input: Partial<WoSettings>): WoSettings {
  const cur = getWoSettings(db)
  const cents = (v: unknown, label: string) => {
    const n = Number(v)
    if (!Number.isInteger(n) || n < 0) throw new WoError(400, `${label} must be a positive amount`)
    return n
  }
  const stageColors = { ...cur.stageColors }
  if (input.stageColors !== undefined) {
    if (!input.stageColors || typeof input.stageColors !== 'object' || Array.isArray(input.stageColors)) throw new WoError(400, 'Stage colors must be an object')
    for (const [key, value] of Object.entries(input.stageColors)) {
      if (!STAGES.some((s) => s.status === key) || typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new WoError(400, 'Choose a valid #RRGGBB color for an existing stage')
      stageColors[key as WoStatus] = value.toLowerCase()
    }
  }
  const next: WoSettings = {
    stageColors,
    estimateFee: {
      cents: { ...cur.estimateFee.cents },
      description: String(input.estimateFee?.description ?? cur.estimateFee.description).trim().slice(0, 120) || cur.estimateFee.description,
      taxable: input.estimateFee?.taxable ?? cur.estimateFee.taxable
    },
    laborRateCents: input.laborRateCents !== undefined ? cents(input.laborRateCents, 'Labor rate') : cur.laborRateCents,
    laborTaxable: input.laborTaxable ?? cur.laborTaxable,
    shopTaxable: input.shopTaxable ?? cur.shopTaxable,
    shopSupplies: { ...cur.shopSupplies },
    templates: { ...cur.templates }
  }
  for (const c of CATEGORIES)
    if (input.estimateFee?.cents?.[c] !== undefined) next.estimateFee.cents[c] = cents(input.estimateFee.cents[c], 'Estimate fee')
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

/** Customer-owned equipment, including repair intake units never purchased here. Read-only. */
export function customerEquipment(db: DB, customerId: number): CustomerEquipment[] {
  if (!Number.isSafeInteger(customerId) || customerId <= 0) throw new WoError(400, 'Choose a valid customer')
  if (!db.prepare('SELECT 1 FROM customers WHERE id=?').get(customerId)) throw new WoError(404, 'Customer not found')
  const units = db.prepare('SELECT * FROM customer_units WHERE customer_id=? ORDER BY active DESC,id DESC').all(customerId) as UnitRow[]
  const tickets = db.prepare('SELECT id,status,created_at,updated_at,problem FROM work_orders WHERE customer_id=? AND unit_id=? ORDER BY id DESC')
  return units.map((u) => ({ unit: toUnit(u), workOrders: (tickets.all(customerId,u.id) as {id:number;status:WoStatus;created_at:string;updated_at:string;problem:string}[]).map((w)=>({id:w.id,cancelled:!!workOrderCancellation(db,w.id),number:woNumber(w.id),status:w.status,createdAt:iso(w.created_at)!,updatedAt:iso(w.updated_at)!,problem:w.problem})) }))
}

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
  mechanic_id: number | null
  problem: string
  diagnosis: string
  work_done: string
  internal_notes: string
  hours_in: number | null
  last_emailed_at: string | null
  last_emailed_status: WoStatus | null
  created_at: string
  updated_at: string
  fee_cents: number
  fee_status: FeeStatus
  fee_sale_id: number | null
  fee_applied_sale_id: number | null
  sale_id: number | null
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

function woLines(db: DB, woId: number): LineRow[] {
  return db
      .prepare(
        `SELECT l.*, p.on_hand, p.type AS ptype, p.sku FROM work_order_lines l LEFT JOIN products p ON p.id = l.product_id
         WHERE l.work_order_id = ? ORDER BY CASE l.kind WHEN 'part' THEN 0 WHEN 'labor' THEN 1 WHEN 'shop' THEN 2 ELSE 3 END, l.id`
      )
      .all(woId) as LineRow[]
}

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
export function reconcileStock(db: DB, woId: number) {
    const wo = db.prepare('SELECT status FROM work_orders WHERE id = ?').get(woId) as { status: WoStatus } | undefined
    if (!wo) return
    // Closing a ticket never moves stock: a repaired unit's parts stay used, a NOT FIXED unit's stay on the shelf
    if (wo.status === 'closed') return
    const take = stage(wo.status).partsTaken
    for (const l of woLines(db, woId)) {
      if (l.kind !== 'part' || l.product_id === null) continue
      const target = take && l.ptype === 'inventory' ? l.qty : 0
      const delta = target - l.stock_taken
      if (delta !== 0) {
        db.prepare('UPDATE products SET on_hand = on_hand - ? WHERE id = ?').run(Math.round(delta), l.product_id)
        db.prepare('UPDATE work_order_lines SET stock_taken = ? WHERE id = ?').run(target, l.id)
      }
    }
  }

export const addHistory = (db: DB, woId: number, note: string, by: string, status: WoStatus | null = null) =>
    db.prepare('INSERT INTO work_order_history (work_order_id, status, note, by_name) VALUES (?, ?, ?, ?)').run(
      woId,
      status,
      note.slice(0, 500),
      by.slice(0, 60)
    )
const touch = (db: DB, woId: number) => db.prepare("UPDATE work_orders SET updated_at = datetime('now') WHERE id = ?").run(woId)

export function loadWorkOrder(db: DB, id: number, taxRate: number): WorkOrder | null {
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
    const lines = woLines(db, id).map(toLine)
    const billLines=(r.status==='not_fixed'&&r.fee_status==='billed')||r.fee_status==='billed_only'?lines.filter(l=>l.kind==='fee'):lines
    const totals = woTotals(billLines, taxRate, exempt)
    const history = (
      db.prepare('SELECT * FROM work_order_history WHERE work_order_id = ? ORDER BY id DESC').all(id) as {
        at: string
        status: WoStatus | null
        note: string
        by_name: string
      }[]
    ).map((h) => ({ at: iso(h.at)!, status: h.status, note: h.note, by: h.by_name }))
    const result: WorkOrder = {
      cancellation:workOrderCancellation(db,id),
      intakes:workOrderIntakes(db,id),
      relatedOrders: relatedOrders(db,id),
      id: r.id,
      number: woNumber(r.id),
      status: r.status,
      group: groupInfo(db,r.id),
      mechanicId: r.mechanic_id,
      mechanicName: (db.prepare('SELECT name FROM mechanics WHERE id=?').get(r.mechanic_id) as {name:string}|undefined)?.name ?? null,
      customerId: r.customer_id,
      customerName: customerDisplayName(customer),
      customerEmail: (c.email as string) || null,
      customerPhone: ((c.mobile as string) || (c.phone as string)) ?? null,
      customerServiceTextAllowed: c.ok_to_service_text===1,
      unit: getUnit(db, r.unit_id)!,
      problem: r.problem,
      diagnosis: r.diagnosis,
      workDone: r.work_done,
      internalNotes: r.internal_notes,
      hoursIn: r.hours_in,
      lines,
      totals,
      feeCents: r.fee_cents,
      feeStatus: r.fee_status,
      feeSaleId: r.fee_sale_id,
      feeAppliedSaleId: r.fee_applied_sale_id,
      saleId: r.sale_id,
      balanceDueCents: Math.max(0, totals.totalCents - (r.fee_status === 'paid' ? r.fee_cents : 0)),
      createdAt: iso(r.created_at)!,
      updatedAt: iso(r.updated_at)!,
      lastEmailedAt: iso(r.last_emailed_at),
      lastEmailedStatus: r.last_emailed_status,
      history
    }
    const enriched=enrichWarranty(db,result,taxRate)
    return {...enriched,balanceDueCents:enriched.cancellation?0:enriched.balanceDueCents,estimate:estimateInfo(db,enriched)}
  }


// ---------------- Paying for a work order at the till (used by createSale) ----------------

export interface PreparedWoSale {
  wo: WorkOrder
  mode: WoSaleMode
  lines: WoSaleLine[]
  /** Estimate fee available to credit on this sale */
  creditAvailableCents: number
}

/** Check the ticket can be paid this way and build its sale lines (prices come from the ticket, never the till) */
export function prepareWorkOrderSale(db: DB, woId: number, mode: WoSaleMode, taxRate: number): PreparedWoSale {
  if (!['fee', 'repair', 'credit'].includes(mode)) throw new WoError(400, 'Unknown work order payment type')
  const wo = loadWorkOrder(db, woId, taxRate)
  if (!wo) throw new WoError(400, 'Work order not found')
  // Ready-for-pickup controls payment eligibility; online estimates are optional notification/decision records.
  const problem = woSaleProblem(wo, mode)
  if (problem) throw new WoError(400, `${wo.number}: ${problem}`)
  const settings = getWoSettings(db)
  const partDepartments: Record<number, string | null> = {}
  for (const l of wo.lines)
    if (l.kind === 'part' && l.productId) {
      const p = db.prepare('SELECT department FROM products WHERE id = ?').get(l.productId) as { department: string | null } | undefined
      partDepartments[l.id] = p?.department ?? null
    }
  return {
    wo,
    mode,
    lines: workOrderSaleLines({ ...wo, partDepartments }, mode, settings.estimateFee),
    creditAvailableCents: mode !== 'fee' && wo.feeStatus === 'paid' ? wo.feeCents : 0
  }
}

/** Credit line for the estimate fee on a sale */
export function feeCreditLine(wo: WorkOrder, creditCents: number): WoSaleLine {
  return {
    description: `Estimate fee credit - ${wo.number}${wo.feeSaleId ? ` (paid on receipt #${wo.feeSaleId})` : ''}`,
    productId: null,
    department: WO_DEPARTMENTS.fee,
    unitPriceCents: -creditCents,
    qty: 1,
    taxable: false,
    credit: true
  }
}

/** After the sale is saved (same transaction): update the ticket */
export function finishWorkOrderSale(db: DB, prep: PreparedWoSale, saleId: number, creditCents: number, by: string) {
  const { wo, mode } = prep
  const money = (c: number) => `$${(c / 100).toFixed(2)}`
  if (mode === 'fee') {
    db.prepare("UPDATE work_orders SET fee_status = 'paid', fee_sale_id = ?, updated_at = datetime('now') WHERE id = ?").run(saleId, wo.id)
    addHistory(db, wo.id, `Estimate fee ${money(wo.feeCents)} paid (receipt #${saleId})`, by)
    return
  }
  if(wo.feeStatus==='billed')db.prepare('UPDATE work_orders SET fee_sale_id=?,fee_status=? WHERE id=?').run(saleId,wo.status==='not_fixed'?'billed_only':'billed',wo.id)
  if(mode==='repair'&&wo.estimate&&(wo.estimate.state!=='approved'||wo.estimate.needsResend))addHistory(db,wo.id,`Checkout used the current bill; online estimate status was ${wo.estimate.state}${wo.estimate.needsResend?' (details changed)':''}. No website approval was recorded by this payment.`,by)
  const kept = prep.creditAvailableCents - creditCents
  const feeNote = prep.creditAvailableCents
    ? `; estimate fee ${money(creditCents)} credited${kept > 0 ? `, ${money(kept)} kept (sale was less than the fee)` : ''}`
    : ''
  if (prep.creditAvailableCents)
    db.prepare("UPDATE work_orders SET fee_status = ?, fee_applied_sale_id = ? WHERE id = ?").run(
      creditCents > 0 ? 'applied' : 'kept',
      saleId,
      wo.id
    )
  db.prepare("UPDATE work_orders SET status = 'closed', sale_id = ?, updated_at = datetime('now') WHERE id = ?").run(saleId, wo.id)
  addHistory(
    db,
    wo.id,
    mode === 'repair'
      ? `Billed and picked up (receipt #${saleId})${feeNote}${wo.feeStatus==='billed'?'; estimate fee included in bill':''}`
      : `Customer bought new instead (receipt #${saleId})${feeNote}`,
    by,
    'closed'
  )
}

const notifying=new Set<number>()

export function registerWorkOrderRoutes(app: express.Express, db: DB, readSettings: (db: DB) => StoreSettings) {
  const linesFor = (woId: number) => woLines(db, woId)
  const getWo = (id: number) => loadWorkOrder(db, id, readSettings(db).taxRate)
  const hist = (woId: number, note: string, by: string, status: WoStatus | null = null) => addHistory(db, woId, note, by, status)
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

  // Static settings routes must precede /api/workorders/:id.
  app.get('/api/workorders/text-settings',wrap((_req,res)=>res.json(textSettingsView(db))))
  app.put('/api/workorders/text-settings',wrap((req,res)=>res.json(saveTextSettings(db,req.body))))

  // ================= Settings =================
  app.post('/api/workorders/:id/group',wrap((req,res)=>{
    const wo=need(Number(req.params.id))
    const other=Number(req.body?.otherId)
    if(!Number.isSafeInteger(other))throw new WoError(400,'Choose another work order')
    db.transaction(()=>linkOrders(db,wo.id,other,by(req)))()
    res.json(need(wo.id))
  }))
  app.post('/api/workorders/:id/ungroup',wrap((req,res)=>{
    const wo=need(Number(req.params.id))
    db.transaction(()=>unlinkOrder(db,wo.id,by(req)))()
    res.json(need(wo.id))
  }))
  app.get('/api/workorders/responses',wrap((_req,res)=>{res.json((db.prepare(`SELECT n.*,c.first_name,c.last_name,c.company,c.track_as_company FROM estimate_notifications n JOIN work_orders w ON w.id=n.work_order_id JOIN customers c ON c.id=w.customer_id WHERE n.seen_at IS NULL ORDER BY n.received_at,n.estimate_id`).all() as any[]).map(r=>({id:r.estimate_id,workOrderId:r.work_order_id,number:woNumber(r.work_order_id),customer:customerDisplayName({firstName:r.first_name,lastName:r.last_name,company:r.company,trackAsCompany:r.track_as_company===1}),decision:r.decision,review:!!r.review,receivedAt:iso(r.received_at)})))}))
  app.post('/api/workorders/responses/read',wrap((req,res)=>{const ids=req.body?.ids;if(!Array.isArray(ids)||ids.length>1000||ids.some(id=>typeof id!=='string'||id.length>100))throw new WoError(400,'Invalid response list');db.transaction(()=>{const mark=db.prepare("UPDATE estimate_notifications SET seen_at=COALESCE(seen_at,datetime('now')) WHERE estimate_id=?");for(const id of ids)mark.run(id)})();res.json({ok:true})}))
  app.get('/api/workorders/mechanics' , (_req,res) => res.json((db.prepare('SELECT * FROM mechanics ORDER BY name').all() as {id:number;name:string;active:number}[]).map(m=>({...m,active:!!m.active}))))
  app.post('/api/workorders/mechanics',wrap((req,res)=>{
    const name=String(req.body?.name??'').trim()
    if(!name || name.length>80)throw new WoError(400,'Enter a mechanic name (up to 80 characters)')
    db.prepare('INSERT INTO mechanics(name) VALUES (?) ON CONFLICT(name) DO UPDATE SET active=1').run(name)
    res.json({ok:true})
  }))
  app.post('/api/workorders/mechanics/:mechanicId/remove',wrap((req,res)=>{
    db.prepare('UPDATE mechanics SET active=0 WHERE id=?').run(Number(req.params.mechanicId))
    res.json({ok:true})
  }))
  app.post('/api/workorders/:id/mechanic',wrap((req,res)=>{
    const wo=need(Number(req.params.id))
    if(wo.status==='closed')throw new WoError(409,'This work order is closed')
    const id=req.body?.mechanicId
    const m=id===null?null:db.prepare('SELECT id,name FROM mechanics WHERE id=? AND active=1').get(Number(id)) as {id:number;name:string}|undefined
    if(id!==null&&(!Number.isInteger(id)||!m))throw new WoError(400,'Choose an active mechanic')
    db.transaction(()=>{
      db.prepare("UPDATE work_orders SET mechanic_id=?,updated_at=datetime('now') WHERE id=?").run(m?.id??null,wo.id)
      hist(wo.id,`Mechanic: ${wo.mechanicName??'Unassigned'} → ${m?.name??'Unassigned'}`,by(req))
    })()
    res.json(need(wo.id))
  }))

  app.post('/api/workorders/:id/cancel',wrap((req,res)=>{
    const wo=need(Number(req.params.id))
    if(estimateIsSending(wo.id)||notifying.has(wo.id))throw new WoError(409,'Wait for the work-order notification to finish before cancelling.')
    try{cancelWorkOrder(db,wo.id,req.body??{})}catch(e){throw new WoError(409,(e as Error).message)}
    cancelWorkOrderKioskSessions(wo.id)
    res.json(need(wo.id))
  }))

  app.get('/api/workorders/settings' , (_req, res) => res.json(getWoSettings(db)))
  app.put(
    '/api/workorders/settings',
    wrap((req, res) => res.json(saveWoSettings(db, req.body ?? {})))
  )

  // ================= Units =================
  app.get('/api/customers/:id/equipment', wrap((req,res) => res.json(customerEquipment(db, Number(req.params.id)))))

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

  app.get('/api/equipment/serial', (req, res) => {
    const serial = String(req.query.serial ?? '').trim()
    if (!serial || serial.length > 80) return res.status(400).json({ error: 'Enter a serial number of 1–80 characters' })
    const rows = db.prepare(`SELECT u.*, c.first_name, c.last_name, c.company, c.track_as_company
      FROM customer_units u JOIN customers c ON c.id = u.customer_id
      WHERE UPPER(TRIM(u.serial)) = UPPER(?) ORDER BY u.active DESC, u.id DESC LIMIT 100`).all(serial) as
      (UnitRow & { first_name: string; last_name: string; company: string; track_as_company: number })[]
    res.json(rows.map((row) => ({ unit: toUnit(row), customerName: customerDisplayName({ firstName: row.first_name,
      lastName: row.last_name, company: row.company, trackAsCompany: row.track_as_company === 1 }),
      tickets: (db.prepare('SELECT id, status FROM work_orders WHERE unit_id = ? ORDER BY id DESC LIMIT 50').all(row.id) as
        { id: number; status: WoStatus }[]).map((t) => ({ ...t, number: woNumber(t.id) })) })))
  })

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
    else if(status==='cancelled')where+=' AND EXISTS(SELECT 1 FROM work_order_cancellations x WHERE x.work_order_id=w.id)'
    else if(status==='closed')where+=" AND w.status='closed' AND NOT EXISTS(SELECT 1 FROM work_order_cancellations x WHERE x.work_order_id=w.id)"
    else if (status === 'needs_call') where += " AND w.status='waiting_customer'"
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
         WHERE ${where} ORDER BY w.id DESC ${status === 'needs_call' ? '' : 'LIMIT 500'}`
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
        cancelled:!!workOrderCancellation(db,r.id),
        number: woNumber(r.id),
        status: r.status,
      group: groupInfo(db,r.id),
      mechanicId: r.mechanic_id,
      mechanicName: (db.prepare('SELECT name FROM mechanics WHERE id=?').get(r.mechanic_id) as {name:string}|undefined)?.name ?? null,
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
        totalCents: woTotals((r.status==='not_fixed'&&r.fee_status==='billed')||r.fee_status==='billed_only'?lines.filter(l=>l.kind==='fee'):lines, rate, exempt).totalCents,
        estimate: loadWorkOrder(db,r.id,rate)?.estimate,
        shortParts: lines.filter((l) => l.short).length,
        feeCents: r.fee_cents,
        feeStatus: r.fee_status,
        balanceDueCents: workOrderCancellation(db,r.id)?0:Math.max(0, woTotals((r.status==='not_fixed'&&r.fee_status==='billed')||r.fee_status==='billed_only'?lines.filter(l=>l.kind==='fee'):lines, rate, exempt).totalCents - (r.fee_status === 'paid' ? r.fee_cents : 0))
      }
    })
    res.json(status === 'needs_call' ? list.filter(w=>w.estimate?.due).slice(0,500) : list)
  })

  app.get('/api/workorders/counts', (_req, res) => {
    const rows = db.prepare('SELECT status, COUNT(*) AS n FROM work_orders GROUP BY status').all() as { status: WoStatus; n: number }[]
    const cancelled=(db.prepare('SELECT COUNT(*) AS n FROM work_order_cancellations').get() as {n:number}).n
    res.json({...Object.fromEntries(STAGES.map(s=>[s.status,(rows.find(r=>r.status===s.status)?.n??0)-(s.status==='closed'?cancelled:0)])),cancelled})
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
      const problem = String(b.problem ?? '').trim().slice(0, 4000)||(b.awaitingIntake===true?PENDING_REPAIR_ISSUE:'')
      if (!problem) throw new WoError(400, "Describe what's wrong with the unit")
      const settings = getWoSettings(db)
      const defaultFee = settings.estimateFee.cents[unit.category]
      if (b.feeCents !== undefined && (typeof b.feeCents !== 'number' || !Number.isSafeInteger(b.feeCents) || b.feeCents < 0))
        throw new WoError(400, 'Estimate fee must be a valid amount of $0.00 or more')
      const fee = b.noFee === true ? 0 : b.feeCents === undefined ? defaultFee : b.feeCents as number
      const id = db.transaction(() => {
        const info = db
          .prepare('INSERT INTO work_orders (customer_id, unit_id, problem, hours_in, fee_cents, fee_status) VALUES (?, ?, ?, ?, ?, ?)')
          .run(unit.customerId, unit.id, problem, unit.category === 'mower' ? hoursIn : null, fee, fee > 0 ? 'unpaid' : 'none')
        const woId = Number(info.lastInsertRowid)
        const shop = settings.shopSupplies[unit.category]
        if (shop.priceCents > 0)
          db.prepare(
            "INSERT INTO work_order_lines (work_order_id, kind, description, qty, unit_price_cents, taxable) VALUES (?, 'shop', ?, 1, ?, ?)"
          ).run(woId, shop.description, shop.priceCents, settings.shopTaxable ? 1 : 0)
        if (unit.category === 'mower' && hoursIn !== null)
          db.prepare('UPDATE customer_units SET hours = ? WHERE id = ?').run(hoursIn, unit.id)
        if(b.linkToId!==undefined){
          const anchor=Number(b.linkToId)
          if(!Number.isSafeInteger(anchor))throw new WoError(400,'Choose a valid related work order')
          linkOrders(db,anchor,woId,by(req))
        }
        hist(woId, 'Checked in', by(req), 'needs_estimate')
        if (fee !== defaultFee) hist(woId, `Estimate fee set to $${(fee / 100).toFixed(2)} for this ticket (configured default $${(defaultFee / 100).toFixed(2)}).`, by(req), 'needs_estimate')
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
      const txt = (k: string, cur: string) => {if(k==='problem'){const text=b[k]===undefined?cur:String(b[k]??'');if(text.length>100000)throw new WoError(400,'Reported issue must be at most 100,000 characters');return withLatestIntakeIssue(db,wo.id,text)}return b[k]===undefined?cur:String(b[k]??'').slice(0,8000)}
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

  app.post('/api/workorders/:id/bill-estimate-fee',wrap((req,res)=>{
    const wo=need(Number(req.params.id))
    if(wo.status==='closed')throw new WoError(409,'This work order is closed')
    if(wo.feeStatus==='billed')return res.json(wo)
    if(wo.feeStatus!=='unpaid'||wo.feeCents<=0)throw new WoError(409,'Only an unpaid estimate fee can be added to the bill')
    db.transaction(()=>{
      db.prepare("INSERT INTO work_order_lines(work_order_id,kind,description,qty,unit_price_cents,taxable) VALUES (?,'fee','Estimate / diagnostic fee',1,?,?)").run(wo.id,wo.feeCents,getWoSettings(db).estimateFee.taxable?1:0)
      db.prepare("UPDATE work_orders SET fee_status='billed',updated_at=datetime('now') WHERE id=?").run(wo.id)
      hist(wo.id,`Unpaid estimate fee $${(wo.feeCents/100).toFixed(2)} added to the bill; not collected separately and no fee credit applies.`,by(req))
    })()
    res.json(need(wo.id))
  }))

  // Move to another stage (stock follows the stage)
  app.post(
    '/api/workorders/:id/status',
    wrap((req, res) => {
      const wo = need(Number(req.params.id))
      if(wo.cancellation)throw new WoError(409,'Cancelled work orders cannot be reopened. Create a new ticket for additional service.')
      const to = String((req.body as Record<string, unknown>)?.status ?? '') as WoStatus
      if (!STAGES.some((s) => s.status === to)) throw new WoError(400, 'Unknown stage')
      if (to === wo.status) return res.json(wo)
      if(to==='on_bench' && !['approved','waiting_parts','ready_review'].includes(wo.status))throw new WoError(409,'Approve the repair before moving it onto the bench')
      if(to==='on_bench' && wo.lines.some(l=>l.kind==='part' && l.short))throw new WoError(409,'Receive all required parts before moving this ticket onto the bench')
      if (wo.status==='waiting_customer' && wo.estimate && (to==='approved'||to==='not_fixed')) {
        if(wo.estimate.state!=='pending')throw new WoError(409,'Send a fresh estimate before recording a new decision.')
        if(wo.estimate.needsResend)throw new WoError(409,'The estimate changed. Send a revised estimate before recording a decision.')
        applyDecision(db,{id:wo.estimate.id,hash:estimateHash(wo),decision:to==='approved'?'approved':'declined',name:`Staff: ${by(req)}`,comment:'Customer decision recorded by staff',at:new Date().toISOString()},by(req))
        return res.json(need(wo.id))
      }
      db.transaction(() => {
        db.prepare("UPDATE work_orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(to, wo.id)
        reconcileStock(db, wo.id)
        const was = stage(wo.status), now = stage(to)
        let note = `${was.label} → ${now.label}`
        if (!was.partsTaken && now.partsTaken && wo.lines.some((l) => l.kind === 'part')) note += ' (parts taken from stock)'
        if (was.partsTaken && !now.partsTaken && wo.lines.some((l) => l.kind === 'part' && l.stockTaken > 0))
          note += ' (parts returned to stock)'
        hist(wo.id, note, by(req), to)
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
        reconcileStock(db, wo.id)
        touch(db, wo.id)
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
      if(line.kind==='fee'&&qty!==1)throw new WoError(400,'The estimate fee must have quantity 1; edit its price instead')
      if (line.kind === 'part' && !Number.isInteger(qty)) throw new WoError(400, 'Part quantity must be a whole number')
      if (!Number.isInteger(price) || price < 0) throw new WoError(400, 'Price must be a positive amount')
      const covered=(db.prepare('SELECT warranty_cents AS n FROM work_order_lines WHERE id=?').get(line.id) as {n:number}).n
      if(covered>Math.round(qty*price))throw new WoError(400,'Reduce warranty coverage before reducing this line below its covered amount')
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
        if(line.kind==='fee')db.prepare('UPDATE work_orders SET fee_cents=? WHERE id=?').run(price,wo.id)
        reconcileStock(db, wo.id)
        touch(db, wo.id)
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
        if(line.kind==='fee'){db.prepare("UPDATE work_orders SET fee_status='none',fee_cents=0 WHERE id=?").run(wo.id);hist(wo.id,'Estimate fee removed from bill (waived)',by(req))}
        db.prepare('DELETE FROM work_order_lines WHERE id = ?').run(line.id)
        touch(db, wo.id)
      })()
      res.json(need(wo.id))
    })
  )

  // Customer declined and takes the unit back: the store keeps the estimate fee
  app.post(
    '/api/workorders/:id/pickup-not-fixed',
    wrap((req, res) => {
      const wo = need(Number(req.params.id))
      if (wo.status !== 'not_fixed') throw new WoError(409, 'Only NOT FIXED tickets can be picked up this way')
      if(wo.feeStatus==='billed')throw new WoError(409,'Ring up the estimate fee bill, or remove that fee line to waive it, before closing this ticket')
      db.transaction(() => {
        if (wo.feeStatus === 'paid') db.prepare("UPDATE work_orders SET fee_status = 'kept' WHERE id = ?").run(wo.id)
        db.prepare("UPDATE work_orders SET status = 'closed', updated_at = datetime('now') WHERE id = ?").run(wo.id)
        reconcileStock(db, wo.id)
        hist(
          wo.id,
          wo.feeStatus === 'paid'
            ? `Picked up, not repaired. Estimate fee $${(wo.feeCents / 100).toFixed(2)} kept`
            : wo.feeStatus === 'unpaid'
              ? 'Picked up, not repaired (estimate fee was never paid)'
              : 'Picked up, not repaired',
          by(req),
          'closed'
        )
      })()
      res.json(need(wo.id))
    })
  )

  app.get('/api/workorders/approval/config',wrap((_req,res)=>res.json(approvalView(db))))
  app.put('/api/workorders/approval/config',wrap((req,res)=>res.json(saveApprovalConfig(db,req.body??{}))))
  app.post('/api/workorders/approval/test',wrap(async(_req,res)=>res.json(await testApprovalConnection(db))))
  app.post('/api/workorders/approval/sync',wrap(async(_req,res)=>res.json(await syncApprovals(db))))
  app.post('/api/workorders/:id/follow-up',wrap((req,res)=>{
    const wo=need(Number(req.params.id)),note=String(req.body?.note??'').trim(),days=Number(req.body?.days??approvalConfig(db).afterDays)
    if(!note||note.length>500||!Number.isInteger(days)||days<1||days>90)throw new WoError(400,'Enter a call note and 1–90 days until the next follow-up')
    if(wo.status!=='waiting_customer'||wo.estimate?.state!=='pending')throw new WoError(409,'This ticket is not waiting for an estimate decision')
    db.transaction(()=>{db.prepare('UPDATE work_order_estimates SET follow_up_at=? WHERE id=?').run(new Date(Date.now()+days*86400000).toISOString(),wo.estimate!.id);hist(wo.id,`Customer follow-up: ${note}. Remind again in ${days} day(s).`,by(req))})()
    res.json(need(wo.id))
  }))
  app.post('/api/workorders/:id/cancel-estimate',wrap(async(req,res)=>{
    const wo=need(Number(req.params.id));if(!wo.estimate)throw new WoError(404,'No estimate was sent')
    if(approvalConfig(db).enabled)await approvalRequest(approvalConfig(db),'cancel',{id:wo.estimate.id})
    db.prepare("UPDATE work_order_estimates SET state='superseded' WHERE id=? AND state IN ('pending','prepared')").run(wo.estimate.id)
    hist(wo.id,'Estimate link cancelled by staff',by(req));res.json(need(wo.id))
  }))

  app.post('/api/workorders/:id/notify',wrap(async(req,res)=>{
    const wo=need(Number(req.params.id)),b=req.body||{},id=String(b.requestId||'')
    if(!/^[a-zA-Z0-9-]{16,80}$/.test(id))throw new WoError(400,'Invalid notification request')
    const estimate=b.estimate===true||wo.status==='waiting_customer',email=b.email===true,text=b.text===true
    if(!email&&!text)throw new WoError(400,'Select Email, Text, or both')
    const payload=JSON.stringify({id:wo.id,estimate,email,text,permission:b.permission===true})
    const previous=db.prepare('SELECT * FROM work_order_notifications WHERE request_id=?').get(id) as any
    if(previous){if(previous.work_order_id!==wo.id||previous.request_json!==payload)throw new WoError(409,'Request already used with different choices');if(!previous.result_json)throw new WoError(409,'This notification is sending or its result is uncertain. Check ticket history and provider before sending again.');return res.json({...JSON.parse(previous.result_json),workOrder:need(wo.id)})}
    if(text&&!estimate&&wo.status!=='ready_pickup')throw new WoError(400,'Texts are only available for estimates and ready-for-pickup notices')
    if(estimate&&!['needs_estimate','waiting_customer'].includes(wo.status))throw new WoError(400,'Send estimates from Needs Estimate or Waiting on Customer')
    if(email&&!wo.customerEmail)throw new WoError(400,'Add a customer email address first')
    const config=textSettings(db)
    let phone=''
    if(text){if(!config.enabled||!config.apiKey||!config.callbackNumber)throw new WoError(400,'Configure and enable Mobile Text Alerts in Work Order Settings first');phone=smsPhone(wo.customerPhone)}
    db.transaction(()=>{db.prepare('INSERT INTO work_order_notifications(request_id,work_order_id,request_json) VALUES (?,?,?)').run(id,wo.id,payload);hist(wo.id,`Sending notification (${[email?'email':'',text?'text':''].filter(Boolean).join(' and ')}). Request ${id}. If no result follows, check provider before resending.`,by(req))})()
    const results:Record<string,ChannelResult>={}
    const deliver=async(link?:string)=>{
      if(email&&smtpProblems(getSmtp(db)).length){results.email={status:'failed',detail:'Email settings are incomplete. Configure Email settings before sending.'}}
      else if(email){try{const mail=buildEmail(estimate?{...wo,status:'waiting_customer'}:wo,link);await sendEmail(db,readSettings(db),{to:wo.customerEmail!,...mail});results.email={status:'accepted',detail:'Accepted by email server; delivery is not confirmed.'}}catch{results.email={status:'unknown',detail:'Email result uncertain. Check the mail service before resending.'}}}
      if(text){const message=serviceText(wo,readSettings(db).storeName,config,estimate,link);results.text=smsLength(message).tooLong?{status:'failed',detail:'Text is too long; shorten ticket details before sending.'}:await sendServiceText(config,phone,message,id)}
      // Preserve the approval link when a channel may have accepted it; do not invalidate a link already sent through the other channel.
      if(!Object.values(results).some(r=>r.status!=='failed'))throw Error('No selected channel accepted the notification')
    }
    notifying.add(wo.id)
    try{
      if(estimate)await sendEstimate(db,wo,by(req),link=>deliver(link),approvalRequest,()=>{const accepted=Object.entries(results).filter(([,r])=>r.status==='accepted').map(([channel])=>channel);return accepted.length?'sent via '+accepted.join(' and '):'delivery uncertain; check provider before resending'})
      else {await deliver();if(results.email?.status==='accepted')db.prepare("UPDATE work_orders SET last_emailed_at=datetime('now'),last_emailed_status=? WHERE id=?").run(wo.status,wo.id)}
    }catch(e){results.error={status:'failed',detail:(e as Error).message}}finally{notifying.delete(wo.id)}
    for(const [channel,result] of Object.entries(results))hist(wo.id,`${channel} notification: ${result.status}. ${result.detail}`,by(req))
    db.prepare('UPDATE work_order_notifications SET result_json=? WHERE request_id=?').run(JSON.stringify({results}),id)
    res.json({workOrder:need(wo.id),results})
  }))

  // ----- Email the customer the current stage -----
  function buildEmail(original: WorkOrder, approvalLink?:string) {
    const wo=original.warranty?customerWarrantyView(original,original.warranty.taxRate):original
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
      balance_due: `$${(wo.balanceDueCents / 100).toFixed(2)}`,
      estimate_fee: `$${(wo.feeCents / 100).toFixed(2)}`,
      diagnosis: wo.diagnosis.trim(),
      work_done: wo.workDone.trim() || '(see the list below)',
      store: store.storeName
    }
    const content = {
      approvalLink,
      estimatePreview: wo.status==='waiting_customer'&&!approvalLink,
      storeName: store.storeName,
      storeAddress: store.storeAddress,
      body: fillTemplate(t.body, values)+(original.warranty?`\n\nWarranty provider ${original.warranty.vendorName} is billed $${(original.warranty.providerTotalCents/100).toFixed(2)} separately. Your amount above is only the customer share.`:''),
      partsNotice: partsOrderingNotice(original.status, original.lines),
      bill: t.includeBill
        ? {
            lines: wo.lines,
            totals: wo.totals,
            feeCreditCents: wo.feeStatus === 'paid' ? Math.min(wo.feeCents, wo.totals.totalCents) : 0,
            balanceDueCents: wo.balanceDueCents
          }
        : null,
      woNumber: wo.number,
      unit: unitLabel(wo.unit),
      serial: wo.unit.serial,
      statusLabel: stage(wo.status).label
    }
    return { subject: fillTemplate(t.subject, values), html: woEmailHtml(content), text: woEmailText(content) }
  }

  app.get(
    '/api/workorders/:id/email-preview',
    wrap((req, res) => {const wo=need(Number(req.params.id));res.json({...buildEmail(req.query.estimate==='1'?{...wo,status:'waiting_customer'}:wo),textPreview:serviceText(wo,readSettings(db).storeName,textSettings(db),req.query.estimate==='1'||wo.status==='waiting_customer')})})
  )

  app.post(
    '/api/workorders/:id/email',
    wrap(async (req, res) => {
      const wo = need(Number(req.params.id))
      if (!wo.customerEmail) throw new WoError(400, `${wo.customerName} has no email address. Add one on their customer record.`)
      if(req.body?.estimate===true||wo.status==='waiting_customer'){
        await sendEstimate(db,wo,by(req),async link=>{const mail=buildEmail({...wo,status:'waiting_customer'},link);await sendEmail(db,readSettings(db),{to:wo.customerEmail!,...mail})})
        return res.json(need(wo.id))
      }
      const mail = buildEmail(wo)
      notifying.add(wo.id)
      try{await sendEmail(db, readSettings(db), { to: wo.customerEmail, ...mail })}finally{notifying.delete(wo.id)}
      db.prepare("UPDATE work_orders SET last_emailed_at = datetime('now'), last_emailed_status = ? WHERE id = ?").run(wo.status, wo.id)
      hist(wo.id, `Emailed customer: ${stage(wo.status).label} (${wo.customerEmail})`, by(req), wo.status)
      res.json(need(wo.id))
    })
  )
}
