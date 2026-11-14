import { useRef, useState } from 'react'
import type { Product } from '../../../shared/types'
import { RETURN_REASONS, type ReturnableSale } from '../../../shared/returns'
import { matchingReturnLines, inlineReturnLine } from '../inlineReturn'
import { api } from '../api'
import { money } from '../format'
import type { ReturnLine } from './ReturnDialog'

/** Return the item already on the Sale screen without navigating away or scanning it again. */
export default function InlineReturnDialog(props: {
  product: Product; negativeQty: number; serial?: string; existing: ReturnLine[]; customerId: number | null
  onCancel: () => void; onAdd: (line: ReturnLine, receipt: ReturnableSale | null) => void
}) {
  const [reason, setReason] = useState('')
  const [restock, setRestock] = useState(props.product.type === 'inventory')
  const [receiptNo, setReceiptNo] = useState('')
  const [receipt, setReceipt] = useState<ReturnableSale | null>(null)
  const [saleItemId, setSaleItemId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lookup = useRef(0)
  const matches = receipt ? matchingReturnLines(receipt, props.product, props.serial) : []
  const selected = matches.find((l) => l.saleItemId === saleItemId)
  const left = (l: typeof matches[number]) => l.qtySold - l.qtyReturned - props.existing.filter((r) => r.saleItemId === l.saleItemId).reduce((n, r) => n + r.qty, 0)
  async function findReceipt() {
    const attempt = ++lookup.current
    setBusy(true); setError(''); setReceipt(null); setSaleItemId(null)
    try {
      const id = Number(receiptNo.trim().replace(/^#/, ''))
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Enter a valid receipt number')
      const found = await api.returnable(id)
      if (attempt !== lookup.current) return
      const lines = matchingReturnLines(found, props.product, props.serial)
      setReceipt(found)
      const available = lines.filter((l) => l.returnable && left(l) >= -props.negativeQty)
      if (available.length === 1) setSaleItemId(available[0].saleItemId)
      if (!lines.length) setError('This item / serial number is not on that receipt. Check the receipt number.')
      else if (!available.length) setError('The matching quantity has already been returned or is already on this sale.')
    } catch (e) { if (attempt === lookup.current) setError((e as Error).message) }
    finally { if (attempt === lookup.current) setBusy(false) }
  }
  function add() {
    try {
      if (receiptNo.trim() && !receipt) throw new Error('Find the receipt first, or clear its number to return without a receipt')
      const line = inlineReturnLine({ ...props, reason, restock, receipt, saleItemId })
      props.onAdd(line, receipt)
    } catch (e) { setError((e as Error).message) }
  }
  return <div className="modal-backdrop">
    <form className="modal" role="dialog" aria-modal="true" aria-labelledby="inline-return-title"
      onSubmit={(e) => { e.preventDefault(); add() }} onKeyDown={(e) => {
        if (e.key === 'Escape') { e.stopPropagation(); props.onCancel() }
      }}>
      <h2 id="inline-return-title">Return item · Qty {props.negativeQty}</h2>
      <p><b>{props.product.name}</b>{props.serial && <> · S/N {props.serial}</>}</p>
      <div className="form">
        <label>Reason
          <select autoFocus value={reason} onChange={(e) => setReason(e.target.value)} required>
            <option value="">Choose…</option>
            {RETURN_REASONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        {props.product.type === 'inventory' && <label>Returned item goes
          <select value={restock ? 'stock' : 'damaged'} onChange={(e) => setRestock(e.target.value === 'stock')}>
            <option value="stock">Back to stock</option><option value="damaged">Damaged — do not restock</option>
          </select>
        </label>}
        <label>Original receipt # (optional)
          <input value={receiptNo} placeholder="Leave blank for no receipt" onChange={(e) => {
            lookup.current++; setBusy(false); setReceiptNo(e.target.value); setReceipt(null); setSaleItemId(null); setError('')
          }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void findReceipt() } }} />
        </label>
        <button type="button" disabled={!receiptNo.trim() || busy} onClick={() => void findReceipt()}>{busy ? 'Finding…' : 'Find receipt'}</button>
        {receipt && matches.length > 0 && <label>Item on receipt #{receipt.saleId}
          <select value={saleItemId ?? ''} onChange={(e) => setSaleItemId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Choose matching line…</option>
            {matches.map((l) => <option key={l.saleItemId} value={l.saleItemId} disabled={!l.returnable || left(l) < -props.negativeQty}>
              {l.name}{l.serial ? ` · S/N ${l.serial}` : ''} · {money(l.unitPaidCents)} · {Math.max(0, left(l))} left
            </option>)}
          </select>
        </label>}
        {!receiptNo.trim() && <p className="msg info">No receipt: refund at today's regular price ({money(props.product.priceCents)} each), plus applicable tax. Any sale price override is ignored. This return is flagged as no receipt.</p>}
        {selected && <p>Using the original price and tax from receipt #{receipt!.saleId}.</p>}
        {error && <div className="error-text" role="alert">{error}</div>}
        <div className="row gap end">
          <button type="button" onClick={props.onCancel}>Cancel</button>
          <button type="submit" className="primary" disabled={!reason || busy || (!!receiptNo.trim() && (!receipt || !selected))}>Apply return</button>
        </div>
      </div>
    </form>
  </div>
}
