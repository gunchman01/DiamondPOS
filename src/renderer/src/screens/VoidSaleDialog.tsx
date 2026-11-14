import { money } from '../format'
import { useEffect,useState } from 'react'
import type { VoidReview } from '../../../shared/voids'
import { api } from '../api'
export default function VoidSaleDialog({id,onClose,onDone}:{id:number;onClose:()=>void;onDone:()=>void}){
  const [review,setReview]=useState<VoidReview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [reason,setReason]=useState(''),[by,setBy]=useState(''),[note,setNote]=useState(''),[payment,setPayment]=useState(false),[legacy,setLegacy]=useState(false),[till,setTill]=useState('')
  useEffect(()=>{let live=true;Promise.all([api.voidReview(id),window.pos.getBootInfo()]).then(([r,b])=>{if(live){setReview(r);setTill(b.config.tillName)}}).catch(e=>{if(live)setError(e.message)});return()=>{live=false}},[id])
  async function submit(){if(busy)return;setBusy(true);setError('');try{await api.voidSale(id,{reason,by,till,paymentNote:note,paymentConfirmed:payment,legacyStockConfirmed:legacy});onDone()}catch(e){setError((e as Error).message);setBusy(false)}}
  return <div className="modal-backdrop void-backdrop"><form className="modal sale-dlg" role="dialog" aria-modal="true" aria-label="Void sale" onSubmit={e=>{e.preventDefault();void submit()}} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();if(!busy)onClose()}}}><h2>Void receipt #{id}</h2>{error&&<div className="error-text" role="alert">{error}</div>}{!review?<p>Loading receipt checks…</p>:!review.allowed?<p className="error-text">{review.blockedReason}</p>:<>
    <p><b>Original sale: {money(review.totalCents)}</b></p><p>This keeps the original receipt and payment details, excludes it from sales totals, restores the stock below, and removes its sold equipment from the customer’s active units.</p><p>{review.qbAction}</p>
    <label>Reason<input required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label><label>Voided by<input required maxLength={100} value={by} onChange={e=>setBy(e.target.value)}/></label>
    <div className="report-table"><table className="table"><thead><tr><th>Item</th><th>Quantity returned to stock</th></tr></thead><tbody>{review.stock.map((s,i)=><tr key={i}><td>{s.name}</td><td>{s.qty}</td></tr>)}</tbody></table>{!review.stock.length&&<p>No stock movement to reverse.</p>}</div>
    {review.legacyStock&&<label className="check"><input required type="checkbox" checked={legacy} onChange={e=>setLegacy(e.target.checked)}/>This older receipt predates stock snapshots. I checked the quantities above, based on current item types.</label>}
    <label>Payment handling note<input required maxLength={500} value={note} placeholder="E.g. terminal payment voided / cash returned" onChange={e=>setNote(e.target.value)}/></label><label className="check"><input required type="checkbox" checked={payment} onChange={e=>setPayment(e.target.checked)}/>I have cancelled or returned the actual payment separately. This does not operate the card terminal.</label>
  </>}<div className="row gap end"><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="danger" disabled={busy||!review?.allowed}>{busy?'Voiding…':'Void sale permanently'}</button></div></form></div>
}
