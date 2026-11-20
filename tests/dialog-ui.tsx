import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ApplicationDialogs, confirmAction } from '../src/renderer/src/dialogs'
import '../src/renderer/src/styles.css'
let closing=()=>{}
;(window as any).pos={onClosing:(cb:()=>void)=>{closing=cb;return()=>{closing=()=>{}}}}
function Harness(){const [value,setValue]=useState('');return <><label>Typing fixture<input id="fixture-input" value={value} onChange={e=>setValue(e.target.value)}/></label><p id="fixture-value">{value}</p><ApplicationDialogs/></>}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Harness/></React.StrictMode>)
const tick=()=>new Promise(r=>setTimeout(r,10))
const requireTrue=(value:unknown,message:string)=>{if(!value)throw Error(message)}
async function test(){
 await tick();const input=document.getElementById('fixture-input') as HTMLInputElement,setValue=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!
 for(let i=0;i<20;i++){
  input.focus();const answer=confirmAction('Keyboard fixture '+i);await tick()
  const dialog=document.querySelector('dialog')!;requireTrue(dialog.open,'Confirmation must be visibly open');requireTrue(dialog.contains(document.activeElement),'Focus must be inside confirmation')
  if(i%2)dialog.querySelectorAll('button')[1].click();else dialog.dispatchEvent(new Event('cancel',{cancelable:true}))
  requireTrue(await answer===Boolean(i%2),'Confirmation result must match selected action');await tick()
  requireTrue(!dialog.open,'Confirmation must close');input.focus();requireTrue(document.activeElement===input,'Input focus must return')
  setValue.call(input,'Typed after confirmation '+i);input.dispatchEvent(new Event('input',{bubbles:true}));await tick()
  requireTrue(document.getElementById('fixture-value')!.textContent==='Typed after confirmation '+i,'Controlled input must update after each prompt')
 }
 const pending=confirmAction('Shutdown cancellation fixture');await tick();closing();requireTrue(await pending===false,'Closing must cancel a pending confirmation');await tick();requireTrue(!document.querySelector('dialog')!.open,'Closing must not leave an invisible open dialog')
 document.getElementById('test-results')!.textContent='PASS 20 real browser confirmation/focus/controlled-input cycles plus shutdown cancellation';document.getElementById('test-results')!.setAttribute('data-status','passed')
}
void test().catch(e=>{document.getElementById('test-results')!.textContent='FAIL '+e.message;document.getElementById('test-results')!.setAttribute('data-status','failed')})
