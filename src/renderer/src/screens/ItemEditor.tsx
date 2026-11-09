import { useEffect, useState } from 'react'
import type { ItemType, Product, ProductInput } from '../../../shared/types'
import TagPrintDialog from './TagPrintDialog'
import { DELETE_EXPLAIN, deleteSummary } from '../deleteText'
import { api } from '../api'
import { dateTime, money, parseMoney } from '../format'
import type { ItemReceipt } from '../../../shared/receiving'
import { parseExtra } from '../../../shared/itemImport'

const UNITS = ['Each', 'Pack', 'Box', 'Case', 'Pair', 'Set', 'kg', 'g', 'L', 'mL', 'm', 'Hour']
const TYPES: { value: ItemType; label: string }[] = [
  { value: 'inventory', label: 'Inventory' },
  { value: 'non_inventory', label: 'Non-inventory' },
  { value: 'service', label: 'Service' }
]

/** Everything in the form is kept as text/checkbox values and converted on save. */
interface Form {
  name: string
  type: ItemType
  department: string
  description: string
  size: string
  attribute: string
  price: string
  cost: string
  onHand: string
  taxable: boolean
  barcode: string
  quickPick: boolean
  quickPickGroup: string
  vendor: string
  orderCost: string
  reorderPoint: string
  sku: string
  alu: string
  unitOfMeasure: string
  manufacturer: string
  active: boolean
  printTags: boolean
  unorderable: boolean
  useSerial: boolean
  earnCommission: boolean
  earnRewards: boolean
  shipWeight: string
  shipHeight: string
  shipLength: string
  shipWidth: string
  comments: string
  msrp: string
  price1: string
  price2: string
  price3: string
  price4: string
}

const centsText = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2))
const numText = (n: number | null) => (n === null ? '' : String(n))

function toForm(p: Product | null): Form {
  return {
    name: p?.name ?? '',
    type: p?.type ?? 'inventory',
    department: p?.department ?? '',
    description: p?.description ?? '',
    size: p?.size ?? '',
    attribute: p?.attribute ?? '',
    price: p ? centsText(p.priceCents) : '',
    cost: centsText(p?.costCents ?? null),
    onHand: String(p?.onHand ?? 0),
    taxable: p?.taxable ?? true,
    barcode: p?.barcode ?? '',
    quickPick: p?.quickPick ?? false,
    quickPickGroup: p?.quickPickGroup ?? '',
    vendor: p?.vendor ?? '',
    orderCost: centsText(p?.orderCostCents ?? null),
    reorderPoint: numText(p?.reorderPoint ?? null),
    sku: p?.sku ?? '',
    alu: p?.alu ?? '',
    unitOfMeasure: p?.unitOfMeasure ?? 'Each',
    manufacturer: p?.manufacturer ?? '',
    active: p?.active ?? true,
    printTags: p?.printTags ?? true,
    unorderable: p?.unorderable ?? false,
    useSerial: p?.useSerial ?? false,
    earnCommission: p?.earnCommission ?? false,
    earnRewards: p?.earnRewards ?? false,
    shipWeight: numText(p?.shipWeight ?? null),
    shipHeight: numText(p?.shipHeight ?? null),
    shipLength: numText(p?.shipLength ?? null),
    shipWidth: numText(p?.shipWidth ?? null),
    comments: p?.comments ?? '',
    msrp: centsText(p?.msrpCents ?? null),
    price1: centsText(p?.price1Cents ?? null),
    price2: centsText(p?.price2Cents ?? null),
    price3: centsText(p?.price3Cents ?? null),
    price4: centsText(p?.price4Cents ?? null)
  }
}

/** Convert the form to an item, or return an error message. */
function fromForm(f: Form, original: Product | null): ProductInput | string {
  if (!f.name.trim()) return 'Enter an item name'
  const money = (label: string, text: string, required = false): number | null | string => {
    if (!text.trim()) return required ? `${label} is required` : null
    const c = parseMoney(text)
    return isNaN(c) ? `${label}: enter an amount like 4.50` : c
  }
  const int = (label: string, text: string): number | null | string => {
    if (!text.trim()) return null
    const n = Number(text)
    return Number.isInteger(n) ? n : `${label} must be a whole number`
  }
  const dec = (label: string, text: string): number | null | string => {
    if (!text.trim()) return null
    const n = Number(text)
    return Number.isFinite(n) && n >= 0 ? n : `${label} must be a positive number`
  }
  const values = {
    priceCents: money('Regular price', f.price, true),
    costCents: money('Avg. unit cost', f.cost),
    orderCostCents: money('Order cost', f.orderCost),
    msrpCents: money('MSRP', f.msrp),
    price1Cents: money('Custom price 1', f.price1),
    price2Cents: money('Custom price 2', f.price2),
    price3Cents: money('Custom price 3', f.price3),
    price4Cents: money('Custom price 4', f.price4),
    onHand: f.onHand.trim() === '' ? 0 : Number.isFinite(Number(f.onHand)) ? Number(f.onHand) : 'On-hand qty must be a number',
    reorderPoint: int('Reorder point', f.reorderPoint),
    shipWeight: dec('Shipping weight', f.shipWeight),
    shipHeight: dec('Shipping height', f.shipHeight),
    shipLength: dec('Shipping length', f.shipLength),
    shipWidth: dec('Shipping width', f.shipWidth)
  }
  for (const v of Object.values(values)) if (typeof v === 'string') return v
  const t = (s: string) => (s.trim() === '' ? null : s.trim())
  return {
    name: f.name.trim(),
    type: f.type,
    department: t(f.department),
    description: t(f.description),
    size: t(f.size),
    attribute: t(f.attribute),
    priceCents: values.priceCents as number,
    costCents: values.costCents as number | null,
    onHand: (values.onHand as number | null) ?? 0,
    taxable: f.taxable,
    barcode: t(f.barcode),
    quickPick: f.quickPick,
    quickPickGroup: t(f.quickPickGroup),
    vendor: t(f.vendor),
    orderCostCents: values.orderCostCents as number | null,
    reorderPoint: values.reorderPoint as number | null,
    sku: t(f.sku),
    alu: t(f.alu),
    unitOfMeasure: t(f.unitOfMeasure),
    manufacturer: t(f.manufacturer),
    active: f.active,
    printTags: f.printTags,
    unorderable: f.unorderable,
    useSerial: f.useSerial,
    earnCommission: f.earnCommission,
    earnRewards: f.earnRewards,
    shipWeight: values.shipWeight as number | null,
    shipHeight: values.shipHeight as number | null,
    shipLength: values.shipLength as number | null,
    shipWidth: values.shipWidth as number | null,
    comments: t(f.comments),
    msrpCents: values.msrpCents as number | null,
    price1Cents: values.price1Cents as number | null,
    price2Cents: values.price2Cents as number | null,
    price3Cents: values.price3Cents as number | null,
    price4Cents: values.price4Cents as number | null,
    // Other imported details are kept as they are
    extra: original?.extra ?? null
  }
}

export interface ItemEditorProps {
  item: Product | null // null = add a new item
  departments: string[]
  vendors: string[]
  groups: string[]
  /** Called after each successful save (the list should reload) */
  onSaved: () => void
  /** Called after the item was deleted (or made inactive), with a message */
  onDeleted?: (message: string) => void
  onClose: () => void
}

/** Add / edit item window: Basic Info, More Info, Misc & Shipping and Comments. */
export default function ItemEditor(props: ItemEditorProps) {
  const [editing, setEditing] = useState<Product | null>(props.item)
  const [form, setForm] = useState<Form>(() => toForm(props.item))
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [tagging, setTagging] = useState(false)

  async function remove() {
    if (!editing) return
    if (!confirm(`Delete "${editing.name}"?\n\n${DELETE_EXPLAIN}`)) return
    setBusy(true)
    try {
      const r = await api.deleteProducts([editing.id])
      props.onDeleted?.(deleteSummary(r, 'item'))
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))
  const text = (key: keyof Form) => ({
    value: form[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      set(key, e.target.value as never)
  })
  const check = (key: keyof Form) => ({
    type: 'checkbox' as const,
    checked: form[key] as boolean,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.checked as never)
  })

  // Margin hint next to the price
  const priceC = parseMoney(form.price)
  const costC = parseMoney(form.cost)
  const margin = !isNaN(priceC) && !isNaN(costC) && priceC > 0 ? Math.round(((priceC - costC) / priceC) * 100) : null

  async function save(andNew: boolean) {
    const input = fromForm(form, editing)
    if (typeof input === 'string') return setError(input)
    setBusy(true)
    setError('')
    try {
      const saved = editing ? await api.updateProduct(editing.id, input) : await api.createProduct(input)
      props.onSaved()
      if (andNew) {
        setEditing(null)
        // keep department / vendor / type to speed up entering similar items
        setForm({ ...toForm(null), department: form.department, vendor: form.vendor, type: form.type })
        setNotice(`Saved "${saved.name}". Enter the next item.`)
        setTimeout(() => document.getElementById('item-name')?.focus(), 0)
      } else props.onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const stock = form.type === 'inventory'

  return (
    <div className="modal-backdrop">
      <form
        className="item-dialog"
        onSubmit={(e) => {
          e.preventDefault()
          save(false)
        }}
        onKeyDown={(e) => e.key === 'Escape' && !busy && props.onClose()}
      >
        <div className="id-title">
          <span>{editing ? `Edit Item${editing.sku ? ` – ${editing.sku}` : ''}` : 'Add Inventory Item'}</span>
          <button type="button" className="title-btn" onClick={props.onClose} title="Close">
            ✕
          </button>
        </div>

        <div className="id-name">
          <input id="item-name" autoFocus placeholder="Enter Item Name" {...text('name')} />
          <span className="req">*</span>
        </div>

        <div className="id-body">
          {/* ----- Left column ----- */}
          <div className="id-col">
            <fieldset className="id-panel">
              <legend>Basic Info</legend>
              <Row label="Type">
                <select {...text('type')}>
                  {TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Row>
              <Row label="Department">
                <input list="dl-departments" {...text('department')} />
              </Row>
              <Row label="Item Description" tall>
                <textarea rows={3} {...text('description')} />
              </Row>
              <Row label="Size">
                <input {...text('size')} />
              </Row>
              <Row label="Attribute">
                <input {...text('attribute')} />
              </Row>
              <Row label="Reg. Price" required>
                <div className="with-hint">
                  <input className="money" placeholder="0.00" {...text('price')} />
                  {margin !== null && <span className="hint">Margin {margin}%</span>}
                </div>
              </Row>
              <Row label="Avg. Unit Cost">
                <input className="money" placeholder="0.00" {...text('cost')} />
              </Row>
              <Row label="On-Hand Qty">
                <input className="num" disabled={!stock} {...text('onHand')} />
              </Row>
              <Row label="Tax">
                <select value={form.taxable ? 'tax' : 'none'} onChange={(e) => set('taxable', e.target.value === 'tax')}>
                  <option value="tax">Taxable</option>
                  <option value="none">Non-taxable</option>
                </select>
              </Row>
              <Row label="UPC / Barcode">
                <input placeholder="Click here and scan" {...text('barcode')} />
              </Row>
              <Row label="Quick Pick">
                <div className="with-hint">
                  <label className="check inline-check">
                    <input {...check('quickPick')} /> Show on Sale screen
                  </label>
                  <input list="dl-groups" placeholder="Group" disabled={!form.quickPick} {...text('quickPickGroup')} />
                </div>
              </Row>
            </fieldset>

            <fieldset className="id-panel grow">
              <legend>Comments</legend>
              <textarea className="comments" {...text('comments')} />
            </fieldset>
            {editing?.extra && Object.keys(parseExtra(editing.extra)).length > 0 && (
              <fieldset className="id-panel">
                <legend>Other details (imported)</legend>
                <table className="extra-table">
                  <tbody>
                    {Object.entries(parseExtra(editing.extra)).map(([k, v]) => (
                      <tr key={k}>
                        <td className="muted">{k}</td>
                        <td>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </fieldset>
            )}
            {editing && <ReceivingHistory productId={editing.id} />}
          </div>

          {/* ----- Right column ----- */}
          <div className="id-col">
            <fieldset className="id-panel">
              <legend>More Info</legend>
              <Row label="Vendor">
                <input list="dl-vendors" {...text('vendor')} />
              </Row>
              <Row label="Order Cost">
                <input className="money" placeholder="0.00" {...text('orderCost')} />
              </Row>
              <Row label="MSRP">
                <input className="money" placeholder="None" {...text('msrp')} />
              </Row>
              <Row label="Custom Prices">
                <div className="price-levels">
                  {(['price1', 'price2', 'price3', 'price4'] as const).map((k, i) => (
                    <input key={k} className="money" placeholder={`#${i + 1}`} title={`Custom Price ${i + 1}`} {...text(k)} />
                  ))}
                </div>
              </Row>
              <Row label="Reorder Point">
                <input className="num" disabled={!stock} {...text('reorderPoint')} />
              </Row>
              <Row label="Item No.">
                <input {...text('sku')} />
              </Row>
              <Row label="ALU">
                <input placeholder="Alternate lookup code" {...text('alu')} />
              </Row>
              <Row label="Unit of Measure">
                <input list="dl-units" {...text('unitOfMeasure')} />
                <datalist id="dl-units">
                  {UNITS.map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </Row>
              <Row label="Manufacturer">
                <input {...text('manufacturer')} />
              </Row>
            </fieldset>

            <fieldset className="id-panel">
              <legend>Misc &amp; Shipping</legend>
              <div className="checks">
                <label className="check">
                  <input {...check('active')} /> Active
                </label>
                <label className="check">
                  <input {...check('printTags')} /> Print Tags
                </label>
                <label className="check">
                  <input {...check('unorderable')} /> Unorderable
                </label>
                <label className="check">
                  <input {...check('useSerial')} /> Use Serial #
                </label>
                <label className="check">
                  <input {...check('earnCommission')} /> Earn Commission
                </label>
                <label className="check">
                  <input {...check('earnRewards')} /> Earn Rewards
                </label>
              </div>
              <Row label="Shipping Weight">
                <input className="num" placeholder="kg" {...text('shipWeight')} />
              </Row>
              <Row label="Shipping Height">
                <input className="num" placeholder="cm" {...text('shipHeight')} />
              </Row>
              <Row label="Shipping Length">
                <input className="num" placeholder="cm" {...text('shipLength')} />
              </Row>
              <Row label="Shipping Width">
                <input className="num" placeholder="cm" {...text('shipWidth')} />
              </Row>
            </fieldset>
          </div>
        </div>

        <div className="id-foot">
          <button type="button" className="primary" disabled={busy} onClick={() => save(true)}>
            Save &amp; New
          </button>
          <div className="id-msg">
            {error ? <span className="error-text">{error}</span> : notice && <span className="ok-text">{notice}</span>}
          </div>
          {editing && props.onDeleted && (
            <button type="button" className="danger" disabled={busy} onClick={remove} title="Delete this item">
              🗑 Delete
            </button>
          )}
          {editing && (
            <button type="button" disabled={busy} onClick={() => setTagging(true)} title="Print price tags for this item">
              🏷 Tags
            </button>
          )}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" disabled={busy} onClick={props.onClose}>
            Cancel
          </button>
        </div>

        <datalist id="dl-departments">
          {props.departments.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
        <datalist id="dl-vendors">
          {props.vendors.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
        <datalist id="dl-groups">
          {props.groups.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      </form>
      {tagging && editing && <TagPrintDialog initial={[editing]} onClose={() => setTagging(false)} />}
    </div>
  )
}

function Row(props: { label: string; required?: boolean; tall?: boolean; children: React.ReactNode }) {
  return (
    <div className={props.tall ? 'frow tall' : 'frow'}>
      <span className="flabel">
        {props.label}
        {props.required && <span className="req">*</span>}
      </span>
      <div className="fctl">{props.children}</div>
    </div>
  )
}

/** Last times this item was received (cost paid and the average cost after) */
function ReceivingHistory({ productId }: { productId: number }) {
  const [rows, setRows] = useState<ItemReceipt[] | null>(null)
  useEffect(() => {
    api.itemReceipts(productId).then(setRows).catch(() => setRows([]))
  }, [productId])
  if (!rows || rows.length === 0) return null
  return (
    <fieldset className="id-panel">
      <legend>Receiving history</legend>
      <table className="extra-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>RV #</th>
            <th>Vendor</th>
            <th className="r">Qty</th>
            <th className="r">Cost</th>
            <th className="r">Avg after</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.receivingId}-${r.postedAt}`}>
              <td className="muted">{dateTime(r.postedAt)}</td>
              <td>{r.number}</td>
              <td>
                {r.vendor}
                {r.invoiceNo ? <span className="muted"> #{r.invoiceNo}</span> : null}
              </td>
              <td className="r">{r.qty}</td>
              <td className="r" title={r.landedCostCents !== r.unitCostCents ? `With freight ${money(r.landedCostCents)}` : ''}>
                {money(r.unitCostCents)}
              </td>
              <td className="r">{money(r.newAvgCostCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </fieldset>
  )
}
