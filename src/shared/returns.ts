/**
 * Returns / refunds, shared by the till (to show the refund) and the server
 * (which decides). A returned item is refunded at the price the customer
 * actually paid on the original receipt (after any tax exemption), never
 * today's shelf price. Returns without a receipt use today's price.
 */
import type { PaymentInput } from './types'

export const RETURN_REASONS = ['Defective', 'Changed mind', 'Wrong item', 'Did not fit / not compatible', 'Duplicate purchase', 'Other'] as const

/** One item coming back, as sent by the till */
export interface ReturnRequestLine {
  /** Serial retained for an item returned without the original receipt. */
  serial?: string
  /** Line on the original receipt (normal return) */
  saleItemId?: number
  /** No receipt: the item being returned (refunded at today's price) */
  productId?: number
  qty: number
  reason: string
  /** true = back on the shelf (stock goes up); false = damaged, don't restock */
  restock: boolean
}

/** A line on an original receipt and how much of it can still come back */
export interface ReturnableLine {
  saleItemId: number
  productId: number | null
  sku: string | null
  name: string
  serial: string | null
  qtySold: number
  qtyReturned: number
  /** Price per unit on the receipt (before tax on 'added' receipts; tax included on older 'inclusive' ones) */
  taxPaidCents?: number
  taxRefundedCents?: number
  unitPaidCents: number
  taxable: boolean
  /** Inventory item (can go back to stock) */
  tracksStock: boolean
  returnable: boolean
  /** Why it can't be returned, when returnable is false */
  whyNot: string | null
}

export interface ReturnableSale {
  saleId: number
  createdAt: string
  tillName: string
  customerId: number | null
  customerName: string | null
  taxExempt: boolean
  /** How the receipt was taxed and at what rate (refunds use the same) */
  taxMode: TaxMode
  taxRate: number
  totalCents: number
  /** Already refunded against this receipt */
  refundedCents: number
  /** Most that can still be refunded against this receipt (what was paid, less refunds so far) */
  refundableCents: number
  lines: ReturnableLine[]
  payments: PaymentInput[]
}

/** A receipt the customer has bought on (for finding a receipt by customer) */
export interface CustomerReceipt {
  id: number
  createdAt: string
  totalCents: number
  itemsText: string
}

export type TaxMode = 'added' | 'inclusive'

/**
 * Refund for qty units of a line (all positive):
 *  - netCents: the line before tax, taxCents: its tax, amountCents: net + tax = money given back
 * mode = how the ORIGINAL sale was taxed: 'added' (v0.3.16+, tax on top) or 'inclusive' (older sales, tax inside the price).
 * taxRate = the rate used on the original sale.
 */
export function returnAmount(unitPaidCents: number, qty: number, taxable: boolean, origExempt: boolean, taxRate: number, mode: TaxMode = 'added', original?: { taxCents: number; qtySold: number; qtyReturned: number; taxRefundedCents: number }) {
  if (original) {
    const remaining = Math.max(0, original.taxCents - original.taxRefundedCents)
    const tax = Math.max(0, Math.min(remaining,
      qty + original.qtyReturned >= original.qtySold ? remaining :
      Math.round(original.taxCents * (original.qtyReturned + qty) / original.qtySold) - original.taxRefundedCents))
    const amount = unitPaidCents * qty
    return mode === 'inclusive' ? { amountCents: amount, taxCents: tax, netCents: amount - tax } :
      { amountCents: amount + tax, taxCents: tax, netCents: amount }
  }
  const charged = taxable && !origExempt
  if (mode === 'inclusive') {
    const amount = unitPaidCents * qty
    const tax = charged ? Math.round((amount * taxRate) / (1 + taxRate)) : 0
    return { amountCents: amount, taxCents: tax, netCents: amount - tax }
  }
  const net = unitPaidCents * qty
  const tax = charged ? Math.round(net * taxRate) : 0
  return { amountCents: net + tax, taxCents: tax, netCents: net }
}

/**
 * If a receipt had an estimate fee credit (or anything else that lowered its
 * total), the refunds against it can't add up to more than was paid. The
 * difference is kept (e.g. the estimate fee goes back to being kept).
 */
export function feeKeptOnReturn(refundableCents: number, returningCents: number): number {
  return Math.max(0, returningCents - Math.max(0, refundableCents))
}

export const isRefundTotal = (totalCents: number) => totalCents < 0
