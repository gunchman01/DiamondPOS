import { useEffect, useRef, type ReactNode } from 'react'
import type { Product } from '../../shared/types'
import { money } from './format'

/** One row on the Sale screen's receipt grid (a scanned item, a work order line, a return…) */
export interface GridRow {
  key: string
  kind: 'item' | 'wo' | 'credit' | 'return' | 'feekept'
  /** The item, when the row is a product from the Item List */
  product?: Product
  lineNo: ReactNode
  sku: string | null
  name: ReactNode
  /** Extra lines under the description (serial, return details) */
  tags: ReactNode[]
  serial: string | null
  qty: number
  unitCents: number
  extCents: number
  /** Price differs from the shelf price because the sale is tax exempt */
  exTax?: boolean
}

export interface SaleColumn {
  id: string
  label: string
  /** Can't be hidden */
  required?: boolean
  width?: number
  num?: boolean
  dim?: boolean
  cell: (r: GridRow) => ReactNode
}

const p = (r: GridRow, f: (x: Product) => ReactNode) => (r.product ? f(r.product) : '')
const signed = (r: GridRow, c: number) => (r.kind === 'return' ? `−${money(c)}` : money(c))

/** Every column that can be shown, in their default order */
export const SALE_COLUMNS: SaleColumn[] = [
  { id: 'line', label: '#', width: 36, dim: true, cell: (r) => r.lineNo },
  { id: 'sku', label: 'Item #', width: 120, dim: true, cell: (r) => r.sku ?? '' },
  { id: 'barcode', label: 'UPC', width: 130, dim: true, cell: (r) => p(r, (x) => x.barcode ?? '') },
  { id: 'alu', label: 'ALU', width: 100, dim: true, cell: (r) => p(r, (x) => x.alu ?? '') },
  { id: 'description', label: 'Description', required: true, cell: (r) => <>{r.name}{r.tags}</> },
  { id: 'itemDescription', label: 'Item Details', width: 180, dim: true, cell: (r) => p(r, (x) => x.description ?? '') },
  { id: 'department', label: 'Department', width: 120, cell: (r) => p(r, (x) => x.department ?? '') },
  { id: 'manufacturer', label: 'Manufacturer', width: 120, cell: (r) => p(r, (x) => x.manufacturer ?? '') },
  { id: 'vendor', label: 'Vendor', width: 120, cell: (r) => p(r, (x) => x.vendor ?? '') },
  { id: 'size', label: 'Size', width: 70, cell: (r) => p(r, (x) => x.size ?? '') },
  { id: 'attribute', label: 'Attribute', width: 90, cell: (r) => p(r, (x) => x.attribute ?? '') },
  { id: 'unit', label: 'Unit', width: 70, cell: (r) => p(r, (x) => x.unitOfMeasure ?? '') },
  { id: 'serial', label: 'Serial #', width: 120, dim: true, cell: (r) => r.serial ?? '' },
  { id: 'onHand', label: 'On Hand', width: 75, num: true, cell: (r) => p(r, (x) => (x.type === 'inventory' ? x.onHand : '')) },
  { id: 'taxable', label: 'Tax', width: 50, cell: (r) => p(r, (x) => (x.taxable ? 'Tax' : 'Non')) },
  { id: 'cost', label: 'Cost', width: 85, num: true, dim: true, cell: (r) => p(r, (x) => (x.costCents !== null && x.costCents !== undefined ? money(x.costCents) : '')) },
  { id: 'regPrice', label: 'Reg Price', width: 90, num: true, cell: (r) => p(r, (x) => money(x.priceCents)) },
  { id: 'qty', label: 'Qty', required: true, width: 60, num: true, cell: (r) => (r.kind === 'return' ? `−${r.qty}` : r.qty) },
  {
    id: 'price',
    label: 'Price',
    width: 90,
    num: true,
    cell: (r) => (
      <>
        {r.kind === 'credit' ? `−${money(r.unitCents)}` : money(r.unitCents)}
        {r.exTax && <span className="ex-tag">ex tax</span>}
      </>
    )
  },
  { id: 'ext', label: 'Ext. Price', required: true, width: 100, num: true, cell: (r) => (r.kind === 'credit' ? `−${money(r.extCents)}` : signed(r, r.extCents)) }
]

export const DEFAULT_SALE_COLUMNS = ['line', 'sku', 'description', 'qty', 'price', 'ext']

/** Saved column ids -> columns to show (unknown ids dropped, required columns always present) */
export function visibleColumns(ids: string[] | undefined): SaleColumn[] {
  const want = ids && ids.length ? ids : DEFAULT_SALE_COLUMNS
  const cols = want.map((id) => SALE_COLUMNS.find((c) => c.id === id)).filter((c): c is SaleColumn => !!c)
  for (const req of SALE_COLUMNS.filter((c) => c.required)) if (!cols.includes(req)) cols.push(req)
  return cols
}

/** Right-click menu on the receipt grid header: show/hide columns, move the clicked one, reset */
export function ColumnMenu(props: {
  x: number
  y: number
  shown: string[]
  /** Column that was right-clicked (for Move left / right) */
  target: string | null
  onChange: (ids: string[]) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) props.onClose()
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    setTimeout(() => window.addEventListener('mousedown', close), 0)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [])

  const toggle = (id: string) => {
    if (props.shown.includes(id)) props.onChange(props.shown.filter((x) => x !== id))
    else {
      // New columns go just before Qty so the money columns stay on the right
      const at = props.shown.indexOf('qty')
      const next = [...props.shown]
      next.splice(at < 0 ? next.length : at, 0, id)
      props.onChange(next)
    }
  }
  const move = (dir: -1 | 1) => {
    const i = props.target ? props.shown.indexOf(props.target) : -1
    const j = i + dir
    if (i < 0 || j < 0 || j >= props.shown.length) return
    const next = [...props.shown]
    ;[next[i], next[j]] = [next[j], next[i]]
    props.onChange(next)
  }
  const label = SALE_COLUMNS.find((c) => c.id === props.target)?.label
  const i = props.target ? props.shown.indexOf(props.target) : -1
  // Keep the menu on screen
  const left = Math.min(props.x, window.innerWidth - 240)
  const top = Math.min(props.y, window.innerHeight - 520)

  return (
    <div ref={ref} className="col-menu" style={{ left, top: Math.max(8, top) }} onContextMenu={(e) => e.preventDefault()}>
      <div className="col-menu-title">Columns to show</div>
      <div className="col-menu-list">
        {SALE_COLUMNS.map((c) => (
          <label key={c.id} className={c.required ? 'disabled' : ''}>
            <input type="checkbox" checked={c.required || props.shown.includes(c.id)} disabled={c.required} onChange={() => toggle(c.id)} />
            {c.label === '#' ? 'Line #' : c.label}
          </label>
        ))}
      </div>
      {label && (
        <div className="col-menu-actions">
          <div className="col-menu-title small">Move "{label === '#' ? 'Line #' : label}"</div>
          <button disabled={i <= 0} onClick={() => move(-1)}>
            ◀ Left
          </button>
          <button disabled={i < 0 || i >= props.shown.length - 1} onClick={() => move(1)}>
            Right ▶
          </button>
        </div>
      )}
      <div className="col-menu-actions">
        <button onClick={() => props.onChange(DEFAULT_SALE_COLUMNS)}>Reset to default</button>
        <button className="primary" onClick={props.onClose}>
          Done
        </button>
      </div>
    </div>
  )
}
