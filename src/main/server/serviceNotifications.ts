import type {WorkOrder} from '../../shared/workorders'
import {unitLabel} from '../../shared/workorders'
import {partsOrderingNotice} from '../../shared/workOrderEmail'
import type { DB } from './db'
import { smsPhone } from '../../shared/serviceSms'
import { backgroundRequest } from '../lifecycle/backgroundIO'
export interface TextSettings {enabled:boolean;apiKey:string;callbackNumber:string}
export type ChannelResult={status:'accepted'|'failed'|'unknown';detail:string}
export function textSettings(db:DB):TextSettings{
 const row=db.prepare("SELECT value FROM settings WHERE key='service_text_settings'").get() as any
 try{return {enabled:false,apiKey:'',callbackNumber:'',...JSON.parse(row?.value||'{}')}}catch{return {enabled:false,apiKey:'',callbackNumber:''}}
}
export function textSettingsView(db:DB){const {apiKey,...s}=textSettings(db);return {...s,hasKey:!!apiKey}}
export function saveTextSettings(db:DB,input:any){
 const old=textSettings(db),apiKey=input.clearKey===true?'':String(input.apiKey||old.apiKey).trim(),callbackNumber=String(input.callbackNumber||'').trim().slice(0,80)
 if(apiKey.length>1000||/[\r\n]/.test(apiKey))throw Error('Invalid API key')
 if(input.enabled===true&&(!apiKey||!callbackNumber))throw Error('Enter the API key and store callback number before enabling texts')
 db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES ('service_text_settings',?)").run(JSON.stringify({enabled:input.enabled===true,apiKey,callbackNumber}))
 return textSettingsView(db)
}
// A timeout may occur after acceptance. Never retry an uncertain paid send automatically.
export async function sendServiceText(config:TextSettings,to:string,message:string,externalId:string,transport:typeof fetch=fetch):Promise<ChannelResult>{
 const recipient=smsPhone(to)
 try{return await backgroundRequest(async signal=>{
  const response=await transport('https://api.mobile-text-alerts.com/v3/send',{method:'POST',redirect:'error',signal,headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({subscribers:[recipient],message,externalId})})
  if(!response.ok){await response.body?.cancel();return {status:response.status>=500?'unknown':'failed',detail:response.status>=500?'Provider result uncertain; check Mobile Text Alerts before resending.':`Provider rejected text (HTTP ${response.status}). Check account, number verification and opt-outs.`}}
  const data=await response.json() as any
  if(data?.data?.totalSent===1&&typeof data.data.messageId==='string')return {status:'accepted',detail:'Accepted by Mobile Text Alerts; delivery is not confirmed.'}
  return {status:'unknown',detail:'Provider response did not confirm acceptance. Check Mobile Text Alerts before resending.'}
 },20000)}catch{return {status:'unknown',detail:'Text result uncertain after a connection error. Check Mobile Text Alerts before resending.'}}
}

export function serviceText(wo:WorkOrder,storeName:string,config:TextSettings,estimate:boolean,link?:string){
 return [storeName,`${wo.number}: ${unitLabel(wo.unit)}`,estimate?`Your estimate is $${(wo.totals.totalCents/100).toFixed(2)}. Review and approve or decline: ${link||'[approval link added when sent]'}`:`Ready for pickup. Balance due: $${(wo.balanceDueCents/100).toFixed(2)}.`,estimate?partsOrderingNotice('waiting_customer',wo.lines):'',`Replies are not monitored. Questions? Call ${config.callbackNumber||'[store callback number]'}. Reply STOP to opt out.`].filter(Boolean).join('\n\n')
}
