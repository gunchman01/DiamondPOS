import type {WorkOrder} from '../../shared/workorders'
import {intakeIssueText,type IntakeResponse} from '../../shared/repairIntake'
import {dateTime,escapeHtml} from './format'
/** Format only intact generated questionnaire blocks; preserve all other issue text verbatim. */
export function reportedIssueHtml(wo:Pick<WorkOrder,'problem'|'intakes'>):string{
 const esc=escapeHtml
 const blocks=(wo.intakes??[]).map(response=>({response,text:intakeIssueText(response)}))
 let remaining=wo.problem,result=''
 while(remaining){
  let next:{response:IntakeResponse;text:string;at:number}|null=null
  for(const block of blocks){const at=remaining.indexOf(block.text);if(at>=0&&(!next||at<next.at))next={...block,at}}
  if(!next){result+=plain(remaining);break}
  result+=plain(remaining.slice(0,next.at))
  result+=`<table class="intake-qa" style="width:100%;border-collapse:collapse;table-layout:fixed;margin:2mm 0;font-size:9pt;white-space:normal"><caption style="text-align:left;font-weight:bold;font-size:9pt;margin-bottom:1mm">Customer questionnaire · ${esc(dateTime(next.response.submittedAt))}</caption><colgroup><col style="width:55%"><col style="width:45%"></colgroup><thead><tr><th style="border:1px solid #777;padding:1mm 1.5mm;text-align:left;font-size:9pt">Question</th><th style="border:1px solid #777;padding:1mm 1.5mm;text-align:left;font-size:9pt">Answer</th></tr></thead><tbody>${next.response.questions.map(q=>`<tr><td style="border:1px solid #777;padding:1mm 1.5mm;height:auto;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere">${esc(q.label)}</td><td style="border:1px solid #777;padding:1mm 1.5mm;height:auto;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere">${esc(next!.response.answers[q.id]||'Not answered')}</td></tr>`).join('')}</tbody></table>`
  remaining=remaining.slice(next.at+next.text.length)
 }
 return result
 function plain(value:string){return value.trim()?`<div style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(value.trim())}</div>`:''}
}
