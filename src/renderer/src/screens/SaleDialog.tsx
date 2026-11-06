import { useEffect, useState } from 'react'
import type { Sale } from '../../../shared/types'
import { api } from '../api'
import { dateTime, money } from '../format'
import { receiptHtml } from '../receipt'

/** Shows one receipt / transaction (from a customer's history or Sales History) with Reprint. */
export default function SaleDialog({ saleId, onClose }: { saleId: number; onClose: () => void }) {
  const [sale, setSale] = useState<Sale | null>(null)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    api.getSale(saleId).then(setSale).catch((e) => setError(e.message))
  }, [saleId])

  async function reprint() {
    if (!sale) return
    try {
      await window.pos.printReceipt(receiptHtml(sale, await api.getSettings()))
      setMsg('Sent to the printer')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const refund = !!sale && sale.totalCents < 0
  const hasReturn = !!sale?.items.some((i) => i.kind === 'return')

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal sale-dlg" onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }} tabIndex={-1}>
        <h2>
          Receipt #{saleId}
          {refund ? ' · REFUND' : hasReturn ? ' · EXCHANGE' : ''}
        </h2>
        {error && <div className="error-text">{error}</div>}
        {!sale && !error && <p className="muted">Loading…</p>}
        {sale && (
          <>
            <div className="sale-head">
              <div>
                <span className="muted small">Date</span>
                <b>{dateTime(sale.createdAt)}</b>
              </div>
              <div>
                <span className="muted small">Till</span>
                <b>{sale.tillName}</b>
              </div>
              <div>
                <span className="muted small">Customer</span>
                <b>{sale.customerName ?? '—'}</b>
              </div>
              {sale.workOrderId && (
                <div>
                  <span className="muted small">Work order</span>
                  <b>WO-{String(sale.workOrderId).padStart(6, '0')}</b>
                </div>
              )}
            </div>
            {sale.taxExempt && <div className="msg info">Tax exempt sale · Farm Tax ID {sale.taxExemptId}</div>}
            {sale.noReceiptReturn && <div className="msg error">Return without a receipt</div>}
            <div className="grid-wrap sale-lines">
              <table className="grid">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="num" style={{ width: 60 }}>Qty</th>
                    <th className="num" style={{ width: 90 }}>Price</th>
                    <th className="num" style={{ width: 100 }}>Ext. Price</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items.map((i, k) => (
                    <tr key={i.id ?? k} className={i.kind === 'return' ? 'return-row' : i.kind === 'wo' || i.kind === 'credit' || i.kind === 'feekept' ? 'wo-row' : ''}>
                      <td>
                        {i.kind === 'return' && <span className="return-tag">RETURN</span>} {i.name}
                        {i.serial && <span className="serial-tag">S/N {i.serial}</span>}
                        {i.kind === 'return' && (
                          <span className="serial-tag">
                            {i.returnOfSaleId ? `From receipt #${i.returnOfSaleId}` : 'No receipt'}
                            {i.returnReason ? ` · ${i.returnReason}` : ''} · {i.restocked ? 'back to stock' : 'not restocked'}
                          </span>
                        )}
                      </td>
                      <td className="num">{i.qty}</td>
                      <td className="num">{money(i.unitPriceCents)}</td>
                      <td className="num">{money(i.lineTotalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sale-totals">
              <div className="tline big">
                <span>{refund ? 'Refunded' : 'Total'}</span>
                <b>{money(Math.abs(sale.totalCents))}</b>
              </div>
              {sale.taxExempt ? (
                <div className="tline muted">
                  <span>Tax exempt (tax removed)</span>
                  <span>−{money(sale.taxExemptCents)}</span>
                </div>
              ) : (
                <div className="tline muted">
                  <span>Tax included</span>
                  <span>{money(sale.taxCents)}</span>
                </div>
              )}
              {sale.payments.map((p, k) => (
                <div key={k} className="tline">
                  <span>
                    {p.method === 'cash' ? 'Cash' : 'Card'}
                    {p.amountCents < 0 ? ' refund' : ''}
                    {p.reference ? ` (${p.reference})` : ''}
                  </span>
                  <span>{money(p.amountCents)}</span>
                </div>
              ))}
              {sale.changeCents > 0 && (
                <div className="tline">
                  <span>Change</span>
                  <span>{money(sale.changeCents)}</span>
                </div>
              )}
            </div>
          </>
        )}
        {msg && <div className="ok-text">{msg}</div>}
        <div className="row gap end">
          <button type="button" disabled={!sale} onClick={reprint}>
            Reprint receipt
          </button>
          <button type="button" className="primary" autoFocus onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
