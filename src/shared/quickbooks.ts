// QuickBooks Desktop sync: shapes shared by the server and the QuickBooks screen.

export type QbMethod = 'cash' | 'card' | 'check'
export const QB_METHODS: QbMethod[] = ['cash', 'card', 'check']

/** How DiamondPOS posts into QuickBooks (set on the QuickBooks screen) */
export interface QbConfig {
  enabled: boolean
  /** Web Connector login (the password is shown on the QuickBooks screen) */
  username: string
  password: string
  /** Days before this date are never sent (YYYY-MM-DD) */
  startDate: string
  /** QuickBooks customer used only when a sale has no selected customer */
  customerName: string
  /** QuickBooks sales tax item (e.g. "State Sales Tax") */
  salesTaxItem: string
  /** QuickBooks sales tax codes for taxable / non-taxable lines */
  taxableCode: string
  nonTaxableCode: string
  /** Income account per DiamondPOS department ('' key = items with no department) */
  departmentAccounts: Record<string, string>
  /** Used for any department without its own account */
  defaultIncomeAccount: string
  /** Where each payment type is deposited, and the QuickBooks payment method name */
  methods: Record<QbMethod, { depositAccount: string; paymentMethod: string }>
  /** Pull lists (accounts, tax items…) from QuickBooks on the next sync */
  refreshLists: boolean
}

export interface QbAccount {
  name: string
  type: string // e.g. Income, Bank, OtherCurrentAsset
}

/** Reference lists read from QuickBooks, used for the mapping drop-downs */
export interface QbLists {
  companyName: string
  fetchedAt: string | null
  accounts: QbAccount[]
  salesTaxItems: { name: string; rate: number | null }[]
  salesTaxCodes: { name: string; taxable: boolean }[]
  paymentMethods: string[]
  /** Other Charge items (DiamondPOS creates "POS …" items here) */
  otherChargeItems: string[]
  customerExists: boolean
}

export interface QbExport {
  saleId?: number
  customerName?: string
  id: number
  saleDate: string
  method: QbMethod
  refNumber: string
  totalCents: number
  saleCount: number
  /** manual = refund, zero total, split payment, or legacy overlap: reconcile in QuickBooks by hand */
  status: 'pending' | 'sent' | 'error' | 'manual'
  txnId: string | null
  error: string | null
  attempts: number
  sentAt: string | null
}

export interface QbLogEntry {
  at: string
  level: 'info' | 'warn' | 'error'
  message: string
}

export interface QbStatus {
  config: QbConfig
  lists: QbLists
  /** Problems that stop sales being sent (empty = ready) */
  missing: string[]
  departments: string[]
  lastContact: string | null
  syncing: boolean
}

/** One line of a daily summary Sales Receipt */
export interface QbSummaryLine {
  description?: string
  department: string // '' = no department
  itemName: string // QuickBooks Other Charge item, e.g. "POS Feed"
  account: string
  taxable: boolean
  amountCents: number
}

/** The Sales Receipt DiamondPOS will create for one day + payment method */
export interface QbDailySummary {
  saleId?: number
  customerId?: number | null
  customerName?: string
  manualReason?: string
  saleDate: string
  method: QbMethod
  refNumber: string
  saleCount: number
  firstSaleId: number
  lastSaleId: number
  taxExemptCount: number
  totalCents: number
  taxCents: number
  /** Difference between our tax and QuickBooks' rate × taxable total (posted on a rounding line) */
  roundingCents: number
  lines: QbSummaryLine[]
}

/** QuickBooks item names are limited to 31 characters */
export function qbItemName(department: string): string {
  return (department ? `POS ${department}` : 'POS General').slice(0, 31)
}
export const QB_ROUNDING_ITEM = 'POS Tax Rounding'

/** Sales Receipt No. (max 11 characters in QuickBooks), e.g. POS261105C */
export function qbRefNumber(saleDate: string, method: QbMethod): string {
  return `POS${saleDate.slice(2, 4)}${saleDate.slice(5, 7)}${saleDate.slice(8, 10)}${method === 'cash' ? 'C' : method === 'check' ? 'K' : 'D'}`
}
