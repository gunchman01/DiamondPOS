import {api as kioskClient} from '../src/renderer/src/api'
import assert from 'node:assert/strict'
import path from 'node:path'
import vm from 'node:vm'
import {openDatabase} from '../src/main/server/db'
import {createApp} from '../src/main/server'
import {getCustomer} from '../src/main/server/customers'
import {kioskPageHtml} from '../src/main/server/kioskPage'
export async function testKioskVerification(check:(n:string,f:()=>void)=>void,dir:string){
 const file=path.join(dir,'kiosk-verification.db'),db=openDatabase(file)
 const app=createApp(db,{dbFile:file,apiKey:'kiosk-test',port:0,appVersion:'test'}),server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r))
 const base=`http://127.0.0.1:${(server.address() as any).port}`
 const call=async(url:string,body?:unknown,staff=false)=>{const response=await fetch(base+url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(staff?{'X-Api-Key':'kiosk-test'}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json() as any}}
 const kiosk=Number(db.prepare("INSERT INTO kiosks(name,till_name,token) VALUES ('Review kiosk','Review till','review-token')").run().lastInsertRowid)
 db.prepare("INSERT INTO kiosks(name,till_name,token) VALUES ('Other kiosk','Other till','other-token')").run()
 const id=Number(db.prepare("INSERT INTO customers(first_name,last_name,company,phone,mobile,email,street,street2,city,region,postcode,notes,past_due_cents,on_account_enabled,ok_to_email,tax_exempt_id) VALUES ('Before','Customer','Company','9185551111','9185552222','before@example.com','Street','Suite 1','Claremore','OK','74019','Private staff note',12345,1,1,'PRIVATE-TAX')").run().lastInsertRowid)
 const abort=new AbortController(),stream=await fetch(base+'/kiosk/api/events?review=2&token=review-token',{signal:abort.signal}),reader=stream.body!.getReader();await reader.read()
 const start=async(customerId=id)=>{const r=await call('/api/kiosk-sessions/verify',{tillName:'Review till',customerId},true);assert.equal(r.status,201);assert.equal(r.data.verificationCustomerId,customerId);return r.data.id as string}
 const form=(sessionId:string,token='review-token')=>call(`/kiosk/api/session?token=${token}&sessionId=${sessionId}`)
 try{
  check('kiosk inline JavaScript parses and contains explicit accept/update controls',()=>{new vm.Script(kioskPageHtml.match(/<script>([\s\S]*?)<\/script>/)![1]);assert.ok(kioskPageHtml.includes('Accept details'));assert.ok(kioskPageHtml.includes('Save updated details'))})
  await testKioskClientCompatibility(check)
  await testKioskScript(check)
  const denied=await call('/api/kiosk-sessions',{tillName:'Review till',customerId:id})
  check('only a paired staff API request can send a customer to the kiosk',()=>assert.equal(denied.status,401))
  const noTarget=await call('/api/kiosk-sessions/verify',{tillName:'Review till'},true)
  check('dedicated validation route never silently creates a blank signup without a selected customer',()=>assert.equal(noTarget.status,400))
  const staleAbort=new AbortController(),staleStream=await fetch(base+'/kiosk/api/events?token=review-token',{signal:staleAbort.signal}),staleReader=staleStream.body!.getReader();await staleReader.read()
  try{
   const blocked=await call('/api/kiosk-sessions/verify',{tillName:'Review till',customerId:id},true)
   const legacyBlocked=await call('/api/kiosk-sessions',{tillName:'Review till',customerId:id},true)
   check('older open kiosk page prevents verification dispatch with a reload instruction instead of a blank signup',()=>{assert.equal(blocked.status,409);assert.match(blocked.data.error,/Reload the kiosk browser/);assert.equal(legacyBlocked.status,409)})
  }finally{staleAbort.abort();await staleReader.cancel().catch(()=>{});await new Promise<void>(r=>setTimeout(r,20))}
  const session=await start(),details=await form(session),wrong=await form(session,'other-token')
  check('verification form is scoped to its assigned paired kiosk and excludes financial, marketing and staff data while showing read-only exemption status',()=>{assert.equal(details.status,200);assert.equal(details.data.mode,'verify');assert.equal(details.data.contact.mobile,'9185552222');assert.equal(details.data.contact.street2,'Suite 1');assert.equal(wrong.status,409);assert.equal(details.data.taxExemption.taxExempt,false);const output=JSON.stringify(details.data);for(const secret of ['Private staff note','12345','okToEmail','accountEnabled'])assert.ok(!output.includes(secret))})
  const count=()=>Number((db.prepare('SELECT COUNT(*) AS n FROM customers').get() as any).n),beforeCount=count()
  const accepted=await call('/kiosk/api/submit',{token:'review-token',sessionId:session,confirm:true,customerId:999,firstName:'FORGED',pastDueCents:0,okToEmail:false})
  const completed=await call(`/api/kiosk-sessions/${session}`,undefined,true),repeat=await call('/kiosk/api/submit',{token:'review-token',sessionId:session,confirm:true}),afterForm=await form(session)
  check('accept keeps the same customer/contact and all staff fields, records verification and finishes the session once',()=>{assert.equal(accepted.status,200);assert.equal(completed.data.customer.id,id);assert.equal(completed.data.matchedExisting,true);assert.equal(repeat.status,409);assert.equal(afterForm.status,409);assert.equal(count(),beforeCount);const c=getCustomer(db,id)!;assert.equal(c.firstName,'Before');assert.equal(c.pastDueCents,12345);assert.equal(c.okToEmail,true);assert.equal(c.taxExemptId,'PRIVATE-TAX');assert.ok(c.notes?.includes('confirmed contact details'));assert.ok(c.notes?.includes('Private staff note'))})
  const next=await start(),contact=(await form(next)).data.contact
  const updated=await call('/kiosk/api/submit',{token:'review-token',sessionId:next,...contact,firstName:'After',mobile:'9185553333',street:'New Street',email:'after@example.com',pastDueCents:0,accountEnabled:false,taxExemptId:'FORGED',notes:'FORGED',okToEmail:true})
  check('customer edits update the exact existing record; changing email does not grant marketing consent',()=>{assert.equal(updated.status,200);const c=getCustomer(db,id)!;assert.equal(c.firstName,'After');assert.equal(c.mobile,'9185553333');assert.equal(c.street,'New Street');assert.equal(c.street2,'Suite 1');assert.equal(c.pastDueCents,12345);assert.equal(c.accountEnabled,true);assert.equal(c.taxExemptId,'PRIVATE-TAX');assert.equal(c.okToEmail,false);assert.ok(c.notes?.includes('Private staff note'));assert.ok(!c.notes?.includes('FORGED'));assert.equal(count(),beforeCount)})
  const stale=await start();db.prepare("UPDATE customers SET phone='9185554444' WHERE id=?").run(id)
  const conflict=await call('/kiosk/api/submit',{token:'review-token',sessionId:stale,confirm:true})
  check('concurrent staff contact edits prevent a stale kiosk confirmation or overwrite',()=>{assert.equal(conflict.status,409);assert.match(conflict.data.error,/Staff changed/);assert.equal(getCustomer(db,id)?.phone,'9185554444')})
  const invalid=await call('/api/kiosk-sessions',{tillName:'Review till',customerId:999999},true)
  check('invalid target does not replace an existing session',()=>assert.equal(invalid.status,404))
  const replacement=await start(),oldAccess=await form(stale)
  await call(`/api/kiosk-sessions/${replacement}/cancel`,{},true)
  const cancelled=await call('/kiosk/api/submit',{token:'review-token',sessionId:replacement,confirm:true})
  check('replaced and cancelled sessions cannot expose or update customer details',()=>{assert.equal(oldAccess.status,409);assert.equal(cancelled.status,409)})
  db.prepare("UPDATE customers SET tax_exempt=1,tax_exempt_id='STAFF-TAX',tax_exempt_expires='2099-01-01' WHERE id=?").run(id)
  const taxSession=await start(),taxForm=(await form(taxSession)).data
  const forgedTax=await call('/kiosk/api/submit',{token:'review-token',sessionId:taxSession,...taxForm.contact,taxExempt:false,taxExemptId:'FORGED',taxExemptExpires:'2000-01-01',taxExemptCardCopied:true})
  check('exemption details are displayed for verification but forged customer changes cannot modify staff tax fields',()=>{assert.equal(taxForm.taxExemption.taxExempt,true);assert.equal(taxForm.taxExemption.taxExemptId,'STAFF-TAX');assert.equal(taxForm.taxExemption.taxExemptExpires,'2099-01-01');assert.equal(forgedTax.status,200);const c=getCustomer(db,id)!;assert.equal(c.taxExempt,true);assert.equal(c.taxExemptId,'STAFF-TAX');assert.equal(c.taxExemptExpires,'2099-01-01');assert.equal(c.taxExemptCardCopied,false)})
  const changedTax=await start();db.prepare("UPDATE customers SET tax_exempt_id='STAFF-UPDATED' WHERE id=?").run(id)
  const taxConflict=await call('/kiosk/api/submit',{token:'review-token',sessionId:changedTax,confirm:true})
  check('cashier exemption changes during review require a fresh validation session',()=>{assert.equal(taxConflict.status,409);assert.match(taxConflict.data.error,/cashier changed/);assert.equal(getCustomer(db,id)?.taxExemptId,'STAFF-UPDATED')})
  const bad=await start(),badContact=(await form(bad)).data.contact
  const badEmail=await call('/kiosk/api/submit',{token:'review-token',sessionId:bad,...badContact,email:'not-email'})
  check('contact validation failures preserve the customer and allow correction in the current session',()=>{assert.equal(badEmail.status,400);assert.equal(getCustomer(db,id)?.email,'after@example.com')})
  const legacy=Number(db.prepare("INSERT INTO customers(company) VALUES ('Company Only')").run().lastInsertRowid),legacySession=await start(legacy)
  const legacyAccepted=await call('/kiosk/api/submit',{token:'review-token',sessionId:legacySession,confirm:true})
  check('an existing customer can accept incomplete contact details without being forced through new-signup requirements',()=>{assert.equal(legacyAccepted.status,200);assert.equal(getCustomer(db,legacy)?.company,'Company Only')})
  const normal=await call('/api/kiosk-sessions',{tillName:'Review till'},true),normalForm=await form(normal.data.id)
  const missing=await call('/kiosk/api/submit',{token:'review-token',sessionId:normal.data.id})
  check('new-customer sessions remain blank signup forms with required validation',()=>{assert.deepEqual(normalForm.data,{mode:'signup'});assert.equal(missing.status,400)})
  const beforeSignup=count()
  const fresh=await call('/kiosk/api/submit',{token:'review-token',sessionId:normal.data.id,firstName:'New Kiosk',lastName:'Customer',company:'',street:'123 New St',street2:'Suite 5',city:'Claremore',state:'OK',zip:'74019',phone:'9185559999',mobile:'9185558888',email:'new-kiosk@example.com',okToEmail:false,taxExempt:false})
  const signed=await call(`/api/kiosk-sessions/${normal.data.id}`,undefined,true),replayedSignup=await call('/kiosk/api/submit',{token:'review-token',sessionId:normal.data.id})
  check('blank kiosk signup creates one customer on submission and returns it to the initiating sale/work-order/customer flow',()=>{assert.equal(fresh.status,200);assert.equal(signed.data.status,'submitted');assert.equal(signed.data.matchedExisting,false);assert.equal(signed.data.customer.firstName,'New Kiosk');assert.equal(signed.data.customer.street2,'Suite 5');assert.equal(signed.data.customer.mobile,'9185558888');assert.equal(count(),beforeSignup+1);assert.equal(replayedSignup.status,409)})
  const cancelledSignup=await call('/api/kiosk-sessions',{tillName:'Review till'},true)
  await call('/kiosk/api/cancel',{token:'review-token',sessionId:cancelledSignup.data.id})
  check('cancelling a blank kiosk signup never creates a partial customer',()=>assert.equal(count(),beforeSignup+1))
  const finalSession=await start();await call(`/api/kiosks/${kiosk}/remove`,{},true)
  const removed=await form(finalSession)
  check('unpairing revokes access to the contact form immediately',()=>assert.equal(removed.status,401))
 }finally{abort.abort();await reader.cancel().catch(()=>{});await new Promise<void>(r=>server.close(()=>r()));db.close()}
}

async function testKioskScript(check:(n:string,f:()=>void)=>void){
 const elements=new Map<string,any>(),timers=new Map<number,{fn:()=>void;ms:number}>();let timerId=0,events:any;const posts:any[]=[]
 const node=(id:string)=>{if(!elements.has(id))elements.set(id,{value:'',hidden:true,checked:false,disabled:false,readOnly:false,style:{},listeners:{},addEventListener(event:string,fn:any){this.listeners[event]=fn},blur(){},focus(){}});return elements.get(id)}
 const contact={firstName:'Kiosk',lastName:'Customer',company:'',phone:'9185551111',mobile:'9185552222',email:'test@example.com',street:'Test Street',street2:'Suite 2',city:'Claremore',region:'OK',postcode:'74019'}
 const context={document:{getElementById:node,addEventListener(){},activeElement:null,title:''},localStorage:{getItem(){return 'test-token'},setItem(){},removeItem(){}},EventSource:function(this:any){events=this;this.close=()=>{}},fetch:async(url:string,options:any)=>{const body=options.body?JSON.parse(options.body):null;if(body)posts.push({url,body});return {ok:true,status:200,json:async()=>url.startsWith('/kiosk/api/info')?{storeName:'Test',hasLogo:false}:url.startsWith('/kiosk/api/session')?{mode:'verify',contact,taxExemption:{taxExempt:true,taxExemptId:'READ-ONLY-ID',taxExemptExpires:'2099-01-01'}}: {firstName:'Kiosk',taxExempt:false}}},setTimeout:(fn:()=>void,ms:number)=>{timers.set(++timerId,{fn,ms});return timerId},clearTimeout:(id:number)=>timers.delete(id),Date,JSON,encodeURIComponent}
 vm.runInNewContext(kioskPageHtml.match(/<script>([\s\S]*?)<\/script>/)![1],context)
 const flush=async()=>{await new Promise<void>(r=>setImmediate(r));await new Promise<void>(r=>setImmediate(r))};await flush()
 events.onmessage({data:JSON.stringify({type:'form',sessionId:'accept-session'})});await flush()
 check('kiosk script loads a read-only scoped contact form with accept/update and hidden marketing/tax controls',()=>{assert.equal(node('firstName').value,'Kiosk');assert.equal(node('mobile').value,'9185552222');assert.equal(node('firstName').readOnly,true);assert.equal(node('confirmBtn').hidden,false);assert.equal(node('submitBtn').hidden,true);assert.equal(node('marketingChoice').hidden,true);assert.equal(node('taxBox').hidden,true);assert.equal(node('verificationTax').hidden,false);assert.equal(node('verificationTaxStatus').textContent,'Tax exempt: Yes');assert.equal(node('verificationTaxId').textContent,'Exemption ID: READ-ONLY-ID');assert.ok(kioskPageHtml.includes('Only the cashier can change'))})
 node('confirmBtn').listeners.click();await flush()
 check('accept action submits explicit confirmation and clears contact values afterwards',()=>{assert.equal(posts.at(-1).body.confirm,true);assert.equal(posts.at(-1).body.sessionId,'accept-session');assert.equal(node('firstName').value,'');assert.equal(node('verificationTaxId').textContent,'')})
 events.onmessage({data:JSON.stringify({type:'form',sessionId:'edit-session'})});await flush();node('editBtn').listeners.click();node('street').value='Changed Street';node('signup').listeners.submit({preventDefault(){}});await flush()
 check('edit action sends all contact fields with state/ZIP aliases and clears after success',()=>{assert.equal(node('firstName').readOnly,false);assert.equal(posts.at(-1).body.street,'Changed Street');assert.equal(posts.at(-1).body.street2,'Suite 2');assert.equal(posts.at(-1).body.region,'OK');assert.equal(posts.at(-1).body.postcode,'74019');assert.equal(node('street').value,'')})
 events.onmessage({data:JSON.stringify({type:'form',sessionId:'timeout-session'})});await flush();const deadline=[...timers.values()].find(t=>t.ms===300000)!;assert.ok(deadline);deadline.fn();await flush()
 check('local kiosk timeout clears private contact details even without receiving a server event',()=>{assert.equal(node('firstName').value,'');assert.equal(node('form').hidden,true);assert.equal(posts.at(-1).url,'/kiosk/api/cancel')})
}

async function testKioskClientCompatibility(check:(n:string,f:()=>void)=>void){
 const original=globalThis.fetch;let supports=false;const calls:{url:string;body:any}[]=[]
 globalThis.fetch=async(url,options)=>{const path=String(url);calls.push({url:path,body:options?.body?JSON.parse(String(options.body)):null});return new Response(JSON.stringify(path.endsWith('/api/health')?{kioskVerification:supports}:{id:'test-session',verificationCustomerId:42}),{status:200})}
 try{
  await assert.rejects(kioskClient.startKioskSession('Customer till',42),/Update the Store Server/)
  check('customer validation against an older server stops before posting any blank signup request',()=>{assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith('/api/health'))})
  supports=true;calls.length=0;const result=await kioskClient.startKioskSession('Customer till',42)
  check('customer-page and sale validation client sends selected ID on the explicit verify route',()=>{assert.equal(result.verificationCustomerId,42);assert.ok(calls[1].url.endsWith('/api/kiosk-sessions/verify'));assert.equal(calls[1].body.customerId,42);assert.equal(calls[1].body.tillName,'Customer till')})
  calls.length=0;await kioskClient.startKioskSession('Customer till')
  check('new-customer signup client remains separate and never posts to verification',()=>{assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith('/api/kiosk-sessions'));assert.equal(calls[0].body.customerId,undefined)})
 }finally{globalThis.fetch=original}
}
