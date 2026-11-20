import type { WorkOrder,WoStatus } from './workorders'
import { stage,unitLabel } from './workorders'
import { fillTemplate,partsOrderingNotice } from './workOrderEmail'
export type SmsStatus='sending'|'accepted'|'queued'|'sent'|'delivered'|'failed'|'undelivered'|'unknown'|'canceled'
export interface SmsConfig {enabled:boolean;provider:'twilio';accountSid:string;authToken:string;fromNumber:string;callbackNumber:string;templates:Record<WoStatus,string>}
export type SmsSettingsView=Omit<SmsConfig,'authToken'>&{hasToken:boolean;problems:string[]}
export interface SmsDraft {workOrderId:number;previewHash:string;to:string;body:string;header:string;footer:string;partsNotice:string;settingsReady:boolean}
export interface SmsSendRequest {requestId:string;previewHash:string;to:string;body:string;permissionConfirmed:boolean;by:string}
export interface SmsMessage {requestId:string;workOrderId:number;to:string;body:string;status:SmsStatus;providerSid:string|null;segments:number|null;error:string|null;createdAt:string;updatedAt:string;by:string}
export const DEFAULT_SMS_TEMPLATES:Record<WoStatus,string>={
 needs_estimate:'Hi {first_name}, {wo_number}: your {unit} has been checked in for service. We will contact you with the estimate.',
 waiting_customer:'Hi {first_name}, {wo_number}: estimate for your {unit} is {total}. {diagnosis} Please contact the shop to discuss or approve service, or use the decision link in your estimate email.',
 approved:'Hi {first_name}, {wo_number}: service on your {unit} has been approved. We will let you know when it is ready.',
 waiting_parts:'Hi {first_name}, {wo_number}: service on your {unit} is waiting for parts. We will contact you with an update.',
 on_bench:'Hi {first_name}, {wo_number}: your {unit} is being repaired.',
 ready_review:'Hi {first_name}, {wo_number}: your {unit} is undergoing final review. We will let you know when it is ready for pickup.',
 ready_pickup:'Hi {first_name}, {wo_number}: your {unit} is ready for pickup. Balance due: {balance_due}. {work_done}',
 not_fixed:'Hi {first_name}, {wo_number}: your {unit} is ready for pickup without repair. Please contact the shop for details.',
 closed:'Hi {first_name}, {wo_number}: your {unit} has been picked up. Thank you for your business.'
}
export function smsPhone(value:unknown):string {
 const raw=String(value??'').trim();if(!/^[+\d\s().-]+$/.test(raw))throw Error('Enter a mobile number without an extension')
 let phone=raw.replace(/[\s().-]/g,'');if(!phone.startsWith('+')){if(/^\d{10}$/.test(phone))phone='+1'+phone;else if(/^1\d{10}$/.test(phone))phone='+'+phone;else throw Error('Use a 10-digit US number or an international number starting with +')}
 if(!/^\+[1-9]\d{7,14}$/.test(phone)||phone.startsWith('+1')&&!/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(phone))throw Error('Enter a valid mobile number with country code')
 return phone
}
const gsm=new Set(Array.from('@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'))
const extended=new Set(Array.from('^{}\\[~]|€\f'))
export function smsLength(text:string,fromNumber=''){
 let units=0,unicode=false;for(const char of text){if(gsm.has(char))units++;else if(extended.has(char))units+=2;else{unicode=true;break}}
 if(unicode)units=text.length
 const tollFree=/^\+1(?:800|833|844|855|866|877|888)/.test(fromNumber),single=unicode?70:160,multi=unicode?(tollFree?66:67):(tollFree?152:153),limit=unicode?700:1600
 return {encoding:unicode?'Unicode':'GSM-7',units,segments:units===0?0:units<=single?1:Math.ceil(units/multi),limit,tooLong:units>limit}
}
export function smsParts(wo:WorkOrder,storeName:string,config:Pick<SmsConfig,'callbackNumber'|'templates'>){
 const plain=(s:string)=>s.replace(/[–—]/g,'-').replace(/[‘’]/g,"'").replace(/[“”]/g,'"')
 const money=(n:number)=>'$'+(n/100).toFixed(2)
 const values={first_name:wo.customerName.split(' ')[0]||'there',customer:wo.customerName,wo_number:wo.number,unit:unitLabel(wo.unit),serial:wo.unit.serial,status:plain(stage(wo.status).label),total:money(wo.totals.totalCents),balance_due:money(wo.balanceDueCents),diagnosis:wo.diagnosis.trim(),work_done:wo.workDone.trim(),store:storeName}
 return {header:storeName.trim(),body:fillTemplate(config.templates[wo.status],values),partsNotice:partsOrderingNotice(wo.status,wo.lines)?'Required parts must be ordered and could take a week to arrive.':'',footer:['Replies are not monitored.',config.callbackNumber?'Questions? Call '+config.callbackNumber+'.':'','Reply STOP to opt out.'].filter(Boolean).join('\n')}
}
export function smsContent(draft:Pick<SmsDraft,'header'|'partsNotice'|'footer'>,body:string){return [draft.header,body.trim(),draft.partsNotice,draft.footer].filter(Boolean).join('\n\n')}
