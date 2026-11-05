import type { ReactNode } from 'react'

/**
 * Shows release notes written in simple Markdown (from CHANGELOG.md):
 * "- " bullets (indent 2 spaces for sub-bullets), **bold**, `code`, and "> " notes.
 * Built as React elements (no raw HTML), so notes can't inject anything into the app.
 */
export default function ReleaseNotes({ text, hideServerNote }: { text: string; hideServerNote?: boolean }) {
  if (!text.trim()) return <p className="muted small">No release notes for this version.</p>
  const blocks: ReactNode[] = []
  let list: { depth: number; text: string }[] = []
  const flushList = () => {
    if (list.length) blocks.push(<BulletList key={blocks.length} items={list} />)
    list = []
  }
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const bullet = /^(\s*)[-*]\s+(.*)$/.exec(raw)
    if (bullet) {
      list.push({ depth: Math.floor(bullet[1].length / 2), text: bullet[2] })
      continue
    }
    flushList()
    const line = raw.trim()
    if (!line || line.startsWith('```')) continue
    if (line.startsWith('>')) {
      const t = line.replace(/^>\s*/, '')
      if (hideServerNote && /update the store server/i.test(t)) continue
      blocks.push(
        <div key={blocks.length} className="callout warn">
          {inline(t)}
        </div>
      )
    } else if (/^#{1,6}\s/.test(line)) blocks.push(<b key={blocks.length}>{inline(line.replace(/^#+\s*/, ''))}</b>)
    else blocks.push(<p key={blocks.length}>{inline(line)}</p>)
  }
  flushList()
  return <div className="release-notes">{blocks}</div>
}

/** Flat list of {depth, text} -> nested <ul> */
function BulletList({ items }: { items: { depth: number; text: string }[] }) {
  const out: ReactNode[] = []
  for (let i = 0; i < items.length; i++) {
    const start = i
    const base = items[start].depth
    const kids: { depth: number; text: string }[] = []
    while (i + 1 < items.length && items[i + 1].depth > base) {
      i++
      kids.push({ text: items[i].text, depth: items[i].depth - base - 1 })
    }
    out.push(
      <li key={start}>
        {inline(items[start].text)}
        {kids.length > 0 && <BulletList items={kids} />}
      </li>
    )
  }
  return <ul>{out}</ul>
}

/** **bold** and `code` */
function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <b key={i}>{part.slice(2, -2)}</b>
    ) : part.startsWith('`') && part.endsWith('`') && part.length > 2 ? (
      <code key={i}>{part.slice(1, -1)}</code>
    ) : (
      part
    )
  )
}
