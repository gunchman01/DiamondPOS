import type { HeldReceipt, HeldReceiptInput, HeldSummary } from '../../shared/held'
import type { PrintDesigns } from '../../shared/printDesigns'
import type { CustomerReceipt, ReturnableSale } from '../../shared/returns'
import type { Feedback, FeedbackInput } from '../../shared/feedback'
// Small HTTP client the UI uses to talk to the store server.
import type {
  DailyReport,
  Health,
  Product,
  ProductInput,
  Sale,
  SaleRequest,
  SaleSummary,
  StoreSettings,
  ImportSummary,
  Customer,
  CustomerDetail,
  CustomerInput,
  KioskInfo,
  KioskSession
} from '../../shared/types'
import type { ImportItem } from '../../shared/itemImport'
import type { QbConfig, QbDailySummary, QbExport, QbLogEntry, QbStatus } from '../../shared/quickbooks'
import type {
  Audience,
  AudienceOptions,
  AudienceResult,
  Campaign,
  CampaignInput,
  CampaignSend,
  SmtpSettings,
  SmtpSettingsView
} from '../../shared/marketing'
import type {
  CustomerUnit,
  CustomerUnitInput,
  WoLineInput,
  WoSettings,
  WoStatus,
  WoSummary,
  WorkOrder
} from '../../shared/workorders'

let baseUrl = ''
let apiKey = ''

/** Base URL of the store server, e.g. http://192.168.1.20:4580 */
export function serverBaseUrl(): string {
  return baseUrl
}

export function configureApi(url: string, key: string): void {
  baseUrl = url.replace(/\/+$/, '')
  apiKey = key
}

async function request<T>(method: string, path: string, body?: unknown, base = baseUrl, key = apiKey): Promise<T> {
  let res: Response
  try {
    res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(8000)
    })
  } catch {
    throw new Error('Cannot reach the store server. Check the network and that the server PC is running.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Server error ${res.status}`)
  return data as T
}

export const api = {
  health: () => request<Health>('GET', '/api/health'),
  /** Used by the setup screen before the till is configured */
  testConnection: (url: string, key: string) =>
    request<StoreSettings>('GET', '/api/settings', undefined, url.replace(/\/+$/, ''), key),

  getSettings: () => request<StoreSettings>('GET', '/api/settings'),
  saveSettings: (s: Partial<StoreSettings>) => request<StoreSettings>('PUT', '/api/settings', s),

  listProducts: (search = '', includeInactive = false) =>
    request<Product[]>(
      'GET',
      `/api/products?search=${encodeURIComponent(search)}${includeInactive ? '&includeInactive=1' : ''}`
    ),
  /** Every item including inactive ones, no limit (for Export to Excel) */
  listAllProducts: () => request<Product[]>('GET', '/api/products?includeInactive=1&all=1'),
  listQuickPicks: () => request<Product[]>('GET', '/api/products?quickPick=1'),
  lookupProduct: (code: string) => request<Product>('GET', `/api/products/lookup/${encodeURIComponent(code)}`),
  createProduct: (p: ProductInput) => request<Product>('POST', '/api/products', p),
  updateProduct: (id: number, p: ProductInput) => request<Product>('PUT', `/api/products/${id}`, p),
  importProducts: (items: ImportItem[], opts: { dryRun: boolean; updateExisting: boolean }) =>
    request<ImportSummary>('POST', '/api/products/import', { items, ...opts }),

  listCustomers: (search = '', includeInactive = false) =>
    request<Customer[]>(
      'GET',
      `/api/customers?search=${encodeURIComponent(search)}${includeInactive ? '&includeInactive=1' : ''}`
    ),
  getCustomer: (id: number) => request<CustomerDetail>('GET', `/api/customers/${id}`),
  createCustomer: (c: CustomerInput) => request<Customer>('POST', '/api/customers', c),
  updateCustomer: (id: number, c: CustomerInput) => request<Customer>('PUT', `/api/customers/${id}`, c),

  // Customer kiosk (iPad)
  listKiosks: () => request<KioskInfo[]>('GET', '/api/kiosks'),
  pairKiosk: (code: string, name: string, tillName: string) =>
    request<KioskInfo>('POST', '/api/kiosks/pair', { code, name, tillName }),
  updateKiosk: (id: number, changes: { name?: string; tillName?: string }) =>
    request<KioskInfo>('PUT', `/api/kiosks/${id}`, changes),
  removeKiosk: (id: number) => request<{ ok: boolean }>('POST', `/api/kiosks/${id}/remove`),
  setLogo: (dataUrl: string | null) => request<StoreSettings>('PUT', '/api/settings/logo', { dataUrl }),
  startKioskSession: (tillName: string) => request<KioskSession>('POST', '/api/kiosk-sessions', { tillName }),
  getKioskSession: (id: string) => request<KioskSession>('GET', `/api/kiosk-sessions/${id}`),
  cancelKioskSession: (id: string) => request<{ ok: boolean }>('POST', `/api/kiosk-sessions/${id}/cancel`),

  // Work orders + customer units
  woSettings: () => request<WoSettings>('GET', '/api/workorders/settings'),
  woSaveSettings: (st: Partial<WoSettings>) => request<WoSettings>('PUT', '/api/workorders/settings', st),
  units: (customerId: number) => request<CustomerUnit[]>('GET', `/api/customers/${customerId}/units`),
  addUnit: (customerId: number, u: Partial<CustomerUnitInput>) =>
    request<CustomerUnit>('POST', `/api/customers/${customerId}/units`, u),
  updateUnit: (id: number, u: Partial<CustomerUnitInput>) => request<CustomerUnit>('PUT', `/api/units/${id}`, u),
  woList: (status: string, search = '') =>
    request<WoSummary[]>('GET', `/api/workorders?status=${status}&search=${encodeURIComponent(search)}`),
  woCounts: () => request<Record<WoStatus, number>>('GET', '/api/workorders/counts'),
  wo: (id: number) => request<WorkOrder>('GET', `/api/workorders/${id}`),
  woCreate: (b: { customerId: number; unitId: number; problem: string; hoursIn: number | null; by: string; noFee?: boolean }) =>
    request<WorkOrder>('POST', '/api/workorders', b),
  woUpdate: (id: number, b: Partial<Pick<WorkOrder, 'problem' | 'diagnosis' | 'workDone' | 'internalNotes' | 'hoursIn'>>) =>
    request<WorkOrder>('PUT', `/api/workorders/${id}`, b),
  woStatus: (id: number, status: WoStatus, by: string) => request<WorkOrder>('POST', `/api/workorders/${id}/status`, { status, by }),
  woAddLine: (id: number, l: Partial<WoLineInput>) => request<WorkOrder>('POST', `/api/workorders/${id}/lines`, l),
  woUpdateLine: (id: number, lineId: number, l: Partial<WoLineInput>) =>
    request<WorkOrder>('PUT', `/api/workorders/${id}/lines/${lineId}`, l),
  woRemoveLine: (id: number, lineId: number) => request<WorkOrder>('POST', `/api/workorders/${id}/lines/${lineId}/remove`),
  woEmailPreview: (id: number) => request<{ subject: string; html: string; text: string }>('GET', `/api/workorders/${id}/email-preview`),
  woEmail: (id: number, by: string) => request<WorkOrder>('POST', `/api/workorders/${id}/email`, { by }),
  woPickupNotFixed: (id: number, by: string) => request<WorkOrder>('POST', `/api/workorders/${id}/pickup-not-fixed`, { by }),

  // Marketing mailers
  mkOptions: () => request<AudienceOptions>('GET', '/api/marketing/options'),
  mkAudience: (audience: Audience) => request<AudienceResult>('POST', '/api/marketing/audience', { audience }),
  mkCampaigns: () => request<Campaign[]>('GET', '/api/marketing/campaigns'),
  mkCampaign: (id: number) => request<Campaign>('GET', `/api/marketing/campaigns/${id}`),
  mkCreate: (c: CampaignInput) => request<Campaign>('POST', '/api/marketing/campaigns', c),
  mkUpdate: (id: number, c: CampaignInput) => request<Campaign>('PUT', `/api/marketing/campaigns/${id}`, c),
  mkCopy: (id: number) => request<Campaign>('POST', `/api/marketing/campaigns/${id}/copy`),
  mkRemove: (id: number) => request<{ ok: boolean }>('POST', `/api/marketing/campaigns/${id}/remove`),
  mkTest: (id: number, email: string) => request<{ ok: boolean }>('POST', `/api/marketing/campaigns/${id}/test`, { email }),
  mkSend: (id: number) => request<Campaign>('POST', `/api/marketing/campaigns/${id}/send`),
  mkCancel: (id: number) => request<Campaign>('POST', `/api/marketing/campaigns/${id}/cancel`),
  mkSends: (id: number) => request<CampaignSend[]>('GET', `/api/marketing/campaigns/${id}/sends`),
  mkSmtp: () => request<SmtpSettingsView>('GET', '/api/marketing/smtp'),
  mkSaveSmtp: (s: Partial<SmtpSettings>) => request<SmtpSettingsView>('PUT', '/api/marketing/smtp', s),
  mkSmtpTest: (email: string) => request<{ ok: boolean }>('POST', '/api/marketing/smtp/test', { email }),

  // QuickBooks Desktop sync
  qbStatus: () => request<QbStatus>('GET', '/api/qb/status'),
  qbSaveConfig: (c: Partial<QbConfig>) => request<QbStatus>('PUT', '/api/qb/config', c),
  qbRefreshLists: () => request<QbStatus>('POST', '/api/qb/refresh-lists'),
  qbNewPassword: () => request<QbStatus>('POST', '/api/qb/new-password'),
  qbConnectorFile: (via: 'direct' | 'bridge') =>
    request<{ fileName: string; xml: string }>('GET', `/api/qb/qwc?via=${via}`),
  qbPreview: (date: string) =>
    request<{ summaries: QbDailySummary[]; qbTaxRate: number | null }>('GET', `/api/qb/preview?date=${date}`),
  qbExports: () => request<QbExport[]>('GET', '/api/qb/exports'),
  qbRetry: (id: number) => request<QbExport[]>('POST', `/api/qb/exports/${id}/retry`),
  qbManualDone: (id: number) => request<QbExport[]>('POST', `/api/qb/exports/${id}/manual-done`),
  qbLog: () => request<QbLogEntry[]>('GET', '/api/qb/log'),

  createSale: (s: SaleRequest) => request<Sale>('POST', '/api/sales', s),
  getSale: (id: number) => request<Sale>('GET', `/api/sales/${id}`),
  listSales: (date: string) => request<SaleSummary[]>('GET', `/api/sales?date=${date}`),
  heldList: () => request<HeldSummary[]>('GET', '/api/held'),
  heldCount: () => request<number>('GET', '/api/held/count'),
  held: (id: number) => request<HeldReceipt>('GET', `/api/held/${id}`),
  holdSale: (h: HeldReceiptInput) => request<HeldReceipt>('POST', '/api/held', h),
  updateHeld: (id: number, h: HeldReceiptInput) => request<HeldReceipt>('PUT', `/api/held/${id}`, h),
  deleteHeld: (id: number) => request<{ ok: boolean }>('DELETE', `/api/held/${id}`),
  printDesigns: () => request<PrintDesigns>('GET', '/api/print-designs'),
  savePrintDesigns: (d: PrintDesigns) => request<PrintDesigns>('PUT', '/api/print-designs', d),
  feedbackList: () => request<Feedback[]>('GET', '/api/feedback'),
  sendFeedback: (f: FeedbackInput) => request<Feedback>('POST', '/api/feedback', f),
  resendFeedback: (id: number) => request<Feedback>('POST', `/api/feedback/${id}/resend`),
  returnable: (saleId: number) => request<ReturnableSale>('GET', `/api/sales/${saleId}/returnable`),
  customerReceipts: (customerId: number) => request<CustomerReceipt[]>('GET', `/api/customers/${customerId}/receipts`),
  dailyReport: (date: string) => request<DailyReport>('GET', `/api/reports/daily?date=${date}`)
}
