import crypto from 'node:crypto'
import type express from 'express'
import type { DB } from '../db'
import { consentConfig, ready, remote, prepareMarketingSend, suppressMarketing, MarketingSuppressed, type ConsentFetch } from './consent'
export interface DeliveryTracking { unsubscribeUrl:string; pixelUrl?:string; clickUrls?:Record<string,string> }
const problem=(message:string)=>Object.assign(new Error(message),{code:'ECONSENT'})
export function trackingStatus(db:DB){
 const row=db.prepare("SELECT value FROM settings WHERE key='marketing_activity_state'").get() as {value:string}|undefined
 let state={cursor:0,lastSyncAt:null as string|null,error:null as string|null};try{if(row)state=JSON.parse(row.value)}catch{}
 return {...state,enabled:consentConfig(db).trackingEnabled}
}
function state(db:DB,value:unknown){db.prepare("INSERT INTO settings(key,value) VALUES('marketing_activity_state',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(value))}
export function safeMarketingUrl(value:unknown):value is string {
 if(typeof value!=='string'||value.length>2048||/[\x00-\x20\x7f]/.test(value))return false
 try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!!u.hostname&&!u.username&&!u.password}catch{return false}
}
function serviceLink(value:unknown,base:string,action:string):string {
 try{const u=new URL(String(value)),b=new URL(base);if(u.origin!==b.origin||u.pathname!==b.pathname||u.hash||u.searchParams.get('action')!==action||!/^[a-f0-9]{64}$/.test(u.searchParams.get('token')??'')||[...u.searchParams.keys()].some(k=>!['action','token'].includes(k)))throw Error();return u.toString()}catch{throw problem('Website tracking link was invalid; update the cPanel marketing service')}
}
export async function prepareDelivery(db:DB,email:string,sendId:number|undefined,links:string[],fetcher:ConsentFetch=fetch):Promise<DeliveryTracking>{
 // Test/transactional emails do not contribute to campaign engagement.
 const unsubscribeUrl=await prepareMarketingSend(db,email,fetcher)
 if(sendId===undefined||!consentConfig(db).trackingEnabled)return {unsubscribeUrl}
 const row=db.prepare('SELECT email,tracking_key FROM marketing_sends WHERE id=?').get(sendId) as {email:string;tracking_key:string|null}|undefined
 if(!row||row.email.trim().toLowerCase()!==email.trim().toLowerCase())throw problem('Campaign recipient no longer matches the tracking record')
 const key=row.tracking_key??crypto.randomBytes(32).toString('hex')
 if(!row.tracking_key)db.prepare('UPDATE marketing_sends SET tracking_key=? WHERE id=?').run(key,sendId)
 const unique=[...new Set(links)];if(unique.length>100||unique.some(u=>!safeMarketingUrl(u)))throw problem('Use at most 100 valid HTTP or HTTPS links in a marketing message')
 const cfg=ready(db),result=await remote(cfg,'prepareTracking',{email,deliveryKey:key,links:unique},fetcher)
 if(result.suppressed===true){suppressMarketing(db,email);throw new MarketingSuppressed('Unsubscribed from marketing')}
 if(result.suppressed!==false||result.version!==1||!result.clickUrls||typeof result.clickUrls!=='object')throw problem('Website tracking is unavailable; update the cPanel marketing service')
 const pixelUrl=serviceLink(result.pixelUrl,cfg.url,'open'),clickUrls:Record<string,string>={}
 for(const url of unique)clickUrls[url]=serviceLink(result.clickUrls[url],cfg.url,'click')
 return {unsubscribeUrl,pixelUrl,clickUrls}
}
const jobs=new WeakMap<DB,Promise<ReturnType<typeof trackingStatus>>>()
export function syncMarketingActivity(db:DB,fetcher:ConsentFetch=fetch){
 const pending=jobs.get(db);if(pending)return pending
 const job=(async()=>{
  const cfg=ready(db);let current=trackingStatus(db)
  try{
   for(let page=0;page<1000;page++){
    const response=await remote(cfg,'activity',{cursor:current.cursor},fetcher)
    if(response.version!==1||!Array.isArray(response.events)||response.events.length>200||typeof response.hasMore!=='boolean')throw Error('Invalid activity batch')
    const latest=consentConfig(db);if(latest.url!==cfg.url||latest.apiKey!==cfg.apiKey)throw Error('Website configuration changed during activity sync; retry')
    let cursor=current.cursor
    db.transaction(()=>{
     for(const event of response.events){
      if(!event||!Number.isSafeInteger(event.id)||event.id<=cursor||!/^[a-f0-9]{64}$/.test(event.eventKey)||!/^[a-f0-9]{64}$/.test(event.deliveryKey)||!['open','click'].includes(event.kind)||typeof event.at!=='string'||!Number.isFinite(Date.parse(event.at))||(event.kind==='click'&&!safeMarketingUrl(event.url))||(event.kind==='open'&&event.url!==null))throw Error('Invalid activity event')
      const send=db.prepare('SELECT id FROM marketing_sends WHERE tracking_key=?').get(event.deliveryKey) as {id:number}|undefined
      if(send)db.prepare('INSERT OR IGNORE INTO marketing_activity(event_key,send_id,kind,at,url) VALUES(?,?,?,?,?)').run(event.eventKey,send.id,event.kind,event.at,event.url)
      cursor=event.id
     }
     if(response.hasMore&&!response.events.length)throw Error('Empty activity continuation')
     current={...current,cursor,error:null};state(db,current)
    })()
    if(!response.hasMore){state(db,{...current,lastSyncAt:new Date().toISOString(),error:null});return trackingStatus(db)}
   }
   throw Error('Activity page limit reached; synchronize again to continue')
  }catch(e){state(db,{...trackingStatus(db),error:(e as Error).message});throw e}
 })().finally(()=>jobs.delete(db));jobs.set(db,job);return job
}
export function startActivityScheduler(db:DB){
 let stopped=false,timer:ReturnType<typeof setTimeout>|undefined
 const run=()=>{if(stopped)return;const cfg=consentConfig(db);void (cfg.enabled?syncMarketingActivity(db):Promise.resolve()).catch(()=>{}).finally(()=>{if(!stopped){timer=setTimeout(run,60000);timer.unref()}})}
 run();return async()=>{stopped=true;if(timer)clearTimeout(timer);await jobs.get(db)?.catch(()=>{})}
}
export function registerTrackingRoutes(app:express.Express,db:DB){
 app.get('/api/marketing/activity',(_req,res)=>res.json(trackingStatus(db)))
 app.post('/api/marketing/activity/sync',(_req,res)=>{void syncMarketingActivity(db).then(v=>res.json(v)).catch(e=>res.status(503).json({error:(e as Error).message}))})
 app.post('/api/marketing/activity/replay',(_req,res)=>{if(jobs.has(db))return res.status(409).json({error:'Activity sync is running; retry shortly'});state(db,{cursor:0,lastSyncAt:null,error:null});void syncMarketingActivity(db).then(v=>res.json(v)).catch(e=>res.status(503).json({error:(e as Error).message}))})
}
