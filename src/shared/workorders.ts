// Work orders (repairs): shapes, stages and defaults shared by the server and the screens.
import { priceSale } from './pricing'

// ---------------- Units (customer equipment) ----------------

/** Hand-held units and mowers get different shop-supply charges; only mowers have an hour meter */
export type UnitCategory = 'handheld' | 'mower' | 'other'

export interface CustomerUnit {
  id: number
  customerId: number
  category: UnitCategory
  unitType: string // e.g. Blower, Chainsaw, Zero-Turn Mower
  brand: string
  model: string
  serial: string
  /** Hour meter reading (mowers, optional) */
  hours: number | null
  /** Bought from us (created automatically from a sale) */
  purchasedHere: boolean
  purchaseDate: string | null // YYYY-MM-DD
  saleId: number | null
  notes: string
  active: boolean
}

export type CustomerUnitInput = Omit<CustomerUnit, 'id' | 'purchasedHere' | 'saleId'> & { purchaseDate?: string | null }

export const UNIT_TYPES: { type: string; category: UnitCategory }[] = [
  { type: 'Blower', category: 'handheld' },
  { type: 'Chainsaw', category: 'handheld' },
  { type: 'String Trimmer', category: 'handheld' },
  { type: 'Hedge Trimmer', category: 'handheld' },
  { type: 'Edger', category: 'handheld' },
  { type: 'Pole Saw', category: 'handheld' },
  { type: 'Brush Cutter', category: 'handheld' },
  { type: 'Push Mower', category: 'mower' },
  { type: 'Self-Propelled Mower', category: 'mower' },
  { type: 'Riding Mower', category: 'mower' },
  { type: 'Zero-Turn Mower', category: 'mower' },
  { type: 'Lawn Tractor', category: 'mower' },
  { type: 'Tiller', category: 'other' },
  { type: 'Generator', category: 'other' },
  { type: 'Pressure Washer', category: 'other' },
  { type: 'Snow Blower', category: 'other' },
  { type: 'Other', category: 'other' }
]

/** Best guess at a unit's category from its type / department / item name */
export function guessCategory(text: string): UnitCategory {
  const t = text.toLowerCase()
  if (/mow|tractor|zero.?turn|rider|riding/.test(t)) return 'mower'
  if (/blower|saw|trimmer|edger|hedge|brush|string|handheld|hand.held|weed|cultivator|split.?boom|multi/.test(t))
    return t.includes('snow') ? 'other' : 'handheld'
  return 'other'
}

export function unitLabel(u: Pick<CustomerUnit, 'brand' | 'model' | 'unitType'>): string {
  return [u.brand, u.model, u.unitType].filter(Boolean).join(' ') || 'Unit'
}

// ---------------- Stages ----------------

export type WoStatus =
  | 'needs_estimate'
  | 'approved'
  | 'waiting_parts'
  | 'on_bench'
  | 'ready_review'
  | 'ready_pickup'
  | 'not_fixed'
  | 'closed'

export interface StageDef {
  status: WoStatus
  label: string
  color: string // badge colour
  /** Parts are taken out of stock while the ticket is in this stage (Picked Up leaves stock as it was) */
  partsTaken: boolean
  /** Shows the "Email customer" button */
  canEmail: boolean
  /** Suggested next moves (buttons on the ticket) */
  next: WoStatus[]
}

export const STAGES: StageDef[] = [
  { status: 'needs_estimate', label: 'Needs Estimate', color: '#6b7280', partsTaken: false, canEmail: true, next: ['approved', 'not_fixed'] },
  { status: 'approved', label: 'Approved to Fix', color: '#1e66d0', partsTaken: true, canEmail: true, next: ['waiting_parts', 'on_bench'] },
  { status: 'waiting_parts', label: 'Waiting on Parts', color: '#b45309', partsTaken: true, canEmail: true, next: ['on_bench'] },
  { status: 'on_bench', label: 'On the Bench', color: '#7c3aed', partsTaken: true, canEmail: true, next: ['ready_review', 'waiting_parts'] },
  { status: 'ready_review', label: 'Ready for Review', color: '#0e7490', partsTaken: true, canEmail: false, next: ['ready_pickup', 'on_bench'] },
  { status: 'ready_pickup', label: 'Ready for Pick Up', color: '#15803d', partsTaken: true, canEmail: true, next: ['closed'] },
  { status: 'not_fixed', label: 'Ready for Pick Up – NOT FIXED!!', color: '#c8102e', partsTaken: false, canEmail: true, next: ['closed'] },
  { status: 'closed', label: 'Picked Up', color: '#374151', partsTaken: true, canEmail: false, next: [] }
]

export const stage = (s: WoStatus): StageDef => STAGES.find((x) => x.status === s) ?? STAGES[0]
export const OPEN_STATUSES: WoStatus[] = STAGES.filter((s) => s.status !== 'closed').map((s) => s.status)

// ---------------- Work orders ----------------

export type WoLineKind = 'part' | 'labor' | 'shop' | 'misc'

export interface WoLine {
  id: number
  kind: WoLineKind
  productId: number | null
  description: string
  sku: string | null
  qty: number // hours for labor
  unitPriceCents: number // before tax, like shelf prices
  taxable: boolean
  /** Parts: how many have been taken out of stock for this ticket */
  stockTaken: number
  /** Parts: on hand now (after anything this ticket already took), for the red "not in stock" warning */
  onHand: number | null
  /** True when this part isn't (fully) in stock */
  short: boolean
}

export type WoLineInput = Pick<WoLine, 'kind' | 'productId' | 'description' | 'qty' | 'unitPriceCents' | 'taxable'>

export interface WoHistory {
  at: string
  status: WoStatus | null
  note: string
  by: string
}

/** none = no fee; unpaid; paid = held as a credit; applied = credited on a sale; kept = customer declined */
export type FeeStatus = 'none' | 'unpaid' | 'paid' | 'applied' | 'kept'

export interface WorkOrder {
  id: number
  number: string // WO-000123
  status: WoStatus
  /** Estimate fee charged at drop-off (credited toward the repair or a new purchase) */
  feeCents: number
  feeStatus: FeeStatus
  feeSaleId: number | null // receipt the fee was paid on
  feeAppliedSaleId: number | null // receipt the fee was credited on
  /** Receipt the repair was paid on (pick-up) */
  saleId: number | null
  /** Total minus a paid estimate fee */
  balanceDueCents: number
  customerId: number
  customerName: string
  customerEmail: string | null
  customerPhone: string | null
  unit: CustomerUnit
  problem: string // what the customer says is wrong
  diagnosis: string // mechanic's estimate notes
  workDone: string // what was done
  internalNotes: string
  hoursIn: number | null // mower hour meter at check-in
  lines: WoLine[]
  totals: WoTotals
  createdAt: string
  updatedAt: string
  lastEmailedAt: string | null
  lastEmailedStatus: WoStatus | null
  history: WoHistory[]
}

export interface WoSummary {
  id: number
  number: string
  status: WoStatus
  customerName: string
  unitLabel: string
  serial: string
  createdAt: string
  updatedAt: string
  totalCents: number
  shortParts: number
  feeCents: number
  feeStatus: FeeStatus
  balanceDueCents: number
}

export interface WoTotals {
  partsCents: number
  laborCents: number
  laborHours: number
  shopCents: number
  miscCents: number
  /** Before tax */
  subtotalCents: number
  totalCents: number
  taxCents: number
  taxExempt: boolean
  taxExemptCents: number
}

/** Ticket totals using the same tax rules as a sale */
export function woTotals(lines: Pick<WoLine, 'kind' | 'qty' | 'unitPriceCents' | 'taxable'>[], taxRate: number, taxExempt: boolean): WoTotals {
  const lineCents = (l: (typeof lines)[number]) => Math.round(l.unitPriceCents * l.qty)
  const sum = (k: WoLineKind) => lines.filter((l) => l.kind === k).reduce((s, l) => s + lineCents(l), 0)
  // Same pricing as the till: whole quantities per unit, part hours as one line (see workOrderSaleLines)
  const priced = priceSale(
    lines.map((l) =>
      Number.isInteger(l.qty)
        ? { unitPriceCents: l.unitPriceCents, qty: l.qty, taxable: l.taxable }
        : { unitPriceCents: lineCents(l), qty: 1, taxable: l.taxable }
    ),
    taxRate,
    taxExempt
  )
  return {
    partsCents: sum('part'),
    laborCents: sum('labor'),
    laborHours: lines.filter((l) => l.kind === 'labor').reduce((s, l) => s + l.qty, 0),
    shopCents: sum('shop'),
    miscCents: sum('misc'),
    subtotalCents: priced.subtotalCents,
    totalCents: priced.totalCents,
    taxCents: priced.taxCents,
    taxExempt,
    taxExemptCents: priced.taxExemptCents
  }
}

// ---------------- Settings ----------------

export interface ShopSupply {
  description: string
  priceCents: number
}

export interface WoTemplate {
  subject: string
  body: string
  /** Include the itemised list of parts/labor and totals */
  includeBill: boolean
}

export interface EstimateFeeSettings {
  /** Fee per unit category (0 = no fee) */
  cents: Record<UnitCategory, number>
  description: string
  taxable: boolean
}

export interface WoSettings {
  estimateFee: EstimateFeeSettings
  laborRateCents: number // per hour, before tax
  laborTaxable: boolean
  shopTaxable: boolean
  shopSupplies: Record<UnitCategory, ShopSupply>
  templates: Record<Exclude<WoStatus, 'ready_review' | 'closed'>, WoTemplate>
}

export const TEMPLATE_PLACEHOLDERS: { key: string; meaning: string }[] = [
  { key: '{first_name}', meaning: "Customer's first name" },
  { key: '{customer}', meaning: "Customer's full name / business" },
  { key: '{wo_number}', meaning: 'Work order number' },
  { key: '{unit}', meaning: 'e.g. Stihl MS 250 Chainsaw' },
  { key: '{serial}', meaning: 'Serial number' },
  { key: '{status}', meaning: 'Stage name' },
  { key: '{total}', meaning: 'Current total' },
  { key: '{balance_due}', meaning: 'Total minus the estimate fee already paid' },
  { key: '{estimate_fee}', meaning: 'Estimate fee amount' },
  { key: '{diagnosis}', meaning: "Mechanic's estimate notes" },
  { key: '{work_done}', meaning: 'Work performed notes' },
  { key: '{store}', meaning: 'Store name' }
]

export const DEFAULT_WO_SETTINGS: WoSettings = {
  estimateFee: {
    cents: { handheld: 3500, mower: 7000, other: 3500 },
    description: 'Estimate fee (credited toward the repair or a new purchase)',
    taxable: false
  },
  laborRateCents: 8500,
  laborTaxable: false,
  shopTaxable: true,
  shopSupplies: {
    handheld: { description: 'Shop supplies (fuel, oil, cleaners)', priceCents: 795 },
    mower: { description: 'Shop supplies (fuel, oil, grease, cleaners)', priceCents: 1495 },
    other: { description: 'Shop supplies', priceCents: 995 }
  },
  templates: {
    needs_estimate: {
      subject: 'We have your {unit} (work order {wo_number})',
      body: 'Hi {first_name},\n\nThanks for bringing in your {unit}. It is checked in as work order {wo_number}. Our mechanic will look it over and we will contact you with an estimate before doing any work.\n\nThank you,\n{store}',
      includeBill: false
    },
    approved: {
      subject: 'Repair approved: {unit} ({wo_number})',
      body: 'Hi {first_name},\n\nThanks for approving the repair of your {unit}. We will get started and let you know when it is ready.\n\nThank you,\n{store}',
      includeBill: true
    },
    waiting_parts: {
      subject: 'Waiting on parts for your {unit} ({wo_number})',
      body: 'Hi {first_name},\n\nWe have ordered the parts needed for your {unit}. We will start the repair as soon as they arrive and keep you posted.\n\nThank you,\n{store}',
      includeBill: false
    },
    on_bench: {
      subject: 'Your {unit} is being repaired ({wo_number})',
      body: 'Hi {first_name},\n\nGood news: your {unit} is on the bench and our mechanic is working on it now.\n\nThank you,\n{store}',
      includeBill: false
    },
    ready_pickup: {
      subject: 'Your {unit} is ready for pick up ({wo_number})',
      body: 'Hi {first_name},\n\nYour {unit} is repaired and ready for pick up.\n\nWork performed:\n{work_done}\n\nYour bill is below. Balance due at pick up: {balance_due}.\n\nThank you,\n{store}',
      includeBill: true
    },
    not_fixed: {
      subject: 'Your {unit} is ready for pick up (not repaired) ({wo_number})',
      body: 'Hi {first_name},\n\nAs requested, we have not repaired your {unit}. It is ready for you to pick up.\n\n{diagnosis}\n\nThank you,\n{store}',
      includeBill: false
    }
  }
}

export type EmailableStatus = keyof WoSettings['templates']
export const isEmailable = (s: WoStatus): s is EmailableStatus => stage(s).canEmail

// ---------------- Paying at the till ----------------

/**
 * fee    = take the estimate fee at drop-off
 * repair = pick up a repaired unit: the ticket's lines, minus the estimate fee already paid
 * credit = the customer buys something new instead: the estimate fee is credited on that sale
 */
export type WoSaleMode = 'fee' | 'repair' | 'credit'

/** Departments used on receipts, reports and the QuickBooks summary */
export const WO_DEPARTMENTS = { labor: 'Service Labor', shop: 'Shop Supplies', misc: 'Service Other', fee: 'Estimate Fees' } as const

export interface WoSaleLine {
  description: string
  productId: number | null
  department: string | null
  unitPriceCents: number // per unit, before tax (negative for the fee credit)
  qty: number // whole number
  taxable: boolean
  credit?: boolean
}

/** Is this action possible for the ticket right now? (explains why not) */
export function woSaleProblem(wo: Pick<WorkOrder, 'status' | 'feeStatus' | 'feeCents'>, mode: WoSaleMode): string | null {
  if (mode === 'fee') return wo.feeStatus === 'unpaid' ? null : 'The estimate fee is not waiting to be paid'
  if (mode === 'repair') return wo.status === 'ready_pickup' ? null : 'Only tickets that are Ready for Pick Up can be rung up'
  if (wo.feeStatus !== 'paid') return 'There is no paid estimate fee to credit'
  return wo.status === 'closed' ? 'This work order is closed' : null
}

/**
 * The ticket's lines as sale lines (before the fee credit). Parts keep their product id
 * for reports but are NOT taken from stock again (that happened when the repair was approved).
 * Labor with part hours becomes one line priced at hours x rate.
 */
export function workOrderSaleLines(
  wo: Pick<WorkOrder, 'number' | 'lines' | 'feeCents'> & { partDepartments?: Record<number, string | null> },
  mode: WoSaleMode,
  fee: Pick<EstimateFeeSettings, 'description' | 'taxable'>
): WoSaleLine[] {
  if (mode === 'fee')
    return [
      {
        description: `${fee.description} - ${wo.number}`,
        productId: null,
        department: WO_DEPARTMENTS.fee,
        unitPriceCents: wo.feeCents,
        qty: 1,
        taxable: fee.taxable
      }
    ]
  if (mode === 'credit') return []
  return wo.lines.map((l) => {
    const whole = Number.isInteger(l.qty)
    const label = l.kind === 'labor' ? `${l.description} (${l.qty} hr)` : l.description
    return {
      description: `${label} - ${wo.number}`,
      productId: l.kind === 'part' ? l.productId : null,
      department: l.kind === 'part' ? (wo.partDepartments?.[l.id] ?? null) : WO_DEPARTMENTS[l.kind as 'labor' | 'shop' | 'misc'],
      unitPriceCents: whole ? l.unitPriceCents : Math.round(l.unitPriceCents * l.qty),
      qty: whole ? l.qty : 1,
      taxable: l.taxable
    }
  })
}

/**
 * Price a sale that may include a work order, applying the estimate fee credit last.
 * The credit can't make the sale negative: anything above the sale total is kept.
 */
export function priceWithFeeCredit(
  items: { unitPriceCents: number; qty: number; taxable: boolean }[],
  taxRate: number,
  taxExempt: boolean,
  creditAvailableCents: number
) {
  const before = priceSale(items, taxRate, taxExempt)
  const credit = Math.max(0, Math.min(creditAvailableCents, before.totalCents))
  if (credit === 0) return { ...before, creditCents: 0, creditKeptCents: creditAvailableCents }
  const after = priceSale([...items, { unitPriceCents: -credit, qty: 1, taxable: false }], taxRate, taxExempt)
  return { ...after, creditCents: credit, creditKeptCents: creditAvailableCents - credit }
}
