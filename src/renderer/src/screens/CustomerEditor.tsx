import { useEffect, useRef, useState } from 'react'
import type { Customer, CustomerDetail, CustomerInput } from '../../../shared/types'
import { api } from '../api'
import { dateTime, money } from '../format'
import TaxExemptBadge from '../TaxExemptBadge'

const TITLES = ['', 'Mr.', 'Mrs.', 'Ms.', 'Miss', 'Dr.', 'Mx.']
const CUSTOMER_TYPES = ['Retail', 'Wholesale', 'Trade', 'Staff', 'VIP']

type Form = { [K in keyof CustomerInput]: CustomerInput[K] extends boolean ? boolean : string }

const EMPTY: Form = {
  firstName: '',
  lastName: '',
  title: '',
  company: '',
  trackAsCompany: false,
  phone: '',
  mobile: '',
  email: '',
  okToEmail: false,
  street: '',
  street2: '',
  city: '',
  region: '',
  postcode: '',
  customerNo: '',
  altPhone: '',
  altContact: '',
  customerType: 'Retail',
  taxExempt: false,
  taxExemptId: '',
  taxExemptExpires: '',
  taxExemptCardCopied: false,
  discountPct: '',
  acceptCheques: false,
  shipSameAsBilling: true,
  shipStreet: '',
  shipStreet2: '',
  shipCity: '',
  shipRegion: '',
  shipPostcode: '',
  notes: '',
  active: true
}

function toForm(c: Customer | null, prefill?: Partial<Form>): Form {
  if (!c) return { ...EMPTY, ...prefill }
  const f = { ...EMPTY } as Record<string, unknown>
  for (const k of Object.keys(EMPTY) as (keyof Form)[]) {
    const v = c[k]
    f[k] = typeof EMPTY[k] === 'boolean' ? !!v : v === null || v === undefined ? '' : String(v)
  }
  return f as Form
}

function fromForm(f: Form): CustomerInput | string {
  const out = {} as Record<string, unknown>
  for (const k of Object.keys(EMPTY) as (keyof Form)[]) {
    const v = f[k]
    out[k] = typeof v === 'boolean' ? v : v.trim() === '' ? null : v.trim()
  }
  if (out.discountPct !== null) {
    const n = Number(out.discountPct)
    if (!Number.isFinite(n) || n < 0 || n > 100) return 'Discount must be a number between 0 and 100'
    out.discountPct = n
  }
  if (!out.firstName && !out.lastName && !out.company) return 'Enter a last name or a company name'
  return out as unknown as CustomerInput
}

export interface CustomerEditorProps {
  customerId: number | null // null = new customer
  /** Pre-fill a new customer, e.g. from what was typed in the sale's customer search */
  prefill?: Partial<Form>
  onSaved: (c: Customer) => void
  onClose: () => void
  /** Hide "Save & New" (used when adding a customer from a sale) */
  single?: boolean
}

/** Add / edit customer window. */
export default function CustomerEditor(props: CustomerEditorProps) {
  const [editingId, setEditingId] = useState<number | null>(props.customerId)
  const [detail, setDetail] = useState<CustomerDetail | null>(null)
  const [form, setForm] = useState<Form>(() => toForm(null, props.prefill))
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const notesRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (props.customerId === null) return
    api
      .getCustomer(props.customerId)
      .then((d) => {
        setDetail(d)
        setForm(toForm(d.customer))
      })
      .catch((e) => setError(e.message))
  }, [props.customerId])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const text = (k: keyof Form) => ({
    value: form[k] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      set(k, e.target.value as never)
  })
  const check = (k: keyof Form) => ({
    type: 'checkbox' as const,
    checked: form[k] as boolean,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.checked as never)
  })

  function dateStamp() {
    const stamp = `${new Date().toLocaleString()} - `
    const notes = form.notes ? `${stamp}\n${form.notes}` : stamp
    set('notes', notes)
    setTimeout(() => {
      const el = notesRef.current
      if (el) {
        el.focus()
        el.setSelectionRange(stamp.length, stamp.length)
      }
    }, 0)
  }

  async function save(andNew: boolean) {
    const input = fromForm(form)
    if (typeof input === 'string') return setError(input)
    setBusy(true)
    setError('')
    try {
      const saved = editingId ? await api.updateCustomer(editingId, input) : await api.createCustomer(input)
      props.onSaved(saved)
      if (andNew) {
        setEditingId(null)
        setDetail(null)
        setForm(toForm(null))
        setNotice(`Saved ${saved.customerNo}. Enter the next customer.`)
        setTimeout(() => document.getElementById('cust-first')?.focus(), 0)
      } else props.onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const stats = detail?.stats

  return (
    <div className="modal-backdrop">
      <form
        className="item-dialog cust-dialog"
        onSubmit={(e) => {
          e.preventDefault()
          save(false)
        }}
        onKeyDown={(e) => e.key === 'Escape' && !busy && props.onClose()}
      >
        <div className="id-title">
          <span>{editingId ? `Edit Customer${form.customerNo ? ` – ${form.customerNo}` : ''}` : 'New Customer'}</span>
          <button type="button" className="title-btn" onClick={props.onClose} title="Close">
            ✕
          </button>
        </div>

        {/* ----- Customer info (big fields across the top) ----- */}
        <div className="cust-info">
          <label>
            First Name
            <input id="cust-first" autoFocus {...text('firstName')} />
          </label>
          <label>
            <span>
              Last Name<span className="req">*</span>
            </span>
            <input {...text('lastName')} />
          </label>
          <label className="narrow">
            Title
            <select {...text('title')}>
              {TITLES.map((t) => (
                <option key={t} value={t}>
                  {t || '—'}
                </option>
              ))}
            </select>
          </label>
          <label className="wide">
            Company
            <input {...text('company')} />
          </label>
          <label className="check track">
            <input {...check('trackAsCompany')} /> Track as Company
          </label>
        </div>

        <div className="id-body cust-body">
          {/* ----- Column 1 ----- */}
          <div className="id-col">
            <fieldset className="id-panel">
              <legend>Contact Info</legend>
              <Row label="Phone">
                <input {...text('phone')} />
              </Row>
              <Row label="Mobile">
                <input {...text('mobile')} />
              </Row>
              <Row label="E-mail">
                <input type="email" {...text('email')} />
              </Row>
              <Row label="OK to e-mail">
                <input {...check('okToEmail')} className="lone-check" />
              </Row>
              <Row label="Street">
                <input {...text('street')} />
              </Row>
              <Row label="Street 2">
                <input {...text('street2')} />
              </Row>
              <Row label="City">
                <input {...text('city')} />
              </Row>
              <Row label="Region">
                <input {...text('region')} />
              </Row>
              <Row label="Postcode">
                <input className="short" {...text('postcode')} />
              </Row>
            </fieldset>

            <fieldset className="id-panel">
              <legend>Customer Settings</legend>
              <Row label="Customer ID">
                <input placeholder="Automatic if left blank" {...text('customerNo')} />
              </Row>
              <Row label="Alt. Phone">
                <input {...text('altPhone')} />
              </Row>
              <Row label="Alt. Contact">
                <input {...text('altContact')} />
              </Row>
              <Row label="Customer Type">
                <input list="dl-cust-types" {...text('customerType')} />
              </Row>
              <Row label="Tax">
                <label className="check inline-check">
                  <input {...check('taxExempt')} /> Tax-Exempt
                </label>
              </Row>
              {form.taxExempt && (
                <>
                  <Row label="Farm Tax ID">
                    <input {...text('taxExemptId')} />
                  </Row>
                  <Row label="ID Expires">
                    <input type="date" className="date" {...text('taxExemptExpires')} />
                  </Row>
                  <Row label="Card copied">
                    <input {...check('taxExemptCardCopied')} className="lone-check" />
                  </Row>
                  <div className="tx-row">
                    <TaxExemptBadge
                      long
                      customer={{
                        taxExempt: true,
                        taxExemptId: form.taxExemptId || null,
                        taxExemptExpires: form.taxExemptExpires || null,
                        taxExemptCardCopied: form.taxExemptCardCopied
                      }}
                    />
                  </div>
                </>
              )}
              <Row label="Discount %">
                <input className="num" placeholder="None" {...text('discountPct')} />
              </Row>
              <Row label="Accept Cheques">
                <input {...check('acceptCheques')} className="lone-check" />
              </Row>
              <Row label="Active">
                <input {...check('active')} className="lone-check" />
              </Row>
            </fieldset>
          </div>

          {/* ----- Column 2 ----- */}
          <div className="id-col">
            <fieldset className="id-panel grow notes-panel">
              <legend>Customer Notes</legend>
              <textarea ref={notesRef} className="comments" {...text('notes')} />
              <div className="row gap">
                <button type="button" onClick={dateStamp}>
                  Date Stamp
                </button>
              </div>
            </fieldset>

            <fieldset className="id-panel">
              <legend>Statistics</legend>
              {stats ? (
                <div className="stats-list">
                  <StatRow label="Last Sale" value={stats.lastSaleAt ? new Date(stats.lastSaleAt).toLocaleDateString() : '—'} />
                  <StatRow label="Number of Sales" value={String(stats.saleCount)} />
                  <StatRow label="Total Sales" value={money(stats.totalCents)} />
                  <StatRow label="Average Receipt" value={money(stats.averageCents)} />
                </div>
              ) : (
                <p className="muted small">Statistics appear once the customer is saved and has sales.</p>
              )}
            </fieldset>
          </div>

          {/* ----- Column 3 ----- */}
          <div className="id-col">
            <fieldset className="id-panel grow">
              <legend>History</legend>
              <div className="history-list">
                {detail?.history.length ? (
                  detail.history.map((h) => (
                    <div key={h.id} className="history-row">
                      <span>{dateTime(h.createdAt)}</span>
                      <span className="dim">Receipt #{h.id}</span>
                      <b>{money(h.totalCents)}</b>
                    </div>
                  ))
                ) : (
                  <p className="muted small">No sales yet.</p>
                )}
              </div>
            </fieldset>

            <fieldset className="id-panel">
              <legend>Ship-To Address</legend>
              <label className="check same-check">
                <input {...check('shipSameAsBilling')} /> Same as contact address
              </label>
              <Row label="Street">
                <input disabled={form.shipSameAsBilling} {...text('shipStreet')} />
              </Row>
              <Row label="Street 2">
                <input disabled={form.shipSameAsBilling} {...text('shipStreet2')} />
              </Row>
              <Row label="City">
                <input disabled={form.shipSameAsBilling} {...text('shipCity')} />
              </Row>
              <Row label="Region">
                <input disabled={form.shipSameAsBilling} {...text('shipRegion')} />
              </Row>
              <Row label="Postcode">
                <input className="short" disabled={form.shipSameAsBilling} {...text('shipPostcode')} />
              </Row>
            </fieldset>
          </div>
        </div>

        <div className="id-foot">
          {!props.single && (
            <button type="button" className="primary" disabled={busy} onClick={() => save(true)}>
              Save &amp; New
            </button>
          )}
          <div className="id-msg">
            {error ? <span className="error-text">{error}</span> : notice && <span className="ok-text">{notice}</span>}
          </div>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" disabled={busy} onClick={props.onClose}>
            Cancel
          </button>
        </div>

        <datalist id="dl-cust-types">
          {CUSTOMER_TYPES.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </form>
    </div>
  )
}

function Row(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="frow">
      <span className="flabel">{props.label}</span>
      <div className="fctl">{props.children}</div>
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="side-row">
      <span className="muted">{label}</span>
      <b>{value}</b>
    </div>
  )
}
