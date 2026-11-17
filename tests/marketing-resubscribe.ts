import assert from 'node:assert/strict'
import path from 'node:path'
import nodemailer from 'nodemailer'
import { openDatabase } from '../src/main/server/db'
import { readSettings, createApp } from '../src/main/server'
import { insertCustomer, CUSTOMER_DEFAULTS, getCustomer, updateCustomer } from '../src/main/server/customers'
import { saveSmtp } from '../src/main/server/marketing/mailer'
import { saveConsentConfig, syncMarketingConsent, suppressMarketing, isMarketingSuppressed } from '../src/main/server/marketing/consent'
import { processSubscriptionRequests, subscriptionStatus } from '../src/main/server/marketing/subscriptions'
type Check=(name:string,fn:()=>void)=>void
export async function testResubscribe(check:Check,dir:string){
 const db=openDatabase(path.join(dir,'marketing-resubscribe.db')),original=nodemailer.createTransport,originalFetch=globalThis.fetch
 try{
 const url='https://marketing.example.test/index.php',email='rejoin@example.com',requestId='a'.repeat(64),token='b'.repeat(64)
 saveConsentConfig(db,{enabled:true,url,apiKey:'c'.repeat(64)})
 saveSmtp(db,{host:'smtp.test.invalid',security:'none',fromEmail:'shop@example.com'})
 const id=insertCustomer(db,{...CUSTOMER_DEFAULTS,firstName:'Rejoin',email,okToEmail:true}),dup=insertCustomer(db,{...CUSTOMER_DEFAULTS,firstName:'Duplicate',email:email.toUpperCase(),okToEmail:true})
 suppressMarketing(db,email)
 let sent=0,prepared=0,ackFails=true,requests:any[]=[{id:requestId,email,requestedAt:'2026-11-17T12:00:00Z'}],events:any[]=[],onPull:(()=>void)|undefined
 const mail:any[]=[]
 nodemailer.createTransport=(()=>({sendMail:async(m:any)=>{sent++;mail.push(m);return {messageId:'test-only'}}})) as any
 const fetcher:typeof fetch=async(input,init)=>{const action=new URL(String(input)).searchParams.get('action'),body=JSON.parse(String(init?.body));
  if(action==='capabilities')return Response.json({ok:true,consentVersion:2})
  if(action==='pull'){onPull?.();onPull=undefined;return Response.json({ok:true,consentVersion:2,events:events.filter(e=>e.id>body.cursor),hasMore:false})}
  if(action==='ack'||action==='suppress')return Response.json({ok:true})
  if(action==='subscriptionRequests')return Response.json({ok:true,requests})
  if(action==='prepareSubscription'){prepared++;return Response.json({ok:true,ready:true,email,confirmationUrl:url+'?action=confirmSubscription&token='+token,expiresAt:'2026-11-18T12:00:00Z'})}
  if(action==='subscriptionSent'){if(ackFails)throw Error('ACK offline');requests=[];return Response.json({ok:true})}
  if(action==='subscriptionIgnored'){requests=[];return Response.json({ok:true})}
  throw Error('Unexpected request '+action)
 }
 db.prepare("INSERT INTO marketing_consent_outbox(email,intent) VALUES(?,'restore')").run(email)
 const calls:string[]=[]
 await assert.rejects(syncMarketingConsent(db,async(input)=>{calls.push(new URL(String(input)).searchParams.get('action')!);return Response.json({ok:true,consentVersion:1})}),/Update the cPanel/)
 check('an outdated website service cannot receive restored suppression writes or erase newer consent',()=>{assert.deepEqual(calls,['capabilities']);assert.equal((db.prepare('SELECT COUNT(*) n FROM marketing_consent_outbox').get() as any).n,1)})
 db.prepare('DELETE FROM marketing_consent_outbox').run()
 await assert.rejects(processSubscriptionRequests(db,readSettings(db),fetcher),/ACK offline/)
 check('suppressed customer can receive a requested confirmation without receiving marketing or regaining permission',()=>{assert.equal(sent,1);assert.equal(getCustomer(db,id)!.okToEmail,false);assert.equal(isMarketingSuppressed(db,email),true);assert.ok(mail[0].text.includes('?action=confirmSubscription&token='));assert.ok(!mail[0].html.includes('?action=open'));assert.ok(!mail[0].headers?.['List-Unsubscribe'])})
 ackFails=false;await processSubscriptionRequests(db,readSettings(db),fetcher)
 check('confirmation SMTP success is saved before ACK so retry does not send a duplicate email',()=>{assert.equal(sent,1);assert.equal(prepared,1);assert.equal((subscriptionStatus(db).recent[0] as any).status,'sent')})
 updateCustomer(db,id,{...getCustomer(db,id)!,okToEmail:true})
 check('requesting or sending confirmation does not let a checkbox override the suppression',()=>assert.equal(getCustomer(db,id)!.okToEmail,false))
 events=[{id:1,email,kind:'subscribed',requestId,at:'2026-11-17T12:05:00Z'}]
 await syncMarketingConsent(db,fetcher);await syncMarketingConsent(db,fetcher)
 check('confirmed website event restores both duplicate permissions, removes suppression and retains one consent evidence record',()=>{assert.equal(isMarketingSuppressed(db,email),false);assert.equal(getCustomer(db,id)!.okToEmail,true);assert.equal(getCustomer(db,dup)!.okToEmail,true);assert.equal((subscriptionStatus(db).recent[0] as any).status,'confirmed');assert.equal(subscriptionStatus(db).confirmations.length,1)})
 // A local opt-out arriving while a website pull is in flight wins until published.
 suppressMarketing(db,email,'website');events.push({id:2,email,kind:'subscribed',requestId:'d'.repeat(64),at:'2026-11-17T12:06:00Z'})
 onPull=()=>suppressMarketing(db,email,'pos',new Date().toISOString(),true)
 await syncMarketingConsent(db,fetcher)
 check('new local opt-out during synchronization cannot be undone by an arriving confirmation',()=>{assert.equal(getCustomer(db,id)!.okToEmail,false);assert.equal(isMarketingSuppressed(db,email),true);assert.ok(db.prepare("SELECT 1 FROM marketing_consent_outbox WHERE email=? AND intent='optout'").get(email))})
 // A malformed confirmation batch must not partially restore anyone.
 db.prepare('DELETE FROM marketing_consent_outbox').run()
 events.push({id:3,email,kind:'subscribed',requestId:'e'.repeat(64),at:'2026-11-17T12:07:00Z'},{id:3,email,kind:'unknown',at:'2026-11-17T12:08:00Z'})
 await assert.rejects(syncMarketingConsent(db,fetcher),/sequence/)
 check('malformed consent batches roll back fresh permission and confirmation evidence atomically',()=>{assert.equal(getCustomer(db,id)!.okToEmail,false);assert.equal(subscriptionStatus(db).confirmations.length,2)})
 requests=[{id:'f'.repeat(64),email:'unknown@example.com',requestedAt:'2026-11-17T12:10:00Z'}];events=events.slice(0,2)
 await processSubscriptionRequests(db,readSettings(db),fetcher)
 check('public requests for unknown addresses neither send emails nor create customer records',()=>{assert.equal(sent,1);assert.equal((db.prepare('SELECT COUNT(*) n FROM customers').get() as any).n,2);assert.equal(requests.length,0)})
 const app=createApp(db,{dbFile:path.join(dir,'marketing-resubscribe.db'),apiKey:'resub-tests',port:0,appVersion:'0.3.46'}),server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r))
 try{const base=`http://127.0.0.1:${(server.address() as any).port}`;const denied=await originalFetch(base+'/api/marketing/subscriptions'),allowed=await originalFetch(base+'/api/marketing/subscriptions',{headers:{'X-Api-Key':'resub-tests'}})
 check('subscription audit requires store pairing and exposes worker status and fresh-consent evidence',()=>{assert.equal(denied.status,401);assert.equal(allowed.status,200)})
  db.prepare('UPDATE customers SET ok_to_email=1 WHERE id=?').run(id);db.prepare('DELETE FROM marketing_suppressions WHERE email=?').run(email)
  const stale=await originalFetch(base+`/api/customers/${id}`,{method:'PUT',headers:{'X-Api-Key':'resub-tests','Content-Type':'application/json'},body:JSON.stringify({...getCustomer(db,id)!,firstName:'Edited later',okToEmail:false,preserveEmailConsent:true})})
  check('saving unrelated fields from a stale customer window preserves a fresh confirmed permission',()=>{assert.equal(stale.status,200);assert.equal(getCustomer(db,id)!.okToEmail,true);assert.equal(isMarketingSuppressed(db,email),false)})

 }finally{await new Promise<void>(r=>server.close(()=>r()))}
 }finally{nodemailer.createTransport=original;globalThis.fetch=originalFetch;db.close()}
}
