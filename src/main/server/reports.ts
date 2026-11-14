import crypto from 'node:crypto'
import type express from 'express'
import type { DB } from './db'
import { REPORT_FIELDS, REPORT_OPERATORS, type ReportDefinition, type ReportFilter, type ReportResult, type SavedReport } from '../../shared/reports'
const MAX_ROWS=10000
class ReportError extends Error {constructor(public status:number,message:string){super(message)}}
const bad=(message:string):never=>{throw new ReportError(400,message)}
function object(value:unknown):Record<string,unknown> {if(!value||typeof value!=='object'||Array.isArray(value))bad('Report definition is required');return value as Record<string,unknown>}
function validDate(value:unknown):string {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)bad('Use a valid date in YYYY-MM-DD format')
  return value as string
}
export function cleanReport(value:unknown):ReportDefinition {
  const b=object(value)
  if(!['sales','inventory','receiving'].includes(String(b.source)))bad('Choose Sales, Inventory or Receiving')
  const source=b.source as ReportDefinition['source'], fields=REPORT_FIELDS[source]
  const field=(key:unknown)=>fields.find(f=>f.key===key)??bad('Unknown report field')
  function keys(value:unknown):string[]{if(!Array.isArray(value)||value.length>30)bad('Choose report columns');const result=(value as unknown[]).map(k=>field(k).key);if(new Set(result).size!==result.length)bad('Repeated report columns');return result}
  const columns=keys(b.columns),groupBy=keys(b.groupBy)
  if(!columns.length)bad('Choose at least one report column')
  if(groupBy.length>5)bad('Group by up to five columns')
  for(const key of groupBy)if(!columns.includes(key)||field(key).sum)bad('Grouping columns must be selected non-total fields')
  if(groupBy.length)for(const key of columns)if(!groupBy.includes(key)&&!field(key).sum)bad('In a summary, select only grouping columns and total fields')
  if(!Array.isArray(b.filters)||b.filters.length>20)bad('Use up to 20 filters')
  const filters=(b.filters as unknown[]).map(v=>{
    const f=object(v),meta=field(f.field)
    if(!Object.hasOwn(REPORT_OPERATORS,String(f.op)))bad('Unknown filter comparison')
    const op=f.op as ReportFilter['op'],value=String(f.value??'').trim()
    if(value.length>500)bad('Filter value is too long')
    if(op==='contains'&&meta.type!=='text')bad('Contains requires a text field')
    if(!['empty','notEmpty'].includes(op)) {
      if(['money','number','boolean'].includes(meta.type)&&(!value||!Number.isFinite(Number(value))))bad('Enter a numeric filter value')
      if(meta.type==='boolean'&&!['0','1'].includes(value))bad('Choose Yes or No')
      if(meta.type==='date')validDate(value)
    }
    return {field:meta.key,op,value}
  })
  if(!['today','month','last30','all','custom'].includes(String(b.period)))bad('Choose a date period')
  const period=b.period as ReportDefinition['period']
  let start='',end=''
  if(source!=='inventory'&&period==='custom'){start=validDate(b.start);end=validDate(b.end);if(start>end)bad('Start date must not follow end date')}
  if(typeof b.descending!=='boolean')bad('Choose a sort direction')
  const sort=String(b.sort)
  if(!columns.includes(sort))bad('Sort by a selected column')
  return {source,columns,groupBy,filters,period:source==='inventory'?'all':period,start,end,sort,descending:b.descending as boolean}
}
const sources:Record<ReportDefinition['source'],string>={
  sales:`SELECT s.id,date(s.created_at,'localtime') AS day,s.till_name AS till,s.customer_id AS customerId,
    CASE WHEN c.id IS NULL THEN 'Walk-in' WHEN c.track_as_company=1 AND COALESCE(c.company,'')<>'' THEN c.company ELSE TRIM(COALESCE(c.first_name,'')||' '||COALESCE(c.last_name,'')) END AS customer,
    s.status,COALESCE(v.reason,'') AS voidReason,COALESCE(v.voided_by,'') AS voidBy,COALESCE(v.voided_at,'') AS voidAt,COALESCE(v.qb_status,'') AS voidSync,EXISTS(SELECT 1 FROM sale_items si WHERE si.sale_id=s.id AND si.kind='return') AS hasReturn,s.tax_exempt AS taxExempt,
    s.total_cents-s.tax_cents AS net,s.tax_cents AS tax,s.total_cents AS total,
    COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.sale_id=s.id AND p.method='cash'),0)-s.change_cents AS cash,
    COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.sale_id=s.id AND p.method='card'),0) AS card,
    COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.sale_id=s.id AND p.method='check'),0) AS "check"
    FROM sales s LEFT JOIN sale_voids v ON v.sale_id=s.id LEFT JOIN customers c ON c.id=s.customer_id`,
  inventory:`SELECT p.id,COALESCE(p.sku,'') AS sku,COALESCE(p.barcode,'') AS barcode,p.name,COALESCE(p.department,'') AS department,COALESCE(p.vendor,'') AS vendor,p.type,p.active,p.use_serial AS serialized,
    p.on_hand AS onHand,p.reorder_point AS reorderPoint,CASE WHEN p.type='inventory' AND p.reorder_point IS NOT NULL AND p.on_hand<=p.reorder_point THEN 1 ELSE 0 END AS lowStock,
    p.cost_cents AS cost,p.price_cents AS price,CASE WHEN p.cost_cents IS NULL THEN NULL ELSE ROUND(p.on_hand*p.cost_cents) END AS value,ROUND(p.on_hand*p.price_cents) AS retail,CASE WHEN p.cost_cents IS NULL THEN 1 ELSE 0 END AS unknownCost FROM products p`,
  receiving:`SELECT r.id,date(COALESCE(r.posted_at,r.created_at),'localtime') AS day,r.vendor,r.invoice_no AS invoice,r.po_number AS po,r.invoice_date AS invoiceDate,r.status,r.received_by AS receivedBy,r.till_name AS till,
    COALESCE(l.qty,0) AS qty,COALESCE(l.items,0) AS items,r.freight_cents AS freight,COALESCE(l.items,0)+r.freight_cents AS total
    FROM receivings r LEFT JOIN (SELECT receiving_id,SUM(qty) AS qty,ROUND(SUM(qty*unit_cost_cents)) AS items FROM receiving_lines GROUP BY receiving_id) l ON l.receiving_id=r.id`
}
const quote=(key:string)=>'"'+key+'"' // All keys validated against REPORT_FIELDS, never user SQL.
export function runReport(db:DB,value:unknown):ReportResult {
  const definition=cleanReport(value),{source,columns,groupBy}=definition,meta=REPORT_FIELDS[source]
  const params:(string|number)[]=[],conditions:string[]=[]
  let periodLabel=source==='inventory'?'Current inventory snapshot':'All dates'
  if(source!=='inventory'&&definition.period!=='all'){
    const today=(db.prepare("SELECT date('now','localtime') AS d").get() as {d:string}).d
    let start=definition.start,end=definition.end
    if(definition.period!=='custom'){
      end=today
      start=definition.period==='today'?today:definition.period==='month'?today.slice(0,7)+'-01':(db.prepare("SELECT date('now','localtime','-29 days') AS d").get() as {d:string}).d
    }
    conditions.push('day>=? AND day<=?');params.push(start,end);periodLabel=start===end?start:`${start} through ${end}`
  }
  for(const f of definition.filters){
    const field=meta.find(m=>m.key===f.field)!,key=quote(f.field)
    if(f.op==='empty'||f.op==='notEmpty'){conditions.push(`(${key} IS ${f.op==='empty'?'':'NOT '}NULL ${f.op==='empty'?'OR':'AND'} ${key}${f.op==='empty'?'=':'<>'}'')`);continue}
    const op={eq:'=',ne:'<>',gt:'>',gte:'>=',lt:'<',lte:'<=',contains:'LIKE'}[f.op]
    conditions.push(`${key} ${op} ?${f.op==='contains'?" ESCAPE '\\'":field.type==='text'?' COLLATE NOCASE':''}`)
    params.push(f.op==='contains'?`%${f.value.replace(/[\\%_]/g,'\\$&')}%`:['money','number','boolean'].includes(field.type)?field.type==='money'?Math.round(Number(f.value)*100):Number(f.value):f.value)
  }
  const base=`WITH data AS (${sources[source]}), filtered AS (SELECT * FROM data${conditions.length?' WHERE '+conditions.map(c=>'('+c+')').join(' AND '):''})`
  const selected=columns.map(k=>groupBy.length&&!groupBy.includes(k)?`SUM(${quote(k)}) AS ${quote(k)}`:quote(k))
  if(groupBy.length)selected.push('COUNT(*) AS "recordCount"')
  const groups=groupBy.length?' GROUP BY '+groupBy.map(quote).join(','):''
  const query=`SELECT ${selected.join(',')} FROM filtered${groups}`
  // A stable tie order makes a capped result repeatable.
  const order=` ORDER BY ${quote(definition.sort)} ${definition.descending?'DESC':'ASC'},${groupBy.length?groupBy.map(quote).join(','):'id'}`
  return db.transaction(()=>{
    const totalsKeys=meta.filter(f=>f.sum).map(f=>f.key)
    const stats=db.prepare(`${base} SELECT COUNT(*) AS recordCount,${totalsKeys.map(k=>`COALESCE(SUM(${quote(k)}),0) AS ${quote(k)}`).join(',')} FROM filtered`).get(...params) as Record<string,number>
    const rowCount=groupBy.length?(db.prepare(`${base} SELECT COUNT(*) AS n FROM (${query})`).get(...params) as {n:number}).n:stats.recordCount
    const rows=db.prepare(base+' '+query+order+' LIMIT ?').all(...params,MAX_ROWS) as ReportResult['rows']
    return {definition,columns:[...columns.map(k=>meta.find(f=>f.key===k)!),...(groupBy.length?[{key:'recordCount',label:source==='inventory'?'Item records':source==='sales'?'Receipts':'Vouchers',type:'number' as const}]:[])],rows,totals:Object.fromEntries(totalsKeys.map(k=>[k,stats[k]])),recordCount:stats.recordCount,rowCount,truncated:rowCount>MAX_ROWS,generatedAt:new Date().toISOString(),periodLabel}
  })()
}
const STORAGE_KEY='reports_saved_v1'
export function savedReports(db:DB):SavedReport[]{const row=db.prepare('SELECT value FROM settings WHERE key=?').get(STORAGE_KEY) as {value:string}|undefined;return row?JSON.parse(row.value):[]}
function writeReports(db:DB,values:SavedReport[]){db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(STORAGE_KEY,JSON.stringify(values))}
export function saveReport(db:DB,body:unknown,id?:string):SavedReport {
  const b=object(body),name=String(b.name??'').trim()
  if(!name||name.length>100)bad('Name your report (up to 100 characters)')
  const definition=cleanReport(b.definition)
  return db.transaction(()=>{
    const values=savedReports(db),index=id?values.findIndex(v=>v.id===id):-1
    if(id&&index<0)throw new ReportError(404,'Saved report not found')
    if(values.some(v=>v.id!==id&&v.name.toLowerCase()===name.toLowerCase()))throw new ReportError(409,'A saved report already uses that name')
    if(!id&&values.length>=100)bad('Up to 100 custom reports can be saved')
    const report:SavedReport={id:id??crypto.randomUUID(),name,definition,updatedAt:new Date().toISOString()}
    if(index<0)values.push(report);else values[index]=report
    writeReports(db,values);return report
  })()
}
export function registerReportRoutes(app:express.Express,db:DB){
  const wrap=(fn:(req:express.Request,res:express.Response)=>void)=>(req:express.Request,res:express.Response)=>{try{fn(req,res)}catch(e){res.status(e instanceof ReportError?e.status:400).json({error:(e as Error).message})}}
  app.post('/api/reports/run',wrap((req,res)=>res.json(runReport(db,req.body))))
  app.get('/api/reports/saved',wrap((_req,res)=>res.json(savedReports(db))))
  app.post('/api/reports/saved',wrap((req,res)=>res.status(201).json(saveReport(db,req.body))))
  app.put('/api/reports/saved/:id',wrap((req,res)=>res.json(saveReport(db,req.body,req.params.id))))
  app.delete('/api/reports/saved/:id',wrap((req,res)=>{db.transaction(()=>{const values=savedReports(db);if(!values.some(v=>v.id===req.params.id))throw new ReportError(404,'Saved report not found');writeReports(db,values.filter(v=>v.id!==req.params.id))})();res.json({ok:true})}))
}
