import { useEffect, useState } from 'react'
import type { BackupOverview } from '../../../shared/backups'
import { api } from '../api'

const when = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not yet recorded'
const size = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`
export default function BackupSettings() {
  const [data, setData] = useState<BackupOverview | null>(null)
  const [interval, setIntervalMinutes] = useState(60)
  const [keep, setKeep] = useState('12')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => {
    let closed = false
    api.backups().then((v) => { if (!closed) { setData(v); setIntervalMinutes(v.settings.intervalMinutes); setKeep(String(v.settings.keepCount)) } }).catch((e) => { if (!closed) setError(e.message) })
    const timer = window.setInterval(() => { api.backups().then((v) => { if (!closed) setData(v) }).catch((e) => { if (!closed) setError(e.message) }) }, 15000)
    return () => { closed = true; window.clearInterval(timer) }
  }, [])
  async function save() {
    if (!/^\d+$/.test(keep) || Number(keep) < 1 || Number(keep) > 365) { setError('Keep between 1 and 365 recent backups.'); return }
    setBusy(true); setError(''); setMessage('')
    try { setData(await api.saveBackupSettings({ intervalMinutes: interval, keepCount: Number(keep) })); setMessage('Backup settings saved on the Store Server. The next backup uses this schedule. Retention is applied after the next successful backup.') }
    catch(e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function run() {
    setBusy(true); setError(''); setMessage('')
    try { const result = await api.runBackup(); setData(result); setMessage(result.cleanupError ? 'Backup verified; review the cleanup warning below.' : 'Backup completed and verified. Retention cleanup finished.') }
    catch(e) { setError(`${(e as Error).message} If the request timed out, check status before trying again; the server may still be working.`) }
    finally { setBusy(false) }
  }
  return <div className="backup-settings">
    <p>These settings apply to the <b>Store Server</b>, whichever computer you open this page from. Backups run while the server POS is open. A verified backup is also taken at server startup.</p>
    {error && <p className="error-text" role="alert">{error}</p>}
    {message && <p className="ok-text" role="status">{message}</p>}
    {!data ? <p>Loading server backup settings…</p> : <>
      <div className="row gap" style={{alignItems:'end',flexWrap:'wrap'}}>
        <label>Backup frequency<select value={interval} disabled={busy} onChange={(e) => setIntervalMinutes(Number(e.target.value))}>
          <option value={15}>Every 15 minutes</option><option value={30}>Every 30 minutes</option><option value={60}>Every hour</option><option value={240}>Every 4 hours</option><option value={1440}>Every 24 hours</option>
        </select></label>
        <label>Recent copies to keep<input type="number" min={1} max={365} step={1} value={keep} disabled={busy} onChange={(e) => setKeep(e.target.value)} /></label>
        <button className="primary" disabled={busy} onClick={save}>Save backup settings</button>
        <button disabled={busy || data.status.running} onClick={run}>{busy || data.status.running ? 'Working…' : 'Back Up Now'}</button>
      </div>
      <p className="small muted">Retention counts scheduled, startup and Back Up Now copies together. Older copies are removed only after a new snapshot passes SQLite verification. Changing retention does not immediately delete files. Pre-migration backups (store-before-v…) and other files are never removed by this cleanup.</p>
      <h3>Server backup status</h3>
      <dl className="backup-details">
        <dt>Status</dt><dd>{data.status.running ? 'Backup in progress' : data.schedulerRunning ? 'Schedule running' : 'Schedule not running'}</dd>
        <dt>Last successful backup</dt><dd>{when(data.status.lastVerifiedAt)}</dd>
        <dt>Next scheduled backup</dt><dd>{data.status.running ? 'Scheduled after the current backup finishes' : data.nextBackupAt ? when(data.nextBackupAt) : 'Not scheduled — server must be running'}</dd>
        <dt>Last attempt</dt><dd>{when(data.status.lastAttemptAt)}</dd>
        <dt>Backup folder (server PC)</dt><dd><code>{data.directory}</code></dd>
        <dt>Folder size</dt><dd>{size(data.totalBytes)} · {data.fileCount} files</dd>
        <dt>Recent managed copies</dt><dd>{data.managedCount} · saved retention: {data.settings.keepCount}</dd>
        <dt>Other files kept separately</dt><dd>{data.protectedCount} (including any pre-migration snapshots or incomplete files)</dd>
        <dt>Latest verified file</dt><dd><code>{data.lastFile ?? 'Not recorded for an earlier backup'}</code></dd>
      </dl>
      {data.status.error && <p className="error-text">Last backup failure ({when(data.status.lastFailureAt)}): {data.status.error}. The previous verified backup time is retained.</p>}
      {data.cleanupError && <p className="error-text">Backup succeeded, but older files could not all be removed: {data.cleanupError}</p>}
      <p className="muted">These copies are stored on the server. Keep a separate copy on another drive or off the PC for drive-failure protection. This page does not configure an off-site copy or restore a database.</p>
    </>}
  </div>
}
