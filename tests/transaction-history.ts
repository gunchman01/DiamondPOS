import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import {openDatabase} from '../src/main/server/db'
import {createApp,createSale,getSale} from '../src/main/server'
import {voidSale} from '../src/main/server/voids'
import {receiveAccountPayment} from '../src/main/server/accounts'
import {returnableSale} from '../src/main/server/returns'
import {transactionHistory,accountPaymentDetail} from '../src/main/server/transactionHistory'
export async function testTransactionHistory(check:(n:string,f:()=>void)=>void,dir:string){
 const file=path.join(dir,'transaction-history.db'),db=openDatabase(file)
 const customer=Number(db.prepare("INSERT INTO customers(first_name,last_name,on_account_enabled,company) VALUES ('History','Customer',1,'Literal %_ Company')").run().lastInsertRowid)
 const product=Number(db.prepare("INSERT INTO products(name,type,price_cents,on_hand,taxable) VALUES ('History item','inventory',1000,500,0)").run().lastInsertRowid)
 const make=(onAccount=false)=>createSale(db,{requestId:crypto.randomUUID(),customerId:customer,tillName:'History till',items:[{productId:product,qty:1}],payments:onAccount?[]:[{method:'cash',amountCents:2000}],onAccount})
 const ordinary=make(),voided=make(),original=make(),wo=make(),invoice=make(true),exchangeOriginal=make()
 voidSale(db,voided.id,{reason:'Test void',by:'Staff',till:'History till',paymentNote:'Returned cash separately',paymentConfirmed:true,legacyStockConfirmed:true})
 const returned=returnableSale(db,original.id)!,refund=createSale(db,{requestId:crypto.randomUUID(),customerId:customer,tillName:'History till',items:[],returns:[{saleItemId:returned.lines[0].saleItemId,qty:1,reason:'Other',restock:true}],payments:[{method:'cash',amountCents:-1000}]})
 const exchangeReceipt=returnableSale(db,exchangeOriginal.id)!,exchange=createSale(db,{requestId:crypto.randomUUID(),customerId:customer,tillName:'History till',items:[{productId:product,qty:1}],returns:[{saleItemId:exchangeReceipt.lines[0].saleItemId,qty:1,reason:'Other',restock:true}],payments:[]})
 const unit=Number(db.prepare("INSERT INTO customer_units(customer_id,model) VALUES (?,'Test mower')").run(customer).lastInsertRowid),woId=Number(db.prepare("INSERT INTO work_orders(customer_id,unit_id,status) VALUES (?,?,'closed')").run(customer,unit).lastInsertRowid)
 db.prepare('UPDATE sales SET work_order_id=? WHERE id=?').run(woId,wo.id)
 const payment=receiveAccountPayment(db,customer,{requestId:crypto.randomUUID(),amountCents:500,method:'check',reference:'CHECK123',by:'Staff',till:'Back office'})
 const keys=(rows:ReturnType<typeof transactionHistory>['rows'])=>rows.map(r=>`${r.source}:${r.id}`)
 try{
  const all=transactionHistory(db),find=(id:number)=>all.rows.find(r=>r.source==='sale'&&r.id===id)!
  check('history unifies all checkout types and payments on account without payment ID collisions',()=>{assert.equal(all.total,9);assert.equal(new Set(keys(all.rows)).size,9);assert.equal(find(ordinary.id).kind,'sale');assert.equal(find(voided.id).kind,'void');assert.equal(find(refund.id).kind,'refund');assert.equal(find(exchange.id).kind,'exchange');assert.equal(find(wo.id).kind,'work_order');assert.equal(find(invoice.id).kind,'account_sale');assert.ok(all.rows.some(r=>r.source==='account_payment'&&r.id===payment.paymentId))})
  check('history preserves signed refunds, zero exchanges, original void amount and actual sale total rather than cash tender',()=>{assert.equal(find(refund.id).totalCents,-1000);assert.equal(find(exchange.id).totalCents,0);assert.equal(find(voided.id).totalCents,1000);assert.equal(find(ordinary.id).totalCents,1000);assert.equal(find(invoice.id).methods,'account');assert.equal(find(wo.id).workOrderId,woId)})
  check('each sales-history row resolves to its actual saved receipt, including void audit and work-order reference',()=>{for(const r of all.rows.filter(r=>r.source==='sale'))assert.equal(getSale(db,r.id)!.totalCents,r.totalCents);assert.equal(getSale(db,voided.id)?.void?.reason,'Test void');assert.equal(getSale(db,wo.id)?.workOrderId,woId)})
  const detail=accountPaymentDetail(db,payment.paymentId)!
  check('account payment detail retains recorded amount, method and allocations with invoice links and excludes retry secrets',()=>{assert.equal(detail.amountCents,500);assert.equal(detail.reference,'CHECK123');assert.equal(detail.tillName,'Back office');assert.equal(detail.allocations[0].saleId,invoice.id);assert.equal(detail.allocations[0].amountCents,500);assert.ok(!JSON.stringify(detail).includes('request_hash'));assert.equal(accountPaymentDetail(db,999999),null)})
  check('type and literal customer/receipt/work-order/reference search filters include account payments',()=>{assert.equal(transactionHistory(db,{kind:'void'}).total,1);assert.equal(transactionHistory(db,{kind:'account_payment',search:'CHECK123'}).total,1);assert.equal(transactionHistory(db,{search:`AP #${payment.paymentId}`}).total,1);assert.equal(transactionHistory(db,{search:`WO-${String(woId).padStart(6,'0')}`}).total,1);assert.equal(transactionHistory(db,{search:'History Customer'}).total,9);assert.equal(transactionHistory(db,{search:'%_'}).total,0)})
  db.prepare("UPDATE sales SET created_at='2026-01-02 12:00:00' WHERE id=?").run(ordinary.id)
  db.prepare("UPDATE account_payments SET created_at='2026-01-02 13:00:00' WHERE id=?").run(payment.paymentId)
  check('date range includes both sale and account payment dates and preserves original sale date',()=>{const result=transactionHistory(db,{from:'2026-01-02',to:'2026-01-02'});assert.equal(result.total,2);assert.ok(result.rows.every(r=>r.createdAt.startsWith('2026-01-02')));assert.equal(result.rows[0].source,'account_payment')})
  check('invalid filters and dates are rejected safely',()=>{for(const opts of [{page:0},{page:1.5},{kind:'injected'},{from:'2026-02-30'},{from:'2026-05-02',to:'2026-05-01'}])assert.throws(()=>transactionHistory(db,opts))})
  db.prepare('UPDATE customers SET track_as_company=1 WHERE id=?').run(customer)
  check('company customers and escaped wildcard search work without treating percent/underscore as wildcards',()=>{assert.equal(transactionHistory(db,{search:'%_ Company'}).total,9);assert.equal(transactionHistory(db).rows[0].customerName,'Literal %_ Company')})
  for(let i=0;i<64;i++)db.prepare("INSERT INTO sales(till_name,total_cents,tax_cents,change_cents,created_at) VALUES ('Old till',100,0,0,'2025-01-01 12:00:00')").run()
  const beforeStock=(db.prepare('SELECT on_hand AS n FROM products WHERE id=?').get(product) as any).n,beforeAlloc=(db.prepare('SELECT COUNT(*) AS n FROM account_allocations').get() as any).n
  check('bounded pagination is stable with tied timestamps and neither drops nor repeats sale/payment rows',()=>{const first=transactionHistory(db),second=transactionHistory(db,{page:2});assert.equal(first.total,73);assert.equal(first.rows.length,50);assert.equal(second.rows.length,23);assert.equal(new Set([...keys(first.rows),...keys(second.rows)]).size,73);assert.equal((db.prepare('SELECT on_hand AS n FROM products WHERE id=?').get(product) as any).n,beforeStock);assert.equal((db.prepare('SELECT COUNT(*) AS n FROM account_allocations').get() as any).n,beforeAlloc)})
  const app=createApp(db,{dbFile:file,apiKey:'history-test',port:0,appVersion:'test'}),server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as any).port}`
  try{
   const call=(url:string,paired=true)=>fetch(base+url,{headers:paired?{'X-Api-Key':'history-test'}:{}})
   const denied=await call('/api/transaction-history',false),deniedPayment=await call(`/api/transaction-history/account-payments/${payment.paymentId}`,false),valid=await call('/api/transaction-history?kind=refund'),validData=await valid.json(),pay=await call(`/api/transaction-history/account-payments/${payment.paymentId}`),payData=await pay.json(),bad=await call('/api/transaction-history?from=2026-02-30'),missing=await call('/api/transaction-history/account-payments/999999'),badId=await call('/api/transaction-history/account-payments/-1')
   check('history and payment-detail HTTP endpoints require pairing and validate queries/IDs',()=>{assert.equal(denied.status,401);assert.equal(deniedPayment.status,401);assert.equal(valid.status,200);assert.equal(validData.rows[0].id,refund.id);assert.equal(pay.status,200);assert.equal(payData.allocations[0].saleId,invoice.id);assert.equal(bad.status,400);assert.equal(missing.status,404);assert.equal(badId.status,400)})
  }finally{await new Promise<void>(r=>server.close(()=>r()))}
 }finally{db.close()}
}
