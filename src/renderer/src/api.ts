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
  qbLog: () => request<QbLogEntry[]>('GET', '/api/qb/log'),

  createSale: (s: SaleRequest) => request<Sale>('POST', '/api/sales', s),
  getSale: (id: number) => request<Sale>('GET', `/api/sales/${id}`),
  listSales: (date: string) => request<SaleSummary[]>('GET', `/api/sales?date=${date}`),
  dailyReport: (date: string) => request<DailyReport>('GET', `/api/reports/daily?date=${date}`)
}
