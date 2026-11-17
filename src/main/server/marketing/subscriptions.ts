import type express from 'express'
import type { DB } from '../db'
import type { StoreSettings } from '../../../shared/types'
import { getSmtp, smtpProblems, sendEmail } from './mailer'
import { consentConfig, normalizedEmail, validEmail, ready, remote, syncMarketingConsent, type ConsentFetch } from './consent'
const jobs=new WeakMap<DB,Promise<void>>()
const esc=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
function record(db:DB,id:string,email:string,at:string){db.prepare('INSERT OR IGNORE INTO marketing_subscription_requests(request_id,email,requested_at) VALUES(?,?,?)').run(id,email,at)}
export function subscriptionStatus(db:DB){const row=db.prepare("SELECT value FROM settings WHERE key='marketing_subscription_worker'").get() as {value:string}|undefined;return {worker:row?JSON.parse(row.value):{lastRunAt:null,error:null},recent:db.prepare('SELECT request_id AS requestId,email,requested_at AS requestedAt,sent_at AS sentAt,status,error FROM marketing_subscription_requests ORDER BY requested_at DESC LIMIT 50').all(),confirmations:db.prepare('SELECT email,confirmed_at AS confirmedAt,request_id AS requestId FROM marketing_consent_confirmations ORDER BY confirmed_at DESC LIMIT 50').all()}}
function workerState(db:DB,error:string|null){db.prepare("INSERT INTO settings(key,value) VALUES('marketing_subscription_worker',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({lastRunAt:new Date().toISOString(),error}))}
export function processSubscriptionRequests(db:DB,store:StoreSettings,fetcher:ConsentFetch=fetch):Promise<void>{
 const active=jobs.get(db);if(active)return active
 const job=(async()=>{
  try{
   const cfg=ready(db),problems=smtpProblems(getSmtp(db));if(problems.length)throw Error('Set up the email account before sending confirmation requests: '+problems.join('; '))
   await syncMarketingConsent(db,fetcher)
   const data=await remote(cfg,'subscriptionRequests',{consentVersion:2},fetcher)
   if(!Array.isArray(data.requests)||data.requests.length>20)throw Error('Invalid subscription request batch')
   for(const row of data.requests.slice(0,Math.min(20,Math.max(1,Math.floor(getSmtp(db).perMinute))))){
    if(!row||!/^[a-f0-9]{64}$/.test(row.id)||!validEmail(normalizedEmail(row.email))||!Number.isFinite(Date.parse(row.requestedAt)))throw Error('Invalid subscription request')
    const email=normalizedEmail(row.email)
    // A public signup never creates customer records or reveals whether one exists.
    const customer=db.prepare('SELECT 1 FROM customers WHERE lower(trim(email))=? AND active=1').get(email)
    if(!customer){await remote(cfg,'subscriptionIgnored',{requestId:row.id,consentVersion:2},fetcher);continue}
    record(db,row.id,email,row.requestedAt)
    const audit=db.prepare('SELECT sent_at,status FROM marketing_subscription_requests WHERE request_id=?').get(row.id) as {sent_at:string|null;status:string}
    try{
     if(!audit.sent_at){
      const prepared=await remote(cfg,'prepareSubscription',{requestId:row.id,consentVersion:2},fetcher)
      if(prepared.ready===false){db.prepare("UPDATE marketing_subscription_requests SET status='expired',error='Request expired or preferences changed' WHERE request_id=?").run(row.id);continue}
      if(prepared.ready!==true||normalizedEmail(prepared.email)!==email)throw Error('Invalid confirmation preparation')
      const link=new URL(String(prepared.confirmationUrl)),base=new URL(cfg.url)
      if(link.origin!==base.origin||link.pathname!==base.pathname||link.hash||link.searchParams.get('action')!=='confirmSubscription'||!/^[a-f0-9]{64}$/.test(link.searchParams.get('token')??'')||[...link.searchParams.keys()].some(k=>!['action','token'].includes(k)))throw Error('Invalid confirmation link')
      const current=consentConfig(db);if(current.url!==cfg.url||current.apiKey!==cfg.apiKey||!current.enabled)throw Error('Website settings changed; retry later')
      const message=`Someone requested marketing emails from ${store.storeName} for this address. If that was you, open the link below and confirm. The link expires in 24 hours. If you did not request this, ignore it; you remain unsubscribed unless you confirm.\n\n${link.toString()}\n\n${store.storeAddress}`
      await sendEmail(db,store,{to:email,subject:`Confirm marketing subscription — ${store.storeName}`,text:message,html:`<p>${esc(message.split('\n\n')[0])}</p><p><a href="${esc(link.toString())}">Confirm marketing subscription</a></p><p>${esc(store.storeAddress).replaceAll('\n','<br>')}</p>`})
      db.prepare("UPDATE marketing_subscription_requests SET sent_at=?,status='sent',error=NULL WHERE request_id=?").run(new Date().toISOString(),row.id)
     }
     // Persist SMTP success before ACK; an ACK retry must not send another email.
     await remote(cfg,'subscriptionSent',{requestId:row.id,consentVersion:2},fetcher)
     db.prepare('UPDATE marketing_subscription_requests SET error=NULL WHERE request_id=?').run(row.id)
    }catch(e){db.prepare("UPDATE marketing_subscription_requests SET error=?,status=CASE WHEN sent_at IS NULL THEN 'failed' ELSE status END WHERE request_id=?").run((e as Error).message,row.id);throw e}
   }
   workerState(db,null)
  }catch(e){workerState(db,(e as Error).message);throw e}
 })().finally(()=>jobs.delete(db));jobs.set(db,job);return job
}
export function startSubscriptionScheduler(db:DB,settings:(db:DB)=>StoreSettings){
 let stopped=false,timer:ReturnType<typeof setTimeout>|undefined
 const run=()=>{if(stopped)return;void(consentConfig(db).enabled?processSubscriptionRequests(db,settings(db)):Promise.resolve()).catch(()=>{}).finally(()=>{if(!stopped){timer=setTimeout(run,60000);timer.unref()}})}
 run();return async()=>{stopped=true;if(timer)clearTimeout(timer);await jobs.get(db)?.catch(()=>{})}
}
export function registerSubscriptionRoutes(app:express.Express,db:DB,settings:(db:DB)=>StoreSettings){
 app.get('/api/marketing/subscriptions',(_req,res)=>res.json(subscriptionStatus(db)))
 app.post('/api/marketing/subscriptions/process',(_req,res)=>{void processSubscriptionRequests(db,settings(db)).then(()=>res.json(subscriptionStatus(db))).catch(e=>res.status(503).json({error:(e as Error).message}))})
 app.post('/api/marketing/subscriptions/request',(req,res)=>{void(async()=>{
  const id=Number(req.body?.customerId);if(!Number.isSafeInteger(id)||id<=0)throw Error('Choose a saved customer')
  const customer=db.prepare('SELECT email,active FROM customers WHERE id=?').get(id) as {email:string|null;active:number}|undefined
  if(!customer?.active||!validEmail(normalizedEmail(customer.email)))throw Error('Choose an active customer with a valid saved email address')
  await syncMarketingConsent(db)
  const result=await remote(ready(db),'requestSubscription',{email:normalizedEmail(customer.email),consentVersion:2},fetch)
  if(result.queued===true&&/^[a-f0-9]{64}$/.test(result.requestId))record(db,result.requestId,normalizedEmail(customer.email),new Date().toISOString())
  res.json({queued:result.queued===true,message:result.queued?'Confirmation requested. The Store Server sends it within about a minute using the email account. Permission changes only after confirmation.':'A recent request already exists or the request limit was reached. Check the inbox or try again later.'})
 })().catch(e=>res.status(400).json({error:(e as Error).message}))})
}
