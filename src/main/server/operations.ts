import type { DB } from './db'
import type { BackupStatus, OperationsStatus } from '../../shared/operations'
import { getQbConfig, getQbLists } from './quickbooks/store'

function read<T>(db: DB, key: string): Partial<T> {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  try { return row ? JSON.parse(row.value) : {} } catch { return {} }
}
function write(db: DB, key: string, value: unknown) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value))
}
export function backupStatus(db: DB): BackupStatus {
  return { lastVerifiedAt: null, lastAttemptAt: null, lastFailureAt: null, error: null, running: false,
    ...read<BackupStatus>(db, 'operations_backup') }
}
/** Only call success after the online backup passed integrity_check and was renamed. */
export function recordBackup(db: DB, event: 'started' | 'verified' | 'failed', error?: string) {
  const next = backupStatus(db)
  const now = new Date().toISOString()
  if (event === 'started') { next.lastAttemptAt = now; next.running = true }
  else if (event === 'verified') { next.lastVerifiedAt = now; next.error = null; next.running = false }
  else { next.lastFailureAt = now; next.error = error || 'Backup failed'; next.running = false }
  write(db, 'operations_backup', next)
}
interface QbHistory { lastConnectionAt: string | null; lastSyncAt: string | null; lastFailureAt: string | null; error: string | null }
export function recordQbCompletion(db: DB, synced: boolean) {
  const previous = read<QbHistory>(db, 'operations_quickbooks')
  const now = new Date().toISOString()
  write(db, 'operations_quickbooks', { ...previous, lastConnectionAt: now,
    lastSyncAt: synced ? now : previous.lastSyncAt ?? null, error: null })
}
export function recordQbFailure(db: DB, error: string) {
  write(db, 'operations_quickbooks', { ...read<QbHistory>(db, 'operations_quickbooks'),
    lastFailureAt: new Date().toISOString(), error: error.slice(0, 1000) })
}
export function operationsStatus(db: DB): OperationsStatus {
  const cfg = getQbConfig(db)
  const counts = db.prepare(`SELECT
    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
    SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS problems,
    SUM(CASE WHEN status = 'manual' THEN 1 ELSE 0 END) AS manual FROM qb_sale_exports`).get() as
    { pending: number | null; problems: number | null; manual: number | null }
  return {
    serverTime: new Date().toISOString(), backup: backupStatus(db),
    quickbooks: { enabled: cfg.enabled, companyName: getQbLists(db).companyName,
      lastConnectionAt: null, lastSyncAt: null, lastFailureAt: null, error: null,
      ...read<QbHistory>(db, 'operations_quickbooks'), pending: counts.pending ?? 0, problems: counts.problems ?? 0, manual: counts.manual ?? 0 }
  }
}
