import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { PrintJob, PrinterInfo } from '../../shared/printing'
import { createPrinterQueue } from './printerQueue'
const queue=createPrinterQueue()
/** One explicit installed printer per job/batch. Cancel never reaches the print bridge. */
export async function choosePrinter(title:string,preferred:string):Promise<string>{
 const chosen=await queue.ask(title,preferred)
 if(chosen===null)throw Error('Printing cancelled; nothing was sent to the printer')
 return chosen
}
export async function printWithChoice(job:PrintJob,title:string):Promise<void>{
 const printer=await choosePrinter(title,job.printer)
 await window.pos.print({...job,printer})
}
export function PrinterPrompt(){
 const current=useSyncExternalStore(queue.subscribe,queue.snapshot),dialog=useRef<HTMLDialogElement>(null),previous=useRef<HTMLElement|null>(null)
 const [printers,setPrinters]=useState<PrinterInfo[]>([]),[selected,setSelected]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false),[refresh,setRefresh]=useState(0)
 useEffect(()=>{const cancel=()=>queue.cancelAll();window.addEventListener('beforeunload',cancel);const stop=window.pos?.onClosing?.(cancel);return()=>{window.removeEventListener('beforeunload',cancel);stop?.()}},[])
 useEffect(()=>{
  const el=dialog.current;if(!el)return
  if(current){if(!el.open){previous.current=document.activeElement instanceof HTMLElement?document.activeElement:null;el.showModal()}}
  else{if(el.open)el.close();if(previous.current?.isConnected)previous.current.focus({preventScroll:true});previous.current=null}
 },[current?.id])
 useEffect(()=>{
  if(!current)return
  let live=true;setLoading(true);setError('');setPrinters([]);setSelected('')
  window.pos.listPrinters().then(list=>{if(!live)return;setPrinters(list);setSelected(list.some(p=>p.name===current.preferred)?current.preferred:'');if(!list.length)setError('No printers were found on this computer. Check the Windows printer installation.')}).catch(e=>{if(live)setError(`Could not load printers: ${(e as Error).message}`)}).finally(()=>{if(live)setLoading(false)})
  return()=>{live=false}
 },[current?.id,refresh])
 const cancel=()=>{if(current)queue.answer(current.id,null)}
 return <dialog ref={dialog} className="app-confirmation" aria-labelledby="printer-prompt-title" onCancel={e=>{e.preventDefault();cancel()}} onKeyDown={e=>e.stopPropagation()}>
  <h2 id="printer-prompt-title">{current?.title??'Choose printer'}</h2>
  <p>The saved printer is selected when available. Changing it here applies only to this print job. Set defaults under Settings → Printing.</p>
  {current?.preferred&&!loading&&!printers.some(p=>p.name===current.preferred)&&<p className="error-text">Saved printer “{current.preferred}” was not found. Choose another printer.</p>}
  {error&&<p className="error-text" role="alert">{error}</p>}
  <label>Printer <select aria-label="Printer for this job" disabled={loading} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">{loading?'Loading printers…':'Choose a printer'}</option>{printers.map(p=><option key={p.name} value={p.name}>{p.displayName}{p.isDefault?' (Windows default)':''}</option>)}</select></label>
  <div className="row gap end"><button onClick={cancel}>Cancel</button><button disabled={loading} onClick={()=>setRefresh(n=>n+1)}>Refresh printers</button><button className="primary" disabled={loading||!printers.some(p=>p.name===selected)} onClick={()=>current&&queue.answer(current.id,selected,printers)}>Print</button></div>
 </dialog>
}
