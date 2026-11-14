import type express from 'express'
import type { DB } from './db'
import { EMPTY_VENDOR, type Vendor, type VendorInput, type VendorDetail } from '../../shared/vendors'
const fields = {
  companyName:'company_name', title:'title', firstName:'first_name', lastName:'last_name', email:'email', website:'website',
  street:'street',street2:'street2',city:'city',region:'region',postcode:'postcode',phone:'phone',mobile:'mobile',
  netDays:'net_days',discountPercent:'discount_percent',discountDays:'discount_days',accountNumber:'account_number',
  altPhone:'alt_phone',altContact:'alt_contact',active:'active',notes:'notes'
} as const
class VendorError extends Error { constructor(public status: number, message: string) { super(message) } }
function toVendor(row: Record<string, unknown>): Vendor {
  const result: Record<string,unknown> = { id: row.id }
  for (const [key,col] of Object.entries(fields)) result[key] = key === 'active' ? row[col] === 1 : row[col]
  return result as unknown as Vendor
}
export function vendorById(db: DB, id: number): Vendor | null {
  const row = db.prepare('SELECT * FROM vendors WHERE id = ?').get(id) as Record<string,unknown> | undefined
  return row ? toVendor(row) : null
}
export function vendorIdForName(db: DB, name: string | null): number | null {
  if (!name?.trim()) return null
  const row = db.prepare('SELECT id FROM vendors WHERE company_name = ? COLLATE NOCASE').get(name.trim()) as { id:number } | undefined
  return row?.id ?? null
}
export function cleanVendor(body: Partial<VendorInput>, base: VendorInput = EMPTY_VENDOR): VendorInput {
  const result = { ...base }
  for (const key of Object.keys(fields) as (keyof VendorInput)[]) {
    if (body[key] === undefined) continue
    if (key === 'active') { if (typeof body[key] !== 'boolean') throw new VendorError(400, 'Inactive must be a checkbox value'); result.active = body.active! }
    else if (key === 'netDays' || key === 'discountDays' || key === 'discountPercent') {
      const n = Number(body[key])
      if (!Number.isFinite(n) || n < 0 || n > (key === 'discountPercent' ? 100 : 3650) || (key !== 'discountPercent' && !Number.isInteger(n))) throw new VendorError(400, 'Payment days must be whole numbers from 0–3650; discount must be 0–100%')
      result[key] = key === 'discountPercent' ? Math.round(n*100)/100 : n
    } else {
      const value = String(body[key] ?? '').trim()
      if (value.length > (key === 'notes' ? 4000 : 500)) throw new VendorError(400, `${key} is too long`)
      result[key] = value
    }
  }
  if (!result.companyName) throw new VendorError(400, 'Company name is required')
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new VendorError(400, 'Enter a valid email address')
  if (result.website) {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(result.website) ? result.website : `https://${result.website}`)
    if (!['http:','https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new VendorError(400, 'Website must be an http or https address')
    result.website = url.href
  }
  return result
}
function attachUnlinked(db: DB, vendor: Vendor) {
  for (const table of ['products','receivings']) db.prepare(`UPDATE ${table} SET vendor_id = ? WHERE vendor_id IS NULL AND TRIM(vendor) = ? COLLATE NOCASE`).run(vendor.id,vendor.companyName)
}
export function saveVendor(db: DB, body: Partial<VendorInput>, id?: number): Vendor {
  return db.transaction(() => {
    const previous = id === undefined ? null : vendorById(db,id)
    if (id !== undefined && !previous) throw new VendorError(404,'Vendor not found')
    const value = cleanVendor(body, previous ?? EMPTY_VENDOR)
    const duplicate = db.prepare('SELECT id FROM vendors WHERE company_name = ? COLLATE NOCASE AND id <> ?').get(value.companyName,id ?? -1)
    if (duplicate) throw new VendorError(409,'That vendor company already exists. Open the existing record instead.')
    const keys = Object.keys(fields) as (keyof VendorInput)[]
    const values = keys.map((k) => k === 'active' ? value.active ? 1 : 0 : value[k])
    if (previous) {
      attachUnlinked(db,previous)
      db.prepare(`UPDATE vendors SET ${keys.map((k) => `${fields[k]} = ?`).join(',')}, updated_at = datetime('now') WHERE id = ?`).run(...values,id!)
      if (previous.companyName !== value.companyName) db.prepare("UPDATE products SET vendor = ?, updated_at = datetime('now') WHERE vendor_id = ?").run(value.companyName,id!)
    } else id = Number(db.prepare(`INSERT INTO vendors (${keys.map((k) => fields[k]).join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...values).lastInsertRowid)
    const vendor = vendorById(db,id!)!
    attachUnlinked(db,vendor)
    return vendor
  })()
}
export function vendorDetail(db: DB, id: number): VendorDetail | null {
  const vendor = vendorById(db,id)
  if (!vendor) return null
  const source = `FROM receivings r WHERE r.vendor_id = ? OR (r.vendor_id IS NULL AND TRIM(r.vendor) = ? COLLATE NOCASE)`
  const total = `(COALESCE((SELECT SUM(ROUND(l.qty*l.unit_cost_cents)) FROM receiving_lines l WHERE l.receiving_id = r.id),0)+r.freight_cents)`
  const history = db.prepare(`SELECT r.id,r.created_at,r.posted_at,r.status,r.invoice_no,${total} AS total ${source} ORDER BY r.id DESC LIMIT 100`).all(id,vendor.companyName) as
    { id:number;created_at:string;posted_at:string|null;status:'draft'|'posted';invoice_no:string;total:number }[]
  const stats = db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(${total}),0) AS amount FROM receivings r WHERE r.status='posted' AND (r.vendor_id=? OR (r.vendor_id IS NULL AND TRIM(r.vendor)=? COLLATE NOCASE))`).get(id,vendor.companyName) as {n:number;amount:number}
  return { vendor, history: history.map((r) => ({ id:r.id,number:`RV-${String(r.id).padStart(6,'0')}`,date:(r.posted_at??r.created_at).replace(' ','T')+'Z',status:r.status,invoiceNo:r.invoice_no,totalCents:r.total })), postedCount:stats.n,postedTotalCents:stats.amount }
}
export function registerVendorRoutes(app: express.Express, db: DB) {
  const wrap = (fn:(req:express.Request,res:express.Response)=>void) => (req:express.Request,res:express.Response) => {
    try { fn(req,res) } catch (e) { const err=e as Error; res.status(e instanceof VendorError ? e.status : 400).json({error:err.message}) }
  }
  app.get('/api/vendors',wrap((req,res) => {
    const search=String(req.query.search??'').trim().slice(0,120).replace(/[\\%_]/g,'\\$&')
    const rows=db.prepare(`SELECT * FROM vendors WHERE (?=1 OR active=1) AND (company_name LIKE ? ESCAPE '\\' OR first_name LIKE ? ESCAPE '\\' OR last_name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR account_number LIKE ? ESCAPE '\\') ORDER BY company_name COLLATE NOCASE`).all(req.query.includeInactive==='1'?1:0,...Array(5).fill(`%${search}%`)) as Record<string,unknown>[]
    res.json(rows.map(toVendor))
  }))
  app.get('/api/vendors/:id',wrap((req,res) => { const v=vendorDetail(db,Number(req.params.id)); if(!v) throw new VendorError(404,'Vendor not found');res.json(v) }))
  app.post('/api/vendors',wrap((req,res) => res.status(201).json(saveVendor(db,req.body??{}))))
  app.put('/api/vendors/:id',wrap((req,res) => res.json(saveVendor(db,req.body??{},Number(req.params.id)))))
}
