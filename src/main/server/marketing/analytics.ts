import type express from 'express'
import type { DB } from '../db'
import { activityLocation, type CampaignAnalytics } from '../../../shared/campaignAnalytics'
import { trackingStatus } from './tracking'
const timeZone='America/Chicago'
const dateFormatter=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'})
const hourFormatter=new Intl.DateTimeFormat('en-US',{timeZone,hour:'2-digit',hourCycle:'h23'})
export function campaignAnalytics(db:DB,campaignId:number,days:number|null=30,now=new Date()):CampaignAnalytics {
 if(!Number.isSafeInteger(campaignId)||campaignId<=0||!db.prepare('SELECT 1 FROM marketing_campaigns WHERE id=?').get(campaignId))throw Error('Campaign not found')
 if(days!==null&&![7,30,90].includes(days))throw Error('Choose 7, 30, 90 days or all time')
 const cutoff=days===null?null:new Date(now.getTime()-days*86400000).toISOString()
 const events=db.prepare("SELECT a.send_id,a.kind,a.at,a.location_json FROM marketing_activity a JOIN marketing_sends s ON s.id=a.send_id WHERE s.campaign_id=? AND s.status='sent' AND s.tracking_active=1 AND (? IS NULL OR datetime(a.at)>=datetime(?)) ORDER BY a.at,a.event_key").all(campaignId,cutoff,cutoff) as {send_id:number;kind:'open'|'click';at:string;location_json:string|null}[]
 const trackedSent=(db.prepare("SELECT COUNT(*) n FROM marketing_sends WHERE campaign_id=? AND status='sent' AND tracking_active=1").get(campaignId) as any).n as number
 const result:CampaignAnalytics={campaignId,days,timeZone,generatedAt:now.toISOString(),geo:trackingStatus(db).geo,totals:{trackedSent,openEvents:0,clickEvents:0,openedRecipients:0,clickedRecipients:0,mappedOpens:0,mappedClicks:0,unknownOpens:0,unknownClicks:0},timeline:[],hours:Array.from({length:24},(_,hour)=>({hour,opens:0,clicks:0})),locations:[]}
 const opened=new Set<number>(),clicked=new Set<number>(),timeline=new Map<string,{date:string;opens:number;clicks:number}>(),locations=new Map<string,CampaignAnalytics['locations'][number]&{ids:Set<number>}>()
 for(const event of events){
  const at=new Date(event.at);if(!Number.isFinite(at.getTime()))continue
  const parts=dateFormatter.formatToParts(at),date=['year','month','day'].map(k=>parts.find(p=>p.type===k)!.value).join('-'),hour=Number(hourFormatter.format(at))
  const day=timeline.get(date)??{date,opens:0,clicks:0};timeline.set(date,day)
  if(event.kind==='open'){result.totals.openEvents++;opened.add(event.send_id);day.opens++;result.hours[hour].opens++}else{result.totals.clickEvents++;clicked.add(event.send_id);day.clicks++;result.hours[hour].clicks++}
  let location=null;try{location=event.location_json?activityLocation(JSON.parse(event.location_json)):null}catch{}
  if(!location){if(event.kind==='open')result.totals.unknownOpens++;else result.totals.unknownClicks++;continue}
  if(event.kind==='open')result.totals.mappedOpens++;else result.totals.mappedClicks++
  const key=JSON.stringify([location.countryCode,location.region,location.city,location.latitude,location.longitude]),group=locations.get(key)??{...location,key,opens:0,clicks:0,recipients:0,ids:new Set<number>()};locations.set(key,group)
  group.ids.add(event.send_id);if(event.kind==='open')group.opens++;else group.clicks++
 }
 result.totals.openedRecipients=opened.size;result.totals.clickedRecipients=clicked.size
 // Fill absent calendar days without counting them as activity; cap the long all-time chart to event dates.
 const sorted=[...timeline.keys()].sort()
 if(sorted.length&&sorted.length<1000){let day=new Date(sorted[0]+'T12:00:00Z');const end=sorted[sorted.length-1];while(day.toISOString().slice(0,10)<=end){const date=day.toISOString().slice(0,10);if(!timeline.has(date))timeline.set(date,{date,opens:0,clicks:0});day=new Date(day.getTime()+86400000);if(timeline.size>3660)break}}
 result.timeline=[...timeline.values()].sort((a,b)=>a.date.localeCompare(b.date))
 result.locations=[...locations.values()].map(({ids,...r})=>({...r,recipients:ids.size})).sort((a,b)=>b.opens-a.opens||b.clicks-a.clicks||a.key.localeCompare(b.key))
 return result
}
export function registerAnalyticsRoutes(app:express.Express,db:DB){
 app.get('/api/marketing/campaigns/:id/analytics',(req,res)=>{try{const days=req.query.days==='all'?null:req.query.days===undefined?30:Number(req.query.days);res.json(campaignAnalytics(db,Number(req.params.id),days))}catch(e){const message=(e as Error).message;res.status(message==='Campaign not found'?404:400).json({error:message})}})
}
