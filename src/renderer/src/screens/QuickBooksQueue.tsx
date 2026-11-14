import { useEffect, useState } from 'react'
import type { QbQueuePage, QbQueueState } from '../../../shared/quickbooks'
import { api } from '../api'
import { dateTime, money } from '../format'
const labels: Record<QbQueueState, string> = { waiting: 'Waiting', synced: 'Synced / entered', failed: 'Failed', manual: 'Manual entry needed', excluded: 'Excluded' }

export default function QuickBooksQueue({ enabled, syncing }: { enabled: boolean; syncing: boolean }) {
  const [data, setData] = useState<QbQueuePage | null>(null)
  const [state, setState] = useState('')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<number[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let live = true, loading = false
    setSelected([]); setData(null); setError('')
    async function load() {
      if (loading) return
      loading = true
      try {
        const query = new URLSearchParams({ status: state, search, from, to, page: String(page) })
        const result = await api.qbQueue(query.toString())
        if (!live) return
        setData(result); setError('')
        setSelected((current) => current.filter((id) => result.rows.some((r) => r.saleId === id && r.eligible)))
      } catch (e) { if (live) { setError((e as Error).message); setData(null); setSelected([]) } }
      finally { loading = false }
    }
    const start = setTimeout(() => void load(), 200)
    const timer = setInterval(() => void load(), 15000)
    return () => { live = false; clearTimeout(start); clearInterval(timer) }
  }, [state, search, from, to, page, refresh])
  const eligible = data?.rows.filter((r) => r.eligible) ?? []
  async function queueSelected() {
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await api.qbQueueSelected(selected)
      setMessage(`${result.queued} transaction(s) queued. Run Update Selected in Web Connector or wait for its next Auto-Run.${enabled ? '' : ' Sending is off; review mapping and enable it when ready.'}`)
      setSelected([]); setRefresh((n) => n+1)
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  return <section className="card form qb-queue" aria-label="QuickBooks transaction sync queue">
    <div className="row between"><h3>Transaction sync queue</h3><button disabled={busy} onClick={() => setRefresh((n) => n+1)}>Refresh queue</button></div>
    <p className="small muted">Normal sales sync automatically. Select Waiting or Failed transactions to queue a check/retry for the next Web Connector run. Synced, excluded and manual transactions cannot be sent from this action. Checking a box does not send money or charge a card.</p>
    {!enabled && <div className="msg info">Sending is off. You can prepare the queue; nothing transfers until sending is enabled and Web Connector runs.</div>}
    {syncing && <div className="msg info">Connector session in progress. Queue changes are available after it finishes.</div>}
    <div className="qb-queue-filters">
      <label>Status<select value={state} disabled={busy} onChange={(e) => { setState(e.target.value); setPage(1) }}><option value="">All transactions</option>{Object.entries(labels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label>Receipt / customer / QB number<input value={search} disabled={busy} onChange={(e) => { setSearch(e.target.value); setPage(1) }} /></label>
      <label>From<input type="date" value={from} disabled={busy} onChange={(e) => { setFrom(e.target.value); setPage(1) }} /></label>
      <label>To<input type="date" value={to} disabled={busy} onChange={(e) => { setTo(e.target.value); setPage(1) }} /></label>
    </div>
    {data && <div className="small muted">{Object.entries(labels).map(([key,label]) => `${label}: ${data.counts[key as QbQueueState]}`).join(' · ')}</div>}
    <div className="row gap"><button className="primary" disabled={busy || syncing || !selected.length} onClick={() => void queueSelected()}>{busy ? 'Queuing…' : `Queue selected for sync (${selected.length})`}</button><span className="small muted">Selection is limited to the current page.</span></div>
    {message && <div className="ok-text" role="status">{message}</div>}{error && <div className="error-text" role="alert">{error}</div>}
    {!data && !error && <p>Loading transactions…</p>}
    {data && <>
      <div className="qb-queue-table"><table className="table qb-table"><thead><tr>
        <th><input aria-label="Select eligible transactions on this page" type="checkbox" disabled={busy || syncing || !eligible.length} checked={eligible.length > 0 && eligible.every((r) => selected.includes(r.saleId))} onChange={(e) => setSelected(e.target.checked ? eligible.map((r) => r.saleId) : [])} /></th>
        <th>POS receipt / Date</th><th>Customer</th><th className="r">Total</th><th>Status</th><th>QuickBooks / Details</th>
      </tr></thead><tbody>{data.rows.map((r) => <tr key={r.saleId}>
        <td><input type="checkbox" aria-label={`Select receipt ${r.saleId}`} disabled={!r.eligible || busy || syncing} checked={selected.includes(r.saleId)} onChange={(e) => setSelected((ids) => e.target.checked ? [...ids, r.saleId] : ids.filter((id) => id !== r.saleId))} /></td>
        <td><b>#{r.saleId}</b><br /><span className="small muted">{dateTime(r.createdAt)}</span></td><td>{r.customerName}</td><td className="r">{money(r.totalCents)}</td>
        <td><span className={`badge ${r.status === 'synced' ? 'new' : r.status === 'failed' || r.status === 'manual' ? 'err' : 'upd'}`}>{r.status === 'synced' ? r.txnId === 'MANUAL' ? 'Entered by hand' : 'Synced' : labels[r.status]}</span>{r.queued && r.status === 'waiting' && <div className="small muted">Queued</div>}</td>
        <td>{r.refNumber && <b>{r.refNumber}</b>}<div className="small">{r.reason || 'Eligible for the next automatic connector run.'}</div>{r.sentAt && <div className="small muted">Confirmed/marked: {dateTime(r.sentAt)}</div>}{r.txnId && <div className="small muted">Transaction: {r.txnId}</div>}</td>
      </tr>)}</tbody></table></div>
      {!data.rows.length && <p className="muted">No transactions match these filters.</p>}
      <div className="row between"><button disabled={busy || page === 1} onClick={() => setPage((p) => p-1)}>Previous</button><span>Page {page} · {data.total} matching transaction(s)</span><button disabled={busy || page*data.pageSize >= data.total} onClick={() => setPage((p) => p+1)}>Next</button></div>
    </>}
  </section>
}
