import { useEffect,useState,useRef } from 'react'
import { api } from './api'
import { dateTime } from './format'
export interface EstimateResponse {id:string;workOrderId:number;number:string;customer:string;decision:string;review:boolean;receivedAt:string}
export default function EstimateResponseNotice({onOpenWorkOrder}:{onOpenWorkOrder:(id:number)=>void}){
 const acknowledged=useRef(new Set<string>())
 const [unread,setUnread]=useState<EstimateResponse[]>([]),[opened,setOpened]=useState<EstimateResponse[]|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{let live=true;const load=()=>api.estimateResponses().then(rows=>{if(live)setUnread(rows.filter(row=>!acknowledged.current.has(row.id)))}).catch(()=>{});void load();const timer=setInterval(()=>void load(),15000);return()=>{live=false;clearInterval(timer)}},[])
 async function open(){if(busy)return;const rows=[...unread];setOpened(rows);setBusy(true);setError('');try{await api.markEstimateResponsesRead(rows.map(r=>r.id));for(const row of rows)acknowledged.current.add(row.id);setUnread(current=>current.filter(r=>!rows.some(seen=>seen.id===r.id)))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <>{unread.length>0&&<button className="estimate-response-alert" disabled={busy} onClick={()=>void open()}>New estimate response{unread.length===1?'':`s (${unread.length})`}</button>}
 {opened&&<div className="modal-backdrop"><section className="modal estimate-response-list" role="dialog" aria-modal="true" aria-labelledby="estimate-response-title" onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape')setOpened(null)}}><h2 id="estimate-response-title">Estimate responses</h2>{error&&<p className="error-text">Could not acknowledge these responses: {error}. The header notice will remain available.</p>}{opened.map(row=><div className="card" key={row.id}><div className="row between"><b>{row.number} · {row.customer}</b><button onClick={()=>{setOpened(null);onOpenWorkOrder(row.workOrderId)}}>Open work order</button></div><p>{row.decision==='approved'?'Approved':'Declined'}{row.review?' · Staff review required':''} · {dateTime(row.receivedAt)}</p></div>)}<button onClick={()=>setOpened(null)}>Close</button></section></div>}
 </>
}
