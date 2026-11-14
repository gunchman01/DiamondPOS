import type { Product } from '../../shared/types'
import type { ReturnableLine, ReturnableSale } from '../../shared/returns'
import type { ReturnLine } from './screens/ReturnDialog'

export function matchingReturnLines(receipt: ReturnableSale, product: Product, serial = ''): ReturnableLine[] {
  return receipt.lines.filter((line) => line.productId === product.id &&
    (!serial || line.serial?.trim().toLowerCase() === serial.trim().toLowerCase()))
}

/** Convert a negative till quantity into the existing, validated return request model. */
export function inlineReturnLine(input: {
  product: Product; negativeQty: number; serial?: string; reason: string; restock: boolean;
  receipt?: ReturnableSale | null; saleItemId?: number | null; existing: ReturnLine[]; customerId?: number | null
}): ReturnLine {
  const { product, negativeQty, receipt, existing } = input
  if (!Number.isInteger(negativeQty) || negativeQty >= 0 || negativeQty < -9999)
    throw new Error('Enter a negative whole quantity between -1 and -9999')
  const qty = -negativeQty
  const serial = (input.serial ?? '').trim()
  if ((serial || product.useSerial) && qty !== 1) throw new Error('Return serialized equipment one unit per line')
  if (!input.reason.trim()) throw new Error('Choose a return reason')
  let line: ReturnableLine | undefined
  if (receipt) {
    if (input.customerId && receipt.customerId && input.customerId !== receipt.customerId)
      throw new Error('This receipt belongs to a different customer. Select that customer or remove the current customer first.')
    line = matchingReturnLines(receipt, product, serial).find((l) => l.saleItemId === input.saleItemId)
    if (!line) throw new Error('Choose the matching item from the original receipt')
    const onSale = existing.filter((r) => r.saleItemId === line!.saleItemId).reduce((n, r) => n + r.qty, 0)
    if (!line.returnable || qty > line.qtySold - line.qtyReturned - onSale)
      throw new Error('That quantity has already been returned or is already on this sale')
  }
  const tracksStock = line?.tracksStock ?? product.type === 'inventory'
  return {
    key: `r:${crypto.randomUUID()}`, saleId: receipt?.saleId ?? null, saleItemId: line?.saleItemId ?? null,
    productId: product.id, sku: line?.sku ?? product.sku ?? null, name: line?.name ?? product.name,
    serial: line?.serial ?? (serial || null), qty, unitCents: line?.unitPaidCents ?? product.priceCents,
    taxable: line?.taxable ?? product.taxable !== false, origExempt: receipt?.taxExempt ?? false,
    origTaxMode: receipt?.taxMode ?? null, origTaxRate: receipt?.taxRate ?? null,
    originalTax: line ? { taxCents: line.taxPaidCents ?? 0, qtySold: line.qtySold,
      qtyReturned: line.qtyReturned, taxRefundedCents: line.taxRefundedCents ?? 0 } : undefined,
    reason: input.reason.trim(), restock: input.restock && tracksStock, tracksStock
  }
}
