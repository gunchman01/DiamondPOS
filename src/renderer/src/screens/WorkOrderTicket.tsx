import { useEffect, useState } from 'react'
import type { Product } from '../../../shared/types'
import { STAGES, stage, unitLabel, type WoLine, type WoSaleMode, type WoStatus, type WorkOrder } from '../../../shared/workorders'
import { api } from '../api'
import { dateTime, money, parseMoney } from '../format'

const KIND_LABEL = { part: 'Part', labor: 'Labor', shop: 'Shop supplies', misc: 'Other' } as const
const FLOW: WoStatus[] = ['needs_estimate', 'approved', 'waiting_parts', 'on_bench', 'ready_review', 'ready_pickup', 'closed']

/** One repair ticket. */
export default function WorkOrderTicket(props: {
  id: number
  by: string
  onBack: () => void
  onPayAtTill: (id: number, mode: WoSaleMode) => void
}) {
  const [wo, setWo] = useState<WorkOrder | null>(null)
  const [notes, setNotes] = useState({ problem: '', diagnosis: '', workDone: '', internalNotes: '' })
  const [picking, setPicking] = useState(false)
  const [miscOpen, setMiscOpen] = useState(false)
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const show = (w: WorkOrder) => {
    setWo(w)
    setNotes({ problem: w.problem, diagnosis: w.diagnosis, workDone: w.workDone, internalNotes: w.internalNotes })
  }
  useEffect(() => {
    api.wo(props.id).then(show).catch((e) => setError(e.message))
  }, [props.id])

  async function run(fn: () => Promise<WorkOrder | void>, ok = '') {
    setBusy(true)
    setError('')
    setMsg('')
    try {
      const w = await fn()
      if (w) show(w)
      if (ok) setMsg(ok)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!wo) return <div className="page">{error || 'Loading…'}</div>

  const st = stage(wo.status)
  const closed = wo.status === 'closed'
  const shortParts = wo.lines.filter((l) => l.short)
  const notesDirty =
    notes.problem !== wo.problem || notes.diagnosis !== wo.diagnosis || notes.workDone !== wo.workDone || notes.internalNotes !== wo.internalNotes
  const move = (to: WoStatus) =>
    run(async () => {
      if (notesDirty) await api.woUpdate(wo.id, notes)
      return api.woStatus(wo.id, to, props.by)
    }, `Moved to ${stage(to).label}`)

  const editLine = (l: WoLine, changes: Partial<WoLine>) => run(() => api.woUpdateLine(wo.id, l.id, changes))

  return (
    <div className="page wide ticket">
      {/* ---------------- Header ---------------- */}
      <div className="row between">
        <button className="link" onClick={props.onBack}>
          ← Work orders
        </button>
        <span className="muted small">
          Checked in {dateTime(wo.createdAt)} · last change {dateTime(wo.updatedAt)}
        </span>
      </div>
      <div className="card ticket-head">
        <div>
          <div className="ticket-no">{wo.number}</div>
          <span className="stage-badge big" style={{ background: st.color }}>
            {st.label}
          </span>
        </div>
        <div className="ticket-who">
          <b>{wo.customerName}</b>
          <span className="muted small">{[wo.customerPhone, wo.customerEmail ?? 'no email on file'].filter(Boolean).join(' · ')}</span>
          <span>
            <b>{unitLabel(wo.unit)}</b>
            {wo.unit.serial && <span className="muted small"> · S/N {wo.unit.serial}</span>}
          </span>
        </div>
        <div className="ticket-actions">
          {st.canEmail && (
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  if (notesDirty) show(await api.woUpdate(wo.id, notes))
                  setPreview(await api.woEmailPreview(wo.id))
                })
              }
            >
              ✉ Email customer: {st.label}
            </button>
          )}
          {wo.lastEmailedAt && (
            <span className="small muted">
              Last emailed {dateTime(wo.lastEmailedAt)} ({stage(wo.lastEmailedStatus ?? wo.status).label})
            </span>
          )}
        </div>
      </div>

      {/* ---------------- Stage flow ---------------- */}
      <div className="stage-flow">
        {FLOW.map((s) => (
          <span key={s} className={s === wo.status ? 'flow-step current' : 'flow-step'} style={s === wo.status ? { background: stage(s).color } : undefined}>
            {stage(s).label}
          </span>
        ))}
        {wo.status === 'not_fixed' && (
          <span className="flow-step current" style={{ background: st.color }}>
            {st.label}
          </span>
        )}
      </div>
      <div className="row gap stage-buttons">
        {wo.status === 'ready_pickup' && (
          <button className="primary big-ish pay-btn" disabled={busy} onClick={() => props.onPayAtTill(wo.id, 'repair')}>
            💳 Ring up at till · {money(wo.balanceDueCents)} due
          </button>
        )}
        {wo.status === 'not_fixed' && wo.feeStatus === 'paid' && (
          <button className="primary big-ish" disabled={busy} onClick={() => props.onPayAtTill(wo.id, 'credit')}>
            Buying new instead → credit {money(wo.feeCents)} at till
          </button>
        )}
        {wo.status === 'not_fixed' && (
          <button
            className="big-ish"
            disabled={busy}
            onClick={() =>
              confirm(
                wo.feeStatus === 'paid'
                  ? `Customer is taking the unit back without the repair. Keep the ${money(wo.feeCents)} estimate fee and close the ticket?`
                  : 'Customer is taking the unit back without the repair. Close the ticket?'
              ) && run(() => api.woPickupNotFixed(wo.id, props.by), 'Picked up')
            }
          >
            {wo.feeStatus === 'paid' ? `Picked up: keep ${money(wo.feeCents)} fee` : 'Picked up (no charge)'}
          </button>
        )}
        {st.next
          .filter((n) => !(n === 'closed' && (wo.status === 'ready_pickup' || wo.status === 'not_fixed')))
          .map((n) => (
          <button key={n} className={n === 'not_fixed' ? 'danger big-ish' : 'primary big-ish'} disabled={busy} onClick={() => move(n)}>
            {n === 'not_fixed' ? 'Customer declined → ' : '→ '}
            {stage(n).label}
          </button>
          ))}
        <label className="inline small">
          or move to
          <select value="" onChange={(e) => e.target.value && move(e.target.value as WoStatus)} disabled={busy}>
            <option value="">choose a stage…</option>
            {STAGES.filter((s) => s.status !== wo.status).map((s) => (
              <option key={s.status} value={s.status}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {msg && <div className="ok-text">{msg}</div>}
      {error && <div className="error-text">{error}</div>}
      <FeeBar wo={wo} onCollect={() => props.onPayAtTill(wo.id, 'fee')} />
      {wo.status === 'needs_estimate' && (
        <div className="info-bar">Parts on the estimate are not taken from stock until it's moved to <b>Approved to Fix</b>.</div>
      )}
      {wo.status === 'ready_review' && (
        <div className="info-bar">Manager review: check the notes, parts and labor hours, then move it to <b>Ready for Pick Up</b>.</div>
      )}
      {shortParts.length > 0 && !closed && (
        <div className="warn-bar">
          {shortParts.length} part{shortParts.length === 1 ? ' is' : 's are'} not in stock (shown in red). Order{' '}
          {shortParts.length === 1 ? 'it' : 'them'} and move the ticket to <b>Waiting on Parts</b>.
        </div>
      )}

      <div className="ticket-grid">
        {/* ---------------- Parts & labor ---------------- */}
        <div className="card form">
          <div className="row between">
            <h3>{st.partsTaken ? 'Parts & labor' : 'Estimate'}</h3>
            {!closed && (
              <div className="row gap">
                <button onClick={() => setPicking(true)}>+ Part</button>
                <button onClick={() => run(() => api.woAddLine(wo.id, { kind: 'labor', qty: 1 }))}>+ Labor</button>
                <button onClick={() => run(() => api.woAddLine(wo.id, { kind: 'shop' }))}>+ Shop supplies</button>
                <button onClick={() => setMiscOpen(true)}>+ Other</button>
              </div>
            )}
          </div>
          <table className="table wo-lines">
            <thead>
              <tr>
                <th>Type</th>
                <th>Description</th>
                <th className="r">Qty / hrs</th>
                <th className="r">Price</th>
                <th className="r">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {wo.lines.map((l) => (
                <tr key={l.id} className={l.short ? 'short-row' : ''}>
                  <td className="muted small">{KIND_LABEL[l.kind]}</td>
                  <td>
                    {l.description}
                    {l.sku && <span className="muted small"> · {l.sku}</span>}
                    {l.kind === 'part' && l.onHand !== null && (
                      <div className={l.short ? 'stock-note bad' : 'stock-note'}>
                        {l.short ? 'NOT IN STOCK' : 'In stock'} · on hand {l.onHand}
                        {l.stockTaken > 0 ? ` · ${l.stockTaken} taken for this job` : ''}
                      </div>
                    )}
                  </td>
                  <td className="r">
                    <NumberCell
                      value={l.qty}
                      disabled={closed}
                      step={l.kind === 'labor' ? 0.25 : 1}
                      onSave={(qty) => editLine(l, { qty })}
                    />
                  </td>
                  <td className="r">
                    <MoneyCell value={l.unitPriceCents} disabled={closed} onSave={(c) => editLine(l, { unitPriceCents: c })} />
                  </td>
                  <td className="r">{money(Math.round(l.unitPriceCents * l.qty))}</td>
                  <td className="r">
                    {!closed && (
                      <button className="link" title="Remove" onClick={() => run(() => api.woRemoveLine(wo.id, l.id))}>
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {wo.lines.length === 0 && <p className="muted small">No parts or labor yet.</p>}
          <div className="wo-totals">
            <span>Parts</span>
            <span>{money(wo.totals.partsCents)}</span>
            <span>Labor ({wo.totals.laborHours} hr)</span>
            <span>{money(wo.totals.laborCents)}</span>
            <span>Shop supplies</span>
            <span>{money(wo.totals.shopCents)}</span>
            {wo.totals.miscCents !== 0 && (
              <>
                <span>Other</span>
                <span>{money(wo.totals.miscCents)}</span>
              </>
            )}
            {wo.totals.taxExempt ? (
              <>
                <span className="ok-text">Tax exempt</span>
                <span className="ok-text">−{money(wo.totals.taxExemptCents)}</span>
              </>
            ) : (
              <>
                <span className="muted">Tax included</span>
                <span className="muted">{money(wo.totals.taxCents)}</span>
              </>
            )}
            <b>Total</b>
            <b>{money(wo.totals.totalCents)}</b>
            {wo.feeStatus === 'paid' && (
              <>
                <span className="ok-text">Estimate fee paid</span>
                <span className="ok-text">−{money(Math.min(wo.feeCents, wo.totals.totalCents))}</span>
                <b className="due">Balance due</b>
                <b className="due">{money(wo.balanceDueCents)}</b>
              </>
            )}
          </div>
        </div>

        {/* ---------------- Notes ---------------- */}
        <div className="card form">
          <h3>Notes</h3>
          {wo.unit.category === 'mower' && (
            <label className="inline">
              Hour meter at check-in
              <NumberCell value={wo.hoursIn ?? 0} disabled={closed} step={0.1} onSave={(h) => run(() => api.woUpdate(wo.id, { hoursIn: h }))} />
              {wo.hoursIn === null && <span className="muted small">(none recorded)</span>}
            </label>
          )}
          <label>
            Customer's complaint
            <textarea className="comments" rows={2} value={notes.problem} onChange={(e) => setNotes({ ...notes, problem: e.target.value })} />
          </label>
          <label>
            Mechanic's estimate notes / diagnosis
            <textarea className="comments" rows={3} value={notes.diagnosis} onChange={(e) => setNotes({ ...notes, diagnosis: e.target.value })} />
          </label>
          <label>
            Work performed (goes on the pick-up email)
            <textarea className="comments" rows={3} value={notes.workDone} onChange={(e) => setNotes({ ...notes, workDone: e.target.value })} />
          </label>
          <label>
            Internal notes (staff only)
            <textarea className="comments" rows={2} value={notes.internalNotes} onChange={(e) => setNotes({ ...notes, internalNotes: e.target.value })} />
          </label>
          <div>
            <button className="primary" disabled={!notesDirty || busy} onClick={() => run(() => api.woUpdate(wo.id, notes), 'Notes saved')}>
              Save notes
            </button>
          </div>
          <h4>History</h4>
          <div className="wo-history">
            {wo.history.map((h, i) => (
              <div key={i}>
                <span className="muted">{dateTime(h.at)}</span> {h.note}
                {h.by && <span className="muted"> · {h.by}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {picking && (
        <PartPicker
          onCancel={() => setPicking(false)}
          onPick={(p, qty) => {
            setPicking(false)
            run(() => api.woAddLine(wo.id, { kind: 'part', productId: p.id, qty }))
          }}
        />
      )}
      {miscOpen && (
        <MiscLine
          onCancel={() => setMiscOpen(false)}
          onSave={(description, cents) => {
            setMiscOpen(false)
            run(() => api.woAddLine(wo.id, { kind: 'misc', description, unitPriceCents: cents, qty: 1 }))
          }}
        />
      )}
      {preview && (
        <div className="modal-backdrop">
          <div className="modal email-modal">
            <h2>Email {wo.customerName}</h2>
            <div className="small">
              To: <b>{wo.customerEmail ?? '(no email address)'}</b>
              <br />
              Subject: <b>{preview.subject}</b>
            </div>
            <div className="email-preview">
              <div
                className="email-body"
                dangerouslySetInnerHTML={{
                  __html: preview.html.slice(preview.html.indexOf('<body'), preview.html.lastIndexOf('</body>')).replace(/^<body[^>]*>/, '')
                }}
              />
            </div>
            {error && <div className="error-text">{error}</div>}
            <div className="row gap end">
              <button onClick={() => setPreview(null)}>Cancel</button>
              <button
                className="primary"
                disabled={busy || !wo.customerEmail}
                onClick={() =>
                  run(async () => {
                    const w = await api.woEmail(wo.id, props.by)
                    setPreview(null)
                    return w
                  }, `Email sent to ${wo.customerEmail}`)
                }
              >
                Send email
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function NumberCell(props: { value: number; step: number; disabled?: boolean; onSave: (n: number) => void }) {
  const [v, setV] = useState(String(props.value))
  useEffect(() => setV(String(props.value)), [props.value])
  return (
    <input
      className="cell-input"
      inputMode="decimal"
      disabled={props.disabled}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = Number(v)
        if (Number.isFinite(n) && n > 0 && n !== props.value) props.onSave(n)
        else setV(String(props.value))
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

function MoneyCell(props: { value: number; disabled?: boolean; onSave: (cents: number) => void }) {
  const [v, setV] = useState((props.value / 100).toFixed(2))
  useEffect(() => setV((props.value / 100).toFixed(2)), [props.value])
  return (
    <input
      className="cell-input money"
      disabled={props.disabled}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const c = parseMoney(v)
        if (!isNaN(c) && c !== props.value) props.onSave(c)
        else setV((props.value / 100).toFixed(2))
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

/** Search the item list for a part; shows stock so the mechanic knows if it must be ordered */
function PartPicker(props: { onPick: (p: Product, qty: number) => void; onCancel: () => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [qty, setQty] = useState('1')
  useEffect(() => {
    const t = setTimeout(() => api.listProducts(q).then(setResults).catch(() => {}), 150)
    return () => clearTimeout(t)
  }, [q])
  const n = Math.max(1, Math.round(Number(qty) || 1))
  return (
    <div className="modal-backdrop">
      <div className="modal find" onKeyDown={(e) => e.key === 'Escape' && props.onCancel()}>
        <h2>Add a part</h2>
        <div className="row gap">
          <input autoFocus style={{ flex: 1, width: 'auto' }} placeholder="Part name, item # or barcode…" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="inline">
            Qty
            <input style={{ width: 60 }} value={qty} onChange={(e) => setQty(e.target.value)} />
          </label>
        </div>
        <div className="grid-wrap find-results">
          <table className="grid">
            <thead>
              <tr>
                <th>Item #</th>
                <th>Description</th>
                <th className="num">On hand</th>
                <th className="num">Price</th>
              </tr>
            </thead>
            <tbody>
              {results.map((p) => {
                const short = p.type === 'inventory' && p.onHand < n
                return (
                  <tr key={p.id} className={short ? 'short-row' : ''} onClick={() => props.onPick(p, n)}>
                    <td className="dim">{p.sku}</td>
                    <td>{p.name}</td>
                    <td className="num">{p.type === 'inventory' ? p.onHand : '-'}</td>
                    <td className="num">{money(p.priceCents)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="row between">
          <span className="muted small">Red = not enough in stock (you can still add it; it'll show red on the ticket).</span>
          <button onClick={props.onCancel}>Close</button>
        </div>
      </div>
    </div>
  )
}

function MiscLine(props: { onSave: (description: string, cents: number) => void; onCancel: () => void }) {
  const [d, setD] = useState('')
  const [p, setP] = useState('')
  const cents = parseMoney(p)
  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault()
          if (d.trim() && !isNaN(cents)) props.onSave(d.trim(), cents)
        }}
      >
        <h2>Add another charge</h2>
        <label>
          Description
          <input autoFocus value={d} placeholder="e.g. Blade sharpening, pickup & delivery" onChange={(e) => setD(e.target.value)} />
        </label>
        <label>
          Price
          <input value={p} placeholder="0.00" onChange={(e) => setP(e.target.value)} />
        </label>
        <div className="row gap end">
          <button type="button" onClick={props.onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!d.trim() || isNaN(cents)}>
            Add
          </button>
        </div>
      </form>
    </div>
  )
}

/** Estimate fee status for the ticket header */
function FeeBar({ wo, onCollect }: { wo: WorkOrder; onCollect: () => void }) {
  const fee = money(wo.feeCents)
  switch (wo.feeStatus) {
    case 'none':
      return null
    case 'unpaid':
      return wo.status === 'closed' ? (
        <div className="fee-bar">Estimate fee {fee} was never paid.</div>
      ) : (
        <div className="fee-bar unpaid">
          <span>
            <b>Estimate fee {fee} not paid yet.</b> It's credited toward the repair or a new purchase, or kept if the customer
            declines.
          </span>
          <button className="primary" onClick={onCollect}>
            Collect {fee} at till
          </button>
        </div>
      )
    case 'paid':
      return (
        <div className="fee-bar paid">
          Estimate fee {fee} paid{wo.feeSaleId ? ` (receipt #${wo.feeSaleId})` : ''}. It will be credited at pick-up or toward a new
          purchase.
        </div>
      )
    case 'applied':
      return (
        <div className="fee-bar">
          Estimate fee {fee} credited{wo.feeAppliedSaleId ? ` on receipt #${wo.feeAppliedSaleId}` : ''}.
          {wo.saleId ? ` Paid on receipt #${wo.saleId}.` : ''}
        </div>
      )
    case 'kept':
      return <div className="fee-bar">Estimate fee {fee} kept (not repaired).</div>
  }
}
