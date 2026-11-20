import type { ReactNode } from 'react'
import type { Product } from '../../shared/types'
import { COLUMNS } from '../../shared/itemImport'
import { money } from './format'

export interface ItemColumn { id: string; label: string; required?: boolean; num?: boolean; cell: (p: Product) => ReactNode }
const defaults = ['sku', 'name', 'department', 'type', 'barcode', 'onHand', 'priceCents', 'active']
const types = { inventory: 'Inventory', non_inventory: 'Non-inv.', service: 'Service' }
export const ITEM_COLUMNS: ItemColumn[] = COLUMNS.map((c) => ({
  id: c.key, label: c.key === 'costCents' ? 'Current Cost' : c.header, required: c.key === 'name',
  num: ['cents', 'cents0', 'qty', 'int', 'real'].includes(c.kind),
  cell: (p) => {
    const value = p[c.key]
    if (value === null || value === undefined) return ''
    if (c.key === 'type') return types[p.type]
    if (c.key === 'onHand' && p.type !== 'inventory') return ''
    if (c.key === 'active') return p.active ? 'Active' : 'Inactive'
    if (c.kind === 'cents' || c.kind === 'cents0') return money(Number(value))
    if (c.kind === 'tax') return value ? 'Tax' : 'Non-taxable'
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    return String(value)
  }
}))
export const DEFAULT_ITEM_COLUMNS = defaults
export function itemColumnIds(saved: unknown): string[] {
  if (!Array.isArray(saved)) return [...defaults]
  const ids = [...new Set(saved.filter((id): id is string => typeof id === 'string' && ITEM_COLUMNS.some((c) => c.id === id)))]
  if (!ids.includes('name')) ids.unshift('name')
  return ids
}
