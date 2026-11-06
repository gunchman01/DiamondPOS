import { useEffect, useState } from 'react'
import { heldNumber, type HeldSummary } from '../../../shared/held'
import { api } from '../api'
import { dateTime, money } from '../format'

const age = (iso: string) => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  return days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`
}

function useHeld(search: string) {
  const [list, setList] = useState<HeldSummary[] | null>(null)
  const [error, setError] = useState('')
  const load = () =>
    api
      .heldList()
      .then(setList)
      .catch((e) => setError(e.message))
  useEffect(() => {
    load()
  }, [])
  const q = search.trim().toLowerCase()
  const shown = (list ?? []).filter(
    (h) => !q || [heldNumber(h.id), h.customerName, h.note, h.itemsText, h.tillName].join(' ').toLowerCase().includes(q)
  )
  return { list, shown, error, load, setError }
}

function HeldTable(props: { rows: HeldSummary[]; onOpen: (id: number) => void; onDelete?: (h: HeldSummary) => void; openLabel: string }) {
  return (
    <table className="table held-table">
      <thead>
        <tr>
          <th>Held #</th>
          <th>Customer</th>
          <th>Note</th>
          <th>Items</th>
          <th className="r">Total now</th>
          <th>Held</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {props.rows.map((h) => (
          <tr key={h.id} className="clickable" onClick={() => props.onOpen(h.id)}>
            <td>
              <b>{heldNumber(h.id)}</b>
            </td>
            <td>{h.customerName ?? <span className="muted">No customer</span>}</td>
            <td className="held-note">{h.note}</td>
            <td className="muted small">
              {h.itemCount} · {h.itemsText}
            </td>
            <td className="r">{money(h.totalCents)}</td>
            <td className="muted small" title={dateTime(h.createdAt)}>
              {age(h.createdAt)}
              <br />
              {h.tillName}
            </td>
            <td className="r nowrap">
              <button className="primary" onClick={(e) => (e.stopPropagation(), props.onOpen(h.id))}>
                {props.openLabel}
              </button>
              {props.onDelete && (
                <button className="link danger-text" title="Delete this held receipt" onClick={(e) => (e.stopPropagation(), props.onDelete!(h))}>
                  Delete
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Held Receipts screen (Home): every sale on hold, waiting for the customer to come and pay. */
export default function HeldReceipts({ onOpenAtTill }: { onOpenAtTill: (id: number) => void }) {
  const [search, setSearch] = useState('')
  const { list, shown, error, load, setError } = useHeld(search)

  async function remove(h: HeldSummary) {
    if (!confirm(`Delete held receipt ${heldNumber(h.id)}${h.customerName ? ` for ${h.customerName}` : ''}? The items are not sold.`)) return
    try {
      await api.deleteHeld(h.id)
      load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="page wide">
      <h2>Held Receipts</h2>
      <p className="muted">
        Sales built ahead of time and put on hold, for example when a part has been ordered. When the customer comes in, open it at
        the till and take payment. To hold a sale, press <b>F6 Hold receipt</b> on the Sale screen.
      </p>
      <input placeholder="Search customer, note, item or held #…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {error && <div className="error-text">{error}</div>}
      {list === null ? <p className="muted">Loading…</p> : <HeldTable rows={shown} onOpen={onOpenAtTill} onDelete={remove} openLabel="Ring up at till" />}
      {list && shown.length === 0 && <p className="muted">{search ? 'Nothing matches.' : 'No receipts on hold.'}</p>}
    </div>
  )
}

/** Sale screen: pick a held receipt to load onto the sale */
export function HeldPicker(props: { onPick: (id: number) => void; onCancel: () => void }) {
  const [search, setSearch] = useState('')
  const { list, shown, error } = useHeld(search)
  return (
    <div className="modal-backdrop">
      <div className="modal held-dlg" onKeyDown={(e) => e.key === 'Escape' && props.onCancel()}>
        <h2>Held receipts</h2>
        <input autoFocus placeholder="Search customer, note, item or held #…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {error && <div className="error-text">{error}</div>}
        <div className="held-scroll">
          {list === null ? <p className="muted">Loading…</p> : <HeldTable rows={shown} onOpen={props.onPick} openLabel="Open" />}
          {list && shown.length === 0 && <p className="muted">{search ? 'Nothing matches.' : 'No receipts on hold.'}</p>}
        </div>
        <div className="row end">
          <button onClick={props.onCancel}>Close</button>
        </div>
      </div>
    </div>
  )
}

/** Sale screen: put the current sale on hold, with a note */
export function HoldDialog(props: {
  heldNo: string | null
  note: string
  customerName: string | null
  itemCount: number
  onHold: (note: string) => Promise<void>
  onCancel: () => void
  onShowHeld: () => void
}) {
  const [note, setNote] = useState(props.note)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function hold(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await props.onHold(note.trim())
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={hold} onKeyDown={(e) => e.key === 'Escape' && !busy && props.onCancel()}>
        <h2>{props.heldNo ? `Update held receipt ${props.heldNo}` : 'Hold this receipt'}</h2>
        <p>
          {props.itemCount} item(s){props.customerName ? <> for <b>{props.customerName}</b></> : ''}. The sale is saved and the screen is cleared.
          Open it again from <b>Held receipts</b> when the customer comes to pay.
        </p>
        {!props.customerName && <div className="msg error">Tip: add the customer (F5) so the held receipt is easy to find.</div>}
        <label>
          Note (what it's waiting for, who to call…)
          <textarea className="comments" rows={3} autoFocus value={note} placeholder="e.g. Carb kit ordered, arrives Tuesday. Call Kim 555-0101" onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && <div className="error-text">{error}</div>}
        <div className="row between">
          <button type="button" className="link" onClick={props.onShowHeld}>
            See held receipts
          </button>
          <div className="row gap">
            <button type="button" onClick={props.onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Holding…' : props.heldNo ? 'Update & hold' : 'Hold receipt'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
