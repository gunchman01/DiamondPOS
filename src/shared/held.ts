import type { Product } from './types'

/** A sale built ahead of time and put on hold until the customer comes back to pay */
export interface HeldItemInput {
  productId: number
  qty: number
  serial?: string
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
  items: { product: Product; qty: number; serial?: string }[]
  missing: number
}

export const heldNumber = (id: number) => `H-${String(id).padStart(5, '0')}`
