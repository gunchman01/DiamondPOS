import { useEffect,useState } from 'react'
import type { SaleVoid } from '../../../shared/voids'
import { api } from '../api'
import { dateTime } from '../format'
export default function VoidQueue(){
  const [rows,setRows]=useState<SaleVoid[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const load=()=>api.qbVoids().then(v=>{setRows(v);setError('')}).catch(e=>setError(e.message))
  useEffect(()=>{void load();const timer=setInterval(load,15000);return()=>clearInterval(timer)},[])
  async function retry(id:number){setBusy(true);setError('');try{await api.retryVoid(id);await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  return <section className="card"><div className="row between"><h3>Voided receipts · QuickBooks corrections</h3><button onClick={()=>void load()}>Refresh</button></div><p className="muted small">Original receipts stay on file. Pending corrections run on the next Web Connector sync with sending enabled. Failed corrections remain visible until verified; they are never treated as reconciled automatically.</p>{error&&<p className="error-text">{error}</p>}<div className="report-table"><table className="table"><thead><tr><th>Receipt</th><th>Voided</th><th>By / reason</th><th>QuickBooks</th><th/></tr></thead><tbody>{rows.map(v=><tr key={v.saleId}><td>#{v.saleId}</td><td>{dateTime(v.at)}</td><td>{v.by} · {v.reason}</td><td>{v.qbStatus==='not_needed'?'Not exported':v.qbStatus==='confirmed'?'Void confirmed':v.qbStatus==='pending'?'Void pending':'Void failed'}{v.qbError&&<div className="error-text">{v.qbError}</div>}</td><td>{v.qbStatus==='error'&&<button disabled={busy} onClick={()=>void retry(v.saleId)}>Retry correction</button>}</td></tr>)}</tbody></table></div>{!rows.length&&<p className="muted">No voided receipts. Latest 500 shown here; use the Voided sales audit report for date filters.</p>}</section>
}
