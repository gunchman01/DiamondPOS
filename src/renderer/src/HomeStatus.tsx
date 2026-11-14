import { useEffect, useState } from 'react'
import type { DailyReport } from '../../shared/types'
import type { OperationsStatus } from '../../shared/operations'
import { api } from './api'
import { dateTime, money, today } from './format'

/** Only successful server reads show current status; historical timestamps are labelled explicitly. */
export default function HomeStatus({ onQuickBooks, onReports }: { onQuickBooks: () => void; onReports: () => void }) {
  const [report, setReport] = useState<DailyReport | null>(null)
  const [status, setStatus] = useState<OperationsStatus | null>(null)
  const [reachable, setReachable] = useState<boolean | null>(null)
  const [detailsAvailable, setDetailsAvailable] = useState(false)
  const [checked, setChecked] = useState<string | null>(null)
  useEffect(() => {
    let live = true, busy = false
    async function refresh() {
      if (busy) return
      busy = true
      try {
        const [sales, operations] = await Promise.allSettled([api.dailyReport(today()), api.operationsStatus()])
        if (!live) return
        setReport(sales.status === 'fulfilled' ? sales.value : null)
        setDetailsAvailable(operations.status === 'fulfilled')
        setReachable(sales.status === 'fulfilled' || operations.status === 'fulfilled')
        if (operations.status === 'fulfilled') setStatus(operations.value)
        setChecked(new Date().toISOString())
      } finally { busy = false }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 30000)
    return () => { live = false; clearInterval(timer) }
  }, [])
  const backup = status?.backup
  const qb = status?.quickbooks
  const staleBackup = !!backup?.lastVerifiedAt && !!status && Date.parse(status.serverTime) - Date.parse(backup.lastVerifiedAt) > 30 * 60000
  const timestamp = (value: string | null | undefined) => value ? dateTime(value) : 'Not recorded yet'
  const unavailable = !detailsAvailable
  return <section className="home-status" aria-label="Today's totals and store status">
    <article className="home-status-card">
      <button className="home-status-heading" onClick={onReports}>Today’s sales</button>
      {report ? <>
        <div className="home-status-total">{money(report.totalCents)} <span>· {report.saleCount} receipt(s)</span></div>
        <div className="home-status-tenders"><span>Cash <b>{money(report.cashCents)}</b></span><span>Card <b>{money(report.cardCents)}</b></span><span>Checks <b>{money(report.checkCents ?? 0)}</b></span></div>
      </> : <p className="muted">{checked ? 'Sales totals unavailable' : 'Loading sales totals…'}</p>}
    </article>
    <article className={`home-status-card ${unavailable ? 'unknown' : qb?.error || qb?.problems || qb?.manual ? 'attention' : ''}`}>
      <button className="home-status-heading" onClick={onQuickBooks}>QuickBooks</button>
      <div className="home-status-state">{unavailable ? 'Status unavailable' : qb?.enabled ? 'Sending enabled' : 'Sending off'}</div>
      <div>Last successful sync <b>{timestamp(qb?.lastSyncAt)}</b></div>
      <div className="muted small">Last successful connection: {timestamp(qb?.lastConnectionAt)}</div>
      {qb && <div className="small">{qb.problems} problem(s) · {qb.manual} manual · {qb.pending} queued</div>}
      {qb?.error && <div className="error-text small" title={qb.error}>{qb.error}</div>}
      {unavailable && <div className="muted small">{status ? 'Showing last received history.' : 'Update the Store Server first if this is a new installation.'}</div>}
    </article>
    <article className={`home-status-card ${unavailable ? 'unknown' : backup?.error || staleBackup ? 'attention' : ''}`}>
      <h3 className="home-status-heading">Database backup</h3>
      <div className="home-status-state">{unavailable ? 'Status unavailable' : backup?.error ? 'Last backup failed' : backup?.running ? 'Backup in progress' : staleBackup ? 'Backup overdue' : backup?.lastVerifiedAt ? 'Verified backup available' : 'Waiting for first verified backup'}</div>
      <div>Last verified backup <b>{timestamp(backup?.lastVerifiedAt)}</b></div>
      {backup?.error && <div className="error-text small" title={backup.error}>{backup.error}</div>}
      {backup?.lastFailureAt && backup.error && <div className="small muted">Failed: {timestamp(backup.lastFailureAt)}</div>}
      <div className="muted small">Every 15 minutes while the server runs · stored on the server PC</div>
    </article>
    <article className={`home-status-card ${reachable === false ? 'attention' : ''}`}>
      <h3 className="home-status-heading">Store server</h3>
      <div className="home-status-state"><span className={`dot ${reachable ? 'ok' : 'bad'}`} /> {reachable === null ? 'Checking…' : reachable ? 'Connected' : 'Connection not confirmed'}</div>
      <div className="small">Last checked <b>{timestamp(checked)}</b></div>
      <div className="muted small">Refreshes every 30 seconds</div>
      {reachable && !detailsAvailable && <div className="small error-text">Server reachable; status details unavailable.</div>}
    </article>
  </section>
}
