import {useEffect,useState} from 'react'
import {TRANSACTION_KINDS,type TransactionHistoryPage,type TransactionHistoryRow,type AccountPaymentDetail} from '../../../shared/transactionHistory'
import {PAYMENT_LABEL,CARD_BRANDS} from '../../../shared/types'
import {api} from '../api'
import {dateTime,money} from '../format'
import SaleDialog from './SaleDialog'
const methods=(value:string)=>value.split(',').filter(Boolean).map(m=>PAYMENT_LABEL[m as keyof typeof PAYMENT_LABEL]??m).join(' + ')||'—'
export default function SalesHistory(){
 const [search,setSearch]=useState(''),[kind,setKind]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[page,setPage]=useState(1)
 const [data,setData]=useState<TransactionHistoryPage|null>(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[selected,setSelected]=useState<TransactionHistoryRow|null>(null)
 useEffect(()=>{let live=true;setData(null);setError('');const timer=setTimeout(()=>{
  api.transactionHistory(new URLSearchParams({search,kind,from,to,page:String(page)}).toString()).then(d=>{if(live)setData(d)}).catch(e=>{if(live)setError(e.message)})
 },150);return()=>{live=false;clearTimeout(timer)}},[search,kind,from,to,page,refresh])
 function close(){setSelected(null);setRefresh(v=>v+1)}
 return <div className="page wide sales-history"><div className="row between"><h2>Sales History</h2><button onClick={()=>setRefresh(v=>v+1)}>Refresh</button></div>
  <p className="muted small">All recorded sales, voids, work-order checkouts, refunds, exchanges, on-account sales and payments on account. Click a row to open the receipt or payment. Voids show their original amounts; account payments are separate from sales.</p>
  <div className="row gap history-filters"><label>Search<input value={search} placeholder="Receipt/payment number, customer, till, WO or reference" onChange={e=>{setSearch(e.target.value);setPage(1)}}/></label>
  <label>Type<select value={kind} onChange={e=>{setKind(e.target.value);setPage(1)}}><option value="">All transactions</option>{Object.entries(TRANSACTION_KINDS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
  <label>From<input type="date" value={from} onChange={e=>{setFrom(e.target.value);setPage(1)}}/></label><label>Through<input type="date" value={to} onChange={e=>{setTo(e.target.value);setPage(1)}}/></label>
  <button onClick={()=>{setSearch('');setKind('');setFrom('');setTo('');setPage(1)}}>Clear filters</button></div>
  {error&&<div className="error-text" role="alert">{error}</div>}{!data&&!error&&<p>Loading transactions…</p>}
  {data&&<><p className="small muted">{data.total} matching transaction(s) · newest first · all dates unless filtered</p><div className="grid-wrap"><table className="grid sales-history-table"><colgroup><col style={{width:"6%"}}/><col style={{width:"16%"}}/><col style={{width:"14%"}}/><col style={{width:"17%"}}/><col style={{width:"9%"}}/><col style={{width:"8%"}}/><col style={{width:"8%"}}/><col style={{width:"10%"}}/><col style={{width:"12%"}}/></colgroup><thead><tr><th>Receipt / payment</th><th>Date &amp; time</th><th>Type</th><th>Customer</th><th>Work order</th><th>Payment</th><th className="num">Amount</th><th>Status</th><th>Till</th></tr></thead><tbody>
   {data.rows.map(r=><tr key={`${r.source}:${r.id}`} className="sales-history-row" tabIndex={0} onClick={()=>setSelected(r)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(r)}}} aria-label={`Open ${r.source==='sale'?'receipt':'account payment'} ${r.id}`}>
    <td><button className="link" onClick={e=>{e.stopPropagation();setSelected(r)}}>{r.source==='sale'?`#${r.id}`:`AP #${r.id}`}</button></td><td>{dateTime(r.createdAt)}</td><td>{TRANSACTION_KINDS[r.kind]}</td><td title={r.customerName}>{r.customerName}</td><td>{r.workOrderId?`WO-${String(r.workOrderId).padStart(6,'0')}`:'—'}</td><td>{methods(r.methods)}</td><td className="num">{money(r.totalCents)}</td><td>{r.source==='sale'?(r.status==='void'?'VOID':r.status):`QB: ${r.status}`}</td><td title={r.tillName}>{r.tillName}</td>
   </tr>)}
  </tbody></table></div>{!data.rows.length&&<p>No matching transactions.</p>}<div className="row between"><button disabled={page<=1} onClick={()=>setPage(v=>v-1)}>Previous</button><span>Page {page} of {Math.max(1,Math.ceil(data.total/data.pageSize))}</span><button disabled={page*data.pageSize>=data.total} onClick={()=>setPage(v=>v+1)}>Next</button></div></>}
  {selected?.source==='sale'&&<SaleDialog saleId={selected.id} onClose={close}/>}{selected?.source==='account_payment'&&<AccountPaymentDialog id={selected.id} onClose={close}/>}
 </div>
}
function AccountPaymentDialog({id,onClose}:{id:number;onClose:()=>void}){
 const [payment,setPayment]=useState<AccountPaymentDetail|null>(null),[error,setError]=useState(''),[saleId,setSaleId]=useState<number|null>(null)
 useEffect(()=>{let live=true;api.accountPaymentDetail(id).then(p=>{if(live)setPayment(p)}).catch(e=>{if(live)setError(e.message)});return()=>{live=false}},[id])
 return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="modal sale-dlg" role="dialog" aria-modal="true" aria-label={`Account payment ${id}`} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose()}}}>
  <h2>Payment on account · AP #{id}</h2>{error&&<div className="error-text">{error}</div>}{!payment&&!error&&<p>Loading payment…</p>}{payment&&<><p><b>{payment.customerName}</b> · {dateTime(payment.createdAt)}</p><h3>{money(payment.amountCents)} received</h3><p>{methods(payment.method)}{payment.cardBrand?` · ${CARD_BRANDS[payment.cardBrand as keyof typeof CARD_BRANDS]??payment.cardBrand}`:''}{payment.reference?` · Reference: ${payment.reference}`:''}</p><p>Till: {payment.tillName} · Recorded by: {payment.by}</p><p>QuickBooks: {payment.status}</p>{payment.error&&<div className="error-text">{payment.error}</div>}<p className="muted">This payment reduces existing customer-account invoices. It is a separate payment record, not another sale.</p><h3>Applied to invoices</h3><table className="grid"><thead><tr><th>Receipt / QB invoice</th><th className="num">Payment applied</th></tr></thead><tbody>{payment.allocations.map(a=><tr key={a.saleId}><td><button className="link" onClick={()=>setSaleId(a.saleId)}>Receipt #{a.saleId}</button> · {a.refNumber}</td><td className="num">{money(a.amountCents)}</td></tr>)}</tbody></table>{!payment.allocations.length&&<p>No invoice allocations recorded.</p>}</>}
  <div className="row end"><button autoFocus className="primary" onClick={onClose}>Close</button></div>
 </div>{saleId!==null&&<SaleDialog saleId={saleId} onClose={()=>setSaleId(null)}/>}</div>
}
