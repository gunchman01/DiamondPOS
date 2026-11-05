/**
 * Item (product) fields and how they map to database columns.
 * Add a new item field here (plus a migration) and it is read, saved and
 * validated everywhere automatically.
 */
import type { DB } from './db'
import type { ItemType, Product, ProductInput } from '../../shared/types'

type Kind = 'text' | 'cents' | 'int' | 'real' | 'bool' | 'type'
interface Field {
  key: keyof ProductInput
  col: string
  kind: Kind
}

export const ITEM_TYPES: ItemType[] = ['inventory', 'non_inventory', 'service']

export const FIELDS: Field[] = [
  { key: 'name', col: 'name', kind: 'text' },
  { key: 'type', col: 'type', kind: 'type' },
  { key: 'department', col: 'department', kind: 'text' },
  { key: 'description', col: 'description', kind: 'text' },
  { key: 'size', col: 'size', kind: 'text' },
  { key: 'attribute', col: 'attribute', kind: 'text' },
  { key: 'priceCents', col: 'price_cents', kind: 'cents' },
  { key: 'costCents', col: 'cost_cents', kind: 'cents' },
  { key: 'onHand', col: 'on_hand', kind: 'int' },
  { key: 'taxable', col: 'taxable', kind: 'bool' },
  { key: 'barcode', col: 'barcode', kind: 'text' },
  { key: 'quickPick', col: 'quick_pick', kind: 'bool' },
  { key: 'quickPickGroup', col: 'quick_pick_group', kind: 'text' },
  { key: 'vendor', col: 'vendor', kind: 'text' },
  { key: 'orderCostCents', col: 'order_cost_cents', kind: 'cents' },
  { key: 'reorderPoint', col: 'reorder_point', kind: 'int' },
  { key: 'sku', col: 'sku', kind: 'text' },
  { key: 'alu', col: 'alu', kind: 'text' },
  { key: 'unitOfMeasure', col: 'unit_of_measure', kind: 'text' },
  { key: 'manufacturer', col: 'manufacturer', kind: 'text' },
  { key: 'active', col: 'active', kind: 'bool' },
  { key: 'printTags', col: 'print_tags', kind: 'bool' },
  { key: 'unorderable', col: 'unorderable', kind: 'bool' },
  { key: 'useSerial', col: 'use_serial', kind: 'bool' },
  { key: 'earnCommission', col: 'earn_commission', kind: 'bool' },
  { key: 'earnRewards', col: 'earn_rewards', kind: 'bool' },
  { key: 'shipWeight', col: 'ship_weight', kind: 'real' },
  { key: 'shipHeight', col: 'ship_height', kind: 'real' },
  { key: 'shipLength', col: 'ship_length', kind: 'real' },
  { key: 'shipWidth', col: 'ship_width', kind: 'real' },
  { key: 'comments', col: 'comments', kind: 'text' }
]

/** Values used for a brand-new item when the request leaves a field out */
export const DEFAULTS: ProductInput = {
  name: '',
  type: 'inventory',
  department: null,
  description: null,
  size: null,
  attribute: null,
  priceCents: 0,
  costCents: null,
  onHand: 0,
  taxable: true,
  barcode: null,
  quickPick: false,
  quickPickGroup: null,
  vendor: null,
  orderCostCents: null,
  reorderPoint: null,
  sku: null,
  alu: null,
  unitOfMeasure: null,
  manufacturer: null,
  active: true,
  printTags: true,
  unorderable: false,
  useSerial: false,
  earnCommission: false,
  earnRewards: false,
  shipWeight: null,
  shipHeight: null,
  shipLength: null,
  shipWidth: null,
  comments: null
}

export class ValidationError extends Error {}

export type ProductRow = Record<string, unknown> & { id: number }

export function toProduct(r: ProductRow): Product {
  const p: Record<string, unknown> = { id: r.id }
  for (const f of FIELDS) {
    const v = r[f.col]
    if (f.kind === 'bool') p[f.key] = v === 1
    else if (f.kind === 'type') p[f.key] = ITEM_TYPES.includes(v as ItemType) ? v : 'inventory'
    else p[f.key] = v ?? null
  }
  return p as unknown as Product
}

export function getProduct(db: DB, id: number): Product | null {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as ProductRow | undefined
  return row ? toProduct(row) : null
}

/**
 * Check and clean an item from a request. Fields the request leaves out keep
 * their value from `base` (the existing item, or DEFAULTS for a new one). That
 * way an older till that doesn't know about newer fields can't wipe them.
 */
export function validateProduct(body: unknown, base: ProductInput): ProductInput {
  const b = (body ?? {}) as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const f of FIELDS) {
    const raw = b[f.key] === undefined ? base[f.key] : b[f.key]
    out[f.key] = coerce(f, raw)
  }
  const p = out as unknown as ProductInput
  if (!p.name) throw new ValidationError('Item name is required')
  if (p.priceCents === null || p.priceCents === undefined) throw new ValidationError('Regular price is required')
  if (p.onHand === null || p.onHand === undefined) p.onHand = 0
  return p
}

function coerce(f: Field, raw: unknown): unknown {
  switch (f.kind) {
    case 'text': {
      const s = String(raw ?? '').trim()
      return s === '' ? null : s.slice(0, 500)
    }
    case 'bool':
      return raw === true || raw === 1
    case 'type':
      if (!ITEM_TYPES.includes(raw as ItemType)) throw new ValidationError('Unknown item type')
      return raw
    case 'cents':
    case 'int': {
      if (raw === null || raw === undefined || raw === '') return null
      const n = Number(raw)
      if (!Number.isInteger(n)) throw new ValidationError(`${label(f)} must be a whole number`)
      if (f.kind === 'cents' && n < 0) throw new ValidationError(`${label(f)} can't be negative`)
      if (f.key === 'reorderPoint' && n < 0) throw new ValidationError('Reorder point can\'t be negative')
      return n
    }
    case 'real': {
      if (raw === null || raw === undefined || raw === '') return null
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) throw new ValidationError(`${label(f)} must be a positive number`)
      return n
    }
  }
}

function label(f: Field): string {
  return f.key.replace(/Cents$/, '').replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
}

const toDb = (f: Field, v: unknown) => (f.kind === 'bool' ? (v ? 1 : 0) : (v ?? null))

export function insertProduct(db: DB, p: ProductInput): number {
  const cols = FIELDS.map((f) => f.col)
  const info = db
    .prepare(`INSERT INTO products (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(...FIELDS.map((f) => toDb(f, p[f.key])))
  return Number(info.lastInsertRowid)
}

export function updateProduct(db: DB, id: number, p: ProductInput): void {
  db.prepare(
    `UPDATE products SET ${FIELDS.map((f) => `${f.col} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`
  ).run(...FIELDS.map((f) => toDb(f, p[f.key])), id)
}
