import type { ReturnRequestLine } from './returns'
import type { PrintJob, PrinterInfo, PrintSettings } from './printing'
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
  /** QuickBooks is on this PC: relay the Web Connector from localhost to the store server */
  qbBridge: boolean
  /** Columns shown on the Sale screen's receipt grid, in order (right-click the grid header to change) */
  saleColumns?: string[]
  /** Printers and what prints where (Settings → Printing) */
  printing?: Partial<PrintSettings>
  /** "I want to…" menu and Home screen buttons for this computer (Settings → Menus); ids from renderer menus.ts */
  menus?: { top?: string[]; home?: string[] }
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
  /** Regular selling price, before sales tax */
  priceCents: number
  /** Average unit cost */
  costCents: number | null
  onHand: number
  /** false = no sales tax on this item */
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
  // --- From QuickBooks POS ---
  msrpCents: number | null
  /** Custom Price 1-4 (price levels) */
  price1Cents: number | null
  price2Cents: number | null
  price3Cents: number | null
  price4Cents: number | null
  /** Other imported columns with data (JSON object of column → value), e.g. Income Account, Unit of Measure 1 */
  extra: string | null
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

export type PaymentMethod = 'cash' | 'card' | 'check'

export const PAYMENT_LABEL: Record<PaymentMethod, string> = { cash: 'Cash', card: 'Card', check: 'Check' }

export interface PaymentInput {
  method: PaymentMethod
  amountCents: number
  /** For card: approval / reference number from the standalone terminal */
  reference?: string
}

export interface SaleRequest {
  /** Stable across retries, including a lost response. */
  requestId: string
  tillName: string
  /** Optional customer / business the sale is for */
  customerId?: number | null
  /** Apply the customer's tax exemption (their Farm Tax ID must be on file and not expired) */
  taxExempt?: boolean
  /** Paying for a work order: fee = estimate fee at drop-off, repair = pick-up, credit = fee toward a new purchase */
  workOrder?: { id: number; mode: 'fee' | 'repair' | 'credit' }
  /** serial: for items with "Use Serial #" (one per line); saved as the customer's unit */
  /** unitPriceCents: price changed at the till for this sale (before tax); omitted = the item's regular price */
  items: { productId: number; qty: number; serial?: string; unitPriceCents?: number }[]
  /** Tax rate picked on the Sale screen (Settings → Taxes); omitted = the store's default */
  taxRateId?: string | null
  /** Ringing up a held receipt: it's marked done when the sale is saved */
  heldId?: number | null
  /** Items coming back (returns / exchanges). A negative total = refund; then payments are negative (money given back). */
  returns?: ReturnRequestLine[]
  payments: PaymentInput[]
}

export interface SaleItem {
  /** sale_items id (used to return it later) */
  id?: number
  /** item | wo (work order line) | credit (estimate fee credit) | return (item coming back, negative) | feekept (part of a refund kept) */
  kind?: 'item' | 'wo' | 'credit' | 'return' | 'feekept'
  /** For a return line: the receipt it came from (null = no receipt), reason, and whether it went back to stock */
  returnOfSaleId?: number | null
  returnReason?: string | null
  restocked?: boolean
  productId: number | null
  /** Item # of the product (for receipts) */
  sku?: string | null
  name: string
  serial?: string | null
  unitPriceCents: number
  qty: number
  lineTotalCents: number
  /** Set when the price was changed at the till: the item's regular price at the time */
  regularPriceCents?: number | null
}

export interface Sale {
  id: number
  createdAt: string
  tillName: string
  totalCents: number
  taxCents: number
  changeCents: number
  customerId: number | null
  customerName: string | null
  taxExempt: boolean
  taxExemptId: string | null
  /** Tax removed because the sale was tax exempt */
  taxExemptCents: number
  workOrderId: number | null
  /** 'added' = tax on top of the prices (v0.3.16+); 'inclusive' = older sale, tax inside the prices */
  taxMode?: 'added' | 'inclusive'
  taxRate?: number | null
  taxRateName?: string | null
  /** Refunded on this sale (returned items, positive number) */
  refundCents?: number
  /** Return made without the original receipt */
  noReceiptReturn?: boolean
  items: SaleItem[]
  payments: PaymentInput[]
}

export interface SaleSummary {
  id: number
  createdAt: string
  tillName: string
  totalCents: number
  customerName: string | null
  /** Has returned items on it */
  hasReturn?: boolean
}

// ----- Customers -------------------------------------------------------------

export interface Customer {
  id: number
  // Customer info
  firstName: string | null
  lastName: string | null
  title: string | null
  company: string | null
  /** Show and search this customer by company name */
  trackAsCompany: boolean
  // Contact info
  phone: string | null
  mobile: string | null
  email: string | null
  okToEmail: boolean
  street: string | null
  street2: string | null
  city: string | null
  region: string | null
  postcode: string | null
  // Customer settings
  /** Customer ID shown on screen (auto-generated, e.g. C000123, if left blank) */
  customerNo: string | null
  altPhone: string | null
  altContact: string | null
  customerType: string | null
  taxExempt: boolean
  /** Farm / tax-exempt certificate number */
  taxExemptId: string | null
  /** Staff have taken a copy of the customer's tax-exempt card */
  taxExemptCardCopied: boolean
  /** Expiry date of the tax-exempt ID (YYYY-MM-DD) */
  taxExemptExpires: string | null
  discountPct: number | null
  acceptCheques: boolean
  // Ship-to address
  shipSameAsBilling: boolean
  shipStreet: string | null
  shipStreet2: string | null
  shipCity: string | null
  shipRegion: string | null
  shipPostcode: string | null
  notes: string | null
  /** Balance owed (negative = credit), carried over from QuickBooks POS "Past Due" */
  pastDueCents: number
  /** QuickBooks POS "Custom Field 1" (often the Farm Tax ID or e.g. DISABLED VET) */
  customField1: string | null
  active: boolean
}

export type CustomerInput = Omit<Customer, 'id'>

export interface CustomerStats {
  saleCount: number
  totalCents: number
  averageCents: number
  lastSaleAt: string | null
}

/** GET /api/customers/:id returns the customer plus statistics and recent receipts */
export interface CustomerDetail {
  customer: Customer
  stats: CustomerStats
  history: SaleSummary[]
}

export type TaxExemptState =
  | { kind: 'none' } // not tax exempt
  | { kind: 'ok'; daysLeft: number | null } // daysLeft null = no expiry recorded
  | { kind: 'expiring'; daysLeft: number } // within 30 days
  | { kind: 'expired'; daysAgo: number }

/** Is this customer's tax-exempt ID current? `today` is YYYY-MM-DD in local time. */
export function taxExemptState(
  c: Pick<Customer, 'taxExempt' | 'taxExemptExpires'>,
  today: string
): TaxExemptState {
  if (!c.taxExempt) return { kind: 'none' }
  if (!c.taxExemptExpires) return { kind: 'ok', daysLeft: null }
  const day = 86_400_000
  const diff = Math.round((Date.parse(c.taxExemptExpires + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / day)
  if (diff < 0) return { kind: 'expired', daysAgo: -diff }
  if (diff <= 30) return { kind: 'expiring', daysLeft: diff }
  return { kind: 'ok', daysLeft: diff }
}

/** Display name: "Company" for businesses, otherwise "First Last" */
export function customerDisplayName(c: Pick<Customer, 'firstName' | 'lastName' | 'company' | 'trackAsCompany'>): string {
  const person = [c.firstName, c.lastName].filter(Boolean).join(' ')
  if (c.trackAsCompany && c.company) return c.company
  return person || c.company || '(no name)'
}

export interface DailyReport {
  date: string
  saleCount: number
  totalCents: number
  taxCents: number
  cashCents: number
  cardCents: number
  /** Checks taken (net of check refunds) */
  checkCents?: number
  /** Tax-exempt sales today and the tax removed on them */
  taxExemptCount: number
  taxExemptCents: number
  /** Sales with returned items, and the total refunded for those items */
  refundCount?: number
  refundCents?: number
}

/** A sales tax rate the store can charge (Settings → Taxes) */
export interface TaxRate {
  id: string
  name: string
  /** Fraction, e.g. 0.07975 for 7.975% */
  rate: number
}

export const taxRateLabel = (t: Pick<TaxRate, 'name' | 'rate'>) => `${t.name} ${Math.round(t.rate * 100000) / 1000}%`

export interface StoreSettings {
  storeName: string
  /** The default tax rate (same as the default entry in taxRates) */
  taxRate: number
  /** All tax rates; the Sale screen can pick one per sale */
  taxRates?: TaxRate[]
  defaultTaxRateId?: string
  receiptFooter: string
  /** Postal address (required in marketing emails) */
  storeAddress: string
  /** Message under the logo on the customer kiosk (iPad) */
  kioskWelcome: string
  /** True when a store logo has been uploaded (served at /kiosk/logo) */
  hasLogo: boolean
  /** Where staff feedback / enhancement requests are emailed */
  feedbackEmail?: string
}

// ----- Customer kiosk (iPad) -------------------------------------------------

export interface KioskInfo {
  id: number
  name: string
  /** Till this kiosk belongs to (matches the till's computer name) */
  tillName: string
  online: boolean
  pairedAt: string
}

export type KioskSessionStatus = 'waiting' | 'submitted' | 'cancelled' | 'expired'

/** A "please fill in your details" request sent from a till to a kiosk */
export interface KioskSession {
  id: string
  kioskId: number
  kioskName: string
  tillName: string
  status: KioskSessionStatus
  /** Set once the customer has submitted */
  customer: Customer | null
  /** True when the details matched an existing customer instead of creating one */
  matchedExisting: boolean
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
  /** Printers installed on this computer */
  listPrinters(): Promise<PrinterInfo[]>
  /** Print silently to a chosen printer */
  print(job: PrintJob): Promise<void>
  listReleases(): Promise<ReleaseInfo[]>
  installRelease(tag: string): Promise<void>
  onUpdateEvent(cb: (e: UpdateEvent) => void): () => void
}
