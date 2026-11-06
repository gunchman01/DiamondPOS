import { useEffect, useState } from 'react'
import type { Sale, StoreSettings } from '../../../shared/types'
import { RECEIPT_BLOCKS, defaultDesigns, receiptBlock, type PrintDesigns, type ReceiptBlock, type ReceiptBlockType } from '../../../shared/printDesigns'
import { printSettings } from '../../../shared/printing'
import { api } from '../api'
import { receiptHtml } from '../receipt'
import { sampleSale } from '../printing'

const label = (t: ReceiptBlockType) => RECEIPT_BLOCKS.find((b) => b.type === t)?.label ?? t
const help = (t: ReceiptBlockType) => RECEIPT_BLOCKS.find((b) => b.type === t)?.help ?? ''

/** Sample sales for the preview */
function samples(): Record<string, Sale> {
  const serial = sampleSale(true)
  return {
    normal: { ...sampleSale(false), id: 1042, customerId: 1, customerName: 'Kim Lee' },
    serial: { ...serial, id: 1043, customerId: 1, customerName: 'Kim Lee', items: serial.items.map((i) => ({ ...i, sku: i.serial ? 'BG50' : 'OIL-1QT' })) },
    refund: {
      ...sampleSale(false),
      id: 1044,
      totalCents: -1299,
      taxCents: -88,
      items: [{ productId: 1, kind: 'return', name: 'Bar & chain oil 1 qt', qty: -1, unitPriceCents: -1299, lineTotalCents: -1299, returnOfSaleId: 1042, returnReason: 'Changed mind' }],
      payments: [{ method: 'cash', amountCents: -1299 }]
    }
  }
}

/**
 * Receipt layout: tick the blocks to print, drag them into order, and set size / alignment.
 * Shared by every till; each till uses its own paper width (Settings → Printing).
 */
export default function ReceiptDesigner({ widthMm }: { widthMm?: number }) {
  const [designs, setDesigns] = useState<PrintDesigns | null>(null)
  const [store, setStore] = useState<StoreSettings | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [sample, setSample] = useState<'normal' | 'serial' | 'refund'>('normal')
  const [width, setWidth] = useState(widthMm ?? 80)
  const [dragId, setDragId] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.printDesigns(), api.getSettings(), window.pos.getBootInfo()])
      .then(([d, s, boot]) => {
        setDesigns(d)
        setStore(s)
        if (!widthMm) setWidth(printSettings(boot.config.printing).receiptWidthMm)
        if (s.hasLogo && boot.config.serverUrl) setLogoUrl(`${boot.config.serverUrl.replace(/\/+$/, '')}/kiosk/logo`)
      })
      .catch((e) => setMsg({ ok: false, text: e.message }))
  }, [])

  if (!designs || !store) return <div className="page">{msg?.text ?? 'Loading…'}</div>
  const layout = designs.receipt
  const blocks = layout.blocks
  const b = blocks.find((x) => x.id === sel) ?? null

  const setBlocks = (next: ReceiptBlock[]) => {
    setDesigns({ ...designs, receipt: { ...layout, blocks: next } })
    setDirty(true)
  }
  const setBlock = (id: string, c: Partial<ReceiptBlock>) => setBlocks(blocks.map((x) => (x.id === id ? { ...x, ...c } : x)))
  const move = (id: string, to: number) => {
    const from = blocks.findIndex((x) => x.id === id)
    if (from < 0 || to < 0 || to >= blocks.length || from === to) return
    const next = [...blocks]
    const [it] = next.splice(from, 1)
    next.splice(to, 0, it)
    setBlocks(next)
  }

  async function save() {
    try {
      const saved = await api.savePrintDesigns(designs!)
      setDesigns(saved)
      setDirty(false)
      setMsg({ ok: true, text: 'Receipt layout saved for every till' })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    }
  }

  const html = receiptHtml(samples()[sample], store, width, layout, logoUrl)

  return (
    <div className="designer receipt-designer">
      {/* ---------- Blocks ---------- */}
      <aside className="ds-side wide">
        <h4>Receipt blocks (top to bottom)</h4>
        <div className="rd-blocks">
          {blocks.map((x, i) => (
            <div
              key={x.id}
              className={['rd-block', x.id === sel ? 'active' : '', x.on ? '' : 'off', dragId === x.id ? 'dragging' : ''].join(' ')}
              draggable
              onDragStart={() => setDragId(x.id)}
              onDragEnd={() => setDragId(null)}
              onDragOver={(e) => {
                e.preventDefault()
                if (dragId && dragId !== x.id) move(dragId, i)
              }}
              onClick={() => setSel(x.id)}
            >
              <span className="grip" title="Drag to move">
                ⋮⋮
              </span>
              <input type="checkbox" checked={x.on} onClick={(e) => e.stopPropagation()} onChange={(e) => setBlock(x.id, { on: e.target.checked })} />
              <span className="rd-name">
                {label(x.type)}
                {x.type === 'text' && x.text && <span className="muted small"> · {x.text.slice(0, 24)}</span>}
              </span>
              <button className="link small" disabled={i === 0} onClick={(e) => (e.stopPropagation(), move(x.id, i - 1))} title="Move up">
                ▲
              </button>
              <button className="link small" disabled={i === blocks.length - 1} onClick={(e) => (e.stopPropagation(), move(x.id, i + 1))} title="Move down">
                ▼
              </button>
            </div>
          ))}
        </div>
        <div className="row gap wrap">
          <select
            value=""
            onChange={(e) => {
              if (!e.target.value) return
              const nb = receiptBlock(e.target.value as ReceiptBlockType, e.target.value === 'text' ? { text: 'Your text here' } : {})
              setBlocks([...blocks, nb])
              setSel(nb.id)
            }}
          >
            <option value="">+ Add a block…</option>
            {RECEIPT_BLOCKS.map((r) => (
              <option key={r.type} value={r.type}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              if (!confirm('Put the receipt back to the standard layout?')) return
              setBlocks(defaultDesigns().receipt.blocks)
              setSel(null)
            }}
          >
            Reset
          </button>
        </div>
      </aside>

      {/* ---------- Selected block ---------- */}
      <aside className="ds-side">
        <h4>{b ? label(b.type) : 'Block'}</h4>
        {!b ? (
          <p className="muted small">Click a block to change its size and alignment. Untick a block to leave it off the receipt.</p>
        ) : (
          <div className="form ds-props">
            {help(b.type) && <p className="muted small">{help(b.type)}</p>}
            {b.type === 'text' && (
              <label>
                Text
                <textarea className="comments" rows={4} value={b.text} onChange={(e) => setBlock(b.id, { text: e.target.value })} />
              </label>
            )}
            {b.type !== 'divider' && (
              <div className="seg">
                {(['left', 'center', 'right'] as const).map((a) => (
                  <button key={a} className={b.align === a ? 'active' : ''} onClick={() => setBlock(b.id, { align: a })}>
                    {a === 'left' ? '⇤ Left' : a === 'center' ? 'Center' : 'Right ⇥'}
                  </button>
                ))}
              </div>
            )}
            {b.type === 'logo' || b.type === 'barcode' ? (
              <label>
                Width: {b.widthPct}% of the paper
                <input type="range" min={20} max={100} step={5} value={b.widthPct} onChange={(e) => setBlock(b.id, { widthPct: Number(e.target.value) })} />
              </label>
            ) : b.type !== 'divider' ? (
              <>
                <label>
                  Text size: {b.fontPt} pt
                  <input type="range" min={6} max={24} step={1} value={b.fontPt} onChange={(e) => setBlock(b.id, { fontPt: Number(e.target.value) })} />
                </label>
                <label className="check">
                  <input type="checkbox" checked={b.bold} onChange={(e) => setBlock(b.id, { bold: e.target.checked })} />
                  Bold
                </label>
              </>
            ) : null}
            {b.type === 'items' && (
              <>
                <label className="check">
                  <input type="checkbox" checked={b.showSku} onChange={(e) => setBlock(b.id, { showSku: e.target.checked })} />
                  Show the Item #
                </label>
                <label className="check">
                  <input type="checkbox" checked={b.showUnitPrice} onChange={(e) => setBlock(b.id, { showUnitPrice: e.target.checked })} />
                  Show "2 @ $12.99" when more than one
                </label>
                <label className="check">
                  <input type="checkbox" checked={b.showSerial} onChange={(e) => setBlock(b.id, { showSerial: e.target.checked })} />
                  Show serial numbers
                </label>
              </>
            )}
            {b.type === 'signature' && (
              <label className="check">
                <input type="checkbox" checked={b.always} onChange={(e) => setBlock(b.id, { always: e.target.checked })} />
                Print on every receipt (not just refunds and exchanges)
              </label>
            )}
            {b.type === 'logo' && !store.hasLogo && <p className="muted small">No logo uploaded yet (Settings → Customer Kiosk).</p>}
            <div className="row gap">
              <button
                onClick={() => {
                  const copy = receiptBlock(b.type, { ...b })
                  const i = blocks.findIndex((x) => x.id === b.id)
                  const next = [...blocks]
                  next.splice(i + 1, 0, copy)
                  setBlocks(next)
                  setSel(copy.id)
                }}
              >
                Duplicate
              </button>
              <button
                className="danger"
                onClick={() => {
                  setBlocks(blocks.filter((x) => x.id !== b.id))
                  setSel(null)
                }}
              >
                Remove
              </button>
            </div>
          </div>
        )}
        <div className="form ds-props">
          <label>
            Receipt font
            <select
              value={layout.font}
              onChange={(e) => {
                setDesigns({ ...designs, receipt: { ...layout, font: e.target.value as 'mono' | 'sans' } })
                setDirty(true)
              }}
            >
              <option value="mono">Typewriter (Courier)</option>
              <option value="sans">Clean (Arial)</option>
            </select>
          </label>
        </div>
        {msg && <div className={msg.ok ? 'ok-text' : 'error-text'}>{msg.text}</div>}
        <div className="row gap">
          <button className="primary" disabled={!dirty} onClick={save}>
            Save receipt layout
          </button>
          {dirty && <span className="muted small">Not saved yet</span>}
        </div>
      </aside>

      {/* ---------- Preview ---------- */}
      <section className="rd-preview">
        <div className="row gap wrap">
          <div className="seg">
            {(
              [
                ['normal', 'Sale'],
                ['serial', 'Serial #'],
                ['refund', 'Refund']
              ] as const
            ).map(([k, l]) => (
              <button key={k} className={sample === k ? 'active' : ''} onClick={() => setSample(k)}>
                {l}
              </button>
            ))}
          </div>
          <div className="seg">
            {[80, 58].map((w) => (
              <button key={w} className={width === w ? 'active' : ''} onClick={() => setWidth(w)}>
                {w} mm
              </button>
            ))}
          </div>
        </div>
        <div className="rd-paper" style={{ width: `${width}mm` }}>
          <iframe title="Receipt preview" srcDoc={html} sandbox="" />
        </div>
      </section>
    </div>
  )
}
