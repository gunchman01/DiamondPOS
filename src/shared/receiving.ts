/**
 * Receiving: items that came in from a vendor. A receiving is built as a draft (add items, quantities and
 * the cost on the invoice), then "received" (posted): stock goes up, the item's average cost is worked out
 * again, and the order cost / regular price can be updated.
 */

export interface ReceivingLineInput {
  productId: number
  qty: number
  /** Cost per unit on this invoice */
  unitCostCents: number
  note?: string
}

export interface ReceivingInput {
  vendor?: string
  invoiceNo?: string
  poNumber?: string
  invoiceDate?: string | null
  receivedBy?: string
  /** Freight / shipping on the invoice */
  freightCents?: number
  /** Spread the freight over the items' cost (by value), so the average cost includes it */
  freightToCost?: boolean
  notes?: string
  tillName?: string
  lines: ReceivingLineInput[]
}

export interface ReceivingLine {
  id: number
  productId: number
  sku: string | null
  name: string
  department: string | null
  type: string
  qty: number
  unitCostCents: number
  note: string
  /** Item now (draft) or before receiving (posted) */
  onHand: number
  avgCostCents: number | null
  orderCostCents: number | null
  priceCents: number
  // Filled in when posted
  landedCostCents: number | null
  newAvgCostCents: number | null
  newPriceCents: number | null
  costUpdated: boolean
}

export interface Receiving {
  id: number
  number: string
  status: 'draft' | 'posted'
  vendor: string
  invoiceNo: string
  poNumber: string
  invoiceDate: string | null
  receivedBy: string
  freightCents: number
  freightToCost: boolean
  notes: string
  tillName: string
  createdAt: string
  postedAt: string | null
  lines: ReceivingLine[]
  totals: ReceivingTotals
}

export interface ReceivingTotals {
  lineCount: number
  qty: number
  /** Items at invoice cost */
  itemsCents: number
  /** Items + freight */
  totalCents: number
}

export interface ReceivingSummary {
  id: number
  number: string
  status: 'draft' | 'posted'
  vendor: string
  invoiceNo: string
  poNumber: string
  receivedBy: string
  createdAt: string
  postedAt: string | null
  lineCount: number
  qty: number
  totalCents: number
}

/** How each line is changed when receiving is posted */
export interface PostLineChoice {
  lineId: number
  /** Set the item's order (last) cost to this receiving's cost */
  updateCost: boolean
  /** New regular price, or null to leave it */
  newPriceCents: number | null
}

/** One past receiving of an item (item window history) */
export interface ItemReceipt {
  receivingId: number
  number: string
  postedAt: string
  vendor: string
  invoiceNo: string
  qty: number
  unitCostCents: number
  landedCostCents: number
  newAvgCostCents: number
}

export const receivingNumber = (id: number) => `RV-${String(id).padStart(6, '0')}`

/** Freight spread over the lines by value: landed cost per unit for each line */
export function landedCosts(lines: { qty: number; unitCostCents: number }[], freightCents: number, spread: boolean): number[] {
  const value = lines.reduce((s, l) => s + l.qty * l.unitCostCents, 0)
  return lines.map((l) => {
    if (!spread || !freightCents || value <= 0 || l.qty <= 0) return l.unitCostCents
    const share = (freightCents * (l.qty * l.unitCostCents)) / value
    return Math.round(l.unitCostCents + share / l.qty)
  })
}

/**
 * Weighted average cost after receiving: (stock on hand × current average + received × cost) / new stock.
 * Stock at or below zero (or no current average) means the new cost becomes the average.
 */
export function newAverageCost(onHand: number, currentAvgCents: number | null, qty: number, unitCostCents: number): number {
  const have = Math.max(0, onHand)
  if (have === 0 || currentAvgCents === null || currentAvgCents === undefined || qty <= 0) return unitCostCents
  return Math.round((have * currentAvgCents + qty * unitCostCents) / (have + qty))
}

export function receivingTotals(lines: { qty: number; unitCostCents: number }[], freightCents: number): ReceivingTotals {
  const itemsCents = Math.round(lines.reduce((s, l) => s + l.qty * l.unitCostCents, 0))
  return {
    lineCount: lines.length,
    qty: lines.reduce((s, l) => s + l.qty, 0),
    itemsCents,
    totalCents: itemsCents + (freightCents || 0)
  }
}

/** Margin %: profit as a % of the price (null when no cost) */
export const marginPct = (priceCents: number, costCents: number | null) =>
  costCents && priceCents ? Math.round(((priceCents - costCents) / priceCents) * 1000) / 10 : null
