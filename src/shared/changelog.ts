/**
 * CHANGELOG.md -> release notes per version.
 * Sections start with "## v1.2.3" (anything after the version, like a date, is ignored).
 * A line "> Update the Store Server PC first." marks a release that changes the database.
 * (scripts/release-notes.mjs does the same split when GitHub Actions publishes a release.)
 */
export function parseChangelog(md: string): Record<string, string> {
  const out: Record<string, string> = {}
  let version: string | null = null
  let lines: string[] = []
  const flush = () => {
    if (version) out[version] = lines.join('\n').trim()
  }
  let fence = false // ignore examples inside ``` blocks
  for (const line of md.replace(/\r\n/g, '\n').split('\n')) {
    if (line.startsWith('```')) {
      fence = !fence
      if (version) lines.push(line)
      continue
    }
    const m = fence ? null : /^##\s+v?(\d+\.\d+\.\d+[\w.-]*)/.exec(line)
    if (m) {
      flush()
      version = m[1]
      lines = []
    } else if (!fence && (/^##\s/.test(line) || /^---\s*$/.test(line))) {
      flush()
      version = null
    } else if (version) lines.push(line)
  }
  flush()
  return out
}

/** The release changes the database, so the Store Server PC must be updated before the tills */
export const needsServerFirst = (notes: string) => /update the store server/i.test(notes)
