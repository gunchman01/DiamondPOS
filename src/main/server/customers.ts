/**
 * Customers: field ↔ column mapping, validation, search, and statistics.
 * Same pattern as products.ts: add a field here (plus a migration) and it is
 * read, saved and validated everywhere.
 */
import type { DB } from './db'
import { ValidationError } from './products'
import { customerDisplayName } from '../../shared/types'
import type { Customer, CustomerDetail, CustomerInput, ImportRowResult, ImportSummary, SaleSummary } from '../../shared/types'

type Kind = 'text' | 'bool' | 'pct' | 'cents'
interface Field {
  key: keyof CustomerInput
  col: string
  kind: Kind
}

export const CUSTOMER_FIELDS: Field[] = [
  { key: 'firstName', col: 'first_name', kind: 'text' },
  { key: 'lastName', col: 'last_name', kind: 'text' },
  { key: 'title', col: 'title', kind: 'text' },
  { key: 'company', col: 'company', kind: 'text' },
  { key: 'trackAsCompany', col: 'track_as_company', kind: 'bool' },
  { key: 'phone', col: 'phone', kind: 'text' },
  { key: 'mobile', col: 'mobile', kind: 'text' },
  { key: 'email', col: 'email', kind: 'text' },
  { key: 'okToEmail', col: 'ok_to_email', kind: 'bool' },
  { key: 'street', col: 'street', kind: 'text' },
  { key: 'street2', col: 'street2', kind: 'text' },
  { key: 'city', col: 'city', kind: 'text' },
  { key: 'region', col: 'region', kind: 'text' },
  { key: 'postcode', col: 'postcode', kind: 'text' },
  { key: 'customerNo', col: 'customer_no', kind: 'text' },
  { key: 'altPhone', col: 'alt_phone', kind: 'text' },
  { key: 'altContact', col: 'alt_contact', kind: 'text' },
  { key: 'customerType', col: 'customer_type', kind: 'text' },
  { key: 'taxExempt', col: 'tax_exempt', kind: 'bool' },
  { key: 'taxExemptId', col: 'tax_exempt_id', kind: 'text' },
  { key: 'taxExemptCardCopied', col: 'tax_exempt_card_copied', kind: 'bool' },
  { key: 'taxExemptExpires', col: 'tax_exempt_expires', kind: 'text' },
  { key: 'discountPct', col: 'discount_pct', kind: 'pct' },
  { key: 'acceptCheques', col: 'accept_cheques', kind: 'bool' },
  { key: 'shipSameAsBilling', col: 'ship_same_as_billing', kind: 'bool' },
  { key: 'shipStreet', col: 'ship_street', kind: 'text' },
  { key: 'shipStreet2', col: 'ship_street2', kind: 'text' },
  { key: 'shipCity', col: 'ship_city', kind: 'text' },
  { key: 'shipRegion', col: 'ship_region', kind: 'text' },
  { key: 'shipPostcode', col: 'ship_postcode', kind: 'text' },
  { key: 'notes', col: 'notes', kind: 'text' },
  { key: 'pastDueCents', col: 'past_due_cents', kind: 'cents' },
  { key: 'customField1', col: 'custom_field1', kind: 'text' },
  { key: 'active', col: 'active', kind: 'bool' }
]

export const CUSTOMER_DEFAULTS: CustomerInput = {
  firstName: null,
  lastName: null,
  title: null,
  company: null,
  trackAsCompany: false,
  phone: null,
  mobile: null,
  email: null,
  okToEmail: false,
  street: null,
  street2: null,
  city: null,
  region: null,
  postcode: null,
  customerNo: null,
  altPhone: null,
  altContact: null,
  customerType: null,
  taxExempt: false,
  taxExemptId: null,
  taxExemptCardCopied: false,
  taxExemptExpires: null,
  discountPct: null,
  acceptCheques: false,
  shipSameAsBilling: true,
  shipStreet: null,
  shipStreet2: null,
  shipCity: null,
  shipRegion: null,
  shipPostcode: null,
  notes: null,
  pastDueCents: 0,
  customField1: null,
  active: true
}

type Row = Record<string, unknown> & { id: number }

export function toCustomer(r: Row): Customer {
  const c: Record<string, unknown> = { id: r.id }
  for (const f of CUSTOMER_FIELDS) c[f.key] = f.kind === 'bool' ? r[f.col] === 1 : (r[f.col] ?? null)
  return c as unknown as Customer
}

export function getCustomer(db: DB, id: number): Customer | null {
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as Row | undefined
  return row ? toCustomer(row) : null
}

/** Fields the request leaves out keep their value from `base` (existing customer or defaults). */
export function validateCustomer(body: unknown, base: CustomerInput): CustomerInput {
  const b = (body ?? {}) as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const f of CUSTOMER_FIELDS) {
    const raw = b[f.key] === undefined ? base[f.key] : b[f.key]
    if (f.kind === 'bool') out[f.key] = raw === true || raw === 1
    else if (f.kind === 'cents') {
      const n = Math.round(Number(raw ?? 0))
      if (!Number.isFinite(n) || Math.abs(n) > 1e9) throw new ValidationError('Past due must be an amount')
      out[f.key] = n
    } else if (f.kind === 'pct') {
      if (raw === null || raw === undefined || raw === '') out[f.key] = null
      else {
        const n = Number(raw)
        if (!Number.isFinite(n) || n < 0 || n > 100) throw new ValidationError('Discount must be between 0 and 100%')
        out[f.key] = n
      }
    } else {
      const s = String(raw ?? '').trim()
      out[f.key] = s === '' ? null : s.slice(0, f.key === 'notes' ? 4000 : 500)
    }
  }
  const c = out as unknown as CustomerInput
  if (!c.firstName && !c.lastName && !c.company) throw new ValidationError('Enter a last name or a company name')
  if (c.trackAsCompany && !c.company) throw new ValidationError('Enter the company name, or untick "Track as Company"')
  if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) throw new ValidationError('That email address doesn\'t look right')
  if (c.taxExemptExpires && !isIsoDate(c.taxExemptExpires))
    throw new ValidationError('Tax ID expiry must be a valid date')
  return c
}

/** True for a real calendar date written as YYYY-MM-DD */
export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(s + 'T00:00:00Z')
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

const toDb = (f: Field, v: unknown) => (f.kind === 'bool' ? (v ? 1 : 0) : f.kind === 'cents' ? Number(v ?? 0) : (v ?? null))

export function insertCustomer(db: DB, c: CustomerInput): number {
  const cols = CUSTOMER_FIELDS.map((f) => f.col)
  const info = db
    .prepare(`INSERT INTO customers (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
    .run(...CUSTOMER_FIELDS.map((f) => toDb(f, c[f.key])))
  const id = Number(info.lastInsertRowid)
  // Give every customer a Customer ID if one wasn't entered
  if (!c.customerNo) db.prepare('UPDATE customers SET customer_no = ? WHERE id = ?').run(`C${String(id).padStart(6, '0')}`, id)
  return id
}

export function updateCustomer(db: DB, id: number, c: CustomerInput): void {
  db.prepare(
    `UPDATE customers SET ${CUSTOMER_FIELDS.map((f) => `${f.col} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`
  ).run(...CUSTOMER_FIELDS.map((f) => toDb(f, c[f.key])), id)
}

/** Search by name, company, phone numbers, email or Customer ID */
export function searchCustomers(db: DB, search: string, includeInactive: boolean): Customer[] {
  const where: string[] = []
  const params: string[] = []
  if (!includeInactive) where.push('active = 1')
  const q = search.trim()
  if (q) {
    const like = `%${q}%`
    const digits = q.replace(/\D/g, '')
    where.push(`(
      first_name LIKE ? OR last_name LIKE ? OR (COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')) LIKE ?
      OR company LIKE ? OR email LIKE ? OR customer_no LIKE ?
      ${digits.length >= 3 ? `OR REPLACE(REPLACE(REPLACE(COALESCE(phone,'') || '|' || COALESCE(mobile,'') || '|' || COALESCE(alt_phone,''), ' ', ''), '-', ''), '+', '') LIKE ?` : ''}
    )`)
    params.push(like, like, like, like, like, like)
    if (digits.length >= 3) params.push(`%${digits}%`)
  }
  const sql = `SELECT * FROM customers ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY COALESCE(CASE WHEN track_as_company = 1 THEN company END, last_name, company, first_name) COLLATE NOCASE
               LIMIT 500`
  return (db.prepare(sql).all(...params) as Row[]).map(toCustomer)
}

/** Customer + statistics + latest receipts, for the customer window */
export function customerDetail(db: DB, id: number): CustomerDetail | null {
  const customer = getCustomer(db, id)
  if (!customer) return null
  const s = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(total_cents),0) AS total, MAX(created_at) AS last
       FROM sales WHERE customer_id = ? AND status = 'completed'`
    )
    .get(id) as { n: number; total: number; last: string | null }
  const history = db
    .prepare(
      `SELECT id, created_at, till_name, total_cents FROM sales
       WHERE customer_id = ? ORDER BY id DESC LIMIT 50`
    )
    .all(id) as { id: number; created_at: string; till_name: string; total_cents: number }[]
  const iso = (t: string) => t.replace(' ', 'T') + 'Z'
  const name = customerDisplayName(customer)
  return {
    customer,
    stats: {
      saleCount: s.n,
      totalCents: s.total,
      averageCents: s.n ? Math.round(s.total / s.n) : 0,
      lastSaleAt: s.last ? iso(s.last) : null
    },
    history: history.map(
      (h): SaleSummary => ({
        id: h.id,
        createdAt: iso(h.created_at),
        tillName: h.till_name,
        totalCents: h.total_cents,
        customerName: name
      })
    )
  }
}

// ---------------------------------------------------------------- Import (Excel / QuickBooks POS)

class Rollback extends Error {}
const digitsOf = (s: unknown) => String(s ?? '').replace(/\D/g, '')
const up = (s: unknown) => String(s ?? '').trim().toUpperCase()
/** Same person = same name, company and phone number */
const matchKey = (c: { lastName?: unknown; firstName?: unknown; company?: unknown; phone?: unknown }) =>
  `${up(c.lastName)}|${up(c.firstName)}|${up(c.company)}|${digitsOf(c.phone)}`

/**
 * Add / update customers from spreadsheet rows (already converted by shared/customerImport).
 * Existing customers are matched by Customer ID, or by name + company + phone. dryRun = preview only.
 */
export function importCustomers(
  db: DB,
  rows: Record<string, unknown>[],
  opts: { dryRun: boolean; updateExisting: boolean }
): ImportSummary {
  const results: ImportRowResult[] = []
  const byNo = new Map<string, number>()
  const byKey = new Map<string, number>()
  for (const r of db.prepare('SELECT id, customer_no, first_name, last_name, company, phone FROM customers').all() as Record<string, unknown>[]) {
    if (r.customer_no) byNo.set(up(r.customer_no), r.id as number)
    byKey.set(matchKey({ lastName: r.last_name, firstName: r.first_name, company: r.company, phone: r.phone }), r.id as number)
  }
  const name = (c: Record<string, unknown>) =>
    [c.company, [c.firstName, c.lastName].filter(Boolean).join(' ')].filter(Boolean).join(' · ')
  try {
    db.transaction(() => {
      rows.forEach((raw, i) => {
        const row = Number(raw.__row) || i + 2
        try {
          const no = raw.customerNo ? up(raw.customerNo) : ''
          const id = (no && byNo.get(no)) || byKey.get(matchKey(raw))
          if (id) {
            if (!opts.updateExisting) throw new ValidationError('Already exists (same Customer ID, or same name and phone)')
            const current = getCustomer(db, id)!
            updateCustomer(db, id, validateCustomer(raw, current))
            results.push({ row, name: name(raw), action: 'update' })
          } else {
            const newId = insertCustomer(db, validateCustomer(raw, CUSTOMER_DEFAULTS))
            const saved = getCustomer(db, newId)!
            if (saved.customerNo) byNo.set(up(saved.customerNo), newId)
            byKey.set(matchKey(saved), newId)
            results.push({ row, name: name(raw), action: 'create' })
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          results.push({ row, name: name(raw), action: 'error', message: msg.includes('UNIQUE') ? 'That Customer ID is already used' : msg })
        }
      })
      if (opts.dryRun) throw new Rollback()
    })()
  } catch (e) {
    if (!(e instanceof Rollback)) throw e
  }
  return {
    dryRun: opts.dryRun,
    created: results.filter((r) => r.action === 'create').length,
    updated: results.filter((r) => r.action === 'update').length,
    errors: results.filter((r) => r.action === 'error').length,
    results
  }
}

/** Every customer (for Export to Excel) */
export function allCustomers(db: DB): Customer[] {
  return (db.prepare('SELECT * FROM customers ORDER BY COALESCE(last_name, company) COLLATE NOCASE, first_name COLLATE NOCASE').all() as Row[]).map(
    toCustomer
  )
}
