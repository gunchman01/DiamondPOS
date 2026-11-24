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
 const abort=new AbortController(),stream=await fetch(base+'/kiosk/api/events?token=review-token',{signal:abort.signal}),reader=stream.body!.getReader();await reader.read()
 const start=async(customerId=id)=>{const r=await call('/api/kiosk-sessions',{tillName:'Review till',customerId},true);assert.equal(r.status,201);return r.data.id as string}
 const form=(sessionId:string,token='review-token')=>call(`/kiosk/api/session?token=${token}&sessionId=${sessionId}`)
 try{
  check('kiosk inline JavaScript parses and contains explicit accept/update controls',()=>{new vm.Script(kioskPageHtml.match(/<script>([\s\S]*?)<\/script>/)![1]);assert.ok(kioskPageHtml.includes('Accept details'));assert.ok(kioskPageHtml.includes('Save updated details'))})
  await testKioskScript(check)
  const denied=await call('/api/kiosk-sessions',{tillName:'Review till',customerId:id})
  check('only a paired staff API request can send a customer to the kiosk',()=>assert.equal(denied.status,401))
  const session=await start(),details=await form(session),wrong=await form(session,'other-token')
  check('verification form is scoped to its assigned paired kiosk and excludes financial, marketing and staff data',()=>{assert.equal(details.status,200);assert.equal(details.data.mode,'verify');assert.equal(details.data.contact.mobile,'9185552222');assert.equal(details.data.contact.street2,'Suite 1');assert.equal(wrong.status,409);const output=JSON.stringify(details.data);for(const secret of ['PRIVATE-TAX','Private staff note','12345','okToEmail','accountEnabled'])assert.ok(!output.includes(secret))})
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
  const bad=await start(),badContact=(await form(bad)).data.contact
  const badEmail=await call('/kiosk/api/submit',{token:'review-token',sessionId:bad,...badContact,email:'not-email'})
  check('contact validation failures preserve the customer and allow correction in the current session',()=>{assert.equal(badEmail.status,400);assert.equal(getCustomer(db,id)?.email,'after@example.com')})
  const legacy=Number(db.prepare("INSERT INTO customers(company) VALUES ('Company Only')").run().lastInsertRowid),legacySession=await start(legacy)
  const legacyAccepted=await call('/kiosk/api/submit',{token:'review-token',sessionId:legacySession,confirm:true})
  check('an existing customer can accept incomplete contact details without being forced through new-signup requirements',()=>{assert.equal(legacyAccepted.status,200);assert.equal(getCustomer(db,legacy)?.company,'Company Only')})
  const normal=await call('/api/kiosk-sessions',{tillName:'Review till'},true),normalForm=await form(normal.data.id)
  const missing=await call('/kiosk/api/submit',{token:'review-token',sessionId:normal.data.id})
  check('new-customer sessions remain blank signup forms with required validation',()=>{assert.deepEqual(normalForm.data,{mode:'signup'});assert.equal(missing.status,400)})
  const finalSession=await start();await call(`/api/kiosks/${kiosk}/remove`,{},true)
  const removed=await form(finalSession)
  check('unpairing revokes access to the contact form immediately',()=>assert.equal(removed.status,401))
 }finally{abort.abort();await reader.cancel().catch(()=>{});await new Promise<void>(r=>server.close(()=>r()));db.close()}
}

async function testKioskScript(check:(n:string,f:()=>void)=>void){
 const elements=new Map<string,any>(),timers=new Map<number,{fn:()=>void;ms:number}>();let timerId=0,events:any;const posts:any[]=[]
 const node=(id:string)=>{if(!elements.has(id))elements.set(id,{value:'',hidden:true,checked:false,disabled:false,readOnly:false,style:{},listeners:{},addEventListener(event:string,fn:any){this.listeners[event]=fn},blur(){},focus(){}});return elements.get(id)}
 const contact={firstName:'Kiosk',lastName:'Customer',company:'',phone:'9185551111',mobile:'9185552222',email:'test@example.com',street:'Test Street',street2:'Suite 2',city:'Claremore',region:'OK',postcode:'74019'}
 const context={document:{getElementById:node,addEventListener(){},activeElement:null,title:''},localStorage:{getItem(){return 'test-token'},setItem(){},removeItem(){}},EventSource:function(this:any){events=this;this.close=()=>{}},fetch:async(url:string,options:any)=>{const body=options.body?JSON.parse(options.body):null;if(body)posts.push({url,body});return {ok:true,status:200,json:async()=>url.startsWith('/kiosk/api/info')?{storeName:'Test',hasLogo:false}:url.startsWith('/kiosk/api/session')?{mode:'verify',contact}: {firstName:'Kiosk',taxExempt:false}}},setTimeout:(fn:()=>void,ms:number)=>{timers.set(++timerId,{fn,ms});return timerId},clearTimeout:(id:number)=>timers.delete(id),Date,JSON,encodeURIComponent}
 vm.runInNewContext(kioskPageHtml.match(/<script>([\s\S]*?)<\/script>/)![1],context)
 const flush=async()=>{await new Promise<void>(r=>setImmediate(r));await new Promise<void>(r=>setImmediate(r))};await flush()
 events.onmessage({data:JSON.stringify({type:'form',sessionId:'accept-session'})});await flush()
 check('kiosk script loads a read-only scoped contact form with accept/update and hidden marketing/tax controls',()=>{assert.equal(node('firstName').value,'Kiosk');assert.equal(node('mobile').value,'9185552222');assert.equal(node('firstName').readOnly,true);assert.equal(node('confirmBtn').hidden,false);assert.equal(node('submitBtn').hidden,true);assert.equal(node('marketingChoice').hidden,true);assert.equal(node('taxBox').hidden,true)})
 node('confirmBtn').listeners.click();await flush()
 check('accept action submits explicit confirmation and clears contact values afterwards',()=>{assert.equal(posts.at(-1).body.confirm,true);assert.equal(posts.at(-1).body.sessionId,'accept-session');assert.equal(node('firstName').value,'')})
 events.onmessage({data:JSON.stringify({type:'form',sessionId:'edit-session'})});await flush();node('editBtn').listeners.click();node('street').value='Changed Street';node('signup').listeners.submit({preventDefault(){}});await flush()
 check('edit action sends all contact fields with state/ZIP aliases and clears after success',()=>{assert.equal(node('firstName').readOnly,false);assert.equal(posts.at(-1).body.street,'Changed Street');assert.equal(posts.at(-1).body.street2,'Suite 2');assert.equal(posts.at(-1).body.region,'OK');assert.equal(posts.at(-1).body.postcode,'74019');assert.equal(node('street').value,'')})
 events.onmessage({data:JSON.stringify({type:'form',sessionId:'timeout-session'})});await flush();const deadline=[...timers.values()].find(t=>t.ms===300000)!;assert.ok(deadline);deadline.fn();await flush()
 check('local kiosk timeout clears private contact details even without receiving a server event',()=>{assert.equal(node('firstName').value,'');assert.equal(node('form').hidden,true);assert.equal(posts.at(-1).url,'/kiosk/api/cancel')})
}
