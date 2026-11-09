/**
 * Spreadsheet columns for importing / exporting customers.
 * The first 20 columns are exactly QuickBooks Point of Sale's customer export
 * (Company, Last Name, First Name … Custom Field 1), so a QB POS export imports
 * as-is and our export can be opened the same way. A few Diamond POS columns follow.
 * Headers are matched loosely (case, spaces and punctuation ignored).
 */
import type { Customer, CustomerInput } from './types'

type Kind = 'text' | 'state' | 'zip' | 'pct' | 'cents' | 'yesno' | 'exempt' | 'email' | 'date'

export interface CustomerColumn {
  header: string
  key: keyof CustomerInput
  kind: Kind
  aliases: string[]
}

export const CUSTOMER_COLUMNS: CustomerColumn[] = [
  // ---- QuickBooks POS customer export, in its order ----
  { header: 'Company', key: 'company', kind: 'text', aliases: ['company', 'companyname', 'business', 'businessname'] },
  { header: 'Last Name', key: 'lastName', kind: 'text', aliases: ['lastname', 'surname', 'last'] },
  { header: 'First Name', key: 'firstName', kind: 'text', aliases: ['firstname', 'first', 'givenname'] },
  { header: 'Title', key: 'title', kind: 'text', aliases: ['title', 'salutation'] },
  { header: 'Street', key: 'street', kind: 'text', aliases: ['street', 'address', 'address1', 'street1'] },
  { header: 'Street2', key: 'street2', kind: 'text', aliases: ['street2', 'address2'] },
  { header: 'City', key: 'city', kind: 'text', aliases: ['city', 'town'] },
  { header: 'State', key: 'region', kind: 'state', aliases: ['state', 'region', 'province', 'st'] },
  { header: 'ZIP', key: 'postcode', kind: 'zip', aliases: ['zip', 'zipcode', 'postcode', 'postalcode'] },
  { header: 'Phone 1', key: 'phone', kind: 'text', aliases: ['phone1', 'phone', 'phonenumber', 'homephone'] },
  { header: 'Phone 2', key: 'mobile', kind: 'text', aliases: ['phone2', 'mobile', 'cell', 'cellphone', 'mobilephone'] },
  { header: 'Alt Contact', key: 'altContact', kind: 'text', aliases: ['altcontact', 'alternatecontact'] },
  { header: 'Alt Phone', key: 'altPhone', kind: 'text', aliases: ['altphone', 'alternatephone'] },
  { header: 'Disc %', key: 'discountPct', kind: 'pct', aliases: ['disc', 'discount', 'discountpct', 'discountpercent'] },
  { header: 'Tax-exempt', key: 'taxExempt', kind: 'exempt', aliases: ['taxexempt', 'exempt'] },
  { header: 'EMail', key: 'email', kind: 'email', aliases: ['email', 'emailaddress'] },
  { header: 'EMail Notification (Yes/No)', key: 'okToEmail', kind: 'yesno', aliases: ['emailnotificationyesno', 'emailnotification', 'oktoemail'] },
  { header: 'Past Due', key: 'pastDueCents', kind: 'cents', aliases: ['pastdue', 'balance', 'balancedue'] },
  { header: 'Notes', key: 'notes', kind: 'text', aliases: ['notes', 'note', 'comments'] },
  { header: 'Custom Field 1', key: 'customField1', kind: 'text', aliases: ['customfield1'] },
  // ---- Diamond POS extras ----
  { header: 'Customer ID', key: 'customerNo', kind: 'text', aliases: ['customerid', 'customerno', 'customernumber', 'accountnumber'] },
  { header: 'Customer Type', key: 'customerType', kind: 'text', aliases: ['customertype', 'type', 'pricelevel'] },
  { header: 'Farm Tax ID', key: 'taxExemptId', kind: 'text', aliases: ['farmtaxid', 'taxexemptid', 'taxid', 'exemptionnumber'] },
  { header: 'Tax ID Expires', key: 'taxExemptExpires', kind: 'date', aliases: ['taxidexpires', 'taxexemptexpires', 'farmtaxidexpires'] },
  { header: 'Tax Card Copied', key: 'taxExemptCardCopied', kind: 'yesno', aliases: ['taxcardcopied', 'cardcopied'] },
  { header: 'Active', key: 'active', kind: 'yesno', aliases: ['active'] }
]

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export function mapCustomerHeaders(headers: string[]): { map: Map<string, CustomerColumn>; unknown: string[] } {
  const map = new Map<string, CustomerColumn>()
  const unknown: string[] = []
  const used = new Set<string>()
  for (const h of headers) {
    const n = norm(h)
    const col = CUSTOMER_COLUMNS.find((c) => !used.has(c.key) && (norm(c.header) === n || c.aliases.includes(n)))
    if (col) {
      map.set(h, col)
      used.add(col.key)
    } else if (h.trim() && !h.startsWith('__EMPTY')) unknown.push(h)
  }
  return { map, unknown }
}

export type ImportCustomer = Partial<CustomerInput> & { __row: number }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Excel date serial or text (MM/DD/YYYY, YYYY-MM-DD, MMDDYYYY) -> YYYY-MM-DD */
function toIsoDate(v: unknown): string | null {
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000)
    return d.toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s) ?? /^(\d{2})(\d{2})(\d{4})$/.exec(s)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  }
  return null
}

/**
 * Convert one spreadsheet row to customer fields. Blank cells are left out (so an update keeps the current value).
 * QuickBooks POS quirks handled:
 *  - "Tax-exempt" = "Exempt" → tax exempt; and "Custom Field 1" becomes the Farm Tax ID when there isn't one
 *  - EMail cells that aren't email addresses (fax numbers, web sites) are kept in the notes instead
 *  - a company with no first / last name is tracked as a company
 */
export function rowToCustomer(row: Record<string, unknown>, map: Map<string, CustomerColumn>, rowNumber: number) {
  const c: ImportCustomer = { __row: rowNumber }
  const errors: string[] = []
  const notesExtra: string[] = []
  for (const [header, col] of map) {
    const v = row[header]
    if (v === undefined || v === null || String(v).trim() === '') continue
    const s = typeof v === 'number' && Number.isInteger(v) && col.kind !== 'cents' && col.kind !== 'pct' ? v.toFixed(0) : String(v).trim()
    const set = (val: unknown) => ((c as Record<string, unknown>)[col.key] = val)
    switch (col.kind) {
      case 'text':
        set(s)
        break
      case 'state':
        set(s.length <= 3 ? s.toUpperCase() : s)
        break
      case 'zip':
        // Excel may have turned 01234 into 1234
        set(/^\d{1,4}$/.test(s) ? s.padStart(5, '0') : s)
        break
      case 'pct': {
        const n = typeof v === 'number' ? v : Number(s.replace('%', ''))
        if (!Number.isFinite(n) || n < 0 || n > 100) errors.push(`${col.header}: "${s}" should be a percent from 0 to 100`)
        else set(n === 0 ? null : n)
        break
      }
      case 'cents': {
        const n = typeof v === 'number' ? v : Number(s.replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1'))
        if (!Number.isFinite(n)) errors.push(`${col.header}: "${s}" is not an amount`)
        else set(Math.round(n * 100))
        break
      }
      case 'yesno': {
        const n = norm(s)
        if (['yes', 'y', 'true', '1', 'x'].includes(n)) set(true)
        else if (['no', 'n', 'false', '0'].includes(n)) set(false)
        else errors.push(`${col.header}: "${s}" should be Yes or No`)
        break
      }
      case 'exempt': {
        const n = norm(s)
        set(['exempt', 'yes', 'y', 'true', '1', 'x', 'taxexempt'].includes(n))
        break
      }
      case 'email':
        if (EMAIL.test(s)) set(s)
        else notesExtra.push(`EMail field from import: ${s}`)
        break
      case 'date': {
        const d = toIsoDate(v)
        if (d) set(d)
        else errors.push(`${col.header}: "${s}" is not a date`)
        break
      }
    }
  }
  if (notesExtra.length) c.notes = [c.notes, ...notesExtra].filter(Boolean).join('\n')
  if (c.company && !c.firstName && !c.lastName) c.trackAsCompany = true
  if (c.taxExempt && !c.taxExemptId && c.customField1) c.taxExemptId = c.customField1
  if (!c.firstName && !c.lastName && !c.company) errors.push('No name or company')
  return { customer: c, errors }
}

/** One spreadsheet row for a customer (Export) */
export function customerToRow(c: Customer): Record<string, string | number> {
  const row: Record<string, string | number> = {}
  for (const col of CUSTOMER_COLUMNS) {
    const v = c[col.key]
    if (col.key === 'customField1') row[col.header] = c.customField1 ?? (c.taxExempt && c.taxExemptId ? c.taxExemptId : '')
    else if (v === null || v === undefined) row[col.header] = col.kind === 'pct' || col.kind === 'cents' ? 0 : ''
    else if (col.kind === 'cents') row[col.header] = (v as number) / 100
    else if (col.kind === 'exempt') row[col.header] = v ? 'Exempt' : ''
    else if (col.kind === 'yesno') row[col.header] = v ? 'Yes' : 'No'
    else row[col.header] = v as string | number
  }
  return row
}

/** Name shown in import results */
export const importName = (c: Partial<CustomerInput>) =>
  [c.company, [c.firstName, c.lastName].filter(Boolean).join(' ')].filter(Boolean).join(' · ')
