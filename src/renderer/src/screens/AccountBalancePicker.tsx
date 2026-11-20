import { useEffect, useState } from 'react'
import type { AccountBalanceCustomer } from '../../../shared/accounts'
import { customerDisplayName, type Customer } from '../../../shared/types'
import { api } from '../api'
import { money } from '../format'
export default function AccountBalancePicker({onPick,onCancel}:{onPick:(customer:Customer)=>void;onCancel:()=>void}){
 const [search,setSearch]=useState(''),[rows,setRows]=useState<AccountBalanceCustomer[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[refresh,setRefresh]=useState(0)
 useEffect(()=>{
  let live=true;setLoading(true);setError('')
  const timer=setTimeout(()=>{api.accountBalances(search).then(result=>{if(live)setRows(result)}).catch(e=>{if(live){setRows([]);setError(e.message)}}).finally(()=>{if(live)setLoading(false)})},150)
  return()=>{live=false;clearTimeout(timer)}
 },[search,refresh])
 return <div className="modal-backdrop"><div className="modal account-balance-picker" role="dialog" aria-modal="true" aria-labelledby="account-balance-title" onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape')onCancel()}}>
  <div className="row between"><h2 id="account-balance-title">Take payment on account</h2><button onClick={onCancel}>Cancel</button></div>
  <p className="muted small">Choose a customer with an outstanding DiamondPOS account balance. Back-office-only invoices are not included. The payment is separate from the current sale.</p>
  <div className="row gap"><input autoFocus aria-label="Search customers with account balances" placeholder="Customer name, company, phone or customer number" value={search} onChange={e=>setSearch(e.target.value)}/><button disabled={loading} onClick={()=>setRefresh(n=>n+1)}>Refresh</button></div>
  {error&&<p className="error-text" role="alert">{error}</p>}
  {loading?<p role="status">Loading account balances…</p>:!error&&<>
   <p className="muted small">{rows.length} customer{rows.length===1?'':'s'} with a balance</p>
   <div className="account-balance-list"><table className="table"><thead><tr><th>Customer</th><th>Phone</th><th>Open invoices</th><th className="r">Balance</th><th/></tr></thead><tbody>
    {rows.map(row=><tr key={row.customer.id}><td><b>{customerDisplayName(row.customer)}</b><div className="muted small">{row.customer.customerNo}{!row.customer.active?' · Inactive':''}</div></td><td>{row.customer.mobile||row.customer.phone||'—'}</td><td>{row.invoiceCount}</td><td className="r"><b>{money(row.balanceCents)}</b></td><td><button onClick={()=>onPick(row.customer)}>Take payment</button></td></tr>)}
   </tbody></table>{!rows.length&&<p>No customers with an outstanding balance match this search.</p>}</div>
  </>}
 </div></div>
}
