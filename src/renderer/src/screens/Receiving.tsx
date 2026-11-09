import { useEffect, useMemo, useRef, useState } from 'react'
import type { BootInfo, Product } from '../../../shared/types'
import {
  landedCosts,
  marginPct,
  newAverageCost,
  receivingTotals,
  type PostLineChoice,
  type Receiving as Rv,
  type ReceivingInput,
  type ReceivingSummary
} from '../../../shared/receiving'
import { api } from '../api'
import { dateTime, money, parseMoney, today } from '../format'
import TagPrintDialog, { type TagLine } from './TagPrintDialog'

/** A line being edited (draft). Costs are kept as text while typing. */
interface EditLine {
  key: string
  product: Product
  qty: string
  cost: string
  note: string
}

const centsText = (c: number | null | undefined) => (c === null || c === undefined ? '' : (c / 100).toFixed(2))
const num = (s: string) => {
  const n = Number(String(s).replace(/,/g, ''))
  return Number.isFinite(n) ? n : NaN
}

/** Receiving: list of receivings (drafts first) and the receiving editor. */
export default function Receiving({ boot, startNew, onIntentDone }: { boot: BootInfo; startNew?: boolean; onIntentDone?: () => void }) {
  const [view, setView] = useState<{ kind: 'list' } | { kind: 'edit'; id: number | null }>({ kind: 'list' })
  const [list, setList] = useState<ReceivingSummary[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'' | 'draft' | 'posted'>('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (startNew) {
      setView({ kind: 'edit', id: null })
      onIntentDone?.()
    }
  }, [startNew])
  const load = () => api.receivings(search, status).then(setList).catch((e) => setError(e.message))
  useEffect(() => {
    if (view.kind !== 'list') return
    const t = setTimeout(load, 150)
    return () => clearTimeout(t)
  }, [search, status, view.kind])

  if (view.kind === 'edit') return <ReceivingEditor boot={boot} id={view.id} onBack={() => setView({ kind: 'list' })} />

  return (
    <div className="page wide">
      <div className="row between">
        <h2>Receiving</h2>
        <button className="primary" onClick={() => setView({ kind: 'edit', id: null })}>
          + New receiving
        </button>
      </div>
      <div className="row gap">
        <input
          placeholder="Search RV #, vendor, invoice #, PO #, or an item…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, width: 'auto' }}
        />
        <div className="seg">
          {(
            [
              ['', 'All'],
              ['draft', 'Not received yet'],
              ['posted', 'Received']
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={status === k ? 'active' : ''} onClick={() => setStatus(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="error-text">{error}</div>}
      <table className="table">
        <thead>
          <tr>
            <th>RV #</th>
            <th>Status</th>
            <th>Vendor</th>
            <th>Invoice #</th>
            <th>PO #</th>
            <th>Date</th>
            <th>By</th>
            <th className="r">Lines</th>
            <th className="r">Qty</th>
            <th className="r">Total cost</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.id} className="clickable" onClick={() => setView({ kind: 'edit', id: r.id })}>
              <td>
                <b>{r.number}</b>
              </td>
              <td>{r.status === 'draft' ? <span className="pill">Not received yet</span> : <span className="pill ok">Received</span>}</td>
              <td>{r.vendor}</td>
              <td>{r.invoiceNo}</td>
              <td>{r.poNumber}</td>
              <td className="muted small">{dateTime(r.postedAt ?? r.createdAt)}</td>
              <td className="muted small">{r.receivedBy}</td>
              <td className="r">{r.lineCount}</td>
              <td className="r">{r.qty}</td>
              <td className="r">{money(r.totalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {list.length === 0 && <p className="muted">{search || status ? 'Nothing matches.' : 'No receivings yet. Click + New receiving when an order comes in.'}</p>}
    </div>
  )
}

function ReceivingEditor({ boot, id, onBack }: { boot: BootInfo; id: number | null; onBack: () => void }) {
  const [rv, setRv] = useState<Rv | null>(null)
  const [head, setHead] = useState({
    vendor: '',
    invoiceNo: '',
    poNumber: '',
    invoiceDate: today(),
    receivedBy: boot.config.tillName,
    freight: '',
    freightToCost: true,
    notes: ''
  })
  const [lines, setLines] = useState<EditLine[]>([])
  const [code, setCode] = useState('')
  const [sugs, setSugs] = useState<Product[]>([])
  const [sugIdx, setSugIdx] = useState(-1)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [dirty, setDirty] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [tags, setTags] = useState<TagLine[] | null>(null)
  const [vendors, setVendors] = useState<string[]>([])
  const scanRef = useRef<HTMLInputElement>(null)
  const posted = rv?.status === 'posted'

  useEffect(() => {
    api
      .listProducts('', true)
      .then((ps) => setVendors([...new Set(ps.map((p) => p.vendor).filter((v): v is string => !!v))].sort()))
      .catch(() => {})
    if (id !== null) api.receiving(id).then(show).catch((e) => setMsg({ ok: false, text: e.message }))
  }, [id])

  async function show(r: Rv) {
    setRv(r)
    setHead({
      vendor: r.vendor,
      invoiceNo: r.invoiceNo,
      poNumber: r.poNumber,
      invoiceDate: r.invoiceDate ?? '',
      receivedBy: r.receivedBy,
      freight: r.freightCents ? centsText(r.freightCents) : '',
      freightToCost: r.freightToCost,
      notes: r.notes
    })
    // The lines need the full items (for averages and tags)
    const prods = await Promise.all(r.lines.map((l) => api.listProducts(l.sku ?? l.name, true).then((ps) => ps.find((p) => p.id === l.productId))))
    setLines(
      r.lines.map((l, i) => ({
        key: `l${l.id}`,
        product:
          prods[i] ??
          ({ id: l.productId, name: l.name, sku: l.sku, onHand: l.onHand, costCents: l.avgCostCents, orderCostCents: l.orderCostCents, priceCents: l.priceCents, type: l.type } as unknown as Product),
        qty: String(l.qty),
        cost: centsText(l.unitCostCents),
        note: l.note
      }))
    )
    setDirty(false)
  }

  // ----- type-ahead to add items -----
  useEffect(() => {
    const q = code.trim()
    if (q.length < 2) return setSugs([])
    let live = true
    const t = setTimeout(() => api.listProducts(q).then((r) => live && (setSugs(r.slice(0, 8)), setSugIdx(-1))).catch(() => {}), 180)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [code])
  function addItem(p: Product) {
    setSugs([])
    setCode('')
    setDirty(true)
    setLines((ls) => {
      const same = ls.findIndex((l) => l.product.id === p.id)
      if (same >= 0) return ls.map((l, i) => (i === same ? { ...l, qty: String((num(l.qty) || 0) + 1) } : l))
      const cost = p.orderCostCents ?? p.costCents ?? 0
      return [...ls, { key: `n${p.id}-${Date.now()}`, product: p, qty: '1', cost: centsText(cost), note: '' }]
    })
    setTimeout(() => scanRef.current?.focus(), 0)
  }
  async function onScan(e: React.FormEvent) {
    e.preventDefault()
    if (sugIdx >= 0 && sugs[sugIdx]) return addItem(sugs[sugIdx])
    const q = code.trim()
    if (!q) return
    try {
      addItem(await api.lookupProduct(q))
    } catch {
      const m = await api.listProducts(q).catch(() => [])
      if (m.length === 1) addItem(m[0])
      else setMsg({ ok: false, text: m.length ? 'Several items match: pick one from the list' : `No item found for "${q}"` })
    }
  }

  // ----- maths shown on screen (same as the server) -----
  const parsed = lines.map((l) => ({ qty: num(l.qty), unitCostCents: parseMoney(l.cost || '0') }))
  const valid = parsed.every((p) => p.qty > 0 && !isNaN(p.unitCostCents))
  const freightCents = head.freight.trim() ? parseMoney(head.freight) : 0
  const landed = useMemo(
    () => (valid && !isNaN(freightCents) ? landedCosts(parsed, freightCents, head.freightToCost) : parsed.map((p) => p.unitCostCents)),
    [JSON.stringify(parsed), freightCents, head.freightToCost, valid]
  )
  const totals = receivingTotals(
    parsed.map((p) => ({ qty: p.qty || 0, unitCostCents: p.unitCostCents || 0 })),
    isNaN(freightCents) ? 0 : freightCents
  )

  function input(): ReceivingInput | string {
    if (!valid) return 'Each line needs a quantity above 0 and a cost (0.00 if free)'
    if (isNaN(freightCents)) return 'Freight: enter an amount like 25.00'
    return {
      vendor: head.vendor,
      invoiceNo: head.invoiceNo,
      poNumber: head.poNumber,
      invoiceDate: head.invoiceDate || null,
      receivedBy: head.receivedBy,
      freightCents,
      freightToCost: head.freightToCost,
      notes: head.notes,
      tillName: boot.config.tillName,
      lines: lines.map((l, i) => ({ productId: l.product.id, qty: parsed[i].qty, unitCostCents: parsed[i].unitCostCents, note: l.note }))
    }
  }
  async function save(quiet = false): Promise<Rv | null> {
    const body = input()
    if (typeof body === 'string') {
      setMsg({ ok: false, text: body })
      return null
    }
    setBusy(true)
    try {
      const saved = rv ? await api.saveReceiving(rv.id, body) : await api.createReceiving(body)
      setRv(saved)
      setDirty(false)
      if (!quiet) setMsg({ ok: true, text: `${saved.number} saved. Nothing changes in stock until you click Receive items.` })
      return saved
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
      return null
    } finally {
      setBusy(false)
    }
  }
  async function startReceive() {
    if (!lines.length) return setMsg({ ok: false, text: 'Add the items that came in first' })
    const saved = await save(true)
    if (saved) {
      setRv(saved)
      setReviewing(true)
    }
  }
  async function removeDraft() {
    if (!rv) return onBack()
    if (!confirm(`Delete ${rv.number}? Nothing has been received from it.`)) return
    try {
      await api.deleteReceiving(rv.id)
      onBack()
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    }
  }
  const tagLinesFor = (r: Rv): TagLine[] =>
    r.lines.map((l, i) => {
      const p = lines.find((x) => x.product.id === l.productId)?.product ?? lines[i]?.product
      return { product: { ...p, priceCents: l.newPriceCents ?? l.priceCents } as Product, qty: Math.max(1, Math.round(l.qty)) }
    })

  const setH = (c: Partial<typeof head>) => {
    setHead({ ...head, ...c })
    setDirty(true)
  }

  return (
    <div className="page wide receiving">
      <div className="row between">
        <button className="link" onClick={() => (!dirty || confirm('Leave without saving the changes?')) && onBack()}>
          ← Receiving
        </button>
        <span className="muted small">{rv ? `Started ${dateTime(rv.createdAt)}${rv.postedAt ? ` · received ${dateTime(rv.postedAt)}` : ''}` : 'New receiving'}</span>
      </div>
      <h2>
        {rv ? rv.number : 'New receiving'}{' '}
        {rv && (posted ? <span className="pill ok">Received</span> : <span className="pill">Not received yet</span>)}
      </h2>

      <div className="card rv-head">
        <label>
          Vendor
          <input list="dl-rv-vendors" disabled={posted} value={head.vendor} onChange={(e) => setH({ vendor: e.target.value })} />
          <datalist id="dl-rv-vendors">
            {vendors.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </label>
        <label>
          Vendor invoice #
          <input disabled={posted} value={head.invoiceNo} onChange={(e) => setH({ invoiceNo: e.target.value })} />
        </label>
        <label>
          PO #
          <input disabled={posted} value={head.poNumber} onChange={(e) => setH({ poNumber: e.target.value })} />
        </label>
        <label>
          Invoice date
          <input type="date" disabled={posted} value={head.invoiceDate} onChange={(e) => setH({ invoiceDate: e.target.value })} />
        </label>
        <label>
          Received by
          <input disabled={posted} value={head.receivedBy} onChange={(e) => setH({ receivedBy: e.target.value })} />
        </label>
        <label>
          Freight / shipping $
          <input className="money" disabled={posted} placeholder="0.00" value={head.freight} onChange={(e) => setH({ freight: e.target.value })} />
        </label>
        <label className="check rv-freight">
          <input type="checkbox" disabled={posted} checked={head.freightToCost} onChange={(e) => setH({ freightToCost: e.target.checked })} />
          Add freight to the items' cost
        </label>
        <label className="rv-notes">
          Notes
          <input disabled={posted} value={head.notes} placeholder="e.g. 2 boxes, 1 damaged; backorder on chains" onChange={(e) => setH({ notes: e.target.value })} />
        </label>
      </div>

      {!posted && (
        <form className="scanbar rv-scan" onSubmit={onScan}>
          <label htmlFor="rv-scan">Add item</label>
          <div className="scan-wrap">
            <input
              id="rv-scan"
              ref={scanRef}
              autoFocus
              autoComplete="off"
              placeholder="Scan, or type an item #, UPC or description"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onBlur={() => setTimeout(() => setSugs([]), 150)}
              onKeyDown={(e) => {
                if (!sugs.length) return
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setSugIdx((i) => Math.min(i + 1, sugs.length - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setSugIdx((i) => Math.max(i - 1, -1))
                } else if (e.key === 'Escape') setSugs([])
              }}
            />
            {sugs.length > 0 && (
              <div className="scan-sugs down">
                {sugs.map((p, i) => (
                  <button
                    type="button"
                    key={p.id}
                    className={i === sugIdx ? 'active' : ''}
                    onMouseEnter={() => setSugIdx(i)}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      addItem(p)
                    }}
                  >
                    <span className="dim">{p.sku ?? ''}</span>
                    <span className="sug-name">{p.name}</span>
                    {p.type === 'inventory' && <span className="dim small">{p.onHand} on hand</span>}
                    <b>{money(p.priceCents)}</b>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="submit" className="primary">
            Add
          </button>
        </form>
      )}

      <div className="grid-wrap rv-grid">
        <table className="grid">
          <thead>
            <tr>
              {!posted && <th className="x-col" />}
              <th style={{ width: 100 }}>Item #</th>
              <th>Item</th>
              <th className="num" style={{ width: 70 }}>On hand</th>
              <th className="num" style={{ width: 70 }}>Qty in</th>
              <th className="num" style={{ width: 90 }}>Cost each</th>
              <th className="num" style={{ width: 80 }}>Last cost</th>
              <th className="num" style={{ width: 120 }}>Avg cost → new</th>
              <th className="num" style={{ width: 80 }}>Reg price</th>
              <th className="num" style={{ width: 70 }}>Margin</th>
              <th className="num" style={{ width: 90 }}>Line cost</th>
              <th style={{ width: 160 }}>Note</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const p = l.product
              const rl = posted ? rv!.lines[i] : null
              const q = parsed[i].qty
              const unit = landed[i]
              const onHand = rl ? rl.onHand : p.onHand
              const avg = rl ? rl.avgCostCents : p.costCents
              const nextAvg = rl ? rl.newAvgCostCents : !isNaN(unit) && q > 0 ? newAverageCost(p.type === 'inventory' ? onHand : 0, avg, q, unit) : null
              const price = rl ? rl.newPriceCents ?? rl.priceCents : p.priceCents
              const lastCost = rl ? rl.orderCostCents : p.orderCostCents
              const changed = !isNaN(parsed[i].unitCostCents) && lastCost !== null && lastCost !== undefined && parsed[i].unitCostCents !== lastCost
              return (
                <tr key={l.key}>
                  {!posted && (
                    <td className="x-col">
                      <button
                        className="line-x"
                        title="Remove"
                        onClick={() => {
                          setLines(lines.filter((x) => x.key !== l.key))
                          setDirty(true)
                        }}
                      >
                        ✕
                      </button>
                    </td>
                  )}
                  <td className="dim">{p.sku ?? ''}</td>
                  <td>
                    {p.name}
                    {p.type !== 'inventory' && <span className="serial-tag">{p.type === 'service' ? 'Service' : 'Non-inventory'}: no stock count</span>}
                  </td>
                  <td className="num">{p.type === 'inventory' ? onHand : ''}</td>
                  <td className="num">
                    {posted ? (
                      l.qty
                    ) : (
                      <input className="qty-in" value={l.qty} onChange={(e) => (setLines(lines.map((x) => (x.key === l.key ? { ...x, qty: e.target.value } : x))), setDirty(true))} />
                    )}
                  </td>
                  <td className="num">
                    {posted ? (
                      money(rl!.unitCostCents)
                    ) : (
                      <input
                        className={changed ? 'money-in changed' : 'money-in'}
                        title={changed ? 'Different from the last cost' : ''}
                        value={l.cost}
                        onChange={(e) => (setLines(lines.map((x) => (x.key === l.key ? { ...x, cost: e.target.value } : x))), setDirty(true))}
                      />
                    )}
                    {!isNaN(unit) && unit !== parsed[i].unitCostCents && <span className="ex-tag">+ freight {money(unit)}</span>}
                  </td>
                  <td className="num dim">{lastCost === null || lastCost === undefined ? '—' : money(lastCost)}</td>
                  <td className="num">
                    <span className="dim">{avg === null || avg === undefined ? '—' : money(avg)}</span> → <b>{nextAvg === null ? '—' : money(nextAvg)}</b>
                  </td>
                  <td className="num">
                    {money(price)}
                    {rl?.newPriceCents !== null && rl?.newPriceCents !== undefined && <span className="ex-tag">was {money(rl.priceCents)}</span>}
                  </td>
                  <td className="num dim">{(() => {
                    const m = marginPct(price, nextAvg)
                    return m === null ? '' : `${m}%`
                  })()}</td>
                  <td className="num">{isNaN(parsed[i].unitCostCents) || !(q > 0) ? '' : money(Math.round(q * parsed[i].unitCostCents))}</td>
                  <td>
                    {posted ? (
                      <span className="small">{l.note}</span>
                    ) : (
                      <input value={l.note} placeholder="e.g. backordered 2" onChange={(e) => (setLines(lines.map((x) => (x.key === l.key ? { ...x, note: e.target.value } : x))), setDirty(true))} />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {lines.length === 0 && <div className="grid-empty">Scan or search for the items that came in.</div>}
      </div>

      <div className="rv-foot">
        <div className="rv-totals">
          <span>
            {totals.lineCount} line{totals.lineCount === 1 ? '' : 's'} · {totals.qty} item{totals.qty === 1 ? '' : 's'}
          </span>
          <span>Items {money(totals.itemsCents)}</span>
          <span>Freight {money(isNaN(freightCents) ? 0 : freightCents)}</span>
          <b>Total {money(totals.totalCents)}</b>
        </div>
        {msg && <div className={msg.ok ? 'ok-text' : 'error-text'}>{msg.text}</div>}
        <div className="row gap">
          {!posted && (
            <>
              <button className="danger" disabled={busy} onClick={removeDraft}>
                {rv ? 'Delete' : 'Cancel'}
              </button>
              <button disabled={busy || !lines.length} onClick={() => save()}>
                Save (receive later)
              </button>
              <button className="primary" disabled={busy || !lines.length} onClick={startReceive}>
                ✓ Receive items…
              </button>
            </>
          )}
          {posted && rv && <button onClick={() => setTags(tagLinesFor(rv))}>🏷 Print tags</button>}
        </div>
      </div>

      {reviewing && rv && (
        <ReceiveReview
          rv={rv}
          landed={landed}
          onCancel={() => setReviewing(false)}
          onPosted={async (done) => {
            setReviewing(false)
            await show(done)
            setMsg({ ok: true, text: `${done.number} received: stock and costs updated.` })
            setTags(tagLinesFor(done))
          }}
        />
      )}
      {tags && <TagPrintDialog title={`Print tags for ${rv?.number ?? 'this receiving'}?`} lines={tags} onClose={() => setTags(null)} />}
    </div>
  )
}

/** Before receiving: choose which items get the new cost and change any regular prices. */
function ReceiveReview({ rv, landed, onCancel, onPosted }: { rv: Rv; landed: number[]; onCancel: () => void; onPosted: (r: Rv) => void }) {
  const [rows, setRows] = useState(() =>
    rv.lines.map((l, i) => ({
      line: l,
      unit: landed[i] ?? l.unitCostCents,
      updateCost: true,
      price: centsText(l.priceCents)
    }))
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (i: number, c: Partial<(typeof rows)[number]>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...c } : r)))
  async function post() {
    const choices: PostLineChoice[] = []
    for (const r of rows) {
      const p = parseMoney(r.price)
      if (isNaN(p)) return setError(`${r.line.name}: enter the price like 12.99`)
      choices.push({ lineId: r.line.id, updateCost: r.updateCost, newPriceCents: p !== r.line.priceCents ? p : null })
    }
    setBusy(true)
    setError('')
    try {
      onPosted(await api.postReceiving(rv.id, choices))
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }
  const costChanges = rows.filter((r) => r.line.orderCostCents !== r.unit).length
  return (
    <div className="modal-backdrop">
      <div className="modal rv-review" onKeyDown={(e) => e.key === 'Escape' && !busy && onCancel()}>
        <h2>Receive {rv.number}</h2>
        <p>
          Stock goes up and each item's <b>average cost</b> is worked out again. {costChanges ? `${costChanges} item(s) came in at a different cost. ` : ''}
          Choose which items should take this cost as their order cost, and change any regular prices now.
        </p>
        <div className="grid-wrap rv-review-grid">
          <table className="grid">
            <thead>
              <tr>
                <th>Item</th>
                <th className="num">Qty</th>
                <th className="num">Last cost</th>
                <th className="num">This cost</th>
                <th style={{ width: 110 }}>Update cost</th>
                <th className="num">Avg → new</th>
                <th style={{ width: 120 }}>Regular price</th>
                <th className="num">Margin</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const l = r.line
                const avg = newAverageCost(l.type === 'inventory' ? l.onHand : 0, l.avgCostCents, l.qty, r.unit)
                const price = parseMoney(r.price)
                const m = isNaN(price) ? null : marginPct(price, avg)
                const differs = l.orderCostCents !== r.unit
                return (
                  <tr key={l.id} className={differs ? 'rv-changed' : ''}>
                    <td>
                      {l.name}
                      <span className="serial-tag">{l.sku}</span>
                    </td>
                    <td className="num">{l.qty}</td>
                    <td className="num dim">{l.orderCostCents === null ? '—' : money(l.orderCostCents)}</td>
                    <td className="num">
                      <b>{money(r.unit)}</b>
                    </td>
                    <td>
                      <label className="check">
                        <input type="checkbox" checked={r.updateCost} onChange={(e) => set(i, { updateCost: e.target.checked })} />
                        {differs ? 'Use new cost' : 'Same'}
                      </label>
                    </td>
                    <td className="num">
                      <span className="dim">{l.avgCostCents === null ? '—' : money(l.avgCostCents)}</span> → <b>{money(avg)}</b>
                    </td>
                    <td>
                      <input className={!isNaN(price) && price !== l.priceCents ? 'money-in changed' : 'money-in'} value={r.price} onChange={(e) => set(i, { price: e.target.value })} />
                    </td>
                    <td className="num dim">{m === null ? '' : `${m}%`}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {error && <div className="error-text">{error}</div>}
        <div className="row gap end">
          <button onClick={onCancel} disabled={busy}>
            Back
          </button>
          <button className="primary" onClick={post} disabled={busy}>
            {busy ? 'Receiving…' : '✓ Receive items'}
          </button>
        </div>
      </div>
    </div>
  )
}
