import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import type express from 'express'
import type { DB } from './db'
import { recordBackup, backupStatus } from './operations'
import { DEFAULT_BACKUP_SETTINGS, validateBackupSettings, type BackupSettings, type BackupOverview } from '../../shared/backups'

// Exact generated names only: pre-migration, manual copies, partials and unknown files are never pruned.
const managedName = /^store-auto-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.db$/
function readSetting<T>(db: DB, key: string): T | null {
  try { const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key) as { value: string } | undefined; return row ? JSON.parse(row.value) : null } catch { return null }
}
function writeSetting(db: DB, key: string, value: unknown) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value))
}
export function backupSettings(db: DB): BackupSettings {
  try { return validateBackupSettings(readSetting(db, 'backup_settings')) } catch { return { ...DEFAULT_BACKUP_SETTINGS } }
}

/** Called only after publishing a new integrity-checked snapshot. Never touches other naming families. */
export async function pruneScheduledBackups(directory: string, keepCount: number, newestFile: string): Promise<void> {
  if (!Number.isInteger(keepCount) || keepCount < 1) throw new Error('Invalid retention count')
  if (!managedName.test(path.basename(newestFile)) || path.resolve(path.dirname(newestFile)) !== path.resolve(directory)) throw new Error('Invalid verified backup path')
  const newest = await fs.promises.lstat(newestFile)
  if (!newest.isFile() || newest.size === 0) throw new Error('Verified backup is missing')
  const names = (await fs.promises.readdir(directory, { withFileTypes: true })).filter((f) => f.isFile() && managedName.test(f.name)).map((f) => f.name).sort().reverse()
  const keep = new Set([path.basename(newestFile), ...names.filter((n) => n !== path.basename(newestFile)).slice(0, keepCount - 1)])
  for (const name of names) if (!keep.has(name)) await fs.promises.unlink(path.join(directory, name))
}

export function createBackupManager(db: DB, directory: string) {
  let active = false, closed = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let nextBackupAt: string | null = null
  let inFlight: Promise<string> | null = null
  let cleanupError: string | null = null
  function schedule() {
    if (timer) clearTimeout(timer)
    timer = null; nextBackupAt = null
    if (!active || closed || inFlight) return
    const delay = backupSettings(db).intervalMinutes * 60000
    nextBackupAt = new Date(Date.now() + delay).toISOString()
    timer = setTimeout(() => { nextBackupAt = null; void run().catch(() => {}) }, delay)
    timer.unref()
  }
  function run(): Promise<string> {
    if (closed) return Promise.reject(new Error('Backup service is stopping'))
    if (inFlight) return inFlight
    if (timer) clearTimeout(timer)
    timer = null; nextBackupAt = null
    recordBackup(db, 'started')
    inFlight = (async () => {
      try {
        const file = await createVerifiedBackup(db, directory)
        recordBackup(db, 'verified')
        writeSetting(db, 'backup_last_file', file)
        cleanupError = null
        try { await pruneScheduledBackups(directory, backupSettings(db).keepCount, file) }
        catch (error) { cleanupError = (error as Error).message; console.error('[backup] Retention cleanup failed:', error) }
        console.info(`[backup] Verified backup: ${file}`)
        return file
      } catch (error) {
        recordBackup(db, 'failed', (error as Error).message)
        console.error('[backup] Backup failed:', error)
        throw error
      }
    })().finally(() => { inFlight = null; schedule() })
    return inFlight
  }
  return {
    run,
    start() { if (active || closed) return; active = true; void run().catch(() => {}) },
    async stop() { active = false; closed = true; if (timer) clearTimeout(timer); timer = null; nextBackupAt = null; await inFlight?.catch(() => {}) },
    save(value: unknown) { const settings = validateBackupSettings(value); writeSetting(db, 'backup_settings', settings); schedule(); return settings },
    async overview(): Promise<BackupOverview> {
      let totalBytes = 0, fileCount = 0, managedCount = 0, protectedCount = 0
      const entries = await fs.promises.readdir(directory, { withFileTypes: true }).catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return []; throw e })
      for (const f of entries) if (f.isFile()) {
        try { totalBytes += (await fs.promises.stat(path.join(directory, f.name))).size; fileCount++; if (managedName.test(f.name)) managedCount++; else protectedCount++ }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      }
      return { settings: backupSettings(db), status: { ...backupStatus(db), running: !!inFlight }, directory,
        nextBackupAt, schedulerRunning: active, totalBytes, fileCount, managedCount, protectedCount, cleanupError,
        lastFile: readSetting<string>(db, 'backup_last_file') }
    }
  }
}
const managers = new WeakMap<DB, ReturnType<typeof createBackupManager>>()
export function getBackupManager(db: DB, directory: string) {
  let manager = managers.get(db)
  if (!manager) { manager = createBackupManager(db, directory); managers.set(db, manager) }
  return manager
}
/** Startup backup, followed by the saved interval; stop waits for an active snapshot/cleanup. */
export function startBackupScheduler(db: DB, directory: string): () => Promise<void> {
  const manager = getBackupManager(db, directory)
  manager.start()
  return () => manager.stop()
}
export function registerBackupRoutes(app: express.Express, db: DB, directory: string) {
  const manager = getBackupManager(db, directory)
  app.get('/api/backups', (_req, res, next) => { void manager.overview().then((v) => res.json(v)).catch(next) })
  app.put('/api/backups/settings', (req, res, next) => {
    try { manager.save(req.body) } catch (error) { res.status(400).json({ error: (error as Error).message }); return }
    void manager.overview().then((v) => res.json(v)).catch(next)
  })
  app.post('/api/backups/run', (_req, res) => { void manager.run().then(() => manager.overview()).then((v) => res.json(v)).catch((e) => res.status(500).json({ error: (e as Error).message })) })
}

export async function createVerifiedBackup(db: DB, directory: string): Promise<string> {
  await fs.promises.mkdir(directory, { recursive: true })
  let timestamp = Date.now()
  let stamp = new Date(timestamp).toISOString().replace(/[:.]/g, '-')
  while (fs.existsSync(path.join(directory, `store-auto-${stamp}.db`))) stamp = new Date(++timestamp).toISOString().replace(/[:.]/g, '-')
  const filename = `store-auto-${stamp}.db`
  const destination = path.join(directory, filename)
  const temporary = `${destination}.partial`

  // A stale partial file can remain after power loss or a forced shutdown.
  await fs.promises.rm(temporary, { force: true })

  try {
    // SQLite's online backup API includes committed WAL content safely.
    await db.backup(temporary)

    const check = new Database(temporary, { fileMustExist: true })
    try {
      // This is the unpublished snapshot, never the live store. Make it standalone
      // and avoid leaving readonly verification WAL/SHM sidecars in the backup folder.
      check.pragma('journal_mode = DELETE')
      const result = check.pragma('integrity_check', { simple: true }) as string
      if (result !== 'ok') throw new Error(`SQLite integrity_check failed: ${result}`)
    } finally {
      check.close()
    }

    // Publish only a fully written and verified backup.
    await fs.promises.rename(temporary, destination)
    return destination
  } catch (error) {
    await fs.promises.rm(temporary, { force: true }).catch(() => undefined)
    throw error
  }
}
