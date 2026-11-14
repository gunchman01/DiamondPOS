/** QuickBooks settings, cached lists, export rows and the sync log (all in the store database). */
import crypto from 'crypto'
import type { DB } from '../db'
import type { QbConfig, QbExport, QbLists, QbLogEntry } from '../../../shared/quickbooks'

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function readJson<T>(db: DB, key: string): Partial<T> {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  try {
    return row ? (JSON.parse(row.value) as Partial<T>) : {}
  } catch {
    return {}
  }
}

function writeJson(db: DB, key: string, value: unknown) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    JSON.stringify(value)
  )
}

export function getQbConfig(db: DB): QbConfig {
  const saved = readJson<QbConfig>(db, 'qb_config')
  const cfg: QbConfig = {
    enabled: saved.enabled ?? false,
    username: saved.username ?? 'diamondpos',
    password: saved.password ?? '',
    startDate: saved.startDate ?? today(),
    customerName: saved.customerName === 'DiamondPOS Daily Sales' ? 'DiamondPOS Walk-in' : saved.customerName ?? 'DiamondPOS Walk-in',
    salesTaxItem: saved.salesTaxItem ?? '',
    taxableCode: saved.taxableCode ?? 'Tax',
    nonTaxableCode: saved.nonTaxableCode ?? 'Non',
    departmentAccounts: saved.departmentAccounts ?? {},
    defaultIncomeAccount: saved.defaultIncomeAccount ?? '',
    methods: {
      cash: { depositAccount: 'Undeposited Funds', paymentMethod: 'Cash', ...(saved.methods?.cash ?? {}) },
      card: { depositAccount: 'Undeposited Funds', paymentMethod: '', ...(saved.methods?.card ?? {}) },
      check: { depositAccount: 'Undeposited Funds', paymentMethod: 'Check', ...(saved.methods?.check ?? {}) }
    },
    refreshLists: saved.refreshLists ?? true
  }
  if (!cfg.password) {
    // First use: create the Web Connector password and remember it
    cfg.password = crypto.randomBytes(9).toString('base64url')
    writeJson(db, 'qb_config', cfg)
  }
  return cfg
}

export function saveQbConfig(db: DB, changes: Partial<QbConfig>): QbConfig {
  const cur = getQbConfig(db)
  const next: QbConfig = {
    ...cur,
    ...changes,
    // never let the UI blank the login
    username: (changes.username ?? cur.username).trim() || cur.username,
    password: cur.password,
    methods: {
      cash: { ...cur.methods.cash, ...(changes.methods?.cash ?? {}) },
      card: { ...cur.methods.card, ...(changes.methods?.card ?? {}) },
      check: { ...cur.methods.check, ...(changes.methods?.check ?? {}) }
    },
    departmentAccounts: changes.departmentAccounts ?? cur.departmentAccounts
  }
  writeJson(db, 'qb_config', next)
  return next
}

export function newQbPassword(db: DB): QbConfig {
  const cfg = getQbConfig(db)
  cfg.password = crypto.randomBytes(9).toString('base64url')
  writeJson(db, 'qb_config', cfg)
  return cfg
}

export function getQbLists(db: DB): QbLists {
  const s = readJson<QbLists>(db, 'qb_lists')
  return {
    companyName: s.companyName ?? '',
    fetchedAt: s.fetchedAt ?? null,
    accounts: s.accounts ?? [],
    salesTaxItems: s.salesTaxItems ?? [],
    salesTaxCodes: s.salesTaxCodes ?? [],
    paymentMethods: s.paymentMethods ?? [],
    otherChargeItems: s.otherChargeItems ?? [],
    customerExists: s.customerExists ?? false
  }
}

export function saveQbLists(db: DB, changes: Partial<QbLists>): QbLists {
  const next = { ...getQbLists(db), ...changes }
  writeJson(db, 'qb_lists', next)
  return next
}

export function qbLog(db: DB, level: QbLogEntry['level'], message: string) {
  db.prepare('INSERT INTO qb_log (level, message) VALUES (?, ?)').run(level, message.slice(0, 2000))
  // keep the log from growing forever
  db.prepare('DELETE FROM qb_log WHERE id <= (SELECT MAX(id) FROM qb_log) - 1000').run()
}

export function readQbLog(db: DB, limit = 200): QbLogEntry[] {
  return (
    db.prepare('SELECT at, level, message FROM qb_log ORDER BY id DESC LIMIT ?').all(limit) as {
      at: string
      level: QbLogEntry['level']
      message: string
    }[]
  ).map((r) => ({ ...r, at: r.at.replace(' ', 'T') + 'Z' }))
}

type ExportRow = {
  id: number
  sale_id?: number
  customer_name?: string
  sale_date: string
  method: 'cash' | 'card' | 'check'
  ref_number: string
  total_cents: number
  sale_count: number
  status: QbExport['status']
  txn_id: string | null
  error: string | null
  attempts: number
  sent_at: string | null
}

export const toExport = (r: ExportRow): QbExport => ({
  id: r.id,
  saleId: r.sale_id,
  customerName: r.customer_name,
  saleDate: r.sale_date,
  method: r.method,
  refNumber: r.ref_number,
  totalCents: r.total_cents,
  saleCount: r.sale_count,
  status: r.status,
  txnId: r.txn_id,
  error: r.error,
  attempts: r.attempts,
  sentAt: r.sent_at ? r.sent_at.replace(' ', 'T') + 'Z' : null
})

export function listExports(db: DB, limit = 120): QbExport[] {
  return (
    db.prepare('SELECT * FROM qb_sale_exports ORDER BY sale_id DESC LIMIT ?').all(limit) as ExportRow[]
  ).map(toExport)
}

export function getExportRow(db: DB, saleDate: string, method: string): QbExport | null {
  const r = db.prepare('SELECT * FROM qb_exports WHERE sale_date = ? AND method = ?').get(saleDate, method) as
    | ExportRow
    | undefined
  return r ? toExport(r) : null
}
