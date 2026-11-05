/**
 * Marketing audiences: "customers who bought X". Rules come from drop-downs on
 * the Marketing screen and are turned into one parameterised SQL query.
 * Only customers who ticked "OK to email" and have an email address receive mailers.
 */
import type { DB } from '../db'
import { customerDisplayName } from '../../../shared/types'
import type { Audience, AudienceOptions, AudienceResult, AudienceRule } from '../../../shared/marketing'

const clean = (s: unknown) => String(s ?? '').trim()

/** Make an audience safe to store/run (drops empty rules, clamps numbers) */
export function normaliseAudience(a: unknown): Audience {
  const x = (a ?? {}) as Partial<Audience>
  const rules: AudienceRule[] = (Array.isArray(x.rules) ? x.rules : [])
    .map((r) => ({
      department: clean(r?.department) || undefined,
      manufacturer: clean(r?.manufacturer) || undefined,
      vendor: clean(r?.vendor) || undefined,
      nameContains: clean(r?.nameContains) || undefined
    }))
    .filter((r) => r.department || r.manufacturer || r.vendor || r.nameContains)
    .slice(0, 20)
  const months = Number(x.withinMonths)
  return {
    allCustomers: x.allCustomers === true,
    rules,
    withinMonths: Number.isInteger(months) && months > 0 && months <= 240 ? months : null,
    customerTypes: (Array.isArray(x.customerTypes) ? x.customerTypes : []).map(clean).filter(Boolean).slice(0, 20)
  }
}

export function audienceOptions(db: DB): AudienceOptions {
  const list = (sql: string) => (db.prepare(sql).all() as { v: string }[]).map((r) => r.v)
  return {
    departments: list(
      `SELECT DISTINCT TRIM(department) AS v FROM products WHERE TRIM(COALESCE(department,'')) <> ''
       UNION SELECT DISTINCT TRIM(department) FROM sale_items WHERE TRIM(COALESCE(department,'')) <> '' ORDER BY 1 COLLATE NOCASE`
    ),
    manufacturers: list(
      `SELECT DISTINCT TRIM(manufacturer) AS v FROM products WHERE TRIM(COALESCE(manufacturer,'')) <> '' ORDER BY 1 COLLATE NOCASE`
    ),
    vendors: list(`SELECT DISTINCT TRIM(vendor) AS v FROM products WHERE TRIM(COALESCE(vendor,'')) <> '' ORDER BY 1 COLLATE NOCASE`),
    customerTypes: list(
      `SELECT DISTINCT TRIM(customer_type) AS v FROM customers WHERE TRIM(COALESCE(customer_type,'')) <> '' ORDER BY 1 COLLATE NOCASE`
    )
  }
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c)

interface Row {
  id: number
  first_name: string | null
  last_name: string | null
  company: string | null
  track_as_company: number
  email: string | null
  ok_to_email: number
  n: number | null
  last: string | null
}

/** Run an audience. `limit` caps the recipient list returned (counts are always complete). */
export function runAudience(db: DB, input: unknown, limit = Infinity): AudienceResult {
  const a = normaliseAudience(input)
  const params: (string | number)[] = []
  let rows: Row[]

  const typeFilter = () => {
    if (!a.customerTypes.length) return ''
    params.push(...a.customerTypes.map((t) => t.toLowerCase()))
    return ` AND LOWER(TRIM(COALESCE(c.customer_type,''))) IN (${a.customerTypes.map(() => '?').join(',')})`
  }

  if (a.allCustomers) {
    const sql = `SELECT c.id, c.first_name, c.last_name, c.company, c.track_as_company, c.email, c.ok_to_email,
                        (SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.id AND s.status = 'completed') AS n,
                        (SELECT MAX(created_at) FROM sales s WHERE s.customer_id = c.id AND s.status = 'completed') AS last
                 FROM customers c WHERE c.active = 1 ${typeFilter()}`
    rows = db.prepare(sql).all(...params) as Row[]
  } else {
    if (a.rules.length === 0) return { matched: 0, recipients: [], excludedNoConsent: 0, excludedNoEmail: 0 }
    // Parameters must be pushed in the order their ? appears in the SQL: time window, then rules, then types
    let when = ''
    if (a.withinMonths) {
      when = ` AND s.created_at >= datetime('now', ?)`
      params.push(`-${a.withinMonths} months`)
    }
    const ruleSql = a.rules.map((r) => {
      const parts: string[] = []
      if (r.department) {
        parts.push(`LOWER(TRIM(COALESCE(si.department, p.department, ''))) = ?`)
        params.push(r.department.toLowerCase())
      }
      if (r.manufacturer) {
        parts.push(`LOWER(TRIM(COALESCE(p.manufacturer, ''))) = ?`)
        params.push(r.manufacturer.toLowerCase())
      }
      if (r.vendor) {
        parts.push(`LOWER(TRIM(COALESCE(p.vendor, ''))) = ?`)
        params.push(r.vendor.toLowerCase())
      }
      if (r.nameContains) {
        parts.push(`LOWER(si.name) LIKE ? ESCAPE '\\'`)
        params.push(`%${likeEscape(r.nameContains.toLowerCase())}%`)
      }
      return `(${parts.join(' AND ')})`
    })
    const purchases = `SELECT s.customer_id AS cid, COUNT(DISTINCT s.id) AS n, MAX(s.created_at) AS last
                       FROM sales s
                       JOIN sale_items si ON si.sale_id = s.id
                       LEFT JOIN products p ON p.id = si.product_id
                       WHERE s.status = 'completed' AND s.customer_id IS NOT NULL AND si.qty > 0 ${when}
                         AND (${ruleSql.join(' OR ')})
                       GROUP BY s.customer_id`
    const sql = `SELECT c.id, c.first_name, c.last_name, c.company, c.track_as_company, c.email, c.ok_to_email, m.n, m.last
                 FROM (${purchases}) m JOIN customers c ON c.id = m.cid
                 WHERE c.active = 1 ${typeFilter()}`
    rows = db.prepare(sql).all(...params) as Row[]
  }

  const validEmail = (e: string | null) => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
  let excludedNoEmail = 0
  let excludedNoConsent = 0
  const recipients: AudienceResult['recipients'] = []
  for (const r of rows) {
    if (!validEmail(r.email)) excludedNoEmail++
    else if (r.ok_to_email !== 1) excludedNoConsent++
    else
      recipients.push({
        customerId: r.id,
        name: customerDisplayName({
          firstName: r.first_name,
          lastName: r.last_name,
          company: r.company,
          trackAsCompany: r.track_as_company === 1
        }),
        email: r.email!.trim(),
        purchases: r.n ?? 0,
        lastPurchase: r.last ? r.last.replace(' ', 'T') + 'Z' : ''
      })
  }
  // De-duplicate on email (families / businesses sometimes share one)
  const seen = new Set<string>()
  const unique = recipients
    .sort((x, y) => x.name.localeCompare(y.name))
    .filter((r) => {
      const k = r.email.toLowerCase()
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  return {
    matched: rows.length,
    recipients: unique.slice(0, limit),
    excludedNoConsent,
    excludedNoEmail
  }
}
