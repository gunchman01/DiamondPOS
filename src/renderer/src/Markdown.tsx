import type { ReactNode } from 'react'

/**
 * Small Markdown renderer for the Help manual and release notes.
 * Supports: # headings, paragraphs, - bullets and 1. numbered lists (indent to nest),
 * | tables |, > notes, **bold** and `code`. Built as React elements (no raw HTML).
 */
export default function Markdown({ text, highlight }: { text: string; highlight?: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  const hl = highlight?.trim().toLowerCase() || ''
  const fmt = (s: string) => inline(s, hl)
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const t = line.trim()
    if (!t || t.startsWith('```')) {
      i++
      continue
    }
    // Lists (with continuation lines indented under an item)
    if (LIST.test(line)) {
      const items: Item[] = []
      while (i < lines.length && (LIST.test(lines[i]) || (items.length && /^\s{2,}\S/.test(lines[i])))) {
        const m = LIST.exec(lines[i])
        if (m) items.push({ depth: Math.floor(m[1].length / 2), ordered: /\d/.test(m[2]), text: m[3] })
        else items[items.length - 1].text += '\n' + lines[i].trim()
        i++
      }
      blocks.push(<List key={blocks.length} items={items} fmt={fmt} />)
      continue
    }
    // Tables
    if (t.startsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells)
        i++
      }
      const [head, ...body] = rows
      blocks.push(
        <table key={blocks.length} className="md-table">
          <thead>
            <tr>{head.map((c, k) => <th key={k}>{fmt(c)}</th>)}</tr>
          </thead>
          <tbody>
            {body.map((r, k) => (
              <tr key={k}>{r.map((c, j) => <td key={j}>{fmt(c)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      )
      continue
    }
    if (t.startsWith('>')) blocks.push(<div key={blocks.length} className="callout warn">{fmt(t.replace(/^>\s*/, ''))}</div>)
    else if (/^#{1,6}\s/.test(t)) {
      const level = t.match(/^#+/)![0].length
      const content = fmt(t.replace(/^#+\s*/, ''))
      blocks.push(level <= 2 ? <h3 key={blocks.length}>{content}</h3> : <h4 key={blocks.length}>{content}</h4>)
    } else blocks.push(<p key={blocks.length}>{fmt(t)}</p>)
    i++
  }
  return <div className="markdown">{blocks}</div>
}

const LIST = /^(\s*)(-|\*|\d+\.)\s+(.*)$/
type Item = { depth: number; ordered: boolean; text: string }

function List({ items, fmt }: { items: Item[]; fmt: (s: string) => ReactNode[] }) {
  const out: ReactNode[] = []
  for (let i = 0; i < items.length; i++) {
    const start = i
    const base = items[start].depth
    const kids: Item[] = []
    while (i + 1 < items.length && items[i + 1].depth > base) {
      i++
      kids.push({ ...items[i], depth: items[i].depth - base - 1 })
    }
    const [first, ...more] = items[start].text.split('\n')
    out.push(
      <li key={start}>
        {fmt(first)}
        {kids.length > 0 && <List items={kids} fmt={fmt} />}
        {more.map((m, k) => (
          <div key={k}>{fmt(m)}</div>
        ))}
      </li>
    )
  }
  return items[0]?.ordered ? <ol>{out}</ol> : <ul>{out}</ul>
}

/** **bold**, `code`, and the search word highlighted */
function inline(s: string, hl: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <b key={i}>{mark(part.slice(2, -2), hl)}</b>
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>
    return <span key={i}>{mark(part, hl)}</span>
  })
}

function mark(s: string, hl: string): ReactNode {
  if (!hl || !s.toLowerCase().includes(hl)) return s
  const out: ReactNode[] = []
  let rest = s
  let k = 0
  for (let at = rest.toLowerCase().indexOf(hl); at >= 0; at = rest.toLowerCase().indexOf(hl)) {
    out.push(rest.slice(0, at), <mark key={k++}>{rest.slice(at, at + hl.length)}</mark>)
    rest = rest.slice(at + hl.length)
  }
  out.push(rest)
  return out
}
