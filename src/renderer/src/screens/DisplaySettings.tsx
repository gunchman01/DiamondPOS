import { useState } from 'react'
import type { BootInfo } from '../../../shared/types'
import { normaliseDisplayZoom } from '../../../shared/display'
export default function DisplaySettings({boot,onChange}:{boot:BootInfo;onChange:(boot:BootInfo)=>void}){
 const [choice,setChoice]=useState(String(normaliseDisplayZoom(boot.config.displayZoom))),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
 return <section className="card form"><h3>Display size for this computer</h3><p>Auto fit adjusts the entire POS to the usable window size, including Windows scaling. Maximize the window for the most workspace. It preserves the arrangement and never reduces the view below 85%; smaller windows use scrolling where needed.</p>
 <label>Display size<select value={choice} disabled={busy} onChange={e=>setChoice(e.target.value)}><option value="auto">Auto fit (recommended)</option>{[.8,.85,.9,.95,1,1.1,1.25].map(value=><option key={value} value={String(value)}>{Math.round(value*100)}%</option>)}</select></label>
 <p className="muted small">Choose a fixed percentage if you prefer larger text. This setting affects only the application on this computer. Receipt and label print sizes are unchanged.</p>
 {error&&<p className="error-text">{error}</p>}{message&&<p role="status">{message}</p>}
 <button disabled={busy} onClick={async()=>{setBusy(true);setError('');setMessage('');try{onChange(await window.pos.saveConfig({displayZoom:normaliseDisplayZoom(choice==='auto'?'auto':Number(choice))}));setMessage('Display size saved for this computer')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>Apply display size</button>
 </section>
}
