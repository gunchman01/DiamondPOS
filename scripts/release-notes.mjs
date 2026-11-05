// Prints the CHANGELOG.md section for a version (used by .github/workflows/release.yml).
// Usage: node scripts/release-notes.mjs v1.2.3 > notes.md
import fs from 'node:fs'

const version = String(process.argv[2] || '').replace(/^v/, '')
const md = fs.readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
let inSection = false
const lines = []
let fence = false // ignore examples inside ``` blocks
for (const line of md.split('\n')) {
  if (line.startsWith('```')) {
    fence = !fence
    if (inSection) lines.push(line)
    continue
  }
  const m = fence ? null : /^##\s+v?(\d+\.\d+\.\d+[\w.-]*)/.exec(line)
  if (m) inSection = m[1] === version
  else if (!fence && (/^##\s/.test(line) || /^---\s*$/.test(line))) inSection = false
  else if (inSection) lines.push(line)
}
const notes = lines.join('\n').trim()
if (!notes) {
  console.error(`::warning::CHANGELOG.md has no section for v${version}. Add "## v${version}" next time.`)
  process.stdout.write(`No release notes were written for v${version}.\n`)
} else process.stdout.write(notes + '\n')
