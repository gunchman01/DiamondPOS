import crypto from 'node:crypto'
import type express from 'express'
import type {DB} from './db'
import type {WorkOrder,WoLine} from '../../shared/workorders'
import {getCustomer} from './customers'
import {customerDisplayName,taxExemptState,type StoreSettings} from '../../shared/types'
import {warrantyPrices} from '../../shared/warranty'
import {invoiceDue} from './accounts'
export function enrichWarranty(db:DB,wo:WorkOrder,rate:number):WorkOrder{
 const row=db.prepare('SELECT warranty_vendor_id,warranty_payer_id,warranty_claim FROM work_orders WHERE id=?').get(wo.id) as any
 const lines=db.prepare('SELECT id,warranty_cents FROM work_order_lines WHERE work_order_id=? ORDER BY id').all(wo.id) as {id:number;warranty_cents:number}[]
 const coverage=Object.fromEntries(lines.map(l=>[l.id,l.warranty_cents]))
 let revision=crypto.createHash('sha256').update(JSON.stringify({row,coverage,lines:wo.lines.map(l=>({id:l.id,qty:l.qty,unit:l.unitPriceCents,tax:l.taxable}))})).digest('hex')
 let warranty:WorkOrder['warranty']=null
 if(row.warranty_vendor_id&&row.warranty_payer_id){
  const payer=getCustomer(db,row.warranty_payer_id),vendor=db.prepare('SELECT company_name FROM vendors WHERE id=?').get(row.warranty_vendor_id) as any
  const exempt=(id:number)=>{const c=getCustomer(db,id);return !!c&&c.taxExempt&&!!c.taxExemptId&&taxExemptState(c,new Date().toLocaleDateString('en-CA')).kind!=='expired'}
  warranty={vendorId:row.warranty_vendor_id,payerId:row.warranty_payer_id,vendorName:vendor?.company_name??'Warranty vendor',payerName:payer?customerDisplayName(payer):'Missing payer',claimReference:row.warranty_claim,coverage,providerExempt:exempt(row.warranty_payer_id),customerExempt:exempt(wo.customerId),providerNetCents:0,customerNetCents:0,providerTotalCents:0,customerTotalCents:0,customerBalanceCents:0,taxRate:rate}
  const temp={...wo,warranty},prices=warrantyPrices(temp,rate)!
  warranty={...warranty,providerNetCents:prices.provider.subtotalCents,customerNetCents:prices.customer.subtotalCents+prices.customer.creditCents,providerTotalCents:prices.provider.totalCents,customerTotalCents:prices.customer.totalCents+prices.customer.creditCents,customerBalanceCents:prices.customer.totalCents}
 }
 revision=crypto.createHash('sha256').update(JSON.stringify({revision,customerExempt:warranty?.customerExempt,providerExempt:warranty?.providerExempt,feeStatus:wo.feeStatus,feeCents:wo.feeCents})).digest('hex')
 const completed=db.prepare('SELECT customer_sale_id AS customerSaleId,provider_sale_id AS providerSaleId FROM warranty_checkouts WHERE work_order_id=?').get(wo.id) as WorkOrder['warrantySales']
 return {...wo,warranty,warrantyRevision:revision,warrantySales:completed??null}
}
export function registerWarrantyRoutes(app:express.Express,db:DB,settings:(db:DB)=>StoreSettings,getWo:(id:number)=>WorkOrder|null){
 app.post('/api/workorders/:id/warranty',(req,res)=>{
  try{const result=db.transaction(()=>{
   const wo=getWo(Number(req.params.id));if(!wo)throw Error('Work order not found')
   if(wo.saleId||wo.status==='closed'||wo.warrantySales)throw Error('Billed work orders cannot change warranty allocations')
   const b=req.body??{};if(b.revision!==wo.warrantyRevision)throw Error('Work order changed. Reload it before saving warranty coverage.')
   const vendorId=b.vendorId===null?null:Number(b.vendorId),payerId=b.payerId===null?null:Number(b.payerId)
   if(vendorId!==null){
    if(!Number.isSafeInteger(vendorId)||!db.prepare('SELECT 1 FROM vendors WHERE id=? AND active=1').get(vendorId))throw Error('Select an active warranty vendor')
    const payer=getCustomer(db,payerId!);if(!payer||!payer.active||!payer.accountEnabled||payer.id===wo.customerId)throw Error('Choose an active manufacturer/vendor company customer account enabled for account sales, different from the equipment owner')
   }else if(payerId!==null)throw Error('Remove both warranty vendor and billing account together')
   const coverage=b.coverage??{};if(typeof coverage!=='object'||Array.isArray(coverage))throw Error('Invalid warranty coverage')
   if(Object.keys(coverage).some(id=>!wo.lines.some(l=>String(l.id)===id)))throw Error('Warranty line changed. Reload the work order.')
   for(const line of wo.lines){const amount=vendorId===null?0:Number(coverage[line.id]??0);if(!Number.isSafeInteger(amount)||amount<0||amount>Math.round(line.qty*line.unitPriceCents))throw Error(`Warranty coverage for ${line.description} must be between zero and the line amount`);db.prepare('UPDATE work_order_lines SET warranty_cents=? WHERE id=?').run(amount,line.id)}
   const claim=String(b.claimReference??'').trim();if(claim.length>100)throw Error('Claim reference must be100 characters or less')
   db.prepare("UPDATE work_orders SET warranty_vendor_id=?,warranty_payer_id=?,warranty_claim=?,updated_at=datetime('now') WHERE id=?").run(vendorId,payerId,vendorId===null?'':claim,wo.id)
   db.prepare('INSERT INTO work_order_history(work_order_id,note,by_name) VALUES (?,?,?)').run(wo.id,'Warranty payer/coverage updated; customer and warranty provider are billed separately.',String(b.by??'Staff').slice(0,100))
   return getWo(wo.id)
  })();res.json(result)}catch(e){res.status(400).json({error:(e as Error).message})}
 })
 app.get('/api/reports/warranty',(req,res)=>{
  const from=String(req.query.from??''),to=String(req.query.to??'')
  if([from,to].some(v=>v&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v))||(from&&to&&from>to))return res.status(400).json({error:'Enter a valid date range'})
  const rows=db.prepare(`SELECT w.id,COALESCE(x.vendor_id,w.warranty_vendor_id) AS vendorId,v.company_name AS vendorName,w.created_at,w.status,x.customer_sale_id,x.provider_sale_id,x.claim_reference
   FROM work_orders w LEFT JOIN warranty_checkouts x ON x.work_order_id=w.id JOIN vendors v ON v.id=COALESCE(x.vendor_id,w.warranty_vendor_id)
   WHERE (?='' OR date(w.created_at,'localtime')>=?) AND (?='' OR date(w.created_at,'localtime')<=?) ORDER BY v.company_name,w.id DESC LIMIT 10001`).all(from,from,to,to) as any[]
  if(rows.length>10000)return res.status(400).json({error:'More than 10,000 warranty jobs. Narrow the date range.'})
  res.json(rows.map(r=>{const wo=getWo(r.id)!;const sale=r.provider_sale_id?db.prepare('SELECT total_cents FROM sales WHERE id=?').get(r.provider_sale_id) as any:null;const invoice=r.provider_sale_id?db.prepare('SELECT status FROM account_invoices WHERE sale_id=?').get(r.provider_sale_id) as any:null
   return {workOrderId:wo.id,number:wo.number,vendorId:r.vendorId,vendorName:r.vendorName,customerName:wo.customerName,problem:wo.problem,workDone:wo.workDone||wo.diagnosis,coveredLines:wo.lines.filter(l=>(wo.warranty?.coverage[l.id]??0)>0).map(l=>({description:l.description,amountCents:wo.warranty!.coverage[l.id]})),unit:[wo.unit.brand,wo.unit.model,wo.unit.serial].filter(Boolean).join(' '),date:r.created_at.replace(' ','T')+'Z',status:wo.cancellation?'cancelled':wo.status,claimReference:r.claim_reference??wo.warranty?.claimReference??'',providerSaleId:r.provider_sale_id??null,customerSaleId:r.customer_sale_id??null,amountCents:wo.cancellation?0:(sale?.total_cents??wo.warranty?.providerTotalCents??0),balanceCents:r.provider_sale_id?invoiceDue(db,r.provider_sale_id):null,syncStatus:wo.cancellation?'Cancelled':invoice?.status??'Not billed'}
  }))
 })
}
