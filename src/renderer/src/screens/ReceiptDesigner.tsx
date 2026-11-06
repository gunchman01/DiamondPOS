import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Sale, StoreSettings } from '../../../shared/types'
import {
  MIDDLE_BLOCKS,
  RECEIPT_BLOCKS,
  RECEIPT_FIELDS,
  defaultDesigns,
  receiptBlock,
  receiptElement,
  type PrintDesigns,
  type ReceiptBlock,
  type ReceiptBlockType,
  type ReceiptElement,
  type ReceiptField,
  type ReceiptLayout
} from '../../../shared/printDesigns'
import { printSettings } from '../../../shared/printing'
import { api } from '../api'
import { receiptElementCss, receiptElementInner, receiptHtml } from '../receipt'
import { sampleSale } from '../printing'

type ZoneKey = 'header' | 'footer'
const MM = 96 / 25.4 // CSS px per mm
const r1 = (v: number) => Math.round(v * 10) / 10
const blockLabel = (t: ReceiptBlockType) => RECEIPT_BLOCKS.find((b) => b.type === t)?.label ?? t
const fieldLabel = (f: ReceiptField) => RECEIPT_FIELDS.find((x) => x.field === f)?.label ?? f

function cssToStyle(css: string): CSSProperties {
  const out: Record<string, string> = {}
  for (const part of css.split(';')) {
    const i = part.indexOf(':')
    if (i < 0) continue
    const k = part.slice(0, i).trim().replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    if (k) out[k] = part.slice(i + 1).trim()
  }
  return out as CSSProperties
}

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

type Drag =
  | { kind: 'el'; zone: ZoneKey; id: string; mode: 'move' | 'size'; sx: number; sy: number; orig: ReceiptElement }
  | { kind: 'zone'; zone: ZoneKey; sy: number; orig: number }

type Sel = { zone: ZoneKey; id: string } | { block: string } | null

/**
 * Receipt Layout: the top and bottom of the receipt are drag-and-drop areas (store name, address, logo,
 * receipt #, customer, your own text, barcode, signature…). The middle (items, totals, payments) grows with
 * each sale, so it's a list you switch on/off and reorder.
 */
export default function ReceiptDesigner() {
  const [designs, setDesigns] = useState<PrintDesigns | null>(null)
  const [store, setStore] = useState<StoreSettings | null>(null)
  const [sel, setSel] = useState<Sel>(null)
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [sample, setSample] = useState<'normal' | 'serial' | 'refund'>('normal')
  const [width, setWidth] = useState(80)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [addTo, setAddTo] = useState<ZoneKey>('header')
  const [addField, setAddField] = useState<ReceiptField>('text')
  const [dragBlock, setDragBlock] = useState<string | null>(null)
  const drag = useRef<Drag | null>(null)

  useEffect(() => {
    Promise.all([api.printDesigns(), api.getSettings(), window.pos.getBootInfo()])
      .then(([d, s, boot]) => {
        setDesigns(d)
        setStore(s)
        setWidth(printSettings(boot.config.printing).receiptWidthMm)
        if (s.hasLogo && boot.config.serverUrl) setLogoUrl(`${boot.config.serverUrl.replace(/\/+$/, '')}/kiosk/logo`)
      })
      .catch((e) => setMsg({ ok: false, text: e.message }))
  }, [])

  const layout: ReceiptLayout | null = designs?.receipt ?? null
  const printableMm = width - 8
  const scale = 1.3
  const paperPx = printableMm * MM * scale

  const setLayout = (c: Partial<ReceiptLayout>) => {
    if (!designs || !layout) return
    setDesigns({ ...designs, receipt: { ...layout, ...c } })
    setDirty(true)
  }
  const setEl = (zone: ZoneKey, id: string, c: Partial<ReceiptElement>) =>
    layout && setLayout({ [zone]: { ...layout[zone], elements: layout[zone].elements.map((e) => (e.id === id ? { ...e, ...c } : e)) } })
  const setBlock = (id: string, c: Partial<ReceiptBlock>) => layout && setLayout({ blocks: layout.blocks.map((b) => (b.id === id ? { ...b, ...c } : b)) })

  // ----- dragging (elements and zone heights) -----
  useEffect(() => {
    const move = (ev: PointerEvent) => {
      const d = drag.current
      if (!d || !layout) return
      const dyMm = (ev.clientY - d.sy) / (MM * scale)
      if (d.kind === 'zone') {
        const minH = Math.max(0, ...layout[d.zone].elements.map((e) => e.y + e.h))
        setLayout({ [d.zone]: { ...layout[d.zone], heightMm: r1(Math.min(200, Math.max(minH, d.orig + dyMm))) } })
        return
      }
      const fine = ev.shiftKey
      const dxPct = ((ev.clientX - d.sx) / (MM * scale) / printableMm) * 100
      const snapPct = (v: number) => (fine ? r1(v) : Math.round(v))
      const snapMm = (v: number) => (fine ? r1(v) : Math.round(v * 2) / 2)
      const zh = layout[d.zone].heightMm
      if (d.mode === 'move')
        setEl(d.zone, d.id, {
          x: Math.min(Math.max(0, snapPct(d.orig.x + dxPct)), 100 - d.orig.w),
          y: Math.min(Math.max(0, snapMm(d.orig.y + dyMm)), Math.max(0, zh - d.orig.h))
        })
      else
        setEl(d.zone, d.id, {
          w: Math.min(Math.max(3, snapPct(d.orig.w + dxPct)), 100 - d.orig.x),
          h: Math.min(Math.max(d.orig.kind === 'line' ? 0.2 : 2, snapMm(d.orig.h + dyMm)), zh - d.orig.y)
        })
    }
    const up = () => (drag.current = null)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  })

  if (!designs || !layout || !store) return <div className="page">{msg?.text ?? 'Loading…'}</div>
  const sale = samples()[sample]
  const selEl = sel && 'zone' in sel ? layout[sel.zone].elements.find((e) => e.id === sel.id) ?? null : null
  const selBlock = sel && 'block' in sel ? layout.blocks.find((b) => b.id === sel.block) ?? null : null

  function addElement(kind: ReceiptElement['kind']) {
    if (!layout) return
    const z = layout[addTo]
    const bottom = Math.max(0, ...z.elements.map((e) => e.y + e.h))
    const h = kind === 'line' ? 0.4 : kind === 'barcode' ? 10 : kind === 'logo' ? 16 : 5
    const e = receiptElement(kind, {
      field: kind === 'text' ? addField : 'text',
      text: kind === 'text' && addField === 'text' ? 'Your text here' : '',
      onlyRefund: addField === 'signature',
      x: kind === 'barcode' ? 15 : kind === 'logo' ? 20 : 0,
      w: kind === 'barcode' ? 70 : kind === 'logo' ? 60 : 100,
      y: r1(bottom),
      h,
      fontPt: addField === 'storeName' ? 13 : 9,
      bold: addField === 'storeName'
    })
    setLayout({ [addTo]: { heightMm: Math.max(z.heightMm, r1(bottom + h)), elements: [...z.elements, e] } })
    setSel({ zone: addTo, id: e.id })
  }
  function removeSelected() {
    if (!layout || !sel) return
    if ('zone' in sel) setLayout({ [sel.zone]: { ...layout[sel.zone], elements: layout[sel.zone].elements.filter((e) => e.id !== sel.id) } })
    else setLayout({ blocks: layout.blocks.filter((b) => b.id !== sel.block) })
    setSel(null)
  }
  function moveBlock(id: string, to: number) {
    if (!layout) return
    const from = layout.blocks.findIndex((b) => b.id === id)
    if (from < 0 || to < 0 || to >= layout.blocks.length || from === to) return
    const next = [...layout.blocks]
    const [it] = next.splice(from, 1)
    next.splice(to, 0, it)
    setLayout({ blocks: next })
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
  const onKey = (ev: React.KeyboardEvent) => {
    const tag = (ev.target as HTMLElement).tagName
    if (!selEl || !sel || !('zone' in sel) || ['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return
    const zh = layout[sel.zone].heightMm
    const k: Record<string, Partial<ReceiptElement>> = {
      ArrowLeft: { x: Math.max(0, selEl.x - 1) },
      ArrowRight: { x: Math.min(100 - selEl.w, selEl.x + 1) },
      ArrowUp: { y: r1(Math.max(0, selEl.y - 0.5)) },
      ArrowDown: { y: r1(Math.min(zh - selEl.h, selEl.y + 0.5)) }
    }
    if (k[ev.key]) {
      ev.preventDefault()
      setEl(sel.zone, selEl.id, k[ev.key])
    } else if (ev.key === 'Delete') removeSelected()
  }

  const Zone = ({ zone, title }: { zone: ZoneKey; title: string }) => {
    const z = layout[zone]
    return (
      <div className="rz">
        <div className="rz-title">
          {title} <span className="muted small">({r1(z.heightMm)} mm tall · drag things where you want them)</span>
        </div>
        <div style={{ width: paperPx, height: z.heightMm * MM * scale, position: 'relative' }} onPointerDown={(e) => e.target === e.currentTarget && setSel(null)}>
          <div
            className="rz-canvas"
            style={{ width: `${printableMm}mm`, height: `${z.heightMm}mm`, transform: `scale(${scale})`, fontFamily: layout.font === 'sans' ? 'Arial, sans-serif' : "'Courier New', monospace" }}
            onPointerDown={(e) => e.target === e.currentTarget && setSel(null)}
          >
            {z.elements.map((e) => {
              const active = sel && 'zone' in sel && sel.zone === zone && sel.id === e.id
              const inner = receiptElementInner(e, sale, store, logoUrl)
              return (
                <div
                  key={e.id}
                  className={active ? 'ds-el selected' : 'ds-el'}
                  style={{ left: `${e.x}%`, width: `${e.w}%`, top: `${e.y}mm`, height: `${e.h}mm` }}
                  title={e.kind === 'text' ? fieldLabel(e.field) : e.kind}
                  onPointerDown={(ev) => {
                    ev.preventDefault()
                    setSel({ zone, id: e.id })
                    drag.current = { kind: 'el', zone, id: e.id, mode: 'move', sx: ev.clientX, sy: ev.clientY, orig: e }
                  }}
                >
                  <div style={cssToStyle(receiptElementCss(e))} dangerouslySetInnerHTML={{ __html: inner || (e.kind === 'text' ? `<span class="rz-empty">${fieldLabel(e.field)}</span>` : e.kind === 'logo' ? '<span class="rz-empty">Logo</span>' : '') }} />
                  {active && (
                    <span
                      className="ds-handle"
                      style={{ transform: `scale(${1 / scale})` }}
                      onPointerDown={(ev) => {
                        ev.preventDefault()
                        ev.stopPropagation()
                        drag.current = { kind: 'el', zone, id: e.id, mode: 'size', sx: ev.clientX, sy: ev.clientY, orig: e }
                      }}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
        <div
          className="rz-grow"
          title="Drag to make this area taller or shorter"
          onPointerDown={(ev) => {
            ev.preventDefault()
            drag.current = { kind: 'zone', zone, sy: ev.clientY, orig: z.heightMm }
          }}
        >
          ⇕
        </div>
      </div>
    )
  }

  return (
    <div className="designer receipt-designer2" tabIndex={0} onKeyDown={onKey}>
      {/* ---------- Left: add + properties ---------- */}
      <aside className="ds-side">
        <h4>Add to the receipt</h4>
        <div className="seg">
          <button className={addTo === 'header' ? 'active' : ''} onClick={() => setAddTo('header')}>
            Top
          </button>
          <button className={addTo === 'footer' ? 'active' : ''} onClick={() => setAddTo('footer')}>
            Bottom
          </button>
        </div>
        <select value={addField} onChange={(e) => setAddField(e.target.value as ReceiptField)}>
          {RECEIPT_FIELDS.map((f) => (
            <option key={f.field} value={f.field}>
              {f.label}
            </option>
          ))}
        </select>
        <div className="row gap wrap">
          <button onClick={() => addElement('text')}>+ Add</button>
          <button onClick={() => addElement('logo')}>+ Logo</button>
          <button onClick={() => addElement('barcode')}>+ Barcode</button>
          <button onClick={() => addElement('line')}>+ Line</button>
        </div>

        <h4 style={{ marginTop: 8 }}>
          {selEl ? (selEl.kind === 'text' ? fieldLabel(selEl.field) : selEl.kind === 'logo' ? 'Logo' : selEl.kind === 'barcode' ? 'Receipt barcode' : 'Line') : selBlock ? blockLabel(selBlock.type) : 'Selected'}
        </h4>
        {!selEl && !selBlock && <p className="muted small">Click something on the receipt to change it.</p>}
        {selEl && sel && 'zone' in sel && (
          <div className="form ds-props">
            {selEl.kind === 'text' && (
              <>
                <label>
                  Shows
                  <select value={selEl.field} onChange={(e) => setEl(sel.zone, selEl.id, { field: e.target.value as ReceiptField })}>
                    {RECEIPT_FIELDS.map((f) => (
                      <option key={f.field} value={f.field}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
                {selEl.field === 'text' && (
                  <label>
                    Text
                    <textarea className="comments" rows={3} value={selEl.text} onChange={(e) => setEl(sel.zone, selEl.id, { text: e.target.value })} />
                  </label>
                )}
                {selEl.field === 'signature' && (
                  <label className="check">
                    <input type="checkbox" checked={selEl.onlyRefund} onChange={(e) => setEl(sel.zone, selEl.id, { onlyRefund: e.target.checked })} />
                    Only on refunds and exchanges
                  </label>
                )}
                <label>
                  Text size: {selEl.fontPt} pt
                  <input type="range" min={5} max={30} value={selEl.fontPt} onChange={(e) => setEl(sel.zone, selEl.id, { fontPt: Number(e.target.value) })} />
                </label>
                <label className="check">
                  <input type="checkbox" checked={selEl.bold} onChange={(e) => setEl(sel.zone, selEl.id, { bold: e.target.checked })} />
                  Bold
                </label>
                <div className="seg">
                  {(['left', 'center', 'right'] as const).map((a) => (
                    <button key={a} className={selEl.align === a ? 'active' : ''} onClick={() => setEl(sel.zone, selEl.id, { align: a })}>
                      {a === 'left' ? '⇤ Left' : a === 'center' ? 'Center' : 'Right ⇥'}
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="ds-xywh">
              <label>
                Left (%)
                <input type="number" value={selEl.x} onChange={(e) => setEl(sel.zone, selEl.id, { x: Math.max(0, Math.min(98, Number(e.target.value) || 0)) })} />
              </label>
              <label>
                Width (%)
                <input type="number" value={selEl.w} onChange={(e) => setEl(sel.zone, selEl.id, { w: Math.max(2, Math.min(100, Number(e.target.value) || 100)) })} />
              </label>
              <label>
                Top (mm)
                <input type="number" step={0.5} value={selEl.y} onChange={(e) => setEl(sel.zone, selEl.id, { y: Math.max(0, Number(e.target.value) || 0) })} />
              </label>
              <label>
                Height (mm)
                <input type="number" step={0.5} value={selEl.h} onChange={(e) => setEl(sel.zone, selEl.id, { h: Math.max(0.2, Number(e.target.value) || 1) })} />
              </label>
            </div>
            <div className="row gap">
              <button
                onClick={() => {
                  const c = receiptElement(selEl.kind, { ...selEl, id: undefined as unknown as string, y: r1(selEl.y + selEl.h) })
                  c.id = receiptElement('text').id
                  const z = layout[sel.zone]
                  setLayout({ [sel.zone]: { heightMm: Math.max(z.heightMm, r1(c.y + c.h)), elements: [...z.elements, c] } })
                  setSel({ zone: sel.zone, id: c.id })
                }}
              >
                Duplicate
              </button>
              <button className="danger" onClick={removeSelected}>
                Remove
              </button>
            </div>
          </div>
        )}
        {selBlock && (
          <div className="form ds-props">
            {selBlock.type === 'text' && (
              <label>
                Text
                <textarea className="comments" rows={3} value={selBlock.text} onChange={(e) => setBlock(selBlock.id, { text: e.target.value })} />
              </label>
            )}
            {selBlock.type !== 'divider' && (
              <>
                <div className="seg">
                  {(['left', 'center', 'right'] as const).map((a) => (
                    <button key={a} className={selBlock.align === a ? 'active' : ''} onClick={() => setBlock(selBlock.id, { align: a })}>
                      {a === 'left' ? '⇤ Left' : a === 'center' ? 'Center' : 'Right ⇥'}
                    </button>
                  ))}
                </div>
                <label>
                  Text size: {selBlock.fontPt} pt
                  <input type="range" min={6} max={24} value={selBlock.fontPt} onChange={(e) => setBlock(selBlock.id, { fontPt: Number(e.target.value) })} />
                </label>
                <label className="check">
                  <input type="checkbox" checked={selBlock.bold} onChange={(e) => setBlock(selBlock.id, { bold: e.target.checked })} />
                  Bold
                </label>
              </>
            )}
            {selBlock.type === 'items' && (
              <>
                <label className="check">
                  <input type="checkbox" checked={selBlock.showSku} onChange={(e) => setBlock(selBlock.id, { showSku: e.target.checked })} />
                  Show the Item #
                </label>
                <label className="check">
                  <input type="checkbox" checked={selBlock.showUnitPrice} onChange={(e) => setBlock(selBlock.id, { showUnitPrice: e.target.checked })} />
                  Show "2 @ $12.99"
                </label>
                <label className="check">
                  <input type="checkbox" checked={selBlock.showSerial} onChange={(e) => setBlock(selBlock.id, { showSerial: e.target.checked })} />
                  Show serial numbers
                </label>
              </>
            )}
            <button className="danger" onClick={removeSelected}>
              Remove
            </button>
          </div>
        )}
        <div className="form ds-props">
          <label>
            Receipt font
            <select value={layout.font} onChange={(e) => setLayout({ font: e.target.value as 'mono' | 'sans' })}>
              <option value="mono">Typewriter (Courier)</option>
              <option value="sans">Clean (Arial)</option>
            </select>
          </label>
        </div>
        {msg && <div className={msg.ok ? 'ok-text' : 'error-text'}>{msg.text}</div>}
        <div className="row gap wrap">
          <button className="primary" disabled={!dirty} onClick={save}>
            Save receipt layout
          </button>
          <button
            onClick={() => {
              if (!confirm('Put the receipt back to the standard layout?')) return
              setLayout(defaultDesigns().receipt)
              setSel(null)
            }}
          >
            Reset
          </button>
        </div>
        {dirty && <span className="muted small">Not saved yet</span>}
      </aside>

      {/* ---------- Center: the receipt ---------- */}
      <section className="rd-editor">
        <div className="row gap wrap">
          <div className="seg">
            {[80, 58].map((w) => (
              <button key={w} className={width === w ? 'active' : ''} onClick={() => setWidth(w)}>
                {w} mm paper
              </button>
            ))}
          </div>
        </div>
        <div className="rd-paper-edit" style={{ width: paperPx + 24 }}>
          <Zone zone="header" title="Top of receipt" />
          <div className="rz rz-middle">
            <div className="rz-title">
              Middle <span className="muted small">(grows with each sale · drag to reorder)</span>
            </div>
            {layout.blocks.map((b, i) => (
              <div
                key={b.id}
                className={['rd-block', sel && 'block' in sel && sel.block === b.id ? 'active' : '', b.on ? '' : 'off', dragBlock === b.id ? 'dragging' : ''].join(' ')}
                draggable
                onDragStart={() => setDragBlock(b.id)}
                onDragEnd={() => setDragBlock(null)}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (dragBlock && dragBlock !== b.id) moveBlock(dragBlock, i)
                }}
                onClick={() => setSel({ block: b.id })}
              >
                <span className="grip">⋮⋮</span>
                <input type="checkbox" checked={b.on} onClick={(e) => e.stopPropagation()} onChange={(e) => setBlock(b.id, { on: e.target.checked })} />
                <span className="rd-name">
                  {blockLabel(b.type)}
                  {b.type === 'text' && b.text && <span className="muted small"> · {b.text.slice(0, 22)}</span>}
                </span>
                <button className="link small" disabled={i === 0} onClick={(e) => (e.stopPropagation(), moveBlock(b.id, i - 1))}>
                  ▲
                </button>
                <button className="link small" disabled={i === layout.blocks.length - 1} onClick={(e) => (e.stopPropagation(), moveBlock(b.id, i + 1))}>
                  ▼
                </button>
              </div>
            ))}
            <select
              value=""
              onChange={(e) => {
                if (!e.target.value) return
                const nb = receiptBlock(e.target.value as ReceiptBlockType, e.target.value === 'text' ? { text: 'Your text here' } : {})
                setLayout({ blocks: [...layout.blocks, nb] })
                setSel({ block: nb.id })
              }}
            >
              <option value="">+ Add to the middle…</option>
              {MIDDLE_BLOCKS.map((t) => (
                <option key={t} value={t}>
                  {blockLabel(t)}
                </option>
              ))}
            </select>
          </div>
          <Zone zone="footer" title="Bottom of receipt" />
        </div>
        <p className="muted small">
          Drag to move, drag the red corner to resize, drag ⇕ to make an area taller. Arrow keys nudge, Delete removes, Shift = fine
          steps. Things that don't apply to a sale (customer, REFUND title, signature) print blank.
        </p>
      </section>

      {/* ---------- Right: real preview ---------- */}
      <section className="rd-preview">
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
        <div className="rd-paper" style={{ width: `${width}mm` }}>
          <iframe title="Receipt preview" srcDoc={receiptHtml(sale, store, width, layout, logoUrl)} sandbox="" />
        </div>
      </section>
    </div>
  )
}
