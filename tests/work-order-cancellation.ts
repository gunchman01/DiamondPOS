import assert from 'node:assert/strict'
import path from 'node:path'
import crypto from 'node:crypto'
import {openDatabase} from '../src/main/server/db'
import {createApp,createSale,readSettings} from '../src/main/server'
import {loadWorkOrder} from '../src/main/server/workorders'
import {snapshot,estimateHash,applyDecision} from '../src/main/server/approvals'
import {runAudience} from '../src/main/server/marketing/audience'
import {fullPageSaleHtml,workOrderHtml} from '../src/renderer/src/printTemplates'
export async function testWorkOrderCancellation(check:(n:string,f:()=>void)=>void,dir:string){
 const file=path.join(dir,'cancel-work-order.db'),db=openDatabase(file)
 const customer=Number(db.prepare("INSERT INTO customers(first_name,email,ok_to_email) VALUES ('Cancel customer','cancel@example.com',1)").run().lastInsertRowid)
 const unit=Number(db.prepare("INSERT INTO customer_units(customer_id,category,unit_type,brand) VALUES (?,'mower','Mower','Test')").run(customer).lastInsertRowid)
 const product=Number(db.prepare("INSERT INTO products(name,type,on_hand,price_cents,taxable) VALUES ('Reserved part','inventory',20,100,0)").run().lastInsertRowid)
 const ticket=(status='needs_estimate',feeStatus='unpaid')=>Number(db.prepare('INSERT INTO work_orders(customer_id,unit_id,status,fee_status,fee_cents) VALUES (?,?,?,?,1000)').run(customer,unit,status,feeStatus).lastInsertRowid)
 const wo=(id:number)=>loadWorkOrder(db,id,readSettings(db).taxRate)!
 const app=createApp(db,{dbFile:file,apiKey:'cancel-test',port:0,appVersion:'0.3.74'}),server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r))
 const base=`http://127.0.0.1:${(server.address() as any).port}`
 const call=async(url:string,b?:unknown,staff=true)=>{const r=await fetch(base+url,{method:b===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(staff?{'X-Api-Key':'cancel-test'}:{})},body:b===undefined?undefined:JSON.stringify(b)});return {status:r.status,data:await r.json()}}
 const cancel=(id:number,extra={})=>call(`/api/workorders/${id}/cancel`,{reason:'Customer cancelled repair',by:'Test cashier',stockConfirmed:true,...extra})
 try{
  const id=ticket();await call(`/api/workorders/${id}/lines`,{kind:'part',productId:product,qty:3})
  const stock=()=>db.prepare('SELECT on_hand FROM products WHERE id=?').get(product).on_hand
  const beforeSales=db.prepare('SELECT COUNT(*) AS n FROM sales').get().n
  const denied=await call(`/api/workorders/${id}/cancel`,{reason:'Forged',by:'Other'},false),reason=await cancel(id,{reason:''}),unconfirmed=await cancel(id,{stockConfirmed:false})
  check('cancellation requires staff pairing, a reason and review of reserved parts before changing inventory',()=>{assert.equal(denied.status,401);assert.equal(reason.status,409);assert.equal(unconfirmed.status,409);assert.equal(stock(),17);assert.equal(wo(id).status,'needs_estimate');assert.equal(wo(id).cancellation,null)})
  const saved=await cancel(id),again=await cancel(id)
  check('cancelling closes ticket, releases reserved stock exactly once and retains lines, unit and reason',()=>{assert.equal(saved.status,200);assert.equal(again.status,200);assert.equal(stock(),20);assert.equal(wo(id).status,'closed');assert.equal(wo(id).balanceDueCents,0);assert.equal(wo(id).feeStatus,'none');assert.equal(wo(id).lines[0].qty,3);assert.equal(wo(id).lines[0].stockTaken,0);assert.equal(wo(id).unit.id,unit);assert.equal(wo(id).cancellation!.reason,'Customer cancelled repair');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sales').get().n,beforeSales);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM work_order_cancellations WHERE work_order_id=?').get(id).n,1)})
  const reopen=await call(`/api/workorders/${id}/status`,{status:'approved'}),line=await call(`/api/workorders/${id}/lines`,{kind:'part',productId:product,qty:1})
  check('cancelled ticket cannot reopen, add parts or check out after cancellation',()=>{assert.equal(reopen.status,409);assert.equal(line.status,409);for(const mode of ['repair','fee','credit'] as const)assert.throws(()=>createSale(db,{requestId:crypto.randomUUID(),tillName:'Test',items:[],payments:[],workOrder:{id,mode}}));assert.equal(stock(),20)})
  const open=await call('/api/workorders?status=open'),picked=await call('/api/workorders?status=closed'),cancelled=await call('/api/workorders?status=cancelled'),counts=await call('/api/workorders/counts'),equipment=await call(`/api/customers/${customer}/equipment`)
  check('cancelled tickets have their own list/count and remain correctly identified in customer history',()=>{assert.ok(!open.data.some((w:any)=>w.id===id));assert.ok(!picked.data.some((w:any)=>w.id===id));assert.equal(cancelled.data[0].id,id);assert.equal(cancelled.data[0].cancelled,true);assert.equal(counts.data.cancelled,1);assert.equal(counts.data.closed,0);assert.equal(equipment.data[0].workOrders[0].cancelled,true);assert.match(workOrderHtml(wo(id),readSettings(db),null,null),/CANCELLED WORK ORDER/);assert.equal(runAudience(db,{source:'service',serviceCompletedOnly:false,serviceCategory:'any',rules:[]}).recipients.length,0)})
  const paid=ticket(),fee=createSale(db,{requestId:crypto.randomUUID(),tillName:'Test',items:[],payments:[{method:'cash',amountCents:100000}],workOrder:{id:paid,mode:'fee'}})
  const payment=db.prepare('SELECT * FROM payments WHERE sale_id=?').get(fee.id),saleRow=db.prepare('SELECT * FROM sales WHERE id=?').get(fee.id)
  const feeCancelled=await cancel(paid)
  check('paid estimate fee and its receipt/payment remain unchanged with no automatic refund or extra sale',()=>{assert.equal(feeCancelled.status,200);assert.equal(wo(paid).feeStatus,'paid');assert.equal(wo(paid).feeSaleId,fee.id);assert.equal(wo(paid).cancellation!.feeSaleId,fee.id);assert.deepEqual(db.prepare('SELECT * FROM payments WHERE sale_id=?').get(fee.id),payment);assert.deepEqual(db.prepare('SELECT * FROM sales WHERE id=?').get(fee.id),saleRow);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sales').get().n,beforeSales+1);assert.equal(wo(paid).balanceDueCents,0)})
  const waiting=ticket('waiting_customer','none'),estimateId=crypto.randomUUID(),waitingWo=wo(waiting),hash=estimateHash(waitingWo)
  db.prepare("INSERT INTO work_order_estimates(id,work_order_id,revision,hash,snapshot_json,state,service_id,sent_at) VALUES (?,?,1,?,?,'pending','test',?)").run(estimateId,waiting,hash,JSON.stringify(snapshot(waitingWo)),new Date().toISOString())
  await cancel(waiting);applyDecision(db,{id:estimateId,hash,decision:'approved',name:'Late customer',comment:'Old link',at:new Date().toISOString()})
  check('cancellation supersedes pending approvals and a late approval cannot restart the repair',()=>{assert.equal(wo(waiting).status,'closed');assert.equal(db.prepare('SELECT state FROM work_order_estimates WHERE id=?').get(estimateId).state,'superseded');assert.equal(wo(waiting).estimate!.due,false);assert.equal(db.prepare('SELECT remote_cancelled FROM work_order_estimates WHERE id=?').get(estimateId).remote_cancelled,0)})
  const complete=ticket('ready_pickup','none');await call(`/api/workorders/${complete}/lines`,{kind:'labor',qty:1,unitPriceCents:100,taxable:false});const completeSale=createSale(db,{requestId:crypto.randomUUID(),tillName:'Test',items:[],payments:[{method:'cash',amountCents:100}],workOrder:{id:complete,mode:'repair'}})
  const completed=await cancel(complete)
  check('completed work-order sales cannot be cancelled or removed from financial history',()=>{assert.equal(completed.status,409);assert.equal(wo(complete).saleId,completeSale.id);assert.equal(wo(complete).cancellation,null);assert.equal(db.prepare('SELECT status FROM sales WHERE id=?').get(completeSale.id).status,'completed')})
  const declined=ticket('not_fixed','none');db.prepare("INSERT INTO work_order_lines(work_order_id,kind,product_id,description,qty,stock_taken) VALUES (?,'part',?,'Already returned',2,0)").run(declined,product);await cancel(declined)
  check('cancelling a declined repair does not return parts a second time',()=>assert.equal(stock(),20))
  const kioskWo=ticket('needs_estimate','none');db.prepare("INSERT INTO kiosks(name,till_name,token) VALUES ('Cancel kiosk','Cancel till','cancel-token')").run()
  const abort=new AbortController(),stream=await fetch(base+'/kiosk/api/events?intake=1&review=2&token=cancel-token',{signal:abort.signal}),reader=stream.body!.getReader();await reader.read()
  try{const session=await call(`/api/workorders/${kioskWo}/intake-kiosk`,{tillName:'Cancel till'});await cancel(kioskWo);const status=await call(`/api/kiosk-sessions/${session.data.id}`),submit=await call('/kiosk/api/repair-submit',{token:'cancel-token',sessionId:session.data.id,answers:{}},false);check('cancelling a ticket also ends its pending repair questionnaire',()=>{assert.equal(status.data.status,'cancelled');assert.equal(submit.status,409);assert.equal(wo(kioskWo).intakes!.length,0)})}finally{abort.abort();await reader.cancel().catch(()=>{})}
 }finally{await new Promise<void>(r=>server.close(()=>r()));db.close()}
 const reopened=openDatabase(file);try{check('cancellation reason and released-stock audit survive reopening the database',()=>{const record=reopened.prepare('SELECT * FROM work_order_cancellations ORDER BY work_order_id LIMIT 1').get();assert.equal(record.by_name,'Test cashier');assert.equal(JSON.parse(record.stock_json)[0].stock_taken,3)})}finally{reopened.close()}
}
