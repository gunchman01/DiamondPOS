import assert from 'node:assert/strict'
import path from 'node:path'
import { openDatabase } from '../src/main/server/db'
import { createApp } from '../src/main/server'
import { insertCustomer, CUSTOMER_DEFAULTS } from '../src/main/server/customers'
import { campaignAnalytics } from '../src/main/server/marketing/analytics'
import { activityLocation } from '../src/shared/campaignAnalytics'
import { saveConsentConfig } from '../src/main/server/marketing/consent'
import { syncMarketingActivity } from '../src/main/server/marketing/tracking'
type Check=(name:string,fn:()=>void)=>void
export async function testCampaignAnalytics(check:Check,dir:string){
 const file=path.join(dir,'marketing-analytics.db'),db=openDatabase(file),now=new Date('2026-11-17T18:00:00Z')
 try{
 const a=insertCustomer(db,{...CUSTOMER_DEFAULTS,firstName:'Map A',email:'mapa@example.com',okToEmail:true}),b=insertCustomer(db,{...CUSTOMER_DEFAULTS,firstName:'Map B',email:'mapb@example.com',okToEmail:true})
 const campaign=Number(db.prepare("INSERT INTO marketing_campaigns(name,status) VALUES('Map fixture','sent')").run().lastInsertRowid)
 const send=(id:number,status='sent',tracked=1)=>Number(db.prepare('INSERT INTO marketing_sends(campaign_id,customer_id,email,status,tracking_active,tracking_key) VALUES(?,?,?,?,?,?)').run(campaign,id,`map${id}@example.com`,status,tracked,String(id).padStart(64,'0')).lastInsertRowid)
 const s1=send(a),s2=send(b),tulsa={city:'Tulsa',region:'Oklahoma',country:'United States',countryCode:'US',latitude:36.2,longitude:-96,source:'ipgeolocation.io' as const},seattle={...tulsa,city:'Seattle',region:'Washington',latitude:47.6,longitude:-122.3}
 let n=0;const event=(s:number,kind:string,at:string,location:unknown=null)=>db.prepare('INSERT INTO marketing_activity(event_key,send_id,kind,at,url,location_json) VALUES(?,?,?,?,?,?)').run(String(++n).padStart(64,'0'),s,kind,at,kind==='click'?'https://morethanmowers.com':null,location?JSON.stringify(location):null)
 event(s1,'open','2026-11-16T23:00:00Z',tulsa);event(s1,'open','2026-11-17T01:00:00Z',tulsa);event(s1,'click','2026-11-17T01:10:00Z',tulsa);event(s2,'open','2026-11-17T07:00:00Z',seattle);event(s1,'open','2026-11-15T12:00:00Z');event(s2,'click','2026-11-17T12:00:00Z');event(s1,'open','2026-10-01T12:00:00Z',tulsa)
 const d=campaignAnalytics(db,campaign,7,now)
 check('campaign analytics separates observed events from distinct recipients and mapped/unknown activity',()=>{assert.equal(d.totals.openEvents,4);assert.equal(d.totals.clickEvents,2);assert.equal(d.totals.openedRecipients,2);assert.equal(d.totals.clickedRecipients,2);assert.equal(d.totals.mappedOpens,3);assert.equal(d.totals.unknownOpens,1);assert.equal(d.totals.mappedClicks,1);assert.equal(d.totals.unknownClicks,1)})
 check('locations group repeated requests without treating them as multiple people or using customer addresses',()=>{assert.equal(d.locations.length,2);const t=d.locations.find(g=>g.city==='Tulsa')!;assert.equal(t.opens,2);assert.equal(t.clicks,1);assert.equal(t.recipients,1);assert.equal(t.latitude,36.2)})
 check('daily and hourly charts use Central Time across midnight rather than UTC event dates',()=>{assert.equal(d.timeZone,'America/Chicago');const day=d.timeline.find(r=>r.date==='2026-11-16')!;assert.equal(day.opens,2);assert.equal(day.clicks,1);assert.equal(d.hours[19].opens,1);assert.equal(d.hours[1].opens,1)})
 check('period filters and all-time totals remain separate and missing activity does not invent geography',()=>{assert.equal(campaignAnalytics(db,campaign,null,now).totals.openEvents,5);assert.equal(d.totals.trackedSent,2);assert.equal(d.geo,null);assert.throws(()=>campaignAnalytics(db,campaign,5,now),/Choose/);assert.throws(()=>campaignAnalytics(db,9999,7,now),/not found/)})
 event(s2,'open','2026-11-17T12:30:00Z',{...tulsa,latitude:999})
 check('corrupt or invalid historical geography remains counted as unknown instead of a fake map marker',()=>{const r=campaignAnalytics(db,campaign,7,now);assert.equal(r.totals.openEvents,5);assert.equal(r.totals.unknownOpens,2);assert.equal(r.locations.length,2);assert.throws(()=>activityLocation({...tulsa,latitude:999}),/Invalid/);assert.equal(activityLocation(undefined),null);assert.equal(activityLocation({...tulsa,latitude:36.15398})!.latitude,36.2)})
 saveConsentConfig(db,{enabled:true,url:'https://marketing.example.test/index.php',apiKey:'a'.repeat(64)})
 const trackedKey=String(a).padStart(64,'0'),batch=[{id:1,eventKey:'f'.repeat(64),deliveryKey:trackedKey,kind:'open',at:'2026-11-17T13:00:00Z',url:null,location:tulsa}]
 const fetcher:typeof fetch=async(_input,init)=>{const cursor=JSON.parse(String(init?.body)).cursor;return Response.json({ok:true,version:1,events:cursor?[]:batch,hasMore:false,geo:{enabled:true,keyConfigured:true,lastError:null,lastSuccessAt:'2026-11-17T13:00:00Z',dailyLookups:1,dailyLimit:900}})}
 await syncMarketingActivity(db,fetcher);await syncMarketingActivity(db,fetcher)
 check('website geography synchronizes once with existing event identity and retains redacted provider health',()=>{const row=db.prepare('SELECT location_json FROM marketing_activity WHERE event_key=?').get('f'.repeat(64)) as any;assert.equal(JSON.parse(row.location_json).city,'Tulsa');const r=campaignAnalytics(db,campaign,7,now);assert.equal(r.geo?.dailyLookups,1);assert.ok(!JSON.stringify(r).includes('apiKey'));assert.equal((db.prepare('SELECT COUNT(*) n FROM marketing_activity WHERE event_key=?').get('f'.repeat(64)) as any).n,1)})
 const app=createApp(db,{dbFile:file,apiKey:'geo-test',port:0,appVersion:'0.3.47'}),server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r))
 try{const base=`http://127.0.0.1:${(server.address() as any).port}`,headers={'X-Api-Key':'geo-test'};const denied=await fetch(base+`/api/marketing/campaigns/${campaign}/analytics`),result=await fetch(base+`/api/marketing/campaigns/${campaign}/analytics?days=all`,{headers}),invalid=await fetch(base+`/api/marketing/campaigns/${campaign}/analytics?days=bad`,{headers}),missing=await fetch(base+'/api/marketing/campaigns/99999/analytics',{headers});const report=await result.json()
 check('analytics API requires pairing and validates report period and campaign without exposing request IPs',()=>{assert.equal(denied.status,401);assert.equal(result.status,200);assert.equal(invalid.status,400);assert.equal(missing.status,404);assert.equal(report.locations.length,2);assert.ok(!JSON.stringify(report).includes('REMOTE_ADDR'))})
 }finally{await new Promise<void>(r=>server.close(()=>r()))}
 }finally{db.close()}
}
