/**
 * Print designs shared by every till (saved on the Store Server):
 *  - Label templates for tags: elements placed anywhere on the label (inches from the top-left corner)
 *  - The receipt layout: which blocks print, in what order, and how they look
 */
import type { Product, StoreSettings } from './types'

// ---------------------------------------------------------------- Labels

/** What a label element shows */
export type LabelField =
  | 'name'
  | 'description'
  | 'price'
  | 'sku'
  | 'upc'
  | 'alu'
  | 'department'
  | 'manufacturer'
  | 'vendor'
  | 'size'
  | 'attribute'
  | 'unit'
  | 'store'
  | 'text'

export const LABEL_FIELDS: { field: LabelField; label: string }[] = [
  { field: 'name', label: 'Item name' },
  { field: 'price', label: 'Price' },
  { field: 'description', label: 'Item details' },
  { field: 'sku', label: 'Item #' },
  { field: 'upc', label: 'UPC' },
  { field: 'alu', label: 'ALU' },
  { field: 'department', label: 'Department' },
  { field: 'manufacturer', label: 'Manufacturer' },
  { field: 'vendor', label: 'Vendor' },
  { field: 'size', label: 'Size' },
  { field: 'attribute', label: 'Attribute' },
  { field: 'unit', label: 'Unit' },
  { field: 'store', label: 'Store name' },
  { field: 'text', label: 'Your own text' }
]

/** Which code a barcode element encodes */
export type BarcodeSource = 'upc' | 'sku' | 'alu'

export interface LabelElement {
  id: string
  kind: 'text' | 'barcode' | 'line'
  /** text elements */
  field: LabelField
  /** for field 'text' */
  text: string
  /** barcode elements */
  barcodeOf: BarcodeSource
  /** print the code under the bars */
  showCode: boolean
  // position and size in inches from the top-left of the label
  x: number
  y: number
  w: number
  h: number
  fontPt: number
  bold: boolean
  align: 'left' | 'center' | 'right'
}

export interface LabelTemplate {
  id: string
  name: string
  widthIn: number
  heightIn: number
  elements: LabelElement[]
}

// ---------------------------------------------------------------- Receipt

export type ReceiptBlockType =
  | 'logo'
  | 'storeName'
  | 'address'
  | 'title'
  | 'saleInfo'
  | 'customer'
  | 'items'
  | 'totals'
  | 'taxExempt'
  | 'payments'
  | 'barcode'
  | 'signature'
  | 'footer'
  | 'text'
  | 'divider'

export const RECEIPT_BLOCKS: { type: ReceiptBlockType; label: string; help: string }[] = [
  { type: 'logo', label: 'Store logo', help: 'The logo uploaded under Customer Kiosk' },
  { type: 'storeName', label: 'Store name', help: '' },
  { type: 'address', label: 'Store address', help: 'From Settings → Store' },
  { type: 'title', label: 'REFUND / EXCHANGE title', help: 'Only prints on refunds and exchanges' },
  { type: 'saleInfo', label: 'Receipt #, date and till', help: '' },
  { type: 'customer', label: 'Customer', help: 'Only when a customer is on the sale' },
  { type: 'items', label: 'Items', help: 'Everything sold or returned' },
  { type: 'totals', label: 'Total and tax', help: '' },
  { type: 'taxExempt', label: 'Tax exempt / Farm Tax ID', help: 'Only on tax-exempt sales' },
  { type: 'payments', label: 'Payments and change', help: '' },
  { type: 'barcode', label: 'Receipt barcode', help: 'Scan it on the Return screen to find the sale' },
  { type: 'signature', label: 'Signature line', help: 'Prints on refunds and exchanges, or always' },
  { type: 'footer', label: 'Receipt footer', help: 'From Settings → Store' },
  { type: 'text', label: 'Your own text', help: 'e.g. return policy, website, hours' },
  { type: 'divider', label: 'Dashed line', help: '' }
]

export interface ReceiptBlock {
  id: string
  type: ReceiptBlockType
  on: boolean
  align: 'left' | 'center' | 'right'
  fontPt: number
  bold: boolean
  /** 'text' blocks */
  text: string
  /** 'logo': width as a % of the paper */
  widthPct: number
  /** 'items': extra details on each line */
  showSku: boolean
  showUnitPrice: boolean
  showSerial: boolean
  /** 'signature': print on every sale (not just refunds / exchanges) */
  always: boolean
}

export interface ReceiptLayout {
  blocks: ReceiptBlock[]
  /** Base font for the receipt */
  font: 'mono' | 'sans'
}

export interface PrintDesigns {
  labels: LabelTemplate[]
  receipt: ReceiptLayout
}

// ---------------------------------------------------------------- Defaults

let n = 0
export const newId = (p: string) => `${p}${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 5)}`

export function labelElement(kind: LabelElement['kind'], c: Partial<LabelElement> = {}): LabelElement {
  return {
    id: newId('e'),
    kind,
    field: 'name',
    text: '',
    barcodeOf: 'upc',
    showCode: true,
    x: 0.1,
    y: 0.1,
    w: 1,
    h: kind === 'line' ? 0.02 : 0.25,
    fontPt: 9,
    bold: false,
    align: 'center',
    ...c
  }
}

export function receiptBlock(type: ReceiptBlockType, c: Partial<ReceiptBlock> = {}): ReceiptBlock {
  const big = type === 'storeName' || type === 'title'
  return {
    id: newId('b'),
    type,
    on: true,
    align: ['items', 'totals', 'payments', 'taxExempt', 'signature'].includes(type) ? 'left' : 'center',
    fontPt: big ? 12 : 9,
    bold: big,
    text: '',
    widthPct: 60,
    showSku: false,
    showUnitPrice: false,
    showSerial: true,
    always: false,
    ...c
  }
}

export const DEFAULT_PRICE_TAG_ID = 'tag-price'
export const DEFAULT_NO_PRICE_TAG_ID = 'tag-noprice'

export function defaultDesigns(): PrintDesigns {
  return {
    labels: [
      {
        id: DEFAULT_PRICE_TAG_ID,
        name: 'Price tag',
        widthIn: 2.25,
        heightIn: 1.25,
        elements: [
          labelElement('text', { field: 'store', x: 0.05, y: 0.03, w: 2.15, h: 0.15, fontPt: 6 }),
          labelElement('text', { field: 'name', x: 0.05, y: 0.18, w: 2.15, h: 0.3, fontPt: 8, bold: true }),
          labelElement('text', { field: 'price', x: 0.05, y: 0.48, w: 2.15, h: 0.3, fontPt: 18, bold: true }),
          labelElement('barcode', { barcodeOf: 'upc', x: 0.2, y: 0.8, w: 1.85, h: 0.4 })
        ]
      },
      {
        id: DEFAULT_NO_PRICE_TAG_ID,
        name: 'Part / bin label (no price)',
        widthIn: 2.25,
        heightIn: 1.25,
        elements: [
          labelElement('text', { field: 'sku', x: 0.05, y: 0.04, w: 2.15, h: 0.28, fontPt: 14, bold: true }),
          labelElement('text', { field: 'name', x: 0.05, y: 0.33, w: 2.15, h: 0.36, fontPt: 8 }),
          labelElement('barcode', { barcodeOf: 'sku', x: 0.2, y: 0.72, w: 1.85, h: 0.48 })
        ]
      }
    ],
    receipt: {
      font: 'mono',
      blocks: [
        receiptBlock('logo', { on: false }),
        receiptBlock('storeName'),
        receiptBlock('address', { on: false }),
        receiptBlock('title'),
        receiptBlock('saleInfo'),
        receiptBlock('customer'),
        receiptBlock('divider'),
        receiptBlock('items'),
        receiptBlock('divider'),
        receiptBlock('totals'),
        receiptBlock('taxExempt'),
        receiptBlock('payments'),
        receiptBlock('signature'),
        receiptBlock('divider'),
        receiptBlock('footer'),
        receiptBlock('barcode', { on: false })
      ]
    }
  }
}

// ---------------------------------------------------------------- Checking saved data

const num = (v: unknown, d: number, min: number, max: number) => {
  const x = Number(v)
  return Number.isFinite(x) ? Math.min(max, Math.max(min, Math.round(x * 1000) / 1000)) : d
}
const str = (v: unknown, max: number) => String(v ?? '').slice(0, max)
const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d)
const ALIGN = ['left', 'center', 'right'] as const
const FIELDS = LABEL_FIELDS.map((f) => f.field)
const BLOCKS = RECEIPT_BLOCKS.map((b) => b.type)

/** Clean up designs sent by a till (or read from the database) so bad values can't break printing */
export function normaliseDesigns(input: unknown): PrintDesigns {
  const d = defaultDesigns()
  const src = (input && typeof input === 'object' ? input : {}) as Partial<PrintDesigns>
  const labels = Array.isArray(src.labels)
    ? src.labels.slice(0, 30).map((t, i): LabelTemplate => {
        const w = num(t?.widthIn, 2.25, 0.5, 8)
        const h = num(t?.heightIn, 1.25, 0.3, 8)
        return {
          id: str(t?.id, 40) || newId('t'),
          name: str(t?.name, 60) || `Label ${i + 1}`,
          widthIn: w,
          heightIn: h,
          elements: (Array.isArray(t?.elements) ? t.elements : []).slice(0, 40).map((e) => {
            const base = labelElement(pick(e?.kind, ['text', 'barcode', 'line'] as const, 'text'))
            return {
              ...base,
              id: str(e?.id, 40) || base.id,
              field: pick(e?.field, FIELDS, 'name'),
              text: str(e?.text, 200),
              barcodeOf: pick(e?.barcodeOf, ['upc', 'sku', 'alu'] as const, 'upc'),
              showCode: e?.showCode !== false,
              x: num(e?.x, 0, 0, w),
              y: num(e?.y, 0, 0, h),
              w: num(e?.w, 1, 0.05, w),
              h: num(e?.h, 0.25, 0.01, h),
              fontPt: num(e?.fontPt, 9, 4, 72),
              bold: e?.bold === true,
              align: pick(e?.align, ALIGN, 'center')
            }
          })
        }
      })
    : d.labels
  const r = (src.receipt ?? {}) as Partial<ReceiptLayout>
  const blocks = Array.isArray(r.blocks)
    ? r.blocks.slice(0, 40).map((b) => {
        const type = pick(b?.type, BLOCKS, 'text')
        const base = receiptBlock(type)
        return {
          ...base,
          id: str(b?.id, 40) || base.id,
          on: b?.on !== false,
          align: pick(b?.align, ALIGN, base.align),
          fontPt: num(b?.fontPt, base.fontPt, 6, 30),
          bold: b?.bold === true,
          text: str(b?.text, 1000),
          widthPct: num(b?.widthPct, 60, 10, 100),
          showSku: b?.showSku === true,
          showUnitPrice: b?.showUnitPrice === true,
          showSerial: b?.showSerial !== false,
          always: b?.always === true
        }
      })
    : d.receipt.blocks
  return { labels: labels.length ? labels : d.labels, receipt: { blocks, font: pick(r.font, ['mono', 'sans'] as const, 'mono') } }
}

/** The text a label field shows for an item */
export function labelFieldValue(
  e: Pick<LabelElement, 'field' | 'text'>,
  p: Partial<Product>,
  store: Pick<StoreSettings, 'storeName'>,
  money: (c: number) => string
): string {
  switch (e.field) {
    case 'name':
      return p.name ?? ''
    case 'description':
      return p.description ?? ''
    case 'price':
      return p.priceCents ? money(p.priceCents) : ''
    case 'sku':
      return p.sku ?? ''
    case 'upc':
      return p.barcode ?? ''
    case 'alu':
      return p.alu ?? ''
    case 'department':
      return p.department ?? ''
    case 'manufacturer':
      return p.manufacturer ?? ''
    case 'vendor':
      return p.vendor ?? ''
    case 'size':
      return p.size ?? ''
    case 'attribute':
      return p.attribute ?? ''
    case 'unit':
      return p.unitOfMeasure ?? ''
    case 'store':
      return store.storeName
    case 'text':
      return e.text
  }
}

/** Code a barcode element encodes (falls back to Item # / UPC when the chosen one is empty) */
export function barcodeValue(src: BarcodeSource, p: Partial<Product>): string {
  const v = src === 'upc' ? p.barcode : src === 'alu' ? p.alu : p.sku
  return (v || p.barcode || p.sku || '').trim()
}
