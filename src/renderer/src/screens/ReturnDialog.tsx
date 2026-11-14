import { useEffect, useRef, useState } from 'react'
import { customerDisplayName, type Customer, type Product } from '../../../shared/types'
import { RETURN_REASONS, returnAmount, type CustomerReceipt, type ReturnableSale } from '../../../shared/returns'
import { api } from '../api'
import { dateTime, money } from '../format'
import CustomerPicker from './CustomerPicker'

/** An item coming back, as it sits on the current sale */
export interface ReturnLine {
  key: string
  /** Original receipt (null = no receipt) */
  saleId: number | null
  saleItemId: number | null
  productId: number | null
  sku: string | null
  name: string
  serial: string | null
  qty: number
  /** Refund per unit: price paid on the receipt (or today's price with no receipt) */
  originalTax?: { taxCents: number; qtySold: number; qtyReturned: number; taxRefundedCents: number }
  unitCents: number
  taxable: boolean
  /** The original receipt was tax exempt (no tax in the refund) */
  origExempt: boolean
  /** How the original receipt was taxed and its rate (null = no receipt: today's price + this sale's rate) */
  origTaxMode: 'added' | 'inclusive' | null
  origTaxRate: number | null
  reason: string
  restock: boolean
  tracksStock: boolean
}

type LinePick = { qty: string; reason: string; restock: boolean; on: boolean }

/**
 * Return items: find the original receipt (receipt # / scan, or the customer's receipts),
 * tick what's coming back, quantity, reason and whether it goes back to stock.
 * Or, with no receipt, pick the item (refunded at today's price, flagged for the manager).
 */
export default function ReturnDialog(props: {
  customer: Customer | null
  /** Return lines already on this sale (so the same units can't be added twice) */
  existing: ReturnLine[]
  onCancel: () => void
  onAdd: (lines: ReturnLine[], receipt: ReturnableSale | null) => void
}) {
  const [receiptNo, setReceiptNo] = useState('')
  const [receipt, setReceipt] = useState<ReturnableSale | null>(null)
  const [picks, setPicks] = useState<Record<number, LinePick>>({})
  const [custReceipts, setCustReceipts] = useState<CustomerReceipt[] | null>(null)
  const [custName, setCustName] = useState('')
  const [pickingCustomer, setPickingCustomer] = useState(false)
  const [noReceipt, setNoReceipt] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const showCustomerReceipts = (c: Customer, name: string) =>
    api
      .customerReceipts(c.id)
      .then((list) => {
        setCustReceipts(list)
        setCustName(name)
      })
      .catch((e) => setError(e.message))
  useEffect(() => {
    if (props.customer) showCustomerReceipts(props.customer, customerDisplayName(props.customer))
  }, [])

  const onSale = (saleItemId: number) => props.existing.filter((l) => l.saleItemId === saleItemId).reduce((n, l) => n + l.qty, 0)

  async function open(id: number) {
    setError('')
    try {
      const r = await api.returnable(id)
      if (props.customer && r.customerId !== null && r.customerId !== props.customer.id)
        return setError(`Receipt #${id} is for ${r.customerName}, not the customer on this sale. Remove the customer first.`)
      setReceipt(r)
      setPicks(
        Object.fromEntries(
          r.lines.map((l) => [l.saleItemId, { qty: String(Math.max(0, l.qtySold - l.qtyReturned - onSale(l.saleItemId))), reason: '', restock: l.tracksStock, on: false }])
        )
      )
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function find(e: React.FormEvent) {
    e.preventDefault()
    const id = Number(receiptNo.trim().replace(/^#/, '').replace(/^0+/, ''))
    if (!Number.isInteger(id) || id <= 0) return setError('Type or scan the receipt number')
    open(id)
  }

  if (pickingCustomer)
    return (
      <CustomerPicker
        onCancel={() => setPickingCustomer(false)}
        onPick={(c) => {
          setPickingCustomer(false)
          showCustomerReceipts(c, customerDisplayName(c))
        }}
      />
    )

  if (noReceipt) return <NoReceiptReturn onBack={() => setNoReceipt(false)} onCancel={props.onCancel} onAdd={(l) => props.onAdd([l], null)} />

  // ---------- Step 2: tick the items coming back ----------
  if (receipt) {
    const chosen = receipt.lines.filter((l) => picks[l.saleItemId]?.on)
    const problems: string[] = []
    let refund = 0
    for (const l of chosen) {
      const p = picks[l.saleItemId]
      const q = Number(p.qty)
      const left = l.qtySold - l.qtyReturned - onSale(l.saleItemId)
      if (!Number.isInteger(q) || q <= 0) problems.push(`${l.name}: enter how many are coming back`)
      else if (q > left) problems.push(`${l.name}: only ${left} can be returned`)
      else refund += returnAmount(l.unitPaidCents, q, l.taxable, receipt.taxExempt, receipt.taxRate, receipt.taxMode,
        { taxCents: l.taxPaidCents ?? 0, qtySold: l.qtySold, qtyReturned: l.qtyReturned + onSale(l.saleItemId),
          taxRefundedCents: (l.taxRefundedCents ?? 0) + returnAmount(l.unitPaidCents, onSale(l.saleItemId), l.taxable,
            receipt.taxExempt, receipt.taxRate, receipt.taxMode,
            { taxCents: l.taxPaidCents ?? 0, qtySold: l.qtySold, qtyReturned: l.qtyReturned, taxRefundedCents: l.taxRefundedCents ?? 0 }).taxCents }).amountCents
      if (!p.reason) problems.push(`${l.name}: choose a reason`)
    }
    const kept = Math.max(0, refund - receipt.refundableCents)
    const add = () =>
      props.onAdd(
        chosen.map((l) => {
          const p = picks[l.saleItemId]
          return {
            key: `r:${l.saleItemId}:${Date.now()}`,
            saleId: receipt.saleId,
            saleItemId: l.saleItemId,
            productId: l.productId,
            sku: l.sku,
            name: l.name,
            serial: l.serial,
            qty: Number(p.qty),
            unitCents: l.unitPaidCents,
            originalTax: { taxCents: l.taxPaidCents ?? 0, qtySold: l.qtySold, qtyReturned: l.qtyReturned,
              taxRefundedCents: l.taxRefundedCents ?? 0 },
            taxable: l.taxable,
            origExempt: receipt.taxExempt,
            origTaxMode: receipt.taxMode,
            origTaxRate: receipt.taxRate,
            reason: p.reason,
            restock: p.restock && l.tracksStock,
            tracksStock: l.tracksStock
          }
        }),
        receipt
      )
    const set = (id: number, c: Partial<LinePick>) => setPicks({ ...picks, [id]: { ...picks[id], ...c } })

    return (
      <div className="modal-backdrop">
        <div className="modal return-dlg" onKeyDown={(e) => e.key === 'Escape' && props.onCancel()}>
          <h2>Return from receipt #{receipt.saleId}</h2>
          <div className="return-head muted small">
            <button className="link" onClick={() => setReceipt(null)}>
              ← Other receipt
            </button>{' '}
            {dateTime(receipt.createdAt)} · {receipt.tillName}
            {receipt.customerName && <> · Customer: <b>{receipt.customerName}</b></>}
            {receipt.taxExempt && <> · <b>Tax exempt</b></>} · Paid{' '}
            {receipt.payments.map((p) => `${p.method} ${money(p.amountCents)}`).join(' + ') || 'nothing'}
            {receipt.refundedCents > 0 && <> · Already refunded {money(receipt.refundedCents)}</>}
          </div>
          <div className="grid-wrap return-lines">
            <table className="grid">
              <thead>
                <tr>
                  <th style={{ width: 30 }} />
                  <th>Item</th>
                  <th className="num" style={{ width: 70 }}>Bought</th>
                  <th className="num" style={{ width: 80 }}>Returned</th>
                  <th className="num" style={{ width: 90 }}>Paid each</th>
                  <th style={{ width: 70 }}>Qty back</th>
                  <th style={{ width: 170 }}>Reason</th>
                  <th style={{ width: 170 }}>Goes</th>
                </tr>
              </thead>
              <tbody>
                {receipt.lines.map((l) => {
                  const p = picks[l.saleItemId]
                  const left = l.qtySold - l.qtyReturned - onSale(l.saleItemId)
                  const can = l.returnable && left > 0
                  return (
                    <tr key={l.saleItemId} className={can ? (p?.on ? 'selected' : '') : 'disabled-row'} title={l.whyNot ?? (left <= 0 ? 'Already on this return' : '')}>
                      <td>
                        <input type="checkbox" disabled={!can} checked={!!p?.on} onChange={(e) => set(l.saleItemId, { on: e.target.checked })} />
                      </td>
                      <td>
                        {l.name}
                        {l.serial && <span className="serial-tag">S/N {l.serial}</span>}
                        {!can && <span className="serial-tag">{l.whyNot ?? 'Already on this return'}</span>}
                      </td>
                      <td className="num">{l.qtySold}</td>
                      <td className="num">{l.qtyReturned || ''}</td>
                      <td className="num">{money(l.unitPaidCents)}</td>
                      <td>
                        {can && (
                          <input
                            className="qty-in"
                            value={p.qty}
                            disabled={!p.on || l.qtySold === 1}
                            onChange={(e) => set(l.saleItemId, { qty: e.target.value })}
                          />
                        )}
                      </td>
                      <td>
                        {can && (
                          <select value={p.reason} disabled={!p.on} onChange={(e) => set(l.saleItemId, { reason: e.target.value })}>
                            <option value="">Choose…</option>
                            {RETURN_REASONS.map((r) => (
                              <option key={r}>{r}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td>
                        {can && l.tracksStock && (
                          <select
                            value={p.restock ? 'stock' : 'damaged'}
                            disabled={!p.on}
                            onChange={(e) => set(l.saleItemId, { restock: e.target.value === 'stock' })}
                          >
                            <option value="stock">Back to stock</option>
                            <option value="damaged">Damaged – don't restock</option>
                          </select>
                        )}
                        {can && !l.tracksStock && <span className="muted small">Not a stock item</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {kept > 0 && (
            <div className="msg info">
              This receipt had an estimate fee credit, so only {money(receipt.refundableCents)} can be refunded on it. {money(kept)} is kept.
            </div>
          )}
          {chosen.length > 0 && problems.length > 0 && <div className="error-text">{problems[0]}</div>}
          {error && <div className="error-text">{error}</div>}
          <div className="row between">
            <span>
              Refund for these items (with tax): <b>{money(refund - kept)}</b>
            </span>
            <div className="row gap">
              <button onClick={props.onCancel}>Cancel</button>
              <button className="primary" disabled={chosen.length === 0 || problems.length > 0} onClick={add}>
                Add to sale as return
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ---------- Step 1: find the receipt ----------
  return (
    <div className="modal-backdrop">
      <div className="modal return-dlg" onKeyDown={(e) => e.key === 'Escape' && props.onCancel()}>
        <h2>Return items</h2>
        <form className="row gap" onSubmit={find}>
          <label className="inline grow">
            Receipt #
            <input
              ref={inputRef}
              autoFocus
              placeholder="Type or scan the receipt number"
              value={receiptNo}
              onChange={(e) => setReceiptNo(e.target.value)}
            />
          </label>
          <button type="submit" className="primary">
            Find receipt
          </button>
        </form>
        <div className="row gap">
          <button onClick={() => setPickingCustomer(true)}>Find by customer…</button>
          <button onClick={() => setNoReceipt(true)}>No receipt…</button>
        </div>
        {error && <div className="error-text">{error}</div>}

        {custReceipts && (
          <>
            <h3>{custName}'s receipts</h3>
            <div className="grid-wrap return-lines">
              <table className="grid">
                <thead>
                  <tr>
                    <th style={{ width: 80 }}>Receipt</th>
                    <th style={{ width: 170 }}>Date</th>
                    <th>Items</th>
                    <th className="num" style={{ width: 100 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {custReceipts.map((r) => (
                    <tr key={r.id} className="clickable" onClick={() => open(r.id)}>
                      <td>#{r.id}</td>
                      <td>{dateTime(r.createdAt)}</td>
                      <td className="dim">{r.itemsText}</td>
                      <td className="num">{money(r.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {custReceipts.length === 0 && <div className="grid-empty">No receipts with items for this customer</div>}
            </div>
          </>
        )}
        <div className="row end">
          <button onClick={props.onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

/** No receipt: refund at today's price, flagged on the sale for the manager */
function NoReceiptReturn(props: { onBack: () => void; onCancel: () => void; onAdd: (l: ReturnLine) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [item, setItem] = useState<Product | null>(null)
  const [qty, setQty] = useState('1')
  const [reason, setReason] = useState('')
  const [restock, setRestock] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => api.listProducts(query.trim()).then(setResults).catch(() => {}), 150)
    return () => clearTimeout(t)
  }, [query])
  const q = Number(qty)
  const ok = item && Number.isInteger(q) && q > 0 && reason
  const tracks = item?.type === 'inventory'
  return (
    <div className="modal-backdrop">
      <div className="modal return-dlg" onKeyDown={(e) => e.key === 'Escape' && props.onCancel()}>
        <h2>Return without a receipt</h2>
        <div>
          <button className="link" onClick={props.onBack}>
            ← Back
          </button>
        </div>
        <div className="msg error">Refunded at today's price. The sale is flagged as a no-receipt return for the manager to check.</div>
        {!item ? (
          <>
            <input autoFocus placeholder="Scan the item or type its name / item #" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="grid-wrap return-lines">
              <table className="grid">
                <tbody>
                  {results.map((p) => (
                    <tr key={p.id} className="clickable" onClick={() => setItem(p)}>
                      <td className="dim" style={{ width: 120 }}>{p.sku ?? ''}</td>
                      <td>{p.name}</td>
                      <td className="num">{money(p.priceCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="form">
            <div className="row between">
              <b>{item.name}</b>
              <button className="link" onClick={() => setItem(null)}>
                Change item
              </button>
            </div>
            <div className="row gap">
              <label className="inline">
                Qty
                <input className="qty-in" autoFocus value={qty} onChange={(e) => setQty(e.target.value)} />
              </label>
              <label className="inline">
                Reason
                <select value={reason} onChange={(e) => setReason(e.target.value)}>
                  <option value="">Choose…</option>
                  {RETURN_REASONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              {tracks && (
                <select value={restock ? 'stock' : 'damaged'} onChange={(e) => setRestock(e.target.value === 'stock')}>
                  <option value="stock">Back to stock</option>
                  <option value="damaged">Damaged – don't restock</option>
                </select>
              )}
            </div>
            <div>
              Refund: <b>{money(item.priceCents * (Number.isInteger(q) && q > 0 ? q : 0))}</b>
            </div>
          </div>
        )}
        <div className="row gap end">
          <button onClick={props.onCancel}>Cancel</button>
          <button
            className="primary"
            disabled={!ok}
            onClick={() =>
              item &&
              props.onAdd({
                key: `r:p${item.id}:${Date.now()}`,
                saleId: null,
                saleItemId: null,
                productId: item.id,
                sku: item.sku ?? null,
                name: item.name,
                serial: null,
                qty: q,
                unitCents: item.priceCents,
                taxable: item.taxable !== false,
                origExempt: false,
                origTaxMode: null,
                origTaxRate: null,
                reason,
                restock: restock && tracks,
                tracksStock: tracks
              })
            }
          >
            Add to sale as return
          </button>
        </div>
      </div>
    </div>
  )
}
