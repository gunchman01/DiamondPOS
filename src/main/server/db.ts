import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { migrations, LATEST_SCHEMA_VERSION } from './migrations'

export type DB = Database.Database

/** Open (or create) the store database and bring its schema up to date. */
export function openDatabase(file: string): DB {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new Database(file)
  db.pragma('journal_mode = WAL') // better for many readers + one writer
  db.pragma('foreign_keys = ON')
  migrate(db, file)
  return db
}

export function getSchemaVersion(db: DB): number {
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null }
  return row.v ?? 0
}

function migrate(db: DB, file: string): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)

  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map((r) => r.version)
  )

  const current = applied.size ? Math.max(...applied) : 0
  if (current > LATEST_SCHEMA_VERSION) {
    // This happens after a rollback: a newer version already upgraded the
    // database. Because migrations only ADD things, we can keep running.
    console.warn(
      `[db] Database schema v${current} is newer than this app knows (v${LATEST_SCHEMA_VERSION}). Continuing (rollback mode).`
    )
  }

  const pending = migrations.filter((m) => !applied.has(m.version)).sort((a, b) => a.version - b.version)
  if (pending.length === 0) return

  // Safety net: copy the database before changing it (skip for a brand-new DB)
  if (applied.size > 0) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupDir = path.join(path.dirname(file), 'backups')
    fs.mkdirSync(backupDir, { recursive: true })
    const backupFile = path.join(backupDir, `store-before-v${pending[0].version}-${stamp}.db`)
    db.exec(`VACUUM INTO '${backupFile.replace(/'/g, "''")}'`)
    console.log(`[db] Backup written to ${backupFile}`)
  }

  const record = db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
  for (const m of pending) {
    db.transaction(() => {
      db.exec(m.up)
      record.run(m.version, m.name)
    })()
    console.log(`[db] Applied migration ${m.version}: ${m.name}`)
  }
}
