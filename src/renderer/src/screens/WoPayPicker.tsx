import { useEffect, useState } from 'react'
import { stage, type WoSaleMode, type WoSummary } from '../../../shared/workorders'
import { api } from '../api'
import { money } from '../format'

/** Sale screen → "Work order": tickets waiting to be paid for, with what can be done for each. */
export default function WoPayPicker(props: { onPick: (id: number, mode: WoSaleMode) => void; onCancel: () => void }) {
  const [q, setQ] = useState('')
  const [list, setList] = useState<WoSummary[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    const t = setTimeout(() => {
      api
        .woList('open', q)
        .then((l) =>
          setList(
            l.filter(
              (w) => w.status === 'ready_pickup' || w.feeStatus === 'unpaid' || (w.status === 'not_fixed' && w.feeStatus === 'paid')
            )
          )
        )
        .catch((e) => setError(e.message))
    }, 150)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="modal-backdrop">
      <div className="modal find picker" onKeyDown={(e) => e.key === 'Escape' && props.onCancel()}>
        <h2>Work order payment</h2>
        <input autoFocus placeholder="WO number, customer, phone or serial #…" value={q} onChange={(e) => setQ(e.target.value)} />
        {error && <div className="error-text">{error}</div>}
        <div className="grid-wrap find-results">
          <table className="grid">
            <thead>
              <tr>
                <th>WO #</th>
                <th>Customer / unit</th>
                <th>Stage</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((w) => (
                <tr key={w.id}>
                  <td>
                    <b>{w.number}</b>
                  </td>
                  <td>
                    {w.customerName}
                    <div className="muted small">{w.unitLabel}</div>
                  </td>
                  <td>
                    <span className="stage-badge" style={{ background: stage(w.status).color }}>
                      {stage(w.status).label}
                    </span>
                  </td>
                  <td className="r pay-actions">
                    {w.feeStatus === 'unpaid' && (
                      <button onClick={() => props.onPick(w.id, 'fee')}>Collect {money(w.feeCents)} estimate fee</button>
                    )}
                    {w.status === 'ready_pickup' && (
                      <button className="primary" onClick={() => props.onPick(w.id, 'repair')}>
                        Ring up repair · {money(w.balanceDueCents)} due
                      </button>
                    )}
                    {w.status === 'not_fixed' && w.feeStatus === 'paid' && (
                      <button onClick={() => props.onPick(w.id, 'credit')}>Credit {money(w.feeCents)} to a new purchase</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <div className="grid-empty">No work orders waiting for payment.</div>}
        </div>
        <div className="row end">
          <button onClick={props.onCancel}>Close</button>
        </div>
      </div>
    </div>
  )
}
