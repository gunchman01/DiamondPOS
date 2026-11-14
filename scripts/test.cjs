// Run SQLite tests with Electron's Node ABI, matching the installed POS.
const { buildSync } = require('esbuild')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const dir = fs.mkdtempSync(path.join(__dirname, '../node_modules/.diamondpos-tests-'))
try {
  const outfile = path.join(dir, 'regressions.cjs')
  buildSync({ entryPoints: [path.join(__dirname, '../tests/regressions.ts')], outfile, bundle: true,
    platform: 'node', format: 'cjs', packages: 'external' })
  const result = spawnSync(require('electron'), [outfile], { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally { fs.rmSync(dir, { recursive: true, force: true }) }
