import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Product, StoreSettings } from '../../../shared/types'
import { LABEL_SIZES } from '../../../shared/printing'
import {
  LABEL_FIELDS,
  labelElement,
  newId,
  type LabelElement,
  type LabelField,
  type LabelTemplate,
  type PrintDesigns
} from '../../../shared/printDesigns'
import { api } from '../api'
import { labelContentCss, labelElementInner } from '../printTemplates'
import { SAMPLE_ITEM, printTags } from '../printing'

const SNAP = 0.05
const snap = (v: number, fine: boolean) => Math.round(v / (fine ? 0.01 : SNAP)) * (fine ? 0.01 : SNAP)
const r2 = (v: number) => Math.round(v * 100) / 100

/** "a:b;c:d" -> React style */
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

type Drag = { id: string; mode: 'move' | 'size'; sx: number; sy: number; orig: LabelElement }

/**
 * Label designer: build tag layouts by adding elements (item name, price, barcode, your own text…)
 * and dragging / resizing them on the label. Saved for every till.
 */
export default function LabelDesigner() {
  const [designs, setDesigns] = useState<PrintDesigns | null>(null)
  const [store, setStore] = useState<StoreSettings | null>(null)
  const [tid, setTid] = useState<string>('')
  const [sel, setSel] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [preview, setPreview] = useState<Partial<Product>>(SAMPLE_ITEM)
  const [itemQuery, setItemQuery] = useState('')
  const [addField, setAddField] = useState<LabelField>('name')
  const drag = useRef<Drag | null>(null)

  useEffect(() => {
    Promise.all([api.printDesigns(), api.getSettings()])
      .then(([d, s]) => {
        setDesigns(d)
        setStore(s)
        setTid(d.labels[0]?.id ?? '')
      })
      .catch((e) => setMsg({ ok: false, text: e.message }))
  }, [])

  const t = designs?.labels.find((x) => x.id === tid) ?? null
  const el = t?.elements.find((e) => e.id === sel) ?? null
  // Show the label about 520 px wide (or 300 px tall)
  const scale = t ? Math.min(520 / (t.widthIn * 96), 300 / (t.heightIn * 96), 4) : 1

  const setTemplate = (c: Partial<LabelTemplate>) => {
    if (!designs || !t) return
    setDesigns({ ...designs, labels: designs.labels.map((x) => (x.id === t.id ? { ...x, ...c } : x)) })
    setDirty(true)
  }
  const setEl = (id: string, c: Partial<LabelElement>) =>
    t && setTemplate({ elements: t.elements.map((e) => (e.id === id ? { ...e, ...c } : e)) })

  // ----- dragging -----
  useEffect(() => {
    const move = (ev: PointerEvent) => {
      const d = drag.current
      if (!d || !t) return
      const dx = (ev.clientX - d.sx) / (96 * scale)
      const dy = (ev.clientY - d.sy) / (96 * scale)
      const fine = ev.shiftKey
      if (d.mode === 'move')
        setEl(d.id, {
          x: r2(Math.min(Math.max(0, snap(d.orig.x + dx, fine)), t.widthIn - 0.05)),
          y: r2(Math.min(Math.max(0, snap(d.orig.y + dy, fine)), t.heightIn - 0.01))
        })
      else
        setEl(d.id, {
          w: r2(Math.min(Math.max(0.05, snap(d.orig.w + dx, fine)), t.widthIn - d.orig.x)),
          h: r2(Math.min(Math.max(d.orig.kind === 'line' ? 0.01 : 0.05, snap(d.orig.h + dy, fine)), t.heightIn - d.orig.y))
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

  // ----- preview item -----
  async function loadPreview(e: React.FormEvent) {
    e.preventDefault()
    const q = itemQuery.trim()
    if (!q) return setPreview(SAMPLE_ITEM)
    try {
      setPreview(await api.lookupProduct(q).catch(async () => (await api.listProducts(q))[0] ?? Promise.reject(new Error('Item not found'))))
      setMsg(null)
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
    }
  }

  if (!designs || !store) return <div className="page">{msg?.text ?? 'Loading…'}</div>

  function addEl(kind: LabelElement['kind'], c: Partial<LabelElement> = {}) {
    if (!t) return
    const e = labelElement(kind, {
      x: 0.1,
      y: Math.min(0.1 + t.elements.length * 0.05, t.heightIn - 0.3),
      w: Math.min(kind === 'barcode' ? 1.6 : 1.5, t.widthIn - 0.2),
      h: kind === 'barcode' ? Math.min(0.45, t.heightIn - 0.1) : kind === 'line' ? 0.02 : 0.25,
      ...c
    })
    setTemplate({ elements: [...t.elements, e] })
    setSel(e.id)
  }
  function newTemplate(copy?: LabelTemplate) {
    if (!designs) return
    const nt: LabelTemplate = copy
      ? { ...copy, id: newId('t'), name: `${copy.name} (copy)`, elements: copy.elements.map((e) => ({ ...e, id: newId('e') })) }
      : { id: newId('t'), name: 'New label', widthIn: 2.25, heightIn: 1.25, elements: [] }
    setDesigns({ ...designs, labels: [...designs.labels, nt] })
    setTid(nt.id)
    setSel(null)
    setDirty(true)
  }
  function deleteTemplate() {
    if (!designs || !t || designs.labels.length <= 1) return
    if (!confirm(`Delete the label "${t.name}"?`)) return
    const rest = designs.labels.filter((x) => x.id !== t.id)
    setDesigns({ ...designs, labels: rest })
    setTid(rest[0].id)
    setDirty(true)
  }
  async function save() {
    try {
      const saved = await api.savePrintDesigns(designs!)
      setDesigns(saved)
      setDirty(false)
      setMsg({ ok: true, text: 'Labels saved for every till' })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    }
  }
  async function testPrint() {
    if (!t) return
    if (dirty) await save()
    try {
      await printTags([{ product: preview as Product, qty: 1 }], t.id)
      setMsg({ ok: true, text: 'Test label sent to the label printer' })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    }
  }

  const onKey = (ev: React.KeyboardEvent) => {
    if (!el || !t || (ev.target as HTMLElement).tagName === 'INPUT' || (ev.target as HTMLElement).tagName === 'SELECT' || (ev.target as HTMLElement).tagName === 'TEXTAREA') return
    const step = ev.shiftKey ? 0.01 : SNAP
    const k: Record<string, Partial<LabelElement>> = {
      ArrowLeft: { x: r2(Math.max(0, el.x - step)) },
      ArrowRight: { x: r2(Math.min(t.widthIn - 0.05, el.x + step)) },
      ArrowUp: { y: r2(Math.max(0, el.y - step)) },
      ArrowDown: { y: r2(Math.min(t.heightIn - 0.01, el.y + step)) }
    }
    if (k[ev.key]) {
      ev.preventDefault()
      setEl(el.id, k[ev.key])
    } else if (ev.key === 'Delete') {
      setTemplate({ elements: t.elements.filter((e) => e.id !== el.id) })
      setSel(null)
    }
  }

  const sizeKey = t ? `${t.widthIn}x${t.heightIn}` : ''
  const preset = LABEL_SIZES.find((z) => `${z.widthIn}x${z.heightIn}` === sizeKey)

  return (
    <div className="designer" tabIndex={0} onKeyDown={onKey}>
      {/* ---------- Templates ---------- */}
      <aside className="ds-side">
        <h4>Labels</h4>
        <div className="ds-list">
          {designs.labels.map((x) => (
            <button
              key={x.id}
              className={x.id === tid ? 'active' : ''}
              onClick={() => {
                setTid(x.id)
                setSel(null)
              }}
            >
              <b>{x.name}</b>
              <span className="muted small">
                {x.widthIn}" × {x.heightIn}"
              </span>
            </button>
          ))}
        </div>
        <div className="row gap wrap">
          <button onClick={() => newTemplate()}>+ New</button>
          <button disabled={!t} onClick={() => t && newTemplate(t)}>
            Copy
          </button>
          <button className="danger" disabled={designs.labels.length <= 1} onClick={deleteTemplate}>
            Delete
          </button>
        </div>
        {t && (
          <div className="form ds-props">
            <label>
              Name
              <input value={t.name} onChange={(e) => setTemplate({ name: e.target.value })} />
            </label>
            <label>
              Label size
              <select
                value={preset ? sizeKey : 'custom'}
                onChange={(e) => {
                  const z = LABEL_SIZES.find((x) => `${x.widthIn}x${x.heightIn}` === e.target.value)
                  if (z) setTemplate({ widthIn: z.widthIn, heightIn: z.heightIn })
                  else setTemplate({ widthIn: r2(t.widthIn + 0.01) })
                }}
              >
                {LABEL_SIZES.map((z) => (
                  <option key={z.label} value={`${z.widthIn}x${z.heightIn}`}>
                    {z.label}
                  </option>
                ))}
                <option value="custom">Other size…</option>
              </select>
            </label>
            {!preset && (
              <div className="row gap">
                <label>
                  Width (in)
                  <input type="number" step={0.05} min={0.5} max={8} value={t.widthIn} onChange={(e) => setTemplate({ widthIn: Number(e.target.value) || 2 })} />
                </label>
                <label>
                  Height (in)
                  <input type="number" step={0.05} min={0.3} max={8} value={t.heightIn} onChange={(e) => setTemplate({ heightIn: Number(e.target.value) || 1 })} />
                </label>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* ---------- Canvas ---------- */}
      <section className="ds-main">
        <div className="ds-toolbar">
          <select value={addField} onChange={(e) => setAddField(e.target.value as LabelField)}>
            {LABEL_FIELDS.map((f) => (
              <option key={f.field} value={f.field}>
                {f.label}
              </option>
            ))}
          </select>
          <button
            onClick={() =>
              addEl('text', {
                field: addField,
                text: addField === 'text' ? 'Your text' : '',
                fontPt: addField === 'price' ? 16 : 9,
                bold: addField === 'price' || addField === 'name'
              })
            }
          >
            + Add field
          </button>
          <button onClick={() => addEl('barcode')}>+ Barcode</button>
          <button onClick={() => addEl('line', { w: t ? t.widthIn - 0.2 : 2 })}>+ Line</button>
          <span className="spacer" />
          <form className="row gap" onSubmit={loadPreview}>
            <input placeholder="Preview with item # / UPC" value={itemQuery} onChange={(e) => setItemQuery(e.target.value)} style={{ width: 190 }} />
            <button type="submit">Preview</button>
          </form>
        </div>

        {t && (
          <div className="ds-canvas-wrap" onPointerDown={(e) => e.target === e.currentTarget && setSel(null)}>
            <div style={{ width: t.widthIn * 96 * scale, height: t.heightIn * 96 * scale }}>
              <div
                className="ds-label"
                style={{ width: `${t.widthIn}in`, height: `${t.heightIn}in`, transform: `scale(${scale})` }}
                onPointerDown={(e) => e.target === e.currentTarget && setSel(null)}
              >
                {t.elements.map((e) => (
                  <div
                    key={e.id}
                    className={e.id === sel ? 'ds-el selected' : 'ds-el'}
                    style={{ left: `${e.x}in`, top: `${e.y}in`, width: `${e.w}in`, height: `${e.h}in` }}
                    onPointerDown={(ev) => {
                      ev.preventDefault()
                      setSel(e.id)
                      drag.current = { id: e.id, mode: 'move', sx: ev.clientX, sy: ev.clientY, orig: e }
                    }}
                  >
                    <div style={cssToStyle(labelContentCss(e))} dangerouslySetInnerHTML={{ __html: labelElementInner(e, preview, store) }} />
                    {e.id === sel && (
                      <span
                        className="ds-handle"
                        style={{ transform: `scale(${1 / scale})` }}
                        onPointerDown={(ev) => {
                          ev.preventDefault()
                          ev.stopPropagation()
                          drag.current = { id: e.id, mode: 'size', sx: ev.clientX, sy: ev.clientY, orig: e }
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        <p className="muted small">
          Drag an element to move it; drag the corner square to resize. Arrow keys nudge it, Delete removes it. Hold Shift for fine
          steps. Fields that are empty for an item (e.g. Price on a part with no price) print blank.
        </p>
        {msg && <div className={msg.ok ? 'ok-text' : 'error-text'}>{msg.text}</div>}
        <div className="row gap">
          <button className="primary" disabled={!dirty} onClick={save}>
            Save labels
          </button>
          <button onClick={testPrint}>Print test label</button>
          {dirty && <span className="muted small">Not saved yet</span>}
        </div>
      </section>

      {/* ---------- Selected element ---------- */}
      <aside className="ds-side">
        <h4>{el ? (el.kind === 'barcode' ? 'Barcode' : el.kind === 'line' ? 'Line' : 'Text field') : 'Element'}</h4>
        {!el ? (
          <p className="muted small">Click an element on the label to change it, or add one from the toolbar.</p>
        ) : (
          <div className="form ds-props">
            {el.kind === 'text' && (
              <>
                <label>
                  Shows
                  <select value={el.field} onChange={(e) => setEl(el.id, { field: e.target.value as LabelField })}>
                    {LABEL_FIELDS.map((f) => (
                      <option key={f.field} value={f.field}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
                {el.field === 'text' && (
                  <label>
                    Text
                    <input value={el.text} onChange={(e) => setEl(el.id, { text: e.target.value })} />
                  </label>
                )}
                <div className="row gap">
                  <label>
                    Font size (pt)
                    <input type="number" min={4} max={72} value={el.fontPt} onChange={(e) => setEl(el.id, { fontPt: Number(e.target.value) || 9 })} />
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={el.bold} onChange={(e) => setEl(el.id, { bold: e.target.checked })} />
                    Bold
                  </label>
                </div>
                <div className="seg">
                  {(['left', 'center', 'right'] as const).map((a) => (
                    <button key={a} className={el.align === a ? 'active' : ''} onClick={() => setEl(el.id, { align: a })}>
                      {a === 'left' ? '⇤ Left' : a === 'center' ? 'Center' : 'Right ⇥'}
                    </button>
                  ))}
                </div>
              </>
            )}
            {el.kind === 'barcode' && (
              <>
                <label>
                  Code
                  <select value={el.barcodeOf} onChange={(e) => setEl(el.id, { barcodeOf: e.target.value as LabelElement['barcodeOf'] })}>
                    <option value="upc">UPC (or Item # if no UPC)</option>
                    <option value="sku">Item #</option>
                    <option value="alu">ALU</option>
                  </select>
                </label>
                <label className="check">
                  <input type="checkbox" checked={el.showCode} onChange={(e) => setEl(el.id, { showCode: e.target.checked })} />
                  Print the numbers under the bars
                </label>
              </>
            )}
            <div className="ds-xywh">
              {(['x', 'y', 'w', 'h'] as const).map((k) => (
                <label key={k}>
                  {k === 'x' ? 'Left' : k === 'y' ? 'Top' : k === 'w' ? 'Width' : 'Height'} (in)
                  <input type="number" step={0.01} value={el[k]} onChange={(e) => setEl(el.id, { [k]: r2(Number(e.target.value) || 0) })} />
                </label>
              ))}
            </div>
            <div className="row gap">
              <button
                onClick={() => {
                  const copy: Partial<LabelElement> = { ...el, x: r2(el.x + 0.05), y: r2(el.y + 0.05) }
                  delete copy.id
                  addEl(el.kind, copy)
                }}
              >
                Duplicate
              </button>
              <button
                className="danger"
                onClick={() => {
                  if (!t) return
                  setTemplate({ elements: t.elements.filter((e) => e.id !== el.id) })
                  setSel(null)
                }}
              >
                Remove
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
