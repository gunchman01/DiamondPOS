export interface QuantityRules { serialized?: boolean; returning?: boolean; maxReturn?: number }
export function parseQuantity(text: string): number | null {
  const trimmed = text.trim()
  if (!/^[+-]?\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  return Number.isSafeInteger(value) ? value : null
}
export function quantityError(value: number | null, rules: QuantityRules = {}): string | null {
  if (value === null || !Number.isInteger(value) || Math.abs(value) > 9999) return 'Use a whole quantity from -9999 to 9999.'
  if (value === 0) return null // Removing a line remains available even if its receipt limits changed.
  if (rules.returning && value > 0) return 'Return quantities must be negative. Remove this return and scan the item to sell it.'
  if (rules.serialized && Math.abs(value) > 1) return 'Serialized equipment is one unit per line.'
  if (rules.returning && rules.maxReturn !== undefined && -value > rules.maxReturn) return 'That exceeds the quantity still available to return.'
  return null
}
