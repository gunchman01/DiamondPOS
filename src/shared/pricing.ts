/**
 * Sale pricing, shared by the till (to show totals) and the server (which is
 * the one that actually decides). Using the same function on both sides means
 * the total the cashier sees is exactly what the server charges.
 *
 * Shelf prices INCLUDE tax. For a tax-exempt sale, the tax portion is taken
 * off each taxable item:  exempt unit price = round(price / (1 + rate)).
 */
export interface PriceInput {
  unitPriceCents: number // shelf price, tax inclusive
  qty: number
  taxable: boolean
}

export interface PricedLine {
  unitPriceCents: number // what is charged per unit on this sale
  lineTotalCents: number
}

export interface PricedSale {
  lines: PricedLine[]
  totalCents: number
  /** Tax included in the total (0 when exempt) */
  taxCents: number
  /** Tax removed because the sale is tax exempt */
  taxExemptCents: number
}

export function priceSale(items: PriceInput[], taxRate: number, taxExempt: boolean): PricedSale {
  let shelfTaxable = 0
  let chargedTaxable = 0
  const lines = items.map((it) => {
    const unit = taxExempt && it.taxable ? Math.round(it.unitPriceCents / (1 + taxRate)) : it.unitPriceCents
    const line = unit * it.qty
    if (it.taxable) {
      shelfTaxable += it.unitPriceCents * it.qty
      chargedTaxable += line
    }
    return { unitPriceCents: unit, lineTotalCents: line }
  })
  const totalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0)
  return {
    lines,
    totalCents,
    taxCents: taxExempt ? 0 : Math.round((shelfTaxable * taxRate) / (1 + taxRate)),
    taxExemptCents: taxExempt ? shelfTaxable - chargedTaxable : 0
  }
}
