import { backgroundRequest } from '../../lifecycle/backgroundIO'
import crypto from 'node:crypto'
import type express from 'express'
import type { DB } from '../db'
import type { MarketingConsentConfig, MarketingConsentView, MarketingSubscriber } from '../../../shared/marketingConsent'
export class MarketingSuppressed extends Error { code='ESUPPRESSED' }
const unavailable=(message:string)=>Object.assign(new Error(message),{code:'ECONSENT'})
function read<T>(db:DB,key:string,fallback:T):T{try{const r=db.prepare('SELECT value FROM settings WHERE key=?').get(key) as any;return r?JSON.parse(r.value):fallback}catch{return fallback}}
function write(db:DB,key:string,value:unknown){db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value))}
export function normalizedEmail(value:unknown):string{return String(value??'').trim().toLowerCase()}
export const validEmail=(value:string)=>/^[\x21-\x7e]+$/.test(value)&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)&&value.length<=254
export function isMarketingSuppressed(db:DB,email:unknown):boolean{return !!db.prepare('SELECT 1 FROM marketing_suppressions WHERE email=?').get(normalizedEmail(email))}
export function suppressMarketing(db:DB,emailValue:unknown,source='website',at=new Date().toISOString(),push=false){
 const email=normalizedEmail(emailValue);if(!validEmail(email))throw new Error('Invalid unsubscribe email address')
 db.transaction(()=>{
  db.prepare('INSERT INTO marketing_suppressions(email,unsubscribed_at,source) VALUES(?,?,?) ON CONFLICT(email) DO NOTHING').run(email,at,source)
  db.prepare("UPDATE customers SET ok_to_email=0,updated_at=datetime('now') WHERE lower(trim(email))=?").run(email)
  db.prepare("UPDATE marketing_sends SET status='skipped',error='Unsubscribed from marketing' WHERE lower(trim(email))=? AND status='pending'").run(email)
  if(push)db.prepare("INSERT INTO marketing_consent_outbox(email,intent,change_id) VALUES(?,'optout',?) ON CONFLICT(email) DO UPDATE SET intent='optout',change_id=CASE WHEN marketing_consent_outbox.intent='restore' THEN excluded.change_id ELSE COALESCE(marketing_consent_outbox.change_id,excluded.change_id) END").run(email,crypto.randomBytes(32).toString('hex'))
 })()
}
export function consentConfig(db:DB):MarketingConsentConfig {
 const s=read<Partial<MarketingConsentConfig>>(db,'marketing_consent_config',{})
 return {enabled:s.enabled===true,trackingEnabled:s.trackingEnabled!==false,url:s.url??'',apiKey:s.apiKey??'',clientId:s.clientId??''}
}
export function saveConsentConfig(db:DB,b:any):MarketingConsentView {
 if(jobs.has(db))throw new Error('A consent sync is running; retry saving shortly')
 const cur=consentConfig(db),url=String(b?.url??cur.url).trim()
 let canonical=''
 if(url){const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw new Error('Use the HTTPS marketing service URL without query parameters or credentials');if(!u.pathname.endsWith('index.php'))u.pathname=u.pathname.replace(/\/$/,'')+'/index.php';canonical=u.toString()}
 const apiKey=b?.apiKey?String(b.apiKey).trim():cur.apiKey
 if(apiKey&&!/^[a-f0-9]{64}$/i.test(apiKey))throw new Error('Use the 64-character generated API key')
 const next={trackingEnabled:b?.trackingEnabled===undefined?cur.trackingEnabled:b.trackingEnabled===true,enabled:b?.enabled===undefined?cur.enabled:b.enabled===true,url:canonical,apiKey,clientId:cur.clientId||crypto.randomUUID()}
 if(next.enabled&&(!next.url||!next.apiKey))throw new Error('Enter the website URL and API key before enabling')
 db.transaction(()=>{write(db,'marketing_consent_config',next);if(next.url!==cur.url||next.apiKey!==cur.apiKey){write(db,'marketing_consent_state',{cursor:0,lastSyncAt:null,error:null});write(db,'marketing_activity_state',{cursor:0,lastSyncAt:null,error:null});db.prepare("INSERT OR IGNORE INTO marketing_consent_outbox(email,intent) SELECT email,'restore' FROM marketing_suppressions").run()}})()
 return consentView(db)
}
export function consentView(db:DB):MarketingConsentView {
 const s=consentConfig(db),state=read(db,'marketing_consent_state',{cursor:0,lastSyncAt:null as string|null,error:null as string|null})
 return {enabled:s.enabled,trackingEnabled:s.trackingEnabled,url:s.url,hasKey:!!s.apiKey,clientId:s.clientId,...state,
  suppressedCount:(db.prepare('SELECT COUNT(*) AS n FROM marketing_suppressions').get() as any).n,pendingCount:(db.prepare('SELECT COUNT(*) AS n FROM marketing_consent_outbox').get() as any).n,
  recent:(db.prepare('SELECT email,unsubscribed_at AS at,source FROM marketing_suppressions ORDER BY unsubscribed_at DESC,email LIMIT 100').all() as any[])}
}
export function ready(db:DB){const cfg=consentConfig(db);if(!cfg.enabled||!cfg.url||!cfg.apiKey)throw unavailable('Configure Website marketing consent in Settings → Email before sending campaigns');return cfg}
export type ConsentFetch=typeof fetch
export async function remote(cfg:MarketingConsentConfig,action:string,body:unknown,fetcher:ConsentFetch){
 try{return await backgroundRequest(async signal=>{
  const url=new URL(cfg.url);url.searchParams.set('action',action)
  const response=await fetcher(url.toString(),{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','X-DiamondPOS-Key':cfg.apiKey},body:JSON.stringify(body),signal})
  if(!response.ok)throw new Error(`Website returned ${response.status}`)
  const value:any=await response.json();if(!value||value.ok!==true)throw new Error('Website response was invalid');return value
 })}catch(e){throw unavailable(`Marketing consent check unavailable: ${(e as Error).message}`)}
}
const jobs=new WeakMap<DB,Promise<MarketingConsentView>>()
export function syncMarketingConsent(db:DB,fetcher:ConsentFetch=fetch):Promise<MarketingConsentView>{
 const pending=jobs.get(db);if(pending)return pending
 const job=(async()=>{
  const cfg=ready(db)
  try{
   const capabilities=await remote(cfg,'capabilities',{},fetcher)
   if(capabilities.consentVersion!==2)throw unavailable('Update the cPanel marketing service for confirmed subscriptions before syncing')
   // Local opt-outs must reach the website before any sending or subscriber export.
   for(const row of db.prepare('SELECT email,intent,change_id FROM marketing_consent_outbox ORDER BY email').all() as {email:string;intent:string;change_id:string|null}[]){
    const changeId=row.change_id??crypto.randomBytes(32).toString('hex');if(!row.change_id)db.prepare('UPDATE marketing_consent_outbox SET change_id=? WHERE email=?').run(changeId,row.email)
    await remote(cfg,'suppress',{email:row.email,source:'pos',consentVersion:2,intent:row.intent,changeId},fetcher)
    db.prepare('DELETE FROM marketing_consent_outbox WHERE email=? AND change_id=?').run(row.email,changeId)
   }
   let state=read(db,'marketing_consent_state',{cursor:0,lastSyncAt:null as string|null,error:null as string|null})
   for(let page=0;page<1000;page++){
    const data=await remote(cfg,'pull',{cursor:state.cursor,clientId:cfg.clientId,consentVersion:2},fetcher)
    if(data.consentVersion!==2)throw unavailable('Update the cPanel marketing service for confirmed subscriptions before syncing')
    if(!Array.isArray(data.events)||data.events.length>200||typeof data.hasMore!=='boolean')throw unavailable('Invalid unsubscribe event batch')
    let cursor=state.cursor
    db.transaction(()=>{
     for(const event of data.events){
      if(!event||!Number.isSafeInteger(event.id)||event.id<=cursor||typeof event.at!=='string'||!Number.isFinite(Date.parse(event.at)))throw unavailable('Invalid unsubscribe event sequence')
      if(event.kind==='subscribed'){
       if(data.consentVersion!==2||!/^[a-f0-9]{64}$/.test(event.requestId)||!validEmail(normalizedEmail(event.email)))throw unavailable('Invalid subscription confirmation')
       const email=normalizedEmail(event.email),pending=db.prepare("SELECT 1 FROM marketing_consent_outbox WHERE email=? AND intent='optout'").get(email)
       db.prepare('INSERT OR IGNORE INTO marketing_consent_confirmations(request_id,email,confirmed_at,website_url) VALUES(?,?,?,?)').run(event.requestId,email,event.at,cfg.url)
       if(!pending){db.prepare('DELETE FROM marketing_suppressions WHERE email=?').run(email);db.prepare("UPDATE customers SET ok_to_email=1,updated_at=datetime('now') WHERE lower(trim(email))=?").run(email)}
       db.prepare("UPDATE marketing_subscription_requests SET status='confirmed',error=NULL WHERE request_id=?").run(event.requestId)
      }else if(event.kind===undefined||event.kind==='suppressed')suppressMarketing(db,event.email,'website',event.at)
      else throw unavailable('Unknown marketing consent event')
      cursor=event.id
     }
     if(data.hasMore&&!data.events.length)throw unavailable('Website returned an empty continuation')
     state={cursor,lastSyncAt:state.lastSyncAt,error:null};write(db,'marketing_consent_state',state)
    })()
    // Acknowledge only after the local transaction committed. A failed ACK retries next sync.
    await remote(cfg,'ack',{cursor,clientId:cfg.clientId},fetcher)
    if(!data.hasMore){write(db,'marketing_consent_state',{...state,lastSyncAt:new Date().toISOString(),error:null});return consentView(db)}
   }
   throw unavailable('Unsubscribe sync exceeded its page limit; retry to continue')
  }catch(e){const error=(e as any)?.code==='ECONSENT'?e:unavailable(`Marketing consent sync failed: ${(e as Error).message}`);const state=read(db,'marketing_consent_state',{cursor:0,lastSyncAt:null});write(db,'marketing_consent_state',{...state,error:(error as Error).message});throw error}
 })().finally(()=>jobs.delete(db))
 jobs.set(db,job);return job
}
export async function prepareMarketingSend(db:DB,emailValue:unknown,fetcher:ConsentFetch=fetch):Promise<string>{
 const email=normalizedEmail(emailValue);if(!validEmail(email))throw new MarketingSuppressed('Invalid recipient email')
 if(isMarketingSuppressed(db,email))throw new MarketingSuppressed('Unsubscribed from marketing')
 await syncMarketingConsent(db,fetcher)
 if(isMarketingSuppressed(db,email))throw new MarketingSuppressed('Unsubscribed from marketing')
 const cfg=ready(db),result=await remote(cfg,'prepare',{email},fetcher)
 if(result.suppressed===true){suppressMarketing(db,email);throw new MarketingSuppressed('Unsubscribed from marketing')}
 if(result.suppressed!==false||typeof result.unsubscribeUrl!=='string')throw unavailable('Website did not return a valid unsubscribe link')
 let link:URL;const base=new URL(cfg.url)
 try{link=new URL(result.unsubscribeUrl)}catch{throw unavailable('Website unsubscribe link was invalid')}
 if(link.origin!==base.origin||link.pathname!==base.pathname||link.hash||[...link.searchParams.keys()].some(k=>k!=='token')||!/^[a-f0-9]{64}$/i.test(link.searchParams.get('token')??''))throw unavailable('Website unsubscribe link was invalid')
 return link.toString()
}
export async function exportMarketingSubscribers(db:DB,fetcher:ConsentFetch=fetch):Promise<MarketingSubscriber[]>{
 await syncMarketingConsent(db,fetcher)
 const rows=db.prepare("SELECT * FROM customers WHERE active=1 AND ok_to_email=1 ORDER BY id").all() as any[],seen=new Set<string>(),out:MarketingSubscriber[]=[]
 for(const c of rows){const email=normalizedEmail(c.email);if(!validEmail(email)||seen.has(email)||isMarketingSuppressed(db,email))continue;seen.add(email);out.push({customerId:c.id,name:c.track_as_company&&c.company?c.company:[c.first_name,c.last_name].filter(Boolean).join(' '),email,consent:'Yes'})}
 return out
}
export function startConsentScheduler(db:DB):()=>Promise<void>{
 let stopped=false,timer:ReturnType<typeof setTimeout>|null=null
 const run=()=>{if(stopped)return;const promise=consentConfig(db).enabled?syncMarketingConsent(db):Promise.resolve();void promise.catch(e=>console.error('[marketing-consent]',(e as Error).message)).finally(()=>{if(!stopped){timer=setTimeout(run,60000);timer.unref()}})}
 run();return async()=>{stopped=true;if(timer)clearTimeout(timer);await jobs.get(db)?.catch(()=>{})}
}
export function registerConsentRoutes(app:express.Express,db:DB){
 app.get('/api/marketing/consent',(_req,res)=>res.json(consentView(db)))
 app.post('/api/marketing/consent/key',(_req,res)=>res.json({apiKey:crypto.randomBytes(32).toString('hex')}))
 app.put('/api/marketing/consent',(req,res)=>{try{res.json(saveConsentConfig(db,req.body))}catch(e){res.status(400).json({error:(e as Error).message})}})
 app.post('/api/marketing/consent/replay',(_req,res)=>{if(jobs.has(db))return res.status(409).json({error:'A sync is running; retry shortly'});write(db,'marketing_consent_state',{cursor:0,lastSyncAt:null,error:null});write(db,'marketing_activity_state',{cursor:0,lastSyncAt:null,error:null});db.prepare("INSERT OR IGNORE INTO marketing_consent_outbox(email,intent) SELECT email,'restore' FROM marketing_suppressions").run();void syncMarketingConsent(db).then(v=>res.json(v)).catch(e=>res.status(503).json({error:(e as Error).message}))})
 app.post('/api/marketing/consent/sync',(_req,res)=>{void syncMarketingConsent(db).then(v=>res.json(v)).catch(e=>res.status(503).json({error:(e as Error).message}))})
 app.post('/api/marketing/consent/export',(_req,res)=>{void exportMarketingSubscribers(db).then(v=>res.json(v)).catch(e=>res.status(503).json({error:(e as Error).message}))})
}
