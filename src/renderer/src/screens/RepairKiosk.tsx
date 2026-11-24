import {useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import type {KioskSession} from '../../../shared/types'
import {api} from '../api'
export default function RepairKiosk({id,tillName,onClose}:{id:number;tillName:string;onClose:()=>void}){
 const [session,setSession]=useState<KioskSession|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0)
 const current=useRef<KioskSession|null>(null)
 useEffect(()=>{let live=true;let timer:ReturnType<typeof setTimeout>;setError('');setSession(null)
  const poll=(s:KioskSession)=>{timer=setTimeout(async()=>{try{const next=await api.getKioskSession(s.id);if(!live)return;current.current=next;setSession(next);if(next.status==='waiting')poll(next)}catch(e){if(live)setError((e as Error).message)}},1000)}
  api.startRepairIntake(id,tillName).then(s=>{if(!live){void api.cancelKioskSession(s.id).catch(()=>{});return}if(s.repairWorkOrderId!==id){void api.cancelKioskSession(s.id).catch(()=>{});throw Error('Update the Store Server before sending repair questions.')}current.current=s;setSession(s);poll(s)}).catch(e=>{if(live)setError(e.message)})
  return()=>{live=false;clearTimeout(timer);if(current.current?.status==='waiting')void api.cancelKioskSession(current.current.id).catch(()=>{})}
 },[id,tillName,attempt])
 return createPortal(<div className="modal-backdrop unit-editor-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-label="Customer repair questions" onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape')onClose()}}><h2>Repair intake · WO-{String(id).padStart(6,'0')}</h2><p>This work order is already checked in. Closing this window keeps the ticket.</p>{error?<p className="error-text">{error}</p>:<p>{session?.status==='submitted'?'Customer answers saved. Review them on the work order.':session?.status==='cancelled'||session?.status==='expired'?'The questionnaire was cancelled or timed out. No answers were saved.':`Waiting for the customer on ${session?.kioskName??'the kiosk'}…`}</p>}<div className="row gap"><button type="button" autoFocus onClick={onClose}>{session?.status==='submitted'?'Review answers':'Close'}</button>{(error||['cancelled','expired'].includes(session?.status??''))&&<button type="button" onClick={()=>setAttempt(v=>v+1)}>Send again</button>}</div></div></div>,document.body)
}
