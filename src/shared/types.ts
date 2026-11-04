// Data shapes shared between the server, the Electron main process and the UI.
// Money is always stored as whole cents (integers) to avoid rounding errors.

export type AppMode = 'server' | 'till'
export type UpdateChannel = 'stable' | 'beta'

/** Saved per-computer in %APPDATA%/Store POS/pos-config.json */
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

export interface Product {
  id: number
  sku: string | null
  barcode: string | null
  name: string
  priceCents: number
  active: boolean
}

export type ProductInput = Omit<Product, 'id'>

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
