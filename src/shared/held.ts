import type { Product } from './types'

/** A sale built ahead of time and put on hold until the customer comes back to pay */
export interface HeldItemInput {
  productId: number
  qty: number
  serial?: string
  /** Price changed at the till; omitted = the regular price when it's rung up */
  priceCents?: number
}

export interface HeldReceiptInput {
  customerId?: number | null
  note?: string
  taxExempt?: boolean
  tillName?: string
  items: HeldItemInput[]
}

export interface HeldSummary {
  id: number
  customerId: number | null
  customerName: string | null
  note: string
  tillName: string
  itemCount: number
  /** At today's prices (shelf price, before any tax exemption) */
  totalCents: number
  itemsText: string
  createdAt: string
  updatedAt: string
}

export interface HeldReceipt extends HeldSummary {
  taxExempt: boolean
  /** Items with their current details; missing = item deleted or made inactive since it was held */
  items: { product: Product; qty: number; serial?: string; priceCents?: number }[]
  missing: number
}

export const heldNumber = (id: number) => `H-${String(id).padStart(5, '0')}`
