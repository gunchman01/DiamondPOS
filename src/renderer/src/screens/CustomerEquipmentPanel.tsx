import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CustomerEquipment } from '../../../shared/customerEquipment'
import type { WorkOrder } from '../../../shared/workorders'
import { stage, unitLabel } from '../../../shared/workorders'
import { api } from '../api'
import { dateTime, money } from '../format'
export default function CustomerEquipmentPanel({customerId,onSale}:{customerId:number;onSale:(id:number)=>void}) {
 const [equipment,setEquipment]=useState<CustomerEquipment[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0),[view,setView]=useState<number|null>(null)
 useEffect(()=>{let closed=false;setLoading(true);setEquipment([]);setError('');api.customerEquipment(customerId).then(rows=>{if(!closed)setEquipment(rows)}).catch(e=>{if(!closed)setError(e.message)}).finally(()=>{if(!closed)setLoading(false)});return()=>{closed=true}},[customerId,refresh])
 return <fieldset className="id-panel customer-equipment"><legend>Customer Equipment</legend><div className="row between"><span className="small muted">{equipment.length} linked unit{equipment.length===1?'':'s'}</span><button type="button" disabled={loading} onClick={()=>setRefresh(n=>n+1)}>Refresh equipment</button></div>
 {error&&<p className="error-text" role="alert">{error}</p>}{loading?<p className="muted small">Loading equipment…</p>:<div className="customer-equipment-list">
 {equipment.map(({unit:u,workOrders:orders})=><details key={u.id} className={u.active?'equipment-card':'equipment-card muted'}><summary><b>{unitLabel(u)||'Unit'}</b>{!u.active&&<span className="pill">Inactive</span>}<span className="small">Serial: {u.serial||'Not recorded'} · {orders.length} work order{orders.length===1?'':'s'}</span></summary>
 <dl><dt>Unit type</dt><dd>{u.unitType||u.category}</dd><dt>Brand</dt><dd>{u.brand||'Not recorded'}</dd><dt>Model</dt><dd>{u.model||'Not recorded'}</dd><dt>Serial number</dt><dd>{u.serial||'Not recorded'}</dd>{u.hours!==null&&<><dt>Hours</dt><dd>{u.hours}</dd></>}<dt>Purchase</dt><dd>{u.purchasedHere?'Purchased at Diamond P':'Purchase not recorded at Diamond P'}{u.purchaseDate?' · '+u.purchaseDate:''} {u.saleId&&<button type="button" onClick={()=>onSale(u.saleId!)}>Receipt #{u.saleId}</button>}</dd>{u.notes&&<><dt>Unit notes</dt><dd className="pre-line">{u.notes}</dd></>}</dl>
 <h4>Work-order history</h4>{orders.length?orders.map(w=><button type="button" className="equipment-history" key={w.id} onClick={()=>setView(w.id)}><b>{w.number}</b> · {stage(w.status).label}<span>{dateTime(w.createdAt)}</span><span>{w.problem||'No problem description'}</span></button>):<p className="small muted">No work orders recorded for this unit.</p>}
 </details>)}{!equipment.length&&!error&&<p className="muted small">No equipment linked yet. Units added during work-order check-in and serialized units sold to this customer appear here automatically.</p>}
 </div>}
 <p className="small muted">Includes units brought in for service, whether or not purchased here. Uses existing records; viewing does not add another unit.</p>
 {view!==null&&<EquipmentTicketView id={view} customerId={customerId} onClose={()=>{setView(null);setRefresh(n=>n+1)}} onSale={onSale}/>}
 </fieldset>
}
function EquipmentTicketView({id,customerId,onClose,onSale}:{id:number;customerId:number;onClose:()=>void;onSale:(id:number)=>void}){
 const [wo,setWo]=useState<WorkOrder|null>(null),[error,setError]=useState('')
 useEffect(()=>{let closed=false;api.wo(id).then(w=>{if(w.customerId!==customerId)throw new Error('This ticket belongs to another customer');if(!closed)setWo(w)}).catch(e=>{if(!closed)setError(e.message)});return()=>{closed=true}},[id,customerId])
 return createPortal(<div className="modal-backdrop equipment-ticket-backdrop"><div className="modal equipment-ticket" role="dialog" aria-modal="true" aria-label="Equipment service history" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose()}}}>
 <div className="row between"><h2>{wo?.number??'Work order'}</h2><button type="button" autoFocus onClick={onClose}>Close</button></div>{error&&<p className="error-text">{error}</p>}{!wo&&!error&&<p>Loading service details…</p>}{wo&&<><p><b>{unitLabel(wo.unit)}</b> · Serial {wo.unit.serial||'Not recorded'}</p><p>{stage(wo.status).label} · Checked in {dateTime(wo.createdAt)}</p><p className="small muted">Read-only history. Make changes or take payment from Work Orders.</p>{([['Reported problem',wo.problem],['Diagnosis',wo.diagnosis],['Work done',wo.workDone],['Internal notes',wo.internalNotes]] as [string,string][]).map(([label,value])=><section key={label}><h4>{label}</h4><p className="pre-line">{value||'Not recorded'}</p></section>)}
 <h4>Parts and charges</h4><table className="table"><thead><tr><th>Description</th><th>Qty</th><th>Amount before tax</th></tr></thead><tbody>{wo.lines.map(l=><tr key={l.id}><td>{l.description}</td><td>{l.qty}</td><td>{money(Math.round(l.unitPriceCents*l.qty))}</td></tr>)}</tbody></table>
 <h4>History</h4>{wo.history.map((h,i)=><p key={i}><b>{dateTime(h.at)}</b> · {h.by}<br/>{h.note}</p>)}
 </>}
 </div></div>,document.body)
}
