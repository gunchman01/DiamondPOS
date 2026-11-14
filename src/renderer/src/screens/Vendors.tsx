import { useEffect, useState } from 'react'
import type { Vendor } from '../../../shared/vendors'
import { api } from '../api'
import VendorEditor from './VendorEditor'
export default function Vendors({onReceiving}:{onReceiving:(id:number)=>void}) {
  const [rows,setRows]=useState<Vendor[]>([]),[search,setSearch]=useState(''),[inactive,setInactive]=useState(false)
  const [editing,setEditing]=useState<number|'new'|null>(null),[refresh,setRefresh]=useState(0),[error,setError]=useState('')
  useEffect(()=>{let live=true;const timer=setTimeout(()=>{api.vendors(search,inactive).then((v)=>{if(live){setRows(v);setError('')}}).catch((e)=>{if(live)setError(e.message)})},150);return()=>{live=false;clearTimeout(timer)}},[search,inactive,refresh])
  return <div className="page wide"><div className="row between"><h2>Vendor List</h2><button className="primary" onClick={()=>setEditing('new')}>+ Add vendor</button></div>
    <div className="row gap"><input aria-label="Search vendors" placeholder="Search company, contact, phone or account #…" value={search} onChange={(e)=>setSearch(e.target.value)}/><label className="check"><input type="checkbox" checked={inactive} onChange={(e)=>setInactive(e.target.checked)}/>Include inactive</label></div>
    {error&&<div className="error-text">{error}</div>}<table className="table"><thead><tr><th>Company</th><th>Contact</th><th>Phone</th><th>Email</th><th>Account #</th><th>Terms</th><th>Status</th><th/></tr></thead><tbody>{rows.map((v)=><tr key={v.id}><td><b>{v.companyName}</b></td><td>{[v.title,v.firstName,v.lastName].filter(Boolean).join(' ')}</td><td>{v.phone||v.mobile}</td><td>{v.email}</td><td>{v.accountNumber}</td><td>Net {v.netDays}{v.discountPercent>0?` · ${v.discountPercent}% / ${v.discountDays} days`:''}</td><td>{v.active?'Active':'Inactive'}</td><td><button onClick={()=>setEditing(v.id)}>Edit</button></td></tr>)}</tbody></table>
    {!rows.length&&!error&&<p className="muted">No vendors match. Add a vendor to get started.</p>}
    {editing!==null&&<VendorEditor vendorId={editing==='new'?null:editing} onClose={()=>setEditing(null)} onSaved={()=>setRefresh((n)=>n+1)} onReceiving={onReceiving}/>}
  </div>
}
