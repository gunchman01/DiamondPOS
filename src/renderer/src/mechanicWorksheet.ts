import {reportedIssueHtml} from './reportedIssue'
import type {StoreSettings} from '../../shared/types'
import type {WorkOrder} from '../../shared/workorders'
import {dateTime,escapeHtml} from './format'
/** A handwriting worksheet, separate from the priced estimate/customer authorization. */
export function mechanicWorksheetHtml(wo:WorkOrder,store:StoreSettings):string{
 const esc=(value:unknown)=>escapeHtml(String(value??''))
 const partRows=Array.from({length:10},()=>'<tr><td>&nbsp;</td><td></td><td></td></tr>').join('')
 return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(wo.number)} — Estimate worksheet</title><style>
 @page{size:letter portrait;margin:12mm}*{box-sizing:border-box}body{margin:0;color:#000;background:#fff;font:10pt Arial,sans-serif;line-height:1.25}header{display:flex;justify-content:space-between;gap:6mm;border-bottom:2px solid #000;padding-bottom:3mm;margin-bottom:3mm}h1{font-size:15pt;margin:0 0 2mm}h2{font-size:10pt;margin:0 0 2mm}.store{font-size:13pt;font-weight:bold}.number{font-size:17pt;font-weight:bold;white-space:nowrap}.meta{display:grid;grid-template-columns:1fr 1.2fr;gap:3mm}.box{border:1px solid #000;padding:3mm;overflow-wrap:anywhere}.field{margin-bottom:1mm}.unit-grid{display:grid;grid-template-columns:1fr 1fr;gap:1mm 3mm}section{margin-top:3mm}section,header,.meta{break-inside:avoid}.issue{min-height:22mm;white-space:pre-wrap;overflow-wrap:anywhere}.write-box{border:1px solid #000;height:31mm;padding:0 3mm}.write-line{height:7.5mm;border-bottom:1px solid #bbb}.write-line:last-child{border:0}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #000;padding:1mm;text-align:left}th{font-size:10pt}td{height:6mm}tr{break-inside:avoid}.parts-no{width:30%}.parts-name{width:58%}.qty{width:12%}.mechanic{display:flex;gap:7mm;margin-top:4mm}.mechanic span{flex:1;border-bottom:1px solid #000;min-height:8mm}.parts-needed{font-size:9pt;line-height:1.15}.parts-needed td{padding:0.8mm 1mm}
 </style></head><body><header><div><div class="store">${esc(store.storeName)}</div><h1>WORK ORDER ESTIMATE WORKSHEET</h1></div><div><div class="number">${esc(wo.number)}</div>${wo.group?`<div>Unit ${esc(wo.group.position)} of ${esc(wo.group.count)}</div>`:''}<div>Checked in: ${esc(dateTime(wo.createdAt))}</div></div></header>
 <div class="meta"><div class="box"><h2>Customer</h2><div class="field"><b>${esc(wo.customerName)}</b></div><div class="field">Phone: ${esc(wo.customerPhone||'Not on file')}</div><div class="field">Email: ${esc(wo.customerEmail||'Not on file')}</div><div class="field">Mechanic: ${esc(wo.mechanicName||'Unassigned')}</div></div>
 <div class="box"><h2>Unit details</h2><div class="unit-grid"><div>Type: <b>${esc(wo.unit.unitType||wo.unit.category)}</b></div><div>Brand: <b>${esc(wo.unit.brand||'Not on file')}</b></div><div>Model: <b>${esc(wo.unit.model||'Not on file')}</b></div><div>Serial: <b>${esc(wo.unit.serial||'Not on file')}</b></div><div>Hours at check-in: <b>${esc(wo.hoursIn??'Not recorded')}</b></div></div></div></div>
 <section style="break-inside:auto"><h2>Reported issue / customer concern</h2><div class="box issue">${wo.problem?reportedIssueHtml(wo):'No issue entered'}</div></section>
 <section><h2>Mechanic findings / diagnosis / recommended work</h2><div class="write-box">${'<div class="write-line"></div>'.repeat(4)}</div></section>
 <section class="parts-needed"><h2>Parts needed</h2><table><thead><tr><th class="parts-no">Part number</th><th class="parts-name">Part name / description</th><th class="qty">Qty</th></tr></thead><tbody>${partRows}</tbody></table></section>
 <div class="mechanic"><span>Mechanic: </span><span>Date: </span><span>Estimated labor hours: </span></div>
</body></html>`
}
