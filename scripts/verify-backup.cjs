// npm run verify:backup -- [optional path to a backup .db]
// Uses Electron's SQLite ABI and checks a temporary restore copy, never store.db.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
if (!process.versions.electron) {
  const result = require('node:child_process').spawnSync(require('electron'), [__filename, ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  })
  if (result.error) throw result.error
  process.exit(result.status ?? 1)
}
let directory
try {
  let source = process.argv[2]
  if (!source) {
    if (!process.env.APPDATA) throw new Error('Supply a backup .db path on this operating system.')
    const backups = path.join(process.env.APPDATA, 'DiamondPOS', 'data', 'backups')
    const names = fs.readdirSync(backups).filter((n) => /^store-auto-.*\.db$/.test(n)).sort().reverse()
    if (!names.length) throw new Error('No scheduled backup found. Start the Store Server first.')
    source = path.join(backups, names[0])
  }
  if (!/^store-(auto-|before-v).*\.db$/.test(path.basename(source)))
    throw new Error('Choose a completed store-auto- or store-before-v backup, not the live store.db.')
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'diamondpos-restore-check-'))
  const target = path.join(directory, 'restore-test.db')
  fs.copyFileSync(source, target)
  const db = new (require('better-sqlite3'))(target, { readonly: true, fileMustExist: true })
  try {
    const integrity = db.pragma('integrity_check', { simple: true })
    if (integrity !== 'ok') throw new Error(`Integrity check failed: ${integrity}`)
    const foreignKeys = db.pragma('foreign_key_check')
    if (foreignKeys.length) throw new Error(`Foreign key check failed (${foreignKeys.length} issues)`)
    console.log(`Backup: ${source}`)
    console.log(`Integrity check: ${integrity}`)
    console.log(`Table count: ${db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'").get().n}`)
    console.log(`Sale count: ${db.prepare('SELECT COUNT(*) AS n FROM sales').get().n}`)
    console.log('Restore copy verified. Your live database was not changed.')
  } finally { db.close() }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally { if (directory) fs.rmSync(directory, { recursive: true, force: true }) }
