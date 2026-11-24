import NewWorkOrder from './NewWorkOrder'
import { confirmAction } from '../dialogs'
import { useEffect, useState } from 'react'
import { PriceCell } from '../saleColumns'
import type { Product } from '../../../shared/types'
import { STAGES, stage, stageStyle, DEFAULT_STAGE_COLORS, unitLabel, type WoLine, type WoSaleMode, type WoStatus, type WorkOrder } from '../../../shared/workorders'
import { api } from '../api'
import { printMechanicWorksheet, printWorkOrder, printWorkOrderLabel } from '../printing'
import { dateTime, money, parseMoney } from '../format'

const KIND_LABEL = { part: 'Part', labor: 'Labor', shop: 'Shop supplies', misc: 'Other', fee:'Estimate fee' } as const
const FLOW: WoStatus[] = ['needs_estimate', 'waiting_customer', 'approved', 'waiting_parts', 'on_bench', 'ready_review', 'ready_pickup', 'closed']

/** One repair ticket. */
export default function WorkOrderTicket(props: {
  id: number
  onOpenRelated: (id:number) => void
  by: string
  onBack: () => void
  onPayAtTill: (id: number, mode: WoSaleMode) => void
}) {
  const [mechanics,setMechanics]=useState<import('../../../shared/workorders').Mechanic[]>([])
  useEffect(()=>{api.woMechanics().then(setMechanics).catch(e=>setError(e.message))},[])
  const [addingRelated,setAddingRelated]=useState(false)
  const [linkId,setLinkId]=useState('')
  const [colors, setColors] = useState(DEFAULT_STAGE_COLORS)
  const [wo, setWo] = useState<WorkOrder | null>(null)
  const [notes, setNotes] = useState({ problem: '', diagnosis: '', workDone: '', internalNotes: '' })
  const [picking, setPicking] = useState(false)
  const [miscOpen, setMiscOpen] = useState(false)
  const [preview, setPreview] = useState<{ subject: string; html: string; textPreview?:string; estimate?: boolean } | null>(null)
  const [emailSelected,setEmailSelected]=useState(true)
  const [textSelected,setTextSelected]=useState(false)
  const [notificationId,setNotificationId]=useState(()=>crypto.randomUUID())
  useEffect(()=>{if(preview){setEmailSelected(!!wo?.customerEmail);setTextSelected(false);setNotificationId(crypto.randomUUID())}},[preview])
  const [callNote,setCallNote]=useState('')
  const [callDays,setCallDays]=useState(3)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    const loadColors = () => api.woSettings().then((s) => { if (live) setColors(s.stageColors ?? DEFAULT_STAGE_COLORS) }).catch(() => {})
    void loadColors()
    const timer = setInterval(() => void loadColors(), 30000)
    return () => { live = false; clearInterval(timer) }
  }, [])
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

  const notesDirty = !!wo && (notes.problem!==wo.problem||notes.diagnosis!==wo.diagnosis||notes.workDone!==wo.workDone||notes.internalNotes!==wo.internalNotes)
  useEffect(()=>{
    if(!wo||busy||preview||notesDirty||picking||miscOpen||addingRelated)return
    let live=true
    const timer=setInterval(()=>{
      if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName??''))return
      api.wo(props.id).then(fresh=>{if(live)show(fresh)}).catch(e=>{if(live)setError(e.message)})
    },30000)
    return()=>{live=false;clearInterval(timer)}
  },[props.id,busy,!!preview,notesDirty,picking,miscOpen,addingRelated,wo?.status])

  if (!wo) return <div className="page">{error || 'Loading…'}</div>

  const st = stage(wo.status, colors)
  const closed = wo.status === 'closed'
  const shortParts = wo.lines.filter((l) => l.short)
  const move = (to: WoStatus) =>
    run(async () => {
      if (notesDirty) await api.woUpdate(wo.id, notes)
      return api.woStatus(wo.id, to, props.by)
    }, `Moved to ${stage(to).label}`)

  const editLine = (l: WoLine, changes: Partial<WoLine>) => run(() => api.woUpdateLine(wo.id, l.id, changes))

  return (
    <div className="page wide ticket">
      {wo.estimate&&<section className="card form"><h3>Estimate revision {wo.estimate.revision} · {wo.estimate.state}</h3><p>Estimate amount: {money(wo.estimate.amountCents)}{wo.estimate.sentAt&&` · Sent ${dateTime(wo.estimate.sentAt)}`}</p>
        {wo.estimate.due&&<p className="error-text"><b>Needs customer call — this estimate is overdue for follow-up.</b></p>}
        {wo.estimate.needsResend&&<p className="error-text">This ticket differs from the last sent estimate. Send a revised estimate for an updated online decision, or confirm the current bill with the customer in person/by phone. Ready-for-pickup payment is still available.</p>}
        {wo.estimate.state==='review'&&<p className="error-text">A decision arrived for an estimate or stage that changed. Review it with the customer; the repair was not automatically approved.</p>}
        {['pending','prepared'].includes(wo.estimate.state)&&<button disabled={busy} onClick={async ()=>{if((await confirmAction('Cancel this estimate link? A revised estimate will need a new email.')))void run(()=>api.woCancelEstimate(wo.id,props.by),'Estimate link cancelled')}}>Cancel estimate link</button>}
        {wo.estimate.decisionAt&&<p>Decision by {wo.estimate.decisionBy} · {dateTime(wo.estimate.decisionAt)} · {wo.estimate.comment}</p>}
        {wo.status==='waiting_customer'&&wo.estimate.state==='pending'&&<><label>Call / contact note<input maxLength={500} value={callNote} onChange={e=>setCallNote(e.target.value)} placeholder="E.g. left voicemail asking customer to review estimate"/></label><label>Remind again in days<input type="number" min="1" max="90" value={callDays} onChange={e=>setCallDays(Number(e.target.value))}/></label><div className="row gap"><button disabled={busy||!callNote.trim()} onClick={()=>run(async()=>{const result=await api.woFollowUp(wo.id,callNote,callDays,props.by);setCallNote('');return result},'Call recorded and reminder updated')}>Record call &amp; remind again</button></div></>}
      </section>}
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
          <div className="ticket-no">{wo.number}</div>{wo.group&&<b>Work order {wo.group.position} of {wo.group.count}</b>}
          <span className="stage-badge big" style={stageStyle(wo.status, colors)}>
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
          <button disabled={busy} title="Print a blank mechanic estimate worksheet on Letter paper" onClick={()=>run(async()=>{await printMechanicWorksheet({...wo,problem:notes.problem});return undefined},'Estimate worksheet sent to the selected printer')}>Print estimate worksheet</button>
          <button
            disabled={busy}
            title="Print this work order on the full-page printer"
            onClick={() => run(() => printWorkOrder(wo).then(() => api.wo(wo.id)), 'Work order sent to the printer')}
          >
            🖨 Print
          </button>
          <button
            disabled={busy}
            title="Print the label for the unit (customer, work order #, date, barcode) on the label printer"
            onClick={() => run(() => printWorkOrderLabel(wo).then(() => api.wo(wo.id)), 'Work order label sent to the label printer')}
          >
            🏷 Label
          </button>
          {['needs_estimate','waiting_customer'].includes(wo.status)&&<button className="primary" disabled={busy} onClick={()=>run(async()=>{if(notesDirty)show(await api.woUpdate(wo.id,notes));setPreview({...await api.woEmailPreview(wo.id,true),estimate:true})})}>✉ {wo.estimate?'Send revised estimate':'Send estimate for decision'}</button>}
          {st.canEmail && (
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  if (notesDirty) show(await api.woUpdate(wo.id, notes))
                  setPreview({...await api.woEmailPreview(wo.id),estimate:wo.status==='waiting_customer'})
                })
              }
            >
              ✉ {wo.status==='ready_pickup'||wo.status==='waiting_customer'?'Notify':'Email'} customer: {st.label}
            </button>
          )}
          {wo.lastEmailedAt && (
            <span className="small muted">
              Last emailed {dateTime(wo.lastEmailedAt)} ({stage(wo.lastEmailedStatus ?? wo.status).label})
            </span>
          )}
        </div>
      </div>

      <div className="card row gap"><label>Assigned mechanic <select disabled={busy||closed} value={wo.mechanicId??''} onChange={e=>{const id=e.target.value?Number(e.target.value):null;void run(async()=>{if(notesDirty)await api.woUpdate(wo.id,notes);return api.woAssignMechanic(wo.id,id,props.by)},'Mechanic assigned')}}>
        <option value="">Unassigned</option>
        {mechanics.filter(m=>m.active||m.id===wo.mechanicId).map(m=><option key={m.id} value={m.id} disabled={!m.active}>{m.name}{!m.active?' (removed)':''}</option>)}
      </select></label></div>
      <section className="card form"><h3>Customer visit · {wo.group?`${wo.group.count} work orders`:'Single work order'}</h3>
        <p className="muted small">Group equipment brought in together. Each unit keeps its own estimate, status, mechanic and payment.</p>
        <div className="row gap"><button disabled={busy} onClick={()=>run(async()=>{if(notesDirty)show(await api.woUpdate(wo.id,notes));setAddingRelated(true)})}>+ Add another unit for this visit</button>
        <select aria-label="Work order to link" value={linkId} disabled={busy} onChange={e=>setLinkId(e.target.value)}><option value="">Choose an existing ticket for this customer</option>{wo.relatedOrders.filter(w=>w.id!==wo.id&&!w.linked).map(w=><option key={w.id} value={w.id}>{w.number} · {w.unitLabel} · {w.serial} · {stage(w.status).label}{w.group?` (group of ${w.group.count})`:''}</option>)}</select>
        <button disabled={busy||!linkId} onClick={()=>run(async()=>{const other=wo.relatedOrders.find(w=>w.id===Number(linkId));if(!await confirmAction(`Group ${wo.number} with ${other?.number}?${other?.group?' All tickets in that visit group will also be joined.':''}`))return;if(notesDirty)await api.woUpdate(wo.id,notes);const fresh=await api.woGroup(wo.id,Number(linkId),props.by);setLinkId('');return fresh},'Customer visit updated')}>Link existing ticket</button>
        {wo.group&&<button disabled={busy} onClick={()=>run(async()=>{if(!await confirmAction('Remove this ticket from the customer visit group? Its repair and charges will stay intact.'))return;if(notesDirty)await api.woUpdate(wo.id,notes);return api.woUngroup(wo.id,props.by)},'Ticket removed from group')}>Remove this ticket from group</button>}</div>
        {wo.group&&wo.relatedOrders.filter(w=>w.linked).map(w=><div key={w.id} className="row gap"><button disabled={busy||w.id===wo.id} onClick={()=>run(async()=>{if(notesDirty)await api.woUpdate(wo.id,notes);props.onOpenRelated(w.id)})}>{w.number} · {w.group?.position} of {w.group?.count}</button><span>{w.unitLabel} {w.serial&&`· S/N ${w.serial}`} · {stage(w.status).label}</span></div>)}
      </section>
      {addingRelated&&<NewWorkOrder initialCustomerId={wo.customerId} linkToId={wo.id} by={props.by} onCancel={()=>setAddingRelated(false)} onCreated={(created,collectFee)=>{setAddingRelated(false);if(collectFee)props.onPayAtTill(created.id,'fee');else props.onOpenRelated(created.id)}}/>}
      {/* ---------------- Stage flow ---------------- */}
      <div className="stage-flow">
        {FLOW.map((s) => (
          <span key={s} className={s === wo.status ? 'flow-step current' : 'flow-step'} style={s === wo.status ? stageStyle(s, colors) : undefined}>
            {stage(s).label}
          </span>
        ))}
        {wo.status === 'not_fixed' && wo.feeStatus!=='billed' && (
          <span className="flow-step current" style={stageStyle(wo.status, colors)}>
            {st.label}
          </span>
        )}
      </div>
      <div className="row gap stage-buttons">
        {(wo.status === 'ready_pickup'||(wo.status==='not_fixed'&&wo.feeStatus==='billed')) && (
          <button className="primary big-ish pay-btn" disabled={busy} onClick={() => props.onPayAtTill(wo.id, 'repair')}>
            💳 Ring up at till · {money(wo.balanceDueCents)} due
          </button>
        )}
        {wo.status === 'not_fixed' && wo.feeStatus === 'paid' && (
          <button className="primary big-ish" disabled={busy} onClick={() => props.onPayAtTill(wo.id, 'credit')}>
            Buying new instead → credit {money(wo.feeCents)} at till
          </button>
        )}
        {wo.status === 'not_fixed' && wo.feeStatus!=='billed' && (
          <button
            className="big-ish"
            disabled={busy}
            onClick={async () =>
              (await confirmAction(
                wo.feeStatus === 'paid'
                  ? `Customer is taking the unit back without the repair. Keep the ${money(wo.feeCents)} estimate fee and close the ticket?`
                  : 'Customer is taking the unit back without the repair. Close the ticket?'
              )) && run(() => api.woPickupNotFixed(wo.id, props.by), 'Picked up')
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
      <FeeBar wo={wo} busy={busy} onCollect={() => props.onPayAtTill(wo.id, 'fee')} onBill={()=>void run(async()=>{if(!await confirmAction(`Add the unpaid ${money(wo.feeCents)} estimate fee as a separate charge on this bill? It will be added to the repair total and will not be credited back.`))return;if(notesDirty)await api.woUpdate(wo.id,notes);return api.woBillEstimateFee(wo.id,props.by)},'Estimate fee added to bill')}/>
      {wo.status === 'needs_estimate' && (
        <div className="info-bar">Inventory parts are taken from stock as soon as they are added to this ticket. Removing them or declining the repair returns them to stock.</div>
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
            <h3>{['needs_estimate','waiting_customer'].includes(wo.status) ? 'Estimate' : 'Parts & labor'}</h3>
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
                    <PriceCell value={l.unitPriceCents} disabled={closed} onSave={(c) => editLine(l, { unitPriceCents: c })} />
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
                <span className="muted">Sales tax</span>
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
            <h2>Notify {wo.customerName}</h2>
            <div className="row gap"><label><input type="checkbox" checked={emailSelected} disabled={busy} onChange={e=>{setEmailSelected(e.target.checked);setNotificationId(crypto.randomUUID())}}/>Email</label>{(preview.estimate||wo.status==='ready_pickup')&&<label><input type="checkbox" checked={textSelected} disabled={busy} onChange={e=>{setTextSelected(e.target.checked);setNotificationId(crypto.randomUUID())}}/>Text</label>}</div>
            <p className="small">Replies to texts and emails are not monitored. Use the estimate link to approve or decline; call the store for questions.</p>
            {textSelected&&<><p>Text to: <b>{wo.customerPhone||'(no phone number)'}</b>. {preview.estimate?'Includes the estimate total and the same approval link as the email.':'Includes the unit, work-order number and balance due.'}</p></>}
            <div className="small">
              To: <b>{wo.customerEmail ?? '(no email address)'}</b>
              <br />
              Subject: <b>{preview.subject}</b>
            </div>
            {textSelected&&<pre style={{whiteSpace:'pre-wrap',maxHeight:220,overflow:'auto'}}>{preview.textPreview}</pre>}
            {emailSelected&&<div className="email-preview">
              <div
                className="email-body"
                dangerouslySetInnerHTML={{
                  __html: preview.html.slice(preview.html.indexOf('<body'), preview.html.lastIndexOf('</body>')).replace(/^<body[^>]*>/, '')
                }}
              />
            </div>}
            {error && <div className="error-text">{error}</div>}
            <div className="row gap end">
              <button onClick={() => setPreview(null)}>Cancel</button>
              <button
                className="primary"
                disabled={busy || (!emailSelected&&!textSelected) || (emailSelected&&!wo.customerEmail) || (textSelected&&!wo.customerPhone)}
                onClick={() =>
                  run(async () => {
                    const result = await api.woNotify(wo.id,{requestId:notificationId,by:props.by,estimate:!!preview.estimate,email:emailSelected,text:textSelected})
                    setPreview(null)
                    setMsg(Object.entries(result.results).map(([channel,r])=>`${channel}: ${r.status}. ${r.detail}`).join(' '))
                    return result.workOrder
                  })
                }
              >
                {preview.estimate?'Send estimate & start follow-up timer':'Send notification'}
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
function FeeBar({ wo, onCollect,onBill,busy }: { wo: WorkOrder; onCollect: () => void;onBill:()=>void;busy:boolean }) {
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
          <button className="primary" disabled={busy} onClick={onCollect}>
            Collect {fee} at till
          </button>
          <button disabled={busy} onClick={onBill}>Add estimate fee to bill</button>
        </div>
      )
    case 'billed_only':
    case 'billed':
      return <div className="fee-bar">Estimate fee {fee} is included as a separate bill item{wo.feeSaleId?` on receipt #${wo.feeSaleId}`:''}. It is not collected separately or credited. {wo.status==='not_fixed'&&'Only the estimate fee is charged when ringing up this declined repair.'}</div>
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
