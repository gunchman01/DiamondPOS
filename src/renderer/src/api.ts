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
  CustomerInput
} from '../../shared/types'
import type { ImportItem } from '../../shared/itemImport'

let baseUrl = ''
let apiKey = ''

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

  createSale: (s: SaleRequest) => request<Sale>('POST', '/api/sales', s),
  getSale: (id: number) => request<Sale>('GET', `/api/sales/${id}`),
  listSales: (date: string) => request<SaleSummary[]>('GET', `/api/sales?date=${date}`),
  dailyReport: (date: string) => request<DailyReport>('GET', `/api/reports/daily?date=${date}`)
}
