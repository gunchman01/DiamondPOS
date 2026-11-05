// Data shapes shared between the server, the Electron main process and the UI.
// Money is always stored as whole cents (integers) to avoid rounding errors.

export type AppMode = 'server' | 'till'
export type UpdateChannel = 'stable' | 'beta'

/** Saved per-computer in %APPDATA%/DiamondPOS/pos-config.json */
export interface AppConfig {
  mode: AppMode | null
  serverUrl: string
  apiKey: string
  tillName: string
  updateChannel: UpdateChannel
}

export interface BootInfo {
  config: AppConfig
  appVersion: string
  isPackaged: boolean
  lanAddresses: string[]
}

export type ItemType = 'inventory' | 'non_inventory' | 'service'

export interface Product {
  id: number
  // --- Basic info ---
  name: string
  type: ItemType
  department: string | null
  description: string | null
  size: string | null
  attribute: string | null
  /** Regular selling price, GST inclusive */
  priceCents: number
  /** Average unit cost */
  costCents: number | null
  onHand: number
  /** false = no GST on this item */
  taxable: boolean
  /** UPC / barcode */
  barcode: string | null
  /** Shown as a button in the Quick Picks panel on the Sale screen */
  quickPick: boolean
  quickPickGroup: string | null
  // --- More info ---
  vendor: string | null
  orderCostCents: number | null
  reorderPoint: number | null
  /** Item No. */
  sku: string | null
  /** Alternate lookup code (also scannable) */
  alu: string | null
  unitOfMeasure: string | null
  manufacturer: string | null
  // --- Misc & shipping ---
  active: boolean
  printTags: boolean
  unorderable: boolean
  useSerial: boolean
  earnCommission: boolean
  earnRewards: boolean
  shipWeight: number | null
  shipHeight: number | null
  shipLength: number | null
  shipWidth: number | null
  comments: string | null
}

export type ProductInput = Omit<Product, 'id'>

/** Result of a bulk item import (or a preview of one) */
export interface ImportRowResult {
  row: number // spreadsheet row number
  name: string
  action: 'create' | 'update' | 'error'
  message?: string
}
export interface ImportSummary {
  dryRun: boolean
  created: number
  updated: number
  errors: number
  results: ImportRowResult[]
}

export type PaymentMethod = 'cash' | 'card'

export interface PaymentInput {
  method: PaymentMethod
  amountCents: number
  /** For card: approval / reference number from the standalone terminal */
  reference?: string
}

export interface SaleRequest {
  tillName: string
  items: { productId: number; qty: number }[]
  payments: PaymentInput[]
}

export interface SaleItem {
  productId: number | null
  name: string
  unitPriceCents: number
  qty: number
  lineTotalCents: number
}

export interface Sale {
  id: number
  createdAt: string
  tillName: string
  totalCents: number
  taxCents: number
  changeCents: number
  items: SaleItem[]
  payments: PaymentInput[]
}

export interface SaleSummary {
  id: number
  createdAt: string
  tillName: string
  totalCents: number
}

export interface DailyReport {
  date: string
  saleCount: number
  totalCents: number
  taxCents: number
  cashCents: number
  cardCents: number
}

export interface StoreSettings {
  storeName: string
  taxRate: number
  receiptFooter: string
}

export interface Health {
  ok: boolean
  serverVersion: string
  schemaVersion: number
  minClientVersion: string
}

export interface ReleaseInfo {
  tag: string
  version: string
  name: string
  notes: string
  publishedAt: string
  prerelease: boolean
}

export type UpdateEvent =
  | { type: 'checking' }
  | { type: 'downloading'; percent: number }
  | { type: 'ready'; version: string }
  | { type: 'error'; message: string }

/** Functions the preload script exposes to the UI as window.pos */
export interface PosBridge {
  getBootInfo(): Promise<BootInfo>
  saveConfig(changes: Partial<AppConfig>): Promise<BootInfo>
  printReceipt(html: string): Promise<void>
  listReleases(): Promise<ReleaseInfo[]>
  installRelease(tag: string): Promise<void>
  onUpdateEvent(cb: (e: UpdateEvent) => void): () => void
}
