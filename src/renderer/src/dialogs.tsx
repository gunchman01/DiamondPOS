import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createDialogQueue } from './dialogQueue'
const queue=createDialogQueue()
export const confirmAction=(message:string)=>queue.ask(message)
export function ApplicationDialogs(){
 const current=useSyncExternalStore(queue.subscribe,queue.snapshot),dialog=useRef<HTMLDialogElement>(null),cancelButton=useRef<HTMLButtonElement>(null),previousFocus=useRef<HTMLElement|null>(null)
 const [closing,setClosing]=useState(false)
 useEffect(()=>{const cancel=()=>queue.cancelAll();window.addEventListener('beforeunload',cancel);const stop=window.pos?.onClosing?.(()=>{queue.cancelAll();setClosing(true)});return()=>{window.removeEventListener('beforeunload',cancel);stop?.()}},[])
 useEffect(()=>{const el=dialog.current;if(!el)return;if(current){if(!el.open){previousFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;el.showModal()}cancelButton.current?.focus()}else{if(el.open)el.close();if(previousFocus.current?.isConnected)previousFocus.current.focus({preventScroll:true});previousFocus.current=null}},[current?.id])
 return <>{closing&&<div className="modal-backdrop app-shutdown" role="status"><div className="modal"><h2>Closing Diamond POS…</h2><p>Stopping background connections and cleaning up. Please wait.</p></div></div>}<dialog className="app-confirmation" ref={dialog} aria-labelledby="app-confirm-title" onCancel={e=>{e.preventDefault();if(current)queue.answer(current.id,false)}} onKeyDown={e=>e.stopPropagation()}><h2 id="app-confirm-title">Please confirm</h2><p style={{whiteSpace:'pre-wrap'}}>{current?.message}</p><div className="row gap end"><button ref={cancelButton} type="button" onClick={()=>current&&queue.answer(current.id,false)}>Cancel</button><button className="primary" type="button" onClick={()=>current&&queue.answer(current.id,true)}>Continue</button></div></dialog></>
}
