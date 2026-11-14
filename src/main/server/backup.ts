import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import type { DB } from './db'

const BACKUP_INTERVAL_MS = 15 * 60 * 1000

/**
 * Runs consistent SQLite online backups while the store is operating.
 *
 * better-sqlite3's backup API reads a transactionally consistent snapshot;
 * copying the live .db file directly is unsafe when WAL mode is enabled.
 */
export function startBackupScheduler(db: DB, backupDirectory: string): () => Promise<void> {
  fs.mkdirSync(backupDirectory, { recursive: true })

  let stopped = false
  let inFlight: Promise<void> | null = null

  const runBackup = (): Promise<void> => {
    if (stopped || inFlight) return inFlight ?? Promise.resolve()

    inFlight = createVerifiedBackup(db, backupDirectory)
      .then((file) => console.info(`[backup] Verified scheduled backup: ${file}`))
      .catch((error: unknown) => {
        console.error('[backup] Scheduled backup failed:', error)
      })
      .finally(() => {
        inFlight = null
      })

    return inFlight
  }

  // Take a baseline backup at server startup, then every 15 minutes.
  void runBackup()
  const timer = setInterval(() => void runBackup(), BACKUP_INTERVAL_MS)
  timer.unref()

  return async () => {
    stopped = true
    clearInterval(timer)
    if (inFlight) await inFlight
  }
}

export async function createVerifiedBackup(db: DB, directory: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `store-auto-${stamp}.db`
  const destination = path.join(directory, filename)
  const temporary = `${destination}.partial`

  // A stale partial file can remain after power loss or a forced shutdown.
  await fs.promises.rm(temporary, { force: true })

  try {
    // SQLite's online backup API includes committed WAL content safely.
    await db.backup(temporary)

    const check = new Database(temporary, { readonly: true, fileMustExist: true })
    try {
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
