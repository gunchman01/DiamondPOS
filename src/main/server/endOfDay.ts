import crypto from 'node:crypto'
import type express from 'express'
import type { DB } from './db'
import { reconcileDrawer, type EndOfDayReport, type EodEvent, type EodTender, type DrawerInputs, type EndOfDayCloseout } from '../../shared/endOfDay'
class EodError extends Error { constructor(public status:number,message:string){super(message)} }
function scope(date:unknown,till:unknown) {
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw new EodError(400,'Choose a valid report date')
  if(till!==null&&till!==undefined&&(typeof till!=='string'||till.length>100))throw new EodError(400,'Choose a valid till')
  return {date,till:typeof till==='string'&&till? till:null}
}
const iso=(s:string)=>s.replace(' ','T')+'Z'
const customerSql="CASE WHEN c.track_as_company=1 AND COALESCE(c.company,'')<>'' THEN c.company ELSE TRIM(COALESCE(c.first_name,'')||' '||COALESCE(c.last_name,'')) END"
const digest=(value:unknown)=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
function tenderRows(events:EodEvent[], byBrand=false):EodTender[]{
  const rows=new Map<string,EodTender>()
  if(!byBrand)for(const [method,label] of [['cash','Cash'],['card','Card terminal'],['check','Checks']])rows.set(method,{method,label,count:0,inCents:0,outCents:0,netCents:0})
  for(const e of events){
    if(byBrand&&e.method!=='card')continue
    const key=byBrand?(e.brand||'unknown'):e.method
    const row=rows.get(key)??{method:key,label:byBrand?(key==='unknown'?'Unspecified card':key):key,count:0,inCents:0,outCents:0,netCents:0}
    row.count++;if(e.cents>=0)row.inCents+=e.cents;else row.outCents-=e.cents;row.netCents+=e.cents;rows.set(key,row)
  }
  return [...rows.values()].sort((a,b)=>a.method.localeCompare(b.method))
}
/** Business-date sales and actual posting-date money movement intentionally remain separate. */
export function endOfDayReport(db:DB,dateValue:unknown,tillValue:unknown=null):EndOfDayReport {
  const {date,till}=scope(dateValue,tillValue)
  const filter=till?' AND s.till_name=?':'';const params=till?[date,till]:[date]
  const sales=db.prepare(`SELECT s.*,${customerSql} AS customer FROM sales s LEFT JOIN customers c ON c.id=s.customer_id WHERE s.status='completed' AND date(s.created_at,'localtime')=?${filter} ORDER BY s.id`).all(...params) as any[]
  const returned=db.prepare(`SELECT si.sale_id,SUM(-(si.line_total_cents-CASE WHEN s.tax_mode='inclusive' THEN COALESCE(si.tax_cents,0) ELSE 0 END)) AS amount FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.status='completed' AND si.kind='return' AND date(s.created_at,'localtime')=?${filter} GROUP BY si.sale_id`).all(...params) as any[]
  const reductions=db.prepare(`SELECT COALESCE(SUM(CASE WHEN si.regular_price_cents>si.unit_price_cents THEN (si.regular_price_cents-si.unit_price_cents)*si.qty ELSE 0 END),0) AS amount,SUM(CASE WHEN si.regular_price_cents IS NULL THEN 1 ELSE 0 END) AS unknown FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.status='completed' AND si.kind='item' AND date(s.created_at,'localtime')=?${filter}`).get(...params) as any
  const reversedReductions=db.prepare(`SELECT COALESCE(SUM(CASE WHEN original.regular_price_cents>original.unit_price_cents THEN (original.regular_price_cents-original.unit_price_cents)*ABS(si.qty) ELSE 0 END),0) AS amount,SUM(CASE WHEN original.regular_price_cents IS NULL THEN 1 ELSE 0 END) AS unknown FROM sale_items si JOIN sales s ON s.id=si.sale_id LEFT JOIN sale_items original ON original.id=si.return_of_item_id WHERE s.status='completed' AND si.kind='return' AND date(s.created_at,'localtime')=?${filter}`).get(...params) as any
  const moneyRows=db.prepare(`SELECT s.id,s.created_at,s.recorded_at,s.till_name,s.change_cents,${customerSql} AS customer,p.id AS payment_id,p.method,COALESCE(p.card_type,p.card_brand) AS card_brand,p.reference,p.amount_cents FROM sales s JOIN payments p ON p.sale_id=s.id LEFT JOIN customers c ON c.id=s.customer_id WHERE date(COALESCE(s.recorded_at,s.created_at),'localtime')=?${filter} ORDER BY s.id,p.id`).all(...params) as any[]
  const events:EodEvent[]=moneyRows.map(r=>({key:'s'+r.payment_id,at:iso(r.recorded_at??r.created_at),kind:'sale',receiptId:r.id,customer:r.customer||'Walk-in',till:r.till_name,method:r.method,brand:r.card_brand,reference:r.reference,cents:r.amount_cents-(r.method==='cash'?r.change_cents:0)}))
  // The checkout currently writes one tender row per method. Apply change only once even if future split entries use multiple cash rows.
  const changeApplied=new Set<number>()
  events.forEach((e,i)=>{const r=moneyRows[i];if(e.method==='cash'){if(changeApplied.has(r.id))e.cents+=r.change_cents;changeApplied.add(r.id)}})
  const payments=db.prepare(`SELECT a.*,${customerSql} AS customer FROM account_payments a LEFT JOIN customers c ON c.id=a.customer_id WHERE date(a.created_at,'localtime')=?${till?' AND a.till_name=?':''} ORDER BY a.id`).all(...params) as any[]
  for(const p of payments)events.push({key:'a'+p.id,at:iso(p.created_at),kind:'account_payment',receiptId:null,customer:p.customer||'Customer',till:p.till_name,method:p.method,brand:p.card_brand,reference:p.reference,cents:p.amount_cents})
  const voids=db.prepare(`SELECT v.*,s.total_cents,s.change_cents,${customerSql} AS customer FROM sale_voids v JOIN sales s ON s.id=v.sale_id LEFT JOIN customers c ON c.id=s.customer_id WHERE date(v.voided_at,'localtime')=?${till?' AND v.till_name=?':''} ORDER BY v.sale_id`).all(...params) as any[]
  for(const v of voids){let changed=false;for(const p of db.prepare('SELECT * FROM payments WHERE sale_id=? ORDER BY id').all(v.sale_id) as any[]){const change=p.method==='cash'&&!changed?v.change_cents:0;if(p.method==='cash')changed=true;events.push({key:'v'+p.id,at:iso(v.voided_at),kind:'void',receiptId:v.sale_id,customer:v.customer||'Walk-in',till:v.till_name,method:p.method,brand:p.card_type??p.card_brand,reference:p.reference,cents:-(p.amount_cents-change)})}}
  events.sort((a,b)=>a.at.localeCompare(b.at)||a.key.localeCompare(b.key))
  const totalCents=sales.reduce((n,s)=>n+s.total_cents,0),taxCents=sales.reduce((n,s)=>n+s.tax_cents,0),returnsCents=returned.reduce((n,r)=>n+r.amount,0)
  const tills=new Map<string,{name:string;receiptCount:number;salesCents:number;paymentNetCents:number}>()
  const getTill=(name:string)=>{let r=tills.get(name);if(!r){r={name,receiptCount:0,salesCents:0,paymentNetCents:0};tills.set(name,r)}return r}
  for(const s of sales){const r=getTill(s.till_name);r.receiptCount++;r.salesCents+=s.total_cents}for(const e of events)getTill(e.till).paymentNetCents+=e.cents
  const body={date,till,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,
    business:{receiptCount:sales.length,refundReceiptCount:sales.filter(s=>s.total_cents<0).length,exchangeCount:sales.filter(s=>s.total_cents>=0&&returned.some(r=>r.sale_id===s.id)).length,grossCents:totalCents-taxCents+returnsCents,returnsCents,netCents:totalCents-taxCents,taxCents,totalCents,accountChargesCents:sales.filter(s=>s.on_account).reduce((n,s)=>n+s.total_cents,0),exemptCount:sales.filter(s=>s.tax_exempt).length,exemptNetCents:sales.filter(s=>s.tax_exempt).reduce((n,s)=>n+s.total_cents-s.tax_cents,0),reductionsCents:reductions.amount,reductionsReturnedCents:reversedReductions.amount,reductionsNetCents:reductions.amount-reversedReductions.amount,returnReductionUnknownLines:reversedReductions.unknown??0,reductionUnknownLines:reductions.unknown??0},
    receiptRows:sales.map(s=>({id:s.id,at:iso(s.created_at),till:s.till_name,customer:s.customer||'Walk-in',totalCents:s.total_cents,onAccount:!!s.on_account})),
    tenders:tenderRows(events),cards:tenderRows(events,true),events,netPaymentsCents:events.reduce((n,e)=>n+e.cents,0),accountPaymentsCents:payments.reduce((n,p)=>n+p.amount_cents,0),
    voids:voids.map(v=>({receiptId:v.sale_id,at:iso(v.voided_at),till:v.till_name,by:v.voided_by,reason:v.reason,paymentNote:v.payment_note,totalCents:v.total_cents})),tills:[...tills.values()].sort((a,b)=>a.name.localeCompare(b.name))}
  return {...body,sourceHash:digest(body),generatedAt:new Date().toISOString()}
}
function inputs(value:unknown):DrawerInputs {
  const b=value as DrawerInputs
  if(!b||typeof b!=='object')throw new EodError(400,'Enter drawer counts')
  for(const key of ['openingCents','countedCashCents','leaveCents','extraInCents','extraOutCents'] as const)if(!Number.isSafeInteger(b[key])||b[key]<0||b[key]>1e10)throw new EodError(400,'Enter nonnegative valid cash amounts')
  for(const key of ['cardActualCents','checkActualCents'] as const)if(b[key]!==null&&(!Number.isSafeInteger(b[key])||Math.abs(b[key]!)>1e10))throw new EodError(400,'Enter valid terminal/check totals, or leave blank')
  if(b.leaveCents>b.countedCashCents)throw new EodError(400,'Cash left cannot exceed counted cash')
  const by=String(b.by??'').trim(),notes=String(b.notes??'').trim()
  if(!by||by.length>100||notes.length>2000)throw new EodError(400,'Enter your name and notes up to 2,000 characters')
  if((b.extraInCents||b.extraOutCents)&&!notes)throw new EodError(400,'Explain the other cash paid in/out in Notes')
  return {...b,by,notes}
}
function saved(row:any):EndOfDayCloseout{return JSON.parse(row.snapshot_json)}
export function saveEndOfDay(db:DB,b:any):EndOfDayCloseout {
  if(!b||typeof b.requestId!=='string'||!/^[a-f0-9-]{36}$/i.test(b.requestId))throw new EodError(400,'A closeout request ID is required')
  const requestHash=digest(b)
  return db.transaction(()=>{
    const prior=db.prepare('SELECT * FROM end_day_closeouts WHERE request_id=?').get(b.requestId) as any
    if(prior){if(prior.request_hash!==requestHash)throw new EodError(409,'Closeout ID was reused with different values');return saved(prior)}
    const count=inputs(b.inputs),report=endOfDayReport(db,b.date,b.till)
    if(b.sourceHash!==report.sourceHash)throw new EodError(409,'Transactions changed. Refresh the report and review counts before saving.')
    const reconciliation=reconcileDrawer(report,count),savedAt=new Date().toISOString()
    const info=db.prepare('INSERT INTO end_day_closeouts(request_id,request_hash,business_date,till_name,saved_at,snapshot_json) VALUES(?,?,?,?,?,?)').run(b.requestId,requestHash,report.date,report.till,savedAt,'{}')
    const result={id:Number(info.lastInsertRowid),savedAt,report,inputs:count,reconciliation}
    db.prepare('UPDATE end_day_closeouts SET snapshot_json=? WHERE id=?').run(JSON.stringify(result),result.id)
    return result
  })()
}
export function registerEndOfDayRoutes(app:express.Express,db:DB){
  const wrap=(fn:(req:express.Request,res:express.Response)=>void)=>(req:express.Request,res:express.Response,next:express.NextFunction)=>{try{fn(req,res)}catch(e){if(e instanceof EodError)res.status(e.status).json({error:e.message});else next(e)}}
  app.get('/api/end-of-day/tills',wrap((_req,res)=>res.json((db.prepare('SELECT till_name FROM sales UNION SELECT till_name FROM account_payments UNION SELECT till_name FROM sale_voids ORDER BY till_name').all() as any[]).map(r=>r.till_name))))
  app.get('/api/end-of-day/closeouts',wrap((req,res)=>{const {date}=scope(req.query.date,null);res.json((db.prepare('SELECT * FROM end_day_closeouts WHERE business_date=? ORDER BY id DESC').all(date) as any[]).map(saved))}))
  app.get('/api/end-of-day',wrap((req,res)=>res.json(endOfDayReport(db,req.query.date,req.query.till))))
  app.post('/api/end-of-day/closeouts',wrap((req,res)=>res.status(201).json(saveEndOfDay(db,req.body))))
}
