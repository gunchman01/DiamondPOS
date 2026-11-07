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
  // work order labels
  | 'woNumber'
  | 'woCustomer'
  | 'woPhone'
  | 'woDate'
  | 'woUnit'
  | 'woSerial'
  | 'woProblem'

/** Fields for work order labels (stuck on a unit at check-in) */
export const WO_LABEL_FIELDS: { field: LabelField; label: string }[] = [
  { field: 'woCustomer', label: 'Customer name' },
  { field: 'woNumber', label: 'Work order #' },
  { field: 'woDate', label: 'Date checked in' },
  { field: 'woUnit', label: 'Unit (brand, model, type)' },
  { field: 'woSerial', label: 'Unit serial #' },
  { field: 'woPhone', label: 'Customer phone' },
  { field: 'woProblem', label: "What's wrong" },
  { field: 'store', label: 'Store name' },
  { field: 'text', label: 'Your own text' }
]

/** What a work order label prints */
export interface WoLabelData {
  number: string
  customerName: string
  phone: string
  checkedIn: string
  unit: string
  serial: string
  problem: string
}

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
export type BarcodeSource = 'upc' | 'sku' | 'alu' | 'wo'

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
  /** item = price tags / part labels; workorder = label stuck on a unit at check-in */
  kind: 'item' | 'workorder'
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

/** What a free-placed receipt element shows (top and bottom of the receipt) */
export type ReceiptField =
  | 'storeName'
  | 'address'
  | 'title'
  | 'saleInfo'
  | 'receiptNo'
  | 'dateTime'
  | 'till'
  | 'customer'
  | 'footer'
  | 'text'
  | 'signature'

export const RECEIPT_FIELDS: { field: ReceiptField; label: string }[] = [
  { field: 'storeName', label: 'Store name' },
  { field: 'address', label: 'Store address' },
  { field: 'saleInfo', label: 'Receipt #, date and till' },
  { field: 'receiptNo', label: 'Receipt #' },
  { field: 'dateTime', label: 'Date and time' },
  { field: 'till', label: 'Till name' },
  { field: 'customer', label: 'Customer' },
  { field: 'title', label: 'REFUND / EXCHANGE title' },
  { field: 'footer', label: 'Receipt footer (Settings → Store)' },
  { field: 'signature', label: 'Signature line' },
  { field: 'text', label: 'Your own text' }
]

/** An element placed on the top or bottom area of the receipt. x / w are % of the paper width; y / h are mm. */
export interface ReceiptElement {
  id: string
  kind: 'text' | 'logo' | 'barcode' | 'line'
  field: ReceiptField
  text: string
  x: number
  w: number
  y: number
  h: number
  fontPt: number
  bold: boolean
  align: 'left' | 'center' | 'right'
  /** Signature line: only on refunds and exchanges */
  onlyRefund: boolean
}

export interface ReceiptZone {
  heightMm: number
  elements: ReceiptElement[]
}

export interface ReceiptLayout {
  version: 2
  /** Top of the receipt: elements dragged into place */
  header: ReceiptZone
  /** Middle: items, totals and payments, which grow with the sale */
  blocks: ReceiptBlock[]
  /** Bottom of the receipt: elements dragged into place */
  footer: ReceiptZone
  /** Base font for the receipt */
  font: 'mono' | 'sans'
}

/** Middle blocks (they flow, because their length changes with every sale) */
export const MIDDLE_BLOCKS: ReceiptBlockType[] = ['items', 'totals', 'taxExempt', 'payments', 'divider', 'text']

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

export function receiptElement(kind: ReceiptElement['kind'], c: Partial<ReceiptElement> = {}): ReceiptElement {
  return {
    id: newId('r'),
    kind,
    field: 'text',
    text: '',
    x: 0,
    w: 100,
    y: 0,
    h: kind === 'line' ? 0.4 : kind === 'barcode' ? 10 : kind === 'logo' ? 16 : 5,
    fontPt: 9,
    bold: false,
    align: 'center',
    onlyRefund: true,
    ...c
  }
}

export function defaultReceiptZones(): { header: ReceiptZone; footer: ReceiptZone } {
  return {
    header: {
      heightMm: 36,
      elements: [
        receiptElement('text', { field: 'storeName', y: 0, h: 7, fontPt: 13, bold: true }),
        receiptElement('text', { field: 'address', y: 7, h: 7, fontPt: 8 }),
        receiptElement('text', { field: 'title', y: 14, h: 5, fontPt: 11, bold: true }),
        receiptElement('text', { field: 'saleInfo', y: 19, h: 12, fontPt: 8 }),
        receiptElement('text', { field: 'customer', y: 31, h: 5, fontPt: 8 })
      ]
    },
    footer: {
      heightMm: 22,
      elements: [
        receiptElement('text', { field: 'signature', y: 2, h: 8, fontPt: 8, align: 'left' }),
        receiptElement('text', { field: 'footer', y: 11, h: 9, fontPt: 8 })
      ]
    }
  }
}

export const DEFAULT_PRICE_TAG_ID = 'tag-price'
export const DEFAULT_WO_LABEL_ID = 'tag-wo'

export function defaultWoLabel(): LabelTemplate {
  return {
    id: DEFAULT_WO_LABEL_ID,
    name: 'Work order label',
    kind: 'workorder',
    widthIn: 2.25,
    heightIn: 1.25,
    elements: [
      labelElement('text', { field: 'woCustomer', x: 0.05, y: 0.03, w: 2.15, h: 0.24, fontPt: 11, bold: true }),
      labelElement('text', { field: 'woNumber', x: 0.05, y: 0.27, w: 1.2, h: 0.22, fontPt: 12, bold: true, align: 'left' }),
      labelElement('text', { field: 'woDate', x: 1.25, y: 0.27, w: 0.95, h: 0.22, fontPt: 8, align: 'right' }),
      labelElement('text', { field: 'woUnit', x: 0.05, y: 0.49, w: 2.15, h: 0.18, fontPt: 7 }),
      labelElement('barcode', { barcodeOf: 'wo', x: 0.2, y: 0.69, w: 1.85, h: 0.52 })
    ]
  }
}
export const DEFAULT_NO_PRICE_TAG_ID = 'tag-noprice'

function defaultMiddle(): ReceiptBlock[] {
  return [
    receiptBlock('divider'),
    receiptBlock('items'),
    receiptBlock('divider'),
    receiptBlock('totals'),
    receiptBlock('taxExempt'),
    receiptBlock('payments'),
    receiptBlock('divider')
  ]
}

export function defaultDesigns(): PrintDesigns {
  return {
    labels: [
      {
        id: DEFAULT_PRICE_TAG_ID,
        name: 'Price tag',
        kind: 'item',
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
        kind: 'item',
        widthIn: 2.25,
        heightIn: 1.25,
        elements: [
          labelElement('text', { field: 'sku', x: 0.05, y: 0.04, w: 2.15, h: 0.28, fontPt: 14, bold: true }),
          labelElement('text', { field: 'name', x: 0.05, y: 0.33, w: 2.15, h: 0.36, fontPt: 8 }),
          labelElement('barcode', { barcodeOf: 'sku', x: 0.2, y: 0.72, w: 1.85, h: 0.48 })
        ]
      },
      defaultWoLabel()
    ],
    receipt: {
      version: 2,
      font: 'mono',
      ...defaultReceiptZones(),
      blocks: defaultMiddle()
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
const FIELDS = [...LABEL_FIELDS, ...WO_LABEL_FIELDS].map((f) => f.field)
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
          kind: pick(t?.kind, ['item', 'workorder'] as const, 'item'),
          widthIn: w,
          heightIn: h,
          elements: (Array.isArray(t?.elements) ? t.elements : []).slice(0, 40).map((e) => {
            const base = labelElement(pick(e?.kind, ['text', 'barcode', 'line'] as const, 'text'))
            return {
              ...base,
              id: str(e?.id, 40) || base.id,
              field: pick(e?.field, FIELDS, 'name'),
              text: str(e?.text, 200),
              barcodeOf: pick(e?.barcodeOf, ['upc', 'sku', 'alu', 'wo'] as const, 'upc'),
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
  const cleanBlock = (b: Partial<ReceiptBlock>) => {
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
  }
  const zones = defaultReceiptZones()
  const cleanZone = (z: Partial<ReceiptZone> | undefined, d: ReceiptZone): ReceiptZone => {
    if (!z || typeof z !== 'object') return d
    const height = num(z.heightMm, d.heightMm, 0, 200)
    return {
      heightMm: height,
      elements: (Array.isArray(z.elements) ? z.elements : []).slice(0, 30).map((e) => {
        const base = receiptElement(pick(e?.kind, ['text', 'logo', 'barcode', 'line'] as const, 'text'))
        const x = num(e?.x, 0, 0, 98)
        const y = num(e?.y, 0, 0, Math.max(0, height - 0.5))
        return {
          ...base,
          id: str(e?.id, 40) || base.id,
          field: pick(e?.field, RECEIPT_FIELDS.map((f) => f.field), 'text'),
          text: str(e?.text, 500),
          x,
          w: num(e?.w, 100, 2, 100 - x),
          y,
          h: num(e?.h, base.h, 0.2, Math.max(0.2, height - y)),
          fontPt: num(e?.fontPt, 9, 5, 40),
          bold: e?.bold === true,
          align: pick(e?.align, ALIGN, 'center'),
          onlyRefund: e?.onlyRefund !== false
        }
      })
    }
  }
  let receipt: ReceiptLayout
  if (r.version === 2 || r.header || r.footer) {
    const blocks = Array.isArray(r.blocks) ? r.blocks.slice(0, 40).map(cleanBlock) : defaultMiddle()
    receipt = {
      version: 2,
      font: pick(r.font, ['mono', 'sans'] as const, 'mono'),
      header: cleanZone(r.header, zones.header),
      footer: cleanZone(r.footer, zones.footer),
      blocks
    }
  } else {
    // Older (v0.3.13) block-only layout: keep its middle blocks, put the standard top and bottom on
    const old = Array.isArray(r.blocks) ? r.blocks.map(cleanBlock).filter((b) => MIDDLE_BLOCKS.includes(b.type)) : []
    receipt = { version: 2, font: pick(r.font, ['mono', 'sans'] as const, 'mono'), ...zones, blocks: old.length ? old : defaultMiddle() }
  }
  const finalLabels = labels.length ? labels : d.labels
  // Older saved designs have no work order label yet: add the standard one
  if (!finalLabels.some((t) => t.kind === 'workorder')) finalLabels.push(defaultWoLabel())
  return { labels: finalLabels, receipt }
}

/** The text a label field shows for an item */
export function labelFieldValue(
  e: Pick<LabelElement, 'field' | 'text'>,
  p: Partial<Product>,
  store: Pick<StoreSettings, 'storeName'>,
  money: (c: number) => string,
  wo?: WoLabelData | null
): string {
  switch (e.field) {
    case 'woNumber':
      return wo?.number ?? ''
    case 'woCustomer':
      return wo?.customerName ?? ''
    case 'woPhone':
      return wo?.phone ?? ''
    case 'woDate':
      return wo?.checkedIn ?? ''
    case 'woUnit':
      return wo?.unit ?? ''
    case 'woSerial':
      return wo?.serial ? `S/N ${wo.serial}` : ''
    case 'woProblem':
      return wo?.problem ?? ''
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
export function barcodeValue(src: BarcodeSource, p: Partial<Product>, wo?: WoLabelData | null): string {
  if (src === 'wo' || wo) return wo?.number ?? ''
  const v = src === 'upc' ? p.barcode : src === 'alu' ? p.alu : p.sku
  return (v || p.barcode || p.sku || '').trim()
}
