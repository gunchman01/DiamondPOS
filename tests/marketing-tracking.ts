import assert from 'node:assert/strict'
import path from 'node:path'
import nodemailer from 'nodemailer'
import { openDatabase } from '../src/main/server/db'
import { createApp, readSettings } from '../src/main/server'
import { insertCustomer, CUSTOMER_DEFAULTS } from '../src/main/server/customers'
import { saveConsentConfig } from '../src/main/server/marketing/consent'
import { prepareDelivery, syncMarketingActivity, trackingStatus, safeMarketingUrl } from '../src/main/server/marketing/tracking'
import { sendMailer, saveSmtp, isServerProblem, startMarketingSender, stopMarketingSender } from '../src/main/server/marketing/mailer'
import { mailerHtml, mailerText, messageLinks } from '../src/shared/mailerTemplate'
type Check=(name:string,fn:()=>void)=>void
export async function testMarketingTracking(check:Check,dir:string){
 const file=path.join(dir,'marketing-tracking.db'),db=openDatabase(file)
 const originalFetch=globalThis.fetch,originalTransport=nodemailer.createTransport
 try{
 const url='https://marketing.example.test/index.php',destination='https://morethanmowers.com/service?unit=mower&offer=fall'
 saveConsentConfig(db,{enabled:true,url,apiKey:'a'.repeat(64)})
 saveSmtp(db,{host:'smtp.test.invalid',security:'none',fromEmail:'shop@example.com'})
 const customer=insertCustomer(db,{...CUSTOMER_DEFAULTS,firstName:'Tracking customer',email:'track@example.com',okToEmail:true})
 const campaign=Number(db.prepare("INSERT INTO marketing_campaigns(name,subject,message,status) VALUES('Tracking test','Test',?,'sending')").run('Visit '+destination).lastInsertRowid)
 const send=Number(db.prepare("INSERT INTO marketing_sends(campaign_id,customer_id,email,status) VALUES(?,?,?,'pending')").run(campaign,customer,'track@example.com').lastInsertRowid)
 const oldCustomer=insertCustomer(db,{...CUSTOMER_DEFAULTS,firstName:'Legacy customer',email:'legacy@example.com',okToEmail:true})
 db.prepare("INSERT INTO marketing_sends(campaign_id,customer_id,email,status) VALUES(?,?,?,'sent')").run(campaign,oldCustomer,'legacy@example.com')
 let key='',prepared=0,events:any[]=[],hasMore=false
 const requests:string[]=[],delivered:any[]=[]
 const fetcher:typeof fetch=async(input,init)=>{const action=new URL(String(input)).searchParams.get('action')!,body=JSON.parse(String(init?.body));requests.push(action)
  if(action==='capabilities')return Response.json({ok:true,consentVersion:2})
  if(action==='pull')return Response.json({ok:true,consentVersion:2,events:[],hasMore:false})
  if(action==='ack')return Response.json({ok:true})
  if(action==='prepare')return Response.json({ok:true,suppressed:false,unsubscribeUrl:url+'?token='+'a'.repeat(64)})
  if(action==='prepareTracking'){prepared++;key=body.deliveryKey;assert.equal(body.email,'track@example.com');return Response.json({ok:true,version:1,suppressed:false,pixelUrl:url+'?action=open&token='+'b'.repeat(64),clickUrls:Object.fromEntries(body.links.map((l:string)=>[l,url+'?action=click&token='+'c'.repeat(64)]))})}
  if(action==='activity')return Response.json({ok:true,version:1,events:events.filter(e=>e.id>body.cursor),hasMore})
  throw Error('Unexpected action '+action)
 }
 const initial=await prepareDelivery(db,'track@example.com',send,[destination],fetcher),stableKey=key
 await prepareDelivery(db,'track@example.com',send,[destination],fetcher)
 check('campaign delivery identity is stable across send retries, with opaque per-recipient tracking URLs',()=>{assert.equal(key,stableKey);assert.equal(key.length,64);assert.equal(initial.pixelUrl,url+'?action=open&token='+'b'.repeat(64));assert.equal(initial.clickUrls?.[destination],url+'?action=click&token='+'c'.repeat(64))})
 const oldService:typeof fetch=async(i,init)=>new URL(String(i)).searchParams.get('action')==='prepareTracking'?Response.json({ok:true}):fetcher(i,init)
 await assert.rejects(prepareDelivery(db,'track@example.com',send,[],oldService),e=>isServerProblem(e))
 check('old or incompatible cPanel service pauses tracked sending instead of silently dropping tracking',()=>assert.equal((db.prepare('SELECT tracking_active FROM marketing_sends WHERE id=?').get(send) as any).tracking_active,0))
 const badService:typeof fetch=async(i,init)=>new URL(String(i)).searchParams.get('action')==='prepareTracking'?Response.json({ok:true,version:1,suppressed:false,pixelUrl:'https://attacker.example/?token='+'b'.repeat(64),clickUrls:{}}):fetcher(i,init)
 await assert.rejects(prepareDelivery(db,'track@example.com',send,[],badService),/link was invalid/)
 check('tracking links reject foreign origins and unsafe destination schemes or credentials',()=>{assert.equal(safeMarketingUrl('javascript:alert(1)'),false);assert.equal(safeMarketingUrl('https://user:password@example.com'),false);assert.equal(safeMarketingUrl('https://example.com/\r\nInjected'),false);assert.equal(safeMarketingUrl(destination),true)})
 const content={storeName:'Shop',storeAddress:'Test street',replyTo:'shop@example.com',subject:'Hello',recipientName:'Customer',message:`Hello {name}, visit ${destination}. <script>alert(1)</script>`,flyerSrc:null,...initial}
 const html=mailerHtml(content),text=mailerText(content)
 check('message URLs become safe clickable links in HTML and tracked links in text, without tracking unsubscribe links',()=>{assert.deepEqual(messageLinks(content.message,'Customer'),[destination]);assert.ok(html.includes('href="'+initial.clickUrls![destination]!.replaceAll('&','&amp;')+'"'));assert.ok(html.includes('src="'+initial.pixelUrl!.replaceAll('&','&amp;')+'"'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('href="'+initial.unsubscribeUrl+'"'));assert.ok(text.includes(initial.clickUrls![destination]));assert.ok(!text.includes(initial.pixelUrl!))})
 globalThis.fetch=fetcher;nodemailer.createTransport=(()=>({sendMail:async(m:any)=>{delivered.push(m);return {messageId:'test-only'}}})) as any
 await sendMailer(db,readSettings(db),{to:'track@example.com',customerId:customer,sendId:send,recipientName:'Customer',subject:'Hello',message:destination,flyer:null})
 db.prepare("UPDATE marketing_sends SET status='sent' WHERE id=?").run(send)
 check('real marketing composition hands SMTP a pixel and tracked link and records successful tracking inclusion',()=>{assert.equal(delivered.length,1);assert.ok(delivered[0].html.includes('?action=open'));assert.ok(delivered[0].text.includes('?action=click'));assert.equal((db.prepare('SELECT tracking_active FROM marketing_sends WHERE id=?').get(send) as any).tracking_active,1)})
 const before=prepared
 await sendMailer(db,readSettings(db),{to:'track@example.com',recipientName:'Test',subject:'Test',message:destination,flyer:null})
 saveConsentConfig(db,{trackingEnabled:false})
 await sendMailer(db,readSettings(db),{to:'track@example.com',customerId:customer,sendId:send,recipientName:'Customer',subject:'Untracked',message:destination,flyer:null})
 check('test messages and disabled tracking add neither pixel nor tracked links nor campaign engagement',()=>{assert.equal(prepared,before);assert.ok(!delivered[1].html.includes('?action=open'));assert.ok(!delivered[2].html.includes('?action=open'));assert.ok(delivered[2].text.includes(destination));assert.equal((db.prepare('SELECT tracking_active FROM marketing_sends WHERE id=?').get(send) as any).tracking_active,0)})
 db.prepare('UPDATE marketing_sends SET tracking_active=1 WHERE id=?').run(send)
 db.prepare("UPDATE marketing_campaigns SET status='sent' WHERE id=?").run(campaign)
 events=[{id:1,eventKey:'1'.repeat(64),deliveryKey:key,kind:'open',at:'2026-11-17T12:01:00Z',url:null},{id:2,eventKey:'2'.repeat(64),deliveryKey:key,kind:'click',at:'2026-11-17T12:02:00Z',url:destination},{id:3,eventKey:'3'.repeat(64),deliveryKey:key,kind:'open',at:'2026-11-17T12:03:00Z',url:null}]
 await syncMarketingActivity(db,fetcher);await syncMarketingActivity(db,fetcher)
 check('activity synchronization is recipient-specific, cursor-based, and idempotent',()=>{assert.equal(trackingStatus(db).cursor,3);assert.equal((db.prepare('SELECT COUNT(*) n FROM marketing_activity').get() as any).n,3);assert.equal(trackingStatus(db).error,null)})
 // Replay against the same retained events must not inflate totals.
 db.prepare("UPDATE settings SET value=? WHERE key='marketing_activity_state'").run(JSON.stringify({cursor:0,lastSyncAt:null,error:null}))
 await syncMarketingActivity(db,fetcher)
 check('activity replay after restore deduplicates event keys rather than double-counting opens',()=>assert.equal((db.prepare('SELECT COUNT(*) n FROM marketing_activity').get() as any).n,3))
 events.push({id:4,eventKey:'4'.repeat(64),deliveryKey:key,kind:'click',at:'2026-11-17T12:04:00Z',url:destination},{id:4,eventKey:'5'.repeat(64),deliveryKey:key,kind:'open',at:'2026-11-17T12:05:00Z',url:null})
 await assert.rejects(syncMarketingActivity(db,fetcher),/Invalid activity/)
 check('a malformed activity batch rolls back the entire batch and cursor',()=>{assert.equal(trackingStatus(db).cursor,3);assert.equal((db.prepare('SELECT COUNT(*) n FROM marketing_activity').get() as any).n,3)})
 events=events.slice(0,3)
 await assert.rejects(syncMarketingActivity(db,async()=>{throw Error('offline')}),/unavailable/)
 check('activity outage preserves existing results and records a visible stale-sync error',()=>{assert.equal(trackingStatus(db).cursor,3);assert.match(trackingStatus(db).error!,/unavailable/);assert.equal((db.prepare('SELECT COUNT(*) n FROM marketing_activity').get() as any).n,3)})
 const app=createApp(db,{dbFile:file,apiKey:'tracking-tests',port:0,appVersion:'0.3.45'}),server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r))
 try{
  const base=`http://127.0.0.1:${(server.address() as any).port}`,headers={'X-Api-Key':'tracking-tests'}
  const denied=await originalFetch(base+'/api/marketing/activity'),status=await originalFetch(base+'/api/marketing/activity',{headers}),summary=await (await originalFetch(base+`/api/marketing/campaigns/${campaign}`,{headers})).json(),sends=await (await originalFetch(base+`/api/marketing/campaigns/${campaign}/sends`,{headers})).json()
  const flyer='data:image/jpeg;base64,'+'A'.repeat(1000000);db.prepare('UPDATE marketing_campaigns SET flyer=? WHERE id=?').run(flyer,campaign)
  const slim=await (await originalFetch(base+`/api/marketing/campaigns/${campaign}?summary=1`,{headers})).json(),full=await (await originalFetch(base+`/api/marketing/campaigns/${campaign}`,{headers})).json(),listed=await (await originalFetch(base+'/api/marketing/campaigns',{headers})).json()
  check('campaign progress and list responses omit large flyers while full editing data still retains the image',()=>{assert.equal(slim.flyer,'yes');assert.equal(listed.find((r:any)=>r.id===campaign).flyer,'yes');assert.equal(full.flyer,flyer);assert.ok(JSON.stringify(slim).length<5000)})
  check('paired campaign API reports distinct engaged recipients with tracked-send denominator and legacy messages excluded',()=>{assert.equal(denied.status,401);assert.equal(status.status,200);assert.equal(summary.sent,2);assert.equal(summary.trackedSent,1);assert.equal(summary.opened,1);assert.equal(summary.clicked,1)})
  check('recipient API exposes first/latest activity and per-link counts without claiming untracked mail was unread',()=>{const r=sends.find((r:any)=>r.customerId===customer);assert.equal(r.openCount,2);assert.equal(r.firstOpenedAt,'2026-11-17T12:01:00Z');assert.equal(r.lastOpenedAt,'2026-11-17T12:03:00Z');assert.equal(r.clickCount,1);assert.equal(r.clickedLinks[0].url,destination);assert.equal(r.clickedLinks[0].count,1);const old=sends.find((r:any)=>r.customerId===oldCustomer);assert.equal(old.tracked,false);assert.equal(old.openCount,0)})
  db.prepare("INSERT INTO marketing_suppressions(email,unsubscribed_at,source) VALUES('keep@example.com',datetime('now'),'pos')").run()
  const blocked=await originalFetch(base+`/api/marketing/campaigns/${campaign}/remove`,{method:'POST',headers})
  check('campaign deletion removes local recipients and activity while preserving customer unsubscribe preferences',()=>{assert.equal(blocked.status,200);assert.equal((db.prepare('SELECT COUNT(*) n FROM marketing_activity').get() as any).n,0);assert.equal((db.prepare('SELECT COUNT(*) n FROM marketing_sends WHERE campaign_id=?').get(campaign) as any).n,0);assert.ok(db.prepare("SELECT 1 FROM marketing_suppressions WHERE email='keep@example.com'").get());assert.ok(db.prepare('SELECT 1 FROM customers WHERE id=?').get(customer))})
  const active=Number(db.prepare("INSERT INTO marketing_campaigns(name,status) VALUES('Active','sending')").run().lastInsertRowid)
  const activeDelete=await originalFetch(base+`/api/marketing/campaigns/${active}/remove`,{method:'POST',headers})
  db.prepare('INSERT INTO marketing_sends(campaign_id,customer_id,email) VALUES(?,?,?)').run(active,customer,'track@example.com')
  let release:(()=>void)|undefined,signal:()=>void=()=>{}
  const atSmtp=new Promise<void>(r=>{signal=r})
  nodemailer.createTransport=(()=>({sendMail:()=>new Promise(resolve=>{release=()=>resolve({messageId:'held-test-only'});signal()})})) as any
  let timeout:ReturnType<typeof setTimeout>|undefined
  try{
   await startMarketingSender(db,readSettings)
   await Promise.race([atSmtp,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Sender did not reach SMTP')),6000)})])
   if(timeout)clearTimeout(timeout)
   await originalFetch(base+`/api/marketing/campaigns/${active}/cancel`,{method:'POST',headers})
   const during=await originalFetch(base+`/api/marketing/campaigns/${active}/remove`,{method:'POST',headers})
   check('a stopped campaign is protected from deletion while its current SMTP handoff is in progress',()=>assert.equal(during.status,409))
  }finally{if(timeout)clearTimeout(timeout);release?.();await stopMarketingSender()}
  const stoppedDelete=await originalFetch(base+`/api/marketing/campaigns/${active}/remove`,{method:'POST',headers})
  check('active campaigns cannot be deleted until stopped, while an idle stopped campaign can be removed',()=>{assert.equal(activeDelete.status,409);assert.equal(stoppedDelete.status,200)})
  db.prepare("UPDATE settings SET value=? WHERE key='marketing_activity_state'").run(JSON.stringify({cursor:0,lastSyncAt:null,error:null}))
  await syncMarketingActivity(db,fetcher)
  check('website activity replay cannot recreate a deleted campaign or attach its activity to another customer',()=>{assert.equal((db.prepare('SELECT COUNT(*) n FROM marketing_activity').get() as any).n,0);assert.equal(db.prepare('SELECT 1 FROM marketing_campaigns WHERE id=?').get(campaign),undefined);assert.equal(trackingStatus(db).cursor,3)})
 }finally{await new Promise<void>(r=>server.close(()=>r()))}
 }finally{globalThis.fetch=originalFetch;nodemailer.createTransport=originalTransport;db.close()}
}
