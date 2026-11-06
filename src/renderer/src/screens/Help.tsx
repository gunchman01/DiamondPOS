import { useEffect, useMemo, useRef, useState } from 'react'
import manual from '../help/USER_MANUAL.md?raw'
import Markdown from '../Markdown'
import type { BootInfo } from '../../../shared/types'
import { SERVER_PORT } from '../../../shared/constants'

export interface HelpSection {
  id: string
  title: string
  body: string
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** The Store Server's address(es) as seen from this computer */
export function serverAddresses(boot?: BootInfo): string[] {
  if (!boot) return []
  if (boot.config.mode === 'server') return boot.lanAddresses
  try {
    const host = new URL(boot.config.serverUrl).hostname
    return host ? [host] : []
  } catch {
    return []
  }
}

/** Replace {server_ip}, {server_ips}, {kiosk_url}, {kiosk_urls} and {port} with this store's values */
export function fillPlaceholders(md: string, boot?: BootInfo): string {
  const ips = serverAddresses(boot)
  const ip = ips[0] ?? '192.168.1.20'
  const url = (h: string) => `http://${h}:${SERVER_PORT}/kiosk`
  return md
    .replace(/\{server_ips\}/g, ips.length ? ips.join(' or ') : `${ip} (example: see Settings → This Computer)`)
    .replace(/\{server_ip\}/g, ip)
    .replace(/\{kiosk_urls\}/g, (ips.length ? ips : [ip]).map(url).join(' or '))
    .replace(/\{kiosk_url\}/g, url(ip))
    .replace(/\{port\}/g, String(SERVER_PORT))
}

/** Split the manual into its "## " sections (the "# " title line is dropped) */
export function helpSections(md: string): HelpSection[] {
  const out: HelpSection[] = []
  for (const line of md.replace(/\r\n/g, '\n').split('\n')) {
    const m = /^##\s+(.*)$/.exec(line)
    if (m) out.push({ id: slug(m[1]), title: m[1].trim(), body: '' })
    else if (out.length && !/^#\s/.test(line)) out[out.length - 1].body += line + '\n'
  }
  return out
}

/** Help: the user manual with a contents list and search. `topic` = section to open at. */
export default function Help({ topic, onFeedback, boot }: { topic?: string | null; onFeedback?: () => void; boot?: BootInfo }) {
  // {server_ip}, {kiosk_url}… in the manual are filled in with this store's real addresses
  const sections = useMemo(() => helpSections(fillPlaceholders(manual, boot)), [boot])
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(topic && sections.some((s) => s.id === topic) ? topic : sections[0]?.id)
  const bodyRef = useRef<HTMLDivElement>(null)

  const q = query.trim().toLowerCase()
  const shown = q ? sections.filter((s) => (s.title + '\n' + s.body).toLowerCase().includes(q)) : sections

  const go = (id: string) => {
    setActive(id)
    document.getElementById('help-' + id)?.scrollIntoView({ block: 'start' })
  }
  useEffect(() => {
    if (topic) setTimeout(() => go(topic), 0)
  }, [topic])

  // Highlight the section being read in the contents list
  function onScroll() {
    const box = bodyRef.current
    if (!box) return
    const top = box.getBoundingClientRect().top + 40
    let current = shown[0]?.id
    for (const s of shown) {
      const el = document.getElementById('help-' + s.id)
      if (el && el.getBoundingClientRect().top <= top) current = s.id
    }
    if (current && current !== active) setActive(current)
  }

  return (
    <div className="help">
      <aside className="help-toc">
        <input placeholder="Search the manual…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        <nav>
          {shown.map((s) => (
            <button key={s.id} className={s.id === active ? 'active' : ''} onClick={() => go(s.id)}>
              {s.title}
            </button>
          ))}
          {shown.length === 0 && <p className="muted small">Nothing found for "{query}".</p>}
        </nav>
        <p className="muted small">Tip: press F1 on any screen to open Help.</p>
        {onFeedback && (
          <button onClick={onFeedback} title="Ideas, enhancement requests, problems or questions">
            💬 Can't find it? Send feedback
          </button>
        )}
      </aside>
      <div className="help-body" ref={bodyRef} onScroll={onScroll}>
        {shown.map((s) => (
          <section key={s.id} id={'help-' + s.id} className="help-section">
            <h2>{s.title}</h2>
            <Markdown text={s.body} highlight={query} />
          </section>
        ))}
      </div>
    </div>
  )
}
