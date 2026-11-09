/**
 * Sale pricing, shared by the till (to show totals) and the server (which is
 * the one that actually decides). Using the same function on both sides means
 * the total the cashier sees is exactly what the server charges.
 *
 * Shelf prices are BEFORE tax (US style). Sales tax is added at checkout on the
 * taxable items, at the rate chosen on the sale:  tax = round(taxable subtotal × rate).
 * A tax-exempt sale charges no tax; taxExemptCents is the tax that was not charged.
 *
 * (Sales made before v0.3.16 used tax-inclusive prices; they are stored with
 * tax_mode = 'inclusive' and are never re-priced.)
 */
export interface PriceInput {
  unitPriceCents: number // shelf price, before tax
  qty: number
  taxable: boolean
}

export interface PricedLine {
  unitPriceCents: number // what is charged per unit on this sale (before tax)
  lineTotalCents: number
}

export interface PricedSale {
  lines: PricedLine[]
  /** Total of the lines, before tax */
  subtotalCents: number
  /** Subtotal + tax */
  totalCents: number
  /** Tax added (0 when exempt) */
  taxCents: number
  /** Tax not charged because the sale is tax exempt */
  taxExemptCents: number
}

/** Tax on an amount (whole cents, rounded half up) */
export const taxOn = (cents: number, rate: number) => Math.round(cents * rate)

export function priceSale(items: PriceInput[], taxRate: number, taxExempt: boolean): PricedSale {
  let taxable = 0
  const lines = items.map((it) => {
    const line = it.unitPriceCents * it.qty
    if (it.taxable) taxable += line
    return { unitPriceCents: it.unitPriceCents, lineTotalCents: line }
  })
  const subtotalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0)
  const tax = taxOn(taxable, taxRate)
  return {
    lines,
    subtotalCents,
    taxCents: taxExempt ? 0 : tax,
    totalCents: subtotalCents + (taxExempt ? 0 : tax),
    taxExemptCents: taxExempt ? tax : 0
  }
}

/** Highest price that can be typed for a line ($100,000.00): catches a scanned barcode typed into a price box */
export const MAX_PRICE_CENTS = 10_000_000
