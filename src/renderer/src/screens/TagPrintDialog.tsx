import { useEffect, useState } from 'react'
import type { Product } from '../../../shared/types'
import { api } from '../api'
import { money } from '../format'
import { currentPrintSettings, printDesigns, printTags, templateFor } from '../printing'
import type { LabelTemplate } from '../../../shared/printDesigns'
import type { PrintSettings } from '../../../shared/printing'

/** Print price tags on the label printer (Zebra): pick items and how many tags of each. */
type TagRow = { product: Product; qty: string; /** '' = automatic */ template: string }

/** Pre-filled lines, e.g. from a receiving: quantity of tags and which label */
export interface TagLine {
  product: Product
  qty: number
  template?: string
}

export default function TagPrintDialog(props: { initial?: Product[]; lines?: TagLine[]; title?: string; onClose: () => void }) {
  const [rows, setRows] = useState<TagRow[]>(() => [
    ...(props.initial ?? []).map((p) => ({ product: p, qty: '1', template: '' })),
    ...(props.lines ?? []).map((l) => ({ product: l.product, qty: String(l.qty), template: l.template ?? '' }))
  ])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  /** '' = automatic: price tag for priced items, no-price label for items without a price */
  const [template, setTemplate] = useState('')
  const [labels, setLabels] = useState<LabelTemplate[]>([])
  const [ps, setPs] = useState<PrintSettings | null>(null)
  useEffect(() => {
    printDesigns().then((d) => setLabels(d.labels.filter((t) => t.kind !== 'workorder')))
    currentPrintSettings().then(setPs)
  }, [])
  const auto = (p: Product) => (ps && labels.length ? templateFor(p, ps, labels).name : '')

  useEffect(() => {
    if (!query.trim()) return setResults([])
    const t = setTimeout(() => api.listProducts(query.trim()).then((r) => setResults(r.slice(0, 8))).catch(() => {}), 150)
    return () => clearTimeout(t)
  }, [query])

  const add = (p: Product, qty = 1) => {
    setRows((r) => (r.some((x) => x.product.id === p.id) ? r : [...r, { product: p, qty: String(qty), template: '' }]))
    setQuery('')
    setResults([])
  }
  async function addMarked() {
    const all = await api.listProducts('')
    const marked = all.filter((p) => p.printTags)
    setRows((r) => [...r, ...marked.filter((p) => !r.some((x) => x.product.id === p.id)).map((p) => ({ product: p, qty: '1', template: '' }))])
    setMsg({ ok: true, text: `${marked.length} item(s) marked "Print Tags" added` })
  }

  const total = rows.reduce((n, r) => n + (Number.isInteger(Number(r.qty)) && Number(r.qty) > 0 ? Number(r.qty) : 0), 0)

  async function print() {
    setBusy(true)
    setMsg(null)
    try {
      const n = await printTags(
        rows.map((r) => ({ product: r.product, qty: Math.min(500, Math.max(0, Math.floor(Number(r.qty) || 0))), template: r.template || null })),
        template || null
      )
      setMsg({ ok: true, text: `${n} tag(s) sent to the label printer` })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal tag-dlg" onKeyDown={(e) => e.key === 'Escape' && props.onClose()}>
        <h2>{props.title ?? 'Print price tags'}</h2>
        <div className="row gap">
          <div className="tag-search">
            <input
              autoFocus
              placeholder="Scan or search an item to add…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && results[0]) {
                  e.preventDefault()
                  add(results[0])
                }
              }}
            />
            {results.length > 0 && (
              <div className="tag-results">
                {results.map((p) => (
                  <button key={p.id} onClick={() => add(p)}>
                    <span>{p.name}</span>
                    <span className="muted small">{p.sku ?? ''}</span>
                    <b>{money(p.priceCents)}</b>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={addMarked} title='Items with "Print Tags" ticked'>
            + Items marked "Print Tags"
          </button>
        </div>
        <div className="grid-wrap tag-lines">
          <table className="grid">
            <thead>
              <tr>
                <th>Item</th>
                <th style={{ width: 110 }}>Item #</th>
                <th className="num" style={{ width: 90 }}>Price</th>
                <th className="num" style={{ width: 80 }}>On hand</th>
                <th style={{ width: 210 }}>Label (with or without price)</th>
                <th style={{ width: 90 }}>Tags</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.product.id}>
                  <td>{r.product.name}</td>
                  <td className="dim">{r.product.sku ?? ''}</td>
                  <td className="num">{money(r.product.priceCents)}</td>
                  <td className="num">
                    {r.product.type === 'inventory' && (
                      <button className="link small" title="One tag per item in stock" onClick={() => setRows(rows.map((x, j) => (j === i ? { ...x, qty: String(Math.max(0, x.product.onHand)) } : x)))}>
                        {r.product.onHand}
                      </button>
                    )}
                  </td>
                  <td>
                    <select
                      className="tag-pick"
                      value={r.template}
                      onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, template: e.target.value } : x)))}
                    >
                      <option value="">Auto: {template ? labels.find((t) => t.id === template)?.name : auto(r.product)}</option>
                      {labels.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input className="qty-in" value={r.qty} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
                  </td>
                  <td>
                    <button className="link" title="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="grid-empty">Scan or search for items above</div>}
        </div>
        {msg && <div className={msg.ok ? 'ok-text' : 'error-text'}>{msg.text}</div>}
        <div className="row between">
          <label className="inline">
            Label
            <select value={template} onChange={(e) => setTemplate(e.target.value)}>
              <option value="">Automatic (price tag, or no-price label for items without a price)</option>
              {labels.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <div className="row gap">
            <button onClick={props.onClose}>Close</button>
            <button className="primary" disabled={busy || total === 0} onClick={print}>
              {busy ? 'Printing…' : `🏷 Print ${total} tag${total === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
