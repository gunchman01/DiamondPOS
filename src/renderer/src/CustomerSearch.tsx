import { useEffect,useId,useState } from 'react'
import { customerDisplayName,type Customer } from '../../shared/types'
import { api } from './api'
export default function CustomerSearch({value,onChange,onPick,onFind}:{value:string;onChange:(value:string)=>void;onPick:(customer:Customer)=>void;onFind:()=>void}){
 const id=useId(),[rows,setRows]=useState<Customer[]>([]),[focused,setFocused]=useState(false),[index,setIndex]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState('')
 const visible=focused&&value.trim().length>=2
 useEffect(()=>{
  if(!visible){setRows([]);setLoading(false);return}
  let live=true;setRows([]);setLoading(true);setError('')
  const timer=setTimeout(()=>{api.listCustomers(value,false,true).then(result=>{if(live){setRows(result);setIndex(0)}}).catch(e=>{if(live)setError(e.message)}).finally(()=>{if(live)setLoading(false)})},150)
  return()=>{live=false;clearTimeout(timer)}
 },[value,visible])
 function pick(customer:Customer){setFocused(false);setRows([]);onPick(customer)}
 return <form className="sale-customer-search" onSubmit={e=>{e.preventDefault();if(visible&&rows[index])pick(rows[index]);else onFind()}} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setFocused(false)}}>
  <input aria-label="Customer name or phone" role="combobox" aria-autocomplete="list" aria-expanded={visible} aria-controls={id} aria-activedescendant={visible&&rows[index]?`${id}-${index}`:undefined} autoComplete="off" placeholder="Enter customer name or phone" value={value} onFocus={()=>setFocused(true)} onChange={e=>{onChange(e.target.value);setRows([]);setIndex(0);setFocused(true)}} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();setFocused(true);setIndex(i=>Math.min(i+1,Math.max(0,rows.length-1)))}else if(e.key==='ArrowUp'){e.preventDefault();setIndex(i=>Math.max(0,i-1))}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setFocused(false)}}}/>
  <button type="button" title="Find or add customer (F5)" onClick={onFind}>Find ▾</button>
  {visible&&<div className="customer-suggestions" id={id} role="listbox" aria-label="Matching customers">{loading?<p role="status">Looking up customers…</p>:error?<p role="alert">Could not load names. Use Find to retry. {error}</p>:!rows.length?<p>No matching names. Use Find to search more broadly or add a customer.</p>:<>{rows.map((customer,i)=><button type="button" role="option" aria-selected={i===index} id={`${id}-${i}`} tabIndex={-1} className={i===index?'active':''} key={customer.id} onMouseEnter={()=>setIndex(i)} onMouseDown={e=>e.preventDefault()} onClick={()=>pick(customer)}><b>{customerDisplayName(customer)}</b><span>{[customer.customerNo,customer.mobile||customer.phone,customer.email].filter(Boolean).join(' · ')}</span></button>)}<p className="customer-search-hint">↑ ↓ to choose · Enter to select · Esc to close{rows.length===500?' · First 500 matches — type more to narrow':''}</p></>}</div>}
 </form>
}
