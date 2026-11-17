import assert from 'node:assert/strict'
import path from 'node:path'
import nodemailer from 'nodemailer'
import { sendMailer, sendSmtpTest, saveSmtp, isServerProblem } from '../src/main/server/marketing/mailer'
import { readSettings } from '../src/main/server'
import { openDatabase } from '../src/main/server/db'
import { CUSTOMER_DEFAULTS, insertCustomer, getCustomer, updateCustomer, importCustomers } from '../src/main/server/customers'
import { consentView, saveConsentConfig, syncMarketingConsent, suppressMarketing, isMarketingSuppressed, prepareMarketingSend, exportMarketingSubscribers, MarketingSuppressed } from '../src/main/server/marketing/consent'
import { runAudience } from '../src/main/server/marketing/audience'
type Check=(name:string,fn:()=>void)=>void
export async function testMarketingConsent(check:Check,dir:string){
 const db=openDatabase(path.join(dir,'marketing-consent.db'))
 try{
 const add=(email:string,name=email)=>insertCustomer(db,{...CUSTOMER_DEFAULTS,firstName:name,email,okToEmail:true})
 const a=add(' Person@Example.com ','Original'),b=add('person@example.com','Duplicate')
 const config={enabled:true,url:'https://marketing.example.test/pos-marketing',apiKey:'a'.repeat(64)}
 saveConsentConfig(db,config)
 check('website settings require HTTPS, preserve keys, and never disclose saved secrets',()=>{assert.throws(()=>saveConsentConfig(db,{url:'http://example.com'}),/HTTPS/);assert.equal(consentView(db).url,config.url+'/index.php');assert.ok(!JSON.stringify(consentView(db)).includes(config.apiKey));assert.equal(saveConsentConfig(db,{apiKey:''}).hasKey,true)})
 const optOut={...getCustomer(db,a)!,okToEmail:false}
 const preview=importCustomers(db,[{customerNo:getCustomer(db,a)!.customerNo,okToEmail:false}],{dryRun:true,updateExisting:true})
 check('import preview rolls back local suppression and outbound opt-out events',()=>{assert.equal(preview.errors,0);assert.equal(getCustomer(db,a)!.okToEmail,true);assert.equal(consentView(db).suppressedCount,0);assert.equal(consentView(db).pendingCount,0)})
 const campaign=Number(db.prepare("INSERT INTO marketing_campaigns(name) VALUES('Consent test')").run().lastInsertRowid)
 db.prepare('INSERT INTO marketing_sends(campaign_id,customer_id,email) VALUES(?,?,?)').run(campaign,a,'person@example.com')
 updateCustomer(db,a,optOut)
 check('POS opt-out normalizes email and clears all duplicate customer permissions',()=>{assert.equal(getCustomer(db,a)!.okToEmail,false);assert.equal(getCustomer(db,b)!.okToEmail,false);assert.equal(consentView(db).pendingCount,1);assert.equal((db.prepare('SELECT status FROM marketing_sends WHERE campaign_id=?').get(campaign) as any).status,'skipped');assert.ok(isMarketingSuppressed(db,' PERSON@example.com '))})
 updateCustomer(db,a,{...getCustomer(db,a)!,okToEmail:true})
 const imported=importCustomers(db,[{customerNo:getCustomer(db,a)!.customerNo,okToEmail:true},{firstName:'Imported duplicate',email:'PERSON@example.com',okToEmail:true}],{dryRun:false,updateExisting:true})
 check('customer edits and new/existing spreadsheet imports cannot undo suppression',()=>{assert.equal(imported.errors,0);assert.equal(getCustomer(db,a)!.okToEmail,false);assert.equal((db.prepare("SELECT COUNT(*) n FROM customers WHERE lower(trim(email))='person@example.com' AND ok_to_email=1").get() as any).n,0)})
 let fail=true,pushed=0,ackFailed=true,acks:number[]=[],events=[{id:1,email:'remote@example.com',at:'2026-11-17T12:00:00Z'}]
 const remote=add('remote@example.com'),eligible=add('eligible@example.com')
 const fetcher:typeof fetch=async(input,init)=>{const action=new URL(String(input)).searchParams.get('action'),body=JSON.parse(String(init?.body));assert.equal((init?.headers as any)['X-DiamondPOS-Key'],config.apiKey);if(action==='suppress'){pushed++;if(fail)throw new Error('offline');return Response.json({ok:true})}if(action==='pull')return Response.json({ok:true,events:events.filter(e=>e.id>body.cursor),hasMore:false});if(action==='ack'){acks.push(body.cursor);if(ackFailed)throw new Error('ACK offline');return Response.json({ok:true})}if(action==='prepare')return Response.json({ok:true,suppressed:false,unsubscribeUrl:config.url+'/index.php?token='+'b'.repeat(64)});throw Error('Unexpected action')}
 await assert.rejects(syncMarketingConsent(db,fetcher),/offline/)
 check('failed outbound opt-out remains pending for retry',()=>assert.equal(consentView(db).pendingCount,1))
 fail=false;await assert.rejects(syncMarketingConsent(db,fetcher),/ACK offline/)
 check('website events commit locally before acknowledgement and survive failed ACK',()=>{assert.equal(consentView(db).cursor,1);assert.equal(getCustomer(db,remote)!.okToEmail,false);assert.equal(consentView(db).pendingCount,0);assert.equal(pushed,2)})
 ackFailed=false;await syncMarketingConsent(db,fetcher)
 check('retry acknowledges committed cursor without duplicate suppression or lost events',()=>{assert.deepEqual(acks,[1,1]);assert.equal(consentView(db).suppressedCount,2);assert.equal(consentView(db).error,null)})
 events=[{id:2,email:'batch@example.com',at:'2026-11-17T12:00:00Z'},{id:2,email:'bad@example.com',at:'2026-11-17T12:00:00Z'}]
 await assert.rejects(syncMarketingConsent(db,fetcher),/sequence/)
 check('invalid website batch rolls back every event and its cursor',()=>{assert.equal(consentView(db).cursor,1);assert.equal(isMarketingSuppressed(db,'batch@example.com'),false)})
 events=[];const link=await prepareMarketingSend(db,'eligible@example.com',fetcher)
 check('send preflight returns an authenticated website unsubscribe link',()=>assert.equal(new URL(link).searchParams.get('token'),'b'.repeat(64)))
 await assert.rejects(prepareMarketingSend(db,'remote@example.com',fetcher),MarketingSuppressed)
 await assert.rejects(prepareMarketingSend(db,'eligible@example.com',async()=>{throw Error('offline')}),/unavailable/)
 const badLink:typeof fetch=async(i,init)=>new URL(String(i)).searchParams.get('action')==='prepare'?Response.json({ok:true,suppressed:false,unsubscribeUrl:'https://attacker.example/?token='+'c'.repeat(64)}):fetcher(i,init)
 await assert.rejects(prepareMarketingSend(db,'eligible@example.com',badLink),/link was invalid/)
 check('marketing fails closed for suppressed recipients, offline service and foreign unsubscribe URLs',()=>assert.equal(getCustomer(db,eligible)!.okToEmail,true))
 const rejectRecipient:typeof fetch=async(i,init)=>new URL(String(i)).searchParams.get('action')==='prepare'?Response.json({ok:true,suppressed:true}):fetcher(i,init)
 const late=add('late@example.com');await assert.rejects(prepareMarketingSend(db,'late@example.com',rejectRecipient),MarketingSuppressed)
 check('unsubscribe after queuing is caught at immediate send preflight and saved locally',()=>assert.equal(getCustomer(db,late)!.okToEmail,false))
 db.prepare('UPDATE customers SET ok_to_email=1 WHERE id=?').run(remote)
 const audience=runAudience(db,{allCustomers:true,rules:[],withinMonths:null,customerTypes:[]})
 const exported=await exportMarketingSubscribers(db,fetcher)
 check('audience and synchronized contact export honor suppression even if a checkbox was forced in SQL',()=>{assert.ok(!audience.recipients.some(r=>r.customerId===remote));assert.deepEqual(exported.map(r=>r.email),['eligible@example.com'])})
 const originalFetch=globalThis.fetch,originalTransport=nodemailer.createTransport
 const delivered:any[]=[]
 try{
  nodemailer.createTransport=(()=>({sendMail:async(m:any)=>{delivered.push(m);return {messageId:'test-only'}}})) as any
  saveSmtp(db,{host:'smtp.test.invalid',security:'none',fromEmail:'shop@example.com'})
  globalThis.fetch=fetcher
  const mail={to:'eligible@example.com',customerId:eligible,recipientName:'Customer',subject:'Test',message:'Hello',flyer:null}
  await sendMailer(db,readSettings(db),mail)
  check('real marketing mail composition includes visible unsubscribe links and HTTPS header',()=>{assert.equal(delivered.length,1);assert.ok(delivered[0].text.includes(link));assert.ok(delivered[0].html.includes(link));assert.ok(delivered[0].headers['List-Unsubscribe'].includes(link));assert.equal(delivered[0].headers['List-Unsubscribe-Post'],undefined)})
  db.prepare('UPDATE customers SET active=0 WHERE id=?').run(eligible)
  await assert.rejects(sendMailer(db,readSettings(db),mail),MarketingSuppressed)
  db.prepare('UPDATE customers SET active=1 WHERE id=?').run(eligible)
  globalThis.fetch=async()=>{throw Error('offline')}
  await assert.rejects(sendMailer(db,readSettings(db),mail),e=>isServerProblem(e))
  check('changed queued customer and unavailable website never reach SMTP',()=>assert.equal(delivered.length,1))
  saveConsentConfig(db,{enabled:false})
  await sendSmtpTest(db,readSettings(db),'shop@example.com')
  check('transactional SMTP configuration test works independently of marketing consent',()=>assert.equal(delivered.length,2))
 }finally{globalThis.fetch=originalFetch;nodemailer.createTransport=originalTransport}
 saveConsentConfig(db,{enabled:false});await assert.rejects(prepareMarketingSend(db,'eligible@example.com',fetcher),/Configure/)
 check('disabling service blocks campaigns without deleting permanent suppression history',()=>assert.equal(consentView(db).suppressedCount,3))
 saveConsentConfig(db,{enabled:true,url:'https://replacement.example.test/index.php'})
 check('changing website resets feed cursor and queues every local suppression for the replacement service',()=>{assert.equal(consentView(db).cursor,0);assert.equal(consentView(db).pendingCount,3)})
 let pages=0
 const paged:typeof fetch=async(i,init)=>{const action=new URL(String(i)).searchParams.get('action');if(action==='pull'){pages++;return Response.json({ok:true,events:[{id:pages,email:`page${pages}@example.com`,at:'2026-11-17T12:00:00Z'}],hasMore:pages===1})}return Response.json({ok:true})}
 await syncMarketingConsent(db,paged)
 check('multi-page website feed drains in order and acknowledges the final committed cursor',()=>{assert.equal(pages,2);assert.equal(consentView(db).cursor,2);assert.equal(consentView(db).pendingCount,0);assert.ok(isMarketingSuppressed(db,'page2@example.com'))})
 }finally{db.close()}
}
