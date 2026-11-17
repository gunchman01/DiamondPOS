// Optional end-to-end protocol check against real PHP/SQLite, with no SMTP send.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import nodemailer from 'nodemailer'
import Database from 'better-sqlite3'
import { campaignAnalytics } from '../src/main/server/marketing/analytics'
import { processSubscriptionRequests } from '../src/main/server/marketing/subscriptions'
import { saveSmtp } from '../src/main/server/marketing/mailer'
import { readSettings } from '../src/main/server'
import { spawn } from 'node:child_process'
import { openDatabase } from '../src/main/server/db'
import { insertCustomer, CUSTOMER_DEFAULTS, getCustomer, updateCustomer } from '../src/main/server/customers'
import { saveConsentConfig, syncMarketingConsent, MarketingSuppressed } from '../src/main/server/marketing/consent'
import { prepareDelivery, syncMarketingActivity } from '../src/main/server/marketing/tracking'
async function main(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'diamondpos-php-e2e-')),php=process.env.DIAMONDP_TEST_PHP||'php',args=JSON.parse(process.env.DIAMONDP_TEST_PHP_ARGS||'[]') as string[]
 const reservation=net.createServer();await new Promise<void>(r=>reservation.listen(0,'127.0.0.1',r));const port=(reservation.address() as net.AddressInfo).port;await new Promise<void>(r=>reservation.close(()=>r()))
 const privateFile=path.join(dir,'config.php'),webDb=path.join(dir,'web.sqlite'),db=openDatabase(path.join(dir,'pos.db')),key='a'.repeat(64),publicUrl='https://marketing.example.test/index.php'
 const quote=(value:string)=>"'"+value.replaceAll('\\','\\\\').replaceAll("'","\\'")+"'"
 fs.writeFileSync(privateFile,`<?php return ['api_key'=>${quote(key)},'public_url'=>${quote(publicUrl)},'database'=>${quote(webDb)}];`)
 const child=spawn(php,[...args,'-S',`127.0.0.1:${port}`,'-t',path.resolve('extras/cpanel-marketing/public')],{env:{...process.env,DIAMONDP_MARKETING_CONFIG:privateFile},stdio:['ignore','ignore','pipe']});let errors='';child.stderr.on('data',b=>{errors+=b})
 const local=`http://127.0.0.1:${port}/index.php`,fetcher:typeof fetch=(url,init)=>fetch(local+new URL(String(url)).search,init)
 try{
  for(let i=0;i<100;i++){try{await fetch(local);break}catch{await new Promise(r=>setTimeout(r,50))}}
  saveConsentConfig(db,{enabled:true,url:publicUrl,apiKey:key})
  const customer=insertCustomer(db,{...CUSTOMER_DEFAULTS,firstName:'Self test',email:'test@example.com',okToEmail:true})
  const campaign=Number(db.prepare("INSERT INTO marketing_campaigns(name,status) VALUES('PHP bridge test','sending')").run().lastInsertRowid)
  const send=Number(db.prepare('INSERT INTO marketing_sends(campaign_id,customer_id,email) VALUES(?,?,?)').run(campaign,customer,'test@example.com').lastInsertRowid)
  const destination='https://morethanmowers.com/service',delivery=await prepareDelivery(db,'test@example.com',send,[destination],fetcher)
  assert.ok(delivery.pixelUrl&&delivery.clickUrls)
  const image=await fetcher(delivery.pixelUrl!);assert.equal(image.headers.get('content-type'),'image/gif');assert.ok((await image.arrayBuffer()).byteLength>0)
  const click=await fetcher(delivery.clickUrls![destination],{redirect:'manual'});assert.equal(click.status,302);assert.equal(click.headers.get('location'),destination)
  // Deterministic coarse-location fixture: no real IP is sent to a provider in this test.
  const web=new Database(webDb);web.prepare('UPDATE activity_events SET location_json=?').run(JSON.stringify({city:'Tulsa',region:'Oklahoma',country:'United States',countryCode:'US',latitude:36.2,longitude:-96,source:'ipgeolocation.io'}));web.close()
  await syncMarketingActivity(db,fetcher);await syncMarketingActivity(db,fetcher)
  const rows=db.prepare('SELECT kind,COUNT(*) n FROM marketing_activity WHERE send_id=? GROUP BY kind ORDER BY kind').all(send)
  assert.deepEqual(rows,[{kind:'click',n:1},{kind:'open',n:1}])
  db.prepare("UPDATE marketing_sends SET status='sent',tracking_active=1 WHERE id=?").run(send)
  const analytics=campaignAnalytics(db,campaign,null);assert.equal(analytics.locations[0].city,'Tulsa');assert.equal(analytics.totals.mappedOpens,1);assert.equal(analytics.totals.mappedClicks,1)

  const token=new URL(delivery.unsubscribeUrl).searchParams.get('token')!
  const unsubscribe=await fetch(local,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token,confirm:'yes'})});assert.match(await unsubscribe.text(),/You are unsubscribed/)
  await syncMarketingConsent(db,fetcher)
  assert.equal((db.prepare('SELECT ok_to_email FROM customers WHERE id=?').get(customer) as any).ok_to_email,0)
  await assert.rejects(prepareDelivery(db,'test@example.com',send,[destination],fetcher),MarketingSuppressed)
  const queued=await fetcher(publicUrl+'?action=requestSubscription',{method:'POST',headers:{'Content-Type':'application/json','X-DiamondPOS-Key':key},body:JSON.stringify({email:'test@example.com',consentVersion:2})});assert.equal(queued.status,200)
  const transport=nodemailer.createTransport;let confirmation='';let sent=0
  try{
   saveSmtp(db,{host:'smtp.test.invalid',security:'none',fromEmail:'shop@example.com'})
   nodemailer.createTransport=(()=>({sendMail:async(m:any)=>{sent++;confirmation=m.text.match(/https:\/\/[^\s]+action=confirmSubscription[^\s]+/)?.[0]??'';return {messageId:'local-test-only'}}})) as any
   await processSubscriptionRequests(db,readSettings(db),fetcher)
   assert.equal(sent,1);assert.ok(confirmation)
  }finally{nodemailer.createTransport=transport}
  assert.equal(getCustomer(db,customer)!.okToEmail,false)
  const confirmPage=await fetcher(confirmation);assert.match(await confirmPage.text(),/Confirm your subscription/)
  await syncMarketingConsent(db,fetcher);assert.equal(getCustomer(db,customer)!.okToEmail,false)
  const confirmationToken=new URL(confirmation).searchParams.get('token')!
  const confirm=await fetcher(confirmation,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:confirmationToken,confirm:'yes'})});assert.match(await confirm.text(),/subscription confirmed/)
  await syncMarketingConsent(db,fetcher);assert.equal(getCustomer(db,customer)!.okToEmail,true)
  await prepareDelivery(db,'test@example.com',send,[destination],fetcher)
  // Simulate stale suppression restored from a local backup: replay must respect website confirmation.
  db.prepare("INSERT INTO marketing_suppressions(email,unsubscribed_at,source) VALUES('test@example.com','2026-01-01T00:00:00Z','restore')").run()
  db.prepare("INSERT INTO marketing_consent_outbox(email,intent) VALUES('test@example.com','restore')").run()
  db.prepare("UPDATE settings SET value=? WHERE key='marketing_consent_state'").run(JSON.stringify({cursor:0,lastSyncAt:null,error:null}))
  await syncMarketingConsent(db,fetcher);assert.equal(getCustomer(db,customer)!.okToEmail,true)
  updateCustomer(db,customer,{...getCustomer(db,customer)!,okToEmail:false});await syncMarketingConsent(db,fetcher)
  const stale=await fetcher(confirmation,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:confirmationToken,confirm:'yes'})});assert.match(await stale.text(),/New confirmation needed/)
  await syncMarketingConsent(db,fetcher);assert.equal(getCustomer(db,customer)!.okToEmail,false)
  console.log('PASS real PHP ↔ POS SQLite: coarse map fixture/analytics, image/click tracking, unsubscribe, queued confirmation through mocked SMTP, scanner-safe GET, explicit re-subscription, restore/replay, and new opt-out invalidating the old link')
 }catch(e){console.error(errors);throw e}finally{child.kill();await new Promise<void>(r=>{if(child.exitCode!==null)r();else child.once('exit',()=>r())});db.close();fs.rmSync(dir,{recursive:true,force:true})}
}
void main().catch(e=>{console.error(e);process.exitCode=1})
