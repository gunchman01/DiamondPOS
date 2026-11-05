/**
 * Spreadsheet columns for importing / exporting items.
 * Headers are matched loosely (case, spaces and punctuation ignored) and
 * several common names are accepted for each column.
 */
import type { ItemType, Product, ProductInput } from './types'

type Kind = 'text' | 'cents' | 'int' | 'real' | 'bool' | 'tax' | 'type'

export interface Column {
  header: string // name used in the template / export
  key: keyof ProductInput
  kind: Kind
  aliases: string[] // other accepted header names (normalised)
}

export const COLUMNS: Column[] = [
  { header: 'Item Name', key: 'name', kind: 'text', aliases: ['name', 'item', 'itemname', 'productname'] },
  { header: 'Item No.', key: 'sku', kind: 'text', aliases: ['itemno', 'itemnumber', 'itemnum', 'sku', 'itemcode', 'code'] },
  { header: 'UPC', key: 'barcode', kind: 'text', aliases: ['upc', 'barcode', 'ean', 'upcbarcode'] },
  { header: 'ALU', key: 'alu', kind: 'text', aliases: ['alu', 'altlookup', 'alternatelookup'] },
  { header: 'Department', key: 'department', kind: 'text', aliases: ['department', 'dept', 'category'] },
  { header: 'Type', key: 'type', kind: 'type', aliases: ['type', 'itemtype'] },
  { header: 'Item Description', key: 'description', kind: 'text', aliases: ['itemdescription', 'description', 'desc'] },
  { header: 'Size', key: 'size', kind: 'text', aliases: ['size'] },
  { header: 'Attribute', key: 'attribute', kind: 'text', aliases: ['attribute', 'attr', 'colour', 'color'] },
  { header: 'Reg Price', key: 'priceCents', kind: 'cents', aliases: ['regprice', 'regularprice', 'price', 'retailprice', 'sellprice', 'sellingprice'] },
  { header: 'Avg Unit Cost', key: 'costCents', kind: 'cents', aliases: ['avgunitcost', 'averageunitcost', 'unitcost', 'cost', 'avgcost'] },
  { header: 'On-Hand Qty', key: 'onHand', kind: 'int', aliases: ['onhandqty', 'onhand', 'qty', 'quantity', 'stock', 'qoh'] },
  { header: 'Tax', key: 'taxable', kind: 'tax', aliases: ['tax', 'taxable', 'taxcode', 'gst'] },
  { header: 'Quick Pick', key: 'quickPick', kind: 'bool', aliases: ['quickpick'] },
  { header: 'Quick Pick Group', key: 'quickPickGroup', kind: 'text', aliases: ['quickpickgroup', 'qpgroup'] },
  { header: 'Vendor', key: 'vendor', kind: 'text', aliases: ['vendor', 'supplier', 'vendorname'] },
  { header: 'Order Cost', key: 'orderCostCents', kind: 'cents', aliases: ['ordercost', 'purchasecost'] },
  { header: 'Reorder Point', key: 'reorderPoint', kind: 'int', aliases: ['reorderpoint', 'reorder', 'minqty'] },
  { header: 'Unit of Measure', key: 'unitOfMeasure', kind: 'text', aliases: ['unitofmeasure', 'uom', 'unit'] },
  { header: 'Manufacturer', key: 'manufacturer', kind: 'text', aliases: ['manufacturer', 'brand', 'mfr'] },
  { header: 'Active', key: 'active', kind: 'bool', aliases: ['active', 'enabled'] },
  { header: 'Print Tags', key: 'printTags', kind: 'bool', aliases: ['printtags'] },
  { header: 'Unorderable', key: 'unorderable', kind: 'bool', aliases: ['unorderable'] },
  { header: 'Use Serial #', key: 'useSerial', kind: 'bool', aliases: ['useserial', 'serial'] },
  { header: 'Earn Commission', key: 'earnCommission', kind: 'bool', aliases: ['earncommission', 'commission'] },
  { header: 'Earn Rewards', key: 'earnRewards', kind: 'bool', aliases: ['earnrewards', 'rewards'] },
  { header: 'Shipping Weight', key: 'shipWeight', kind: 'real', aliases: ['shippingweight', 'shipweight', 'weight'] },
  { header: 'Shipping Height', key: 'shipHeight', kind: 'real', aliases: ['shippingheight', 'shipheight', 'height'] },
  { header: 'Shipping Length', key: 'shipLength', kind: 'real', aliases: ['shippinglength', 'shiplength', 'length'] },
  { header: 'Shipping Width', key: 'shipWidth', kind: 'real', aliases: ['shippingwidth', 'shipwidth', 'width'] },
  { header: 'Comments', key: 'comments', kind: 'text', aliases: ['comments', 'notes', 'comment'] }
]

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Work out which spreadsheet header goes to which item field. */
export function mapHeaders(headers: string[]): { map: Map<string, Column>; unknown: string[] } {
  const map = new Map<string, Column>()
  const unknown: string[] = []
  const used = new Set<string>()
  for (const h of headers) {
    const n = norm(h)
    const col = COLUMNS.find((c) => !used.has(c.key) && (norm(c.header) === n || c.aliases.includes(n)))
    if (col) {
      map.set(h, col)
      used.add(col.key)
    } else if (h.trim() && !h.startsWith('__EMPTY')) unknown.push(h)
  }
  return { map, unknown }
}

export type ImportItem = Partial<ProductInput> & { __row: number }

/**
 * Convert one spreadsheet row to item fields. Blank cells are left out, so
 * when updating an existing item a blank cell means "keep the current value".
 */
export function rowToItem(row: Record<string, unknown>, map: Map<string, Column>, rowNumber: number) {
  const item: ImportItem = { __row: rowNumber }
  const errors: string[] = []
  for (const [header, col] of map) {
    const v = row[header]
    if (v === undefined || v === null || String(v).trim() === '') continue
    const result = convert(col, v)
    if (result.error) errors.push(`${col.header}: ${result.error}`)
    else (item as Record<string, unknown>)[col.key] = result.value
  }
  return { item, errors }
}

function convert(col: Column, v: unknown): { value?: unknown; error?: string } {
  const s = String(v).trim()
  const yes = ['yes', 'y', 'true', '1', 'x', '✓', 'on']
  const no = ['no', 'n', 'false', '0', 'off']
  switch (col.kind) {
    case 'text':
      // whole numbers (e.g. barcodes Excel stored as numbers) without ".0" or scientific notation
      return { value: typeof v === 'number' && Number.isInteger(v) ? v.toFixed(0) : s }
    case 'cents': {
      const n = typeof v === 'number' ? v : Number(s.replace(/[$,\s]/g, ''))
      if (!Number.isFinite(n) || n < 0) return { error: `"${s}" is not a valid amount` }
      return { value: Math.round(n * 100) }
    }
    case 'int': {
      const n = typeof v === 'number' ? v : Number(s.replace(/,/g, ''))
      if (!Number.isInteger(n)) return { error: `"${s}" is not a whole number` }
      return { value: n }
    }
    case 'real': {
      const n = typeof v === 'number' ? v : Number(s)
      if (!Number.isFinite(n) || n < 0) return { error: `"${s}" is not a valid number` }
      return { value: n }
    }
    case 'bool': {
      const n = norm(s) || s
      if (yes.includes(n) || v === true) return { value: true }
      if (no.includes(n) || v === false) return { value: false }
      return { error: `"${s}" should be Yes or No` }
    }
    case 'tax': {
      const n = norm(s)
      if (yes.includes(n) || ['tax', 'taxable', 'gst', 't'].includes(n) || v === true) return { value: true }
      if (no.includes(n) || ['non', 'nontax', 'nontaxable', 'exempt', 'none', 'notax'].includes(n) || v === false)
        return { value: false }
      return { error: `"${s}" should be Tax or Non-taxable` }
    }
    case 'type': {
      const n = norm(s)
      const t: Record<string, ItemType> = {
        inventory: 'inventory',
        inv: 'inventory',
        noninventory: 'non_inventory',
        noninv: 'non_inventory',
        service: 'service'
      }
      return t[n] ? { value: t[n] } : { error: `"${s}" should be Inventory, Non-inventory or Service` }
    }
  }
}

/** One spreadsheet row for an item (used by Export). */
export function itemToRow(p: Product): Record<string, string | number> {
  const row: Record<string, string | number> = {}
  for (const c of COLUMNS) {
    const v = p[c.key]
    if (v === null || v === undefined) row[c.header] = ''
    else if (c.kind === 'cents') row[c.header] = (v as number) / 100
    else if (c.kind === 'bool') row[c.header] = v ? 'Yes' : 'No'
    else if (c.kind === 'tax') row[c.header] = v ? 'Tax' : 'Non-taxable'
    else if (c.kind === 'type')
      row[c.header] = v === 'non_inventory' ? 'Non-inventory' : v === 'service' ? 'Service' : 'Inventory'
    else row[c.header] = v as string | number
  }
  return row
}

/** Example rows for the downloadable template. */
export const TEMPLATE_ROWS: Record<string, string | number>[] = [
  {
    'Item Name': 'Flat White',
    'Item No.': 'COF-001',
    UPC: '9400000000011',
    Department: 'Coffee',
    Type: 'Inventory',
    'Reg Price': 5.5,
    'Avg Unit Cost': 1.8,
    'On-Hand Qty': 100,
    Tax: 'Tax',
    'Quick Pick': 'Yes',
    Vendor: 'Local Roasters Ltd',
    'Reorder Point': 20,
    'Unit of Measure': 'Each',
    Active: 'Yes'
  },
  {
    'Item Name': 'Gift Card $20',
    'Item No.': 'GC-20',
    Department: 'Gifts',
    Type: 'Non-inventory',
    'Reg Price': 20,
    Tax: 'Non-taxable',
    Active: 'Yes'
  }
]
