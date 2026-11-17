import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import { openDatabase } from '../src/main/server/db'
import { createApp, createSale } from '../src/main/server'
import { endOfDayReport, saveEndOfDay } from '../src/main/server/endOfDay'
import { reconcileDrawer } from '../src/shared/endOfDay'
import { receiveAccountPayment } from '../src/main/server/accounts'
import { voidSale } from '../src/main/server/voids'
import { eodHtml } from '../src/renderer/src/endOfDayPrint'
import { endOfDayReport as report } from '../src/main/server/endOfDay'
import type { SaleRequest } from '../src/shared/types'
type Check=(name:string,fn:()=>void)=>void
export async function testEndOfDay(check:Check,dir:string){
 const file=path.join(dir,'end-of-day.db'),db=openDatabase(file)
 db.prepare('UPDATE products SET price_cents=100,taxable=0,on_hand=200 WHERE id=1').run()
 const date=(db.prepare("SELECT date('now','localtime') AS d").get() as any).d
 const request=(extra:any={}):SaleRequest=>({requestId:crypto.randomUUID(),tillName:'Till A',items:[{productId:1,qty:1}],payments:[{method:'cash',amountCents:100}],...extra})
 const cash=createSale(db,request({payments:[{method:'cash',amountCents:200}]})) // 100 change
 const card=createSale(db,request({tillName:'Till B',items:[{productId:1,qty:1,unitPriceCents:90}],payments:[{method:'card',amountCents:90,cardBrand:'visa'}]}))
 const checkSale=createSale(db,request({payments:[{method:'check',amountCents:100,reference:'0007'}]}))
 const cid=Number(db.prepare("INSERT INTO customers(first_name,on_account_enabled,account_terms_days) VALUES('Account',1,30)").run().lastInsertRowid)
 createSale(db,request({onAccount:true,customerId:cid,payments:[]}))
 receiveAccountPayment(db,cid,{requestId:crypto.randomUUID(),amountCents:50,method:'cash',by:'Staff',till:'Till A'})
 const refunded=createSale(db,request({items:[],returns:[{saleItemId:(db.prepare('SELECT id FROM sale_items WHERE sale_id=?').get(checkSale.id) as any).id,qty:1,reason:'Test return',restock:true}],payments:[{method:'check',amountCents:-100,reference:'0007'}]}))
 let r=report(db,date)
 check('end-of-day reports separate net sales, returns, accounts and actual money without duplicate revenue',()=>{
  assert.equal(r.business.receiptCount,5);assert.equal(r.business.refundReceiptCount,1)
  assert.equal(r.business.grossCents,390);assert.equal(r.business.returnsCents,100);assert.equal(r.business.netCents,290)
  assert.equal(r.business.accountChargesCents,100);assert.equal(r.accountPaymentsCents,50);assert.equal(r.netPaymentsCents,240)
  assert.equal(r.tenders.find(x=>x.method==='cash')!.netCents,150);assert.equal(r.tenders.find(x=>x.method==='check')!.outCents,100)
  assert.equal(r.cards.find(x=>x.method==='visa')!.netCents,90);assert.equal(r.business.reductionsCents,10)
  assert.ok(r.events.some(e=>e.reference==='0007'))
 })
 check('workstation filtering isolates sales, money and card-brand activity',()=>{
  const b=report(db,date,'Till B');assert.equal(b.business.receiptCount,1);assert.equal(b.netPaymentsCents,90);assert.equal(b.tenders.find(x=>x.method==='cash')!.netCents,0)
 })
 const counts={openingCents:10000,countedCashCents:10000,leaveCents:5000,extraInCents:100,extraOutCents:250,cardActualCents:90,checkActualCents:0,by:'Staff',notes:'Other cash movements'}
 check('drawer reconciliation uses opening cash, net cash movement, other in/out, counted cash and leave amount',()=>{
  const x=reconcileDrawer(r,counts);assert.equal(x.expectedCashCents,10000);assert.equal(x.cashOverShortCents,0);assert.equal(x.depositCashCents,5000);assert.equal(x.cardOverShortCents,0);assert.equal(x.checkOverShortCents,0)
 })
 const closeReq={requestId:crypto.randomUUID(),date,till:null,sourceHash:r.sourceHash,inputs:counts},saved=saveEndOfDay(db,closeReq)
 check('closeout saves a fixed snapshot and retries without creating another record',()=>{
  assert.equal(saveEndOfDay(db,closeReq).id,saved.id);assert.equal((db.prepare('SELECT COUNT(*) AS n FROM end_day_closeouts').get() as any).n,1)
  assert.throws(()=>saveEndOfDay(db,{...closeReq,inputs:{...counts,countedCashCents:9000}}),/reused/)
 })
 const back=createSale(db,request({saleAt:'2020-01-01T17:00:00.000Z'}))
 r=report(db,date)
 check('backdated receipt revenue uses its business day while current cash count includes actual payment today',()=>{
  assert.equal(r.business.receiptCount,5);assert.equal(r.netPaymentsCents,340);assert.equal(report(db,'2020-01-01').business.totalCents,100)
  assert.equal(saved.report.netPaymentsCents,240)
  assert.throws(()=>saveEndOfDay(db,{...closeReq,requestId:crypto.randomUUID()}),/Transactions changed/)
 })
 voidSale(db,back.id,{reason:'Test cross-day correction',by:'Staff',till:'Till B',paymentNote:'Cash returned at B',paymentConfirmed:true,legacyStockConfirmed:true})
 check('void money reversal belongs to the actual void till/day and does not erase posted cash history',()=>{
  const all=report(db,date),a=report(db,date,'Till A'),b=report(db,date,'Till B');assert.equal(all.netPaymentsCents,240)
  assert.equal(a.tenders.find(t=>t.method==='cash')!.netCents,250);assert.equal(b.tenders.find(t=>t.method==='cash')!.netCents,-100)
  assert.equal(all.voids.length,1);assert.equal(report(db,'2020-01-01').business.receiptCount,0)
 })
 check('printed report escapes names/notes and labels sales-date versus cash-entry-date bases',()=>{
  const html=eodHtml(saved.report,'<script>bad</script>',{...counts,notes:'<img src=x onerror=alert(1)>'},saved.reconciliation,saved.id)
  assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>bad'));assert.ok(html.includes('actual entry / refund date'));assert.ok(html.includes('&lt;img'))
 })
 check('closeout validation rejects invalid dates, invalid counts, missing name and unexplained cash adjustments',()=>{
  assert.throws(()=>report(db,'2026-02-30'),/valid report date/)
  const current=report(db,date),base={requestId:crypto.randomUUID(),date,till:null,sourceHash:current.sourceHash,inputs:counts}
  for(const patch of [{countedCashCents:-1},{countedCashCents:0,leaveCents:1},{by:''},{notes:''},{cardActualCents:NaN}])assert.throws(()=>saveEndOfDay(db,{...base,inputs:{...counts,...patch}}))
 })
 createSale(db,request({items:[],returns:[{saleItemId:(db.prepare('SELECT id FROM sale_items WHERE sale_id=?').get(card.id) as any).id,qty:1,reason:'Discounted return',restock:true}],payments:[{method:'card',amountCents:-90,cardBrand:'visa'}]}))
 check('returned discounted merchandise reverses the known reduction and reconciles card-brand refunds',()=>{
  const r=report(db,date);assert.equal(r.business.reductionsCents,10);assert.equal(r.business.reductionsReturnedCents,10);assert.equal(r.business.reductionsNetCents,0);assert.equal(r.cards.find(t=>t.method==='visa')!.netCents,0)
 })
 db.prepare('UPDATE products SET taxable=1 WHERE id=1').run()
 const taxed=createSale(db,request({payments:[{method:'cash',amountCents:1000}]}))
 check('tax and change reconcile to receipts rather than counting tendered cash as income',()=>{
  const r=report(db,date);assert.equal(r.business.taxCents,taxed.taxCents);assert.equal(r.business.netCents+r.business.taxCents,r.business.totalCents);assert.equal(r.tenders.reduce((n,t)=>n+t.netCents,0),r.netPaymentsCents)
 })
 db.prepare('UPDATE products SET taxable=0 WHERE id=1').run()
 const beforeFuture=report(db,date)
 createSale(db,request({saleAt:'2099-06-01T16:00:00.000Z'}))
 check('future-dated completed sales still affect the actual cash day without moving business revenue into today',()=>{
  const after=report(db,date);assert.equal(after.business.totalCents,beforeFuture.business.totalCents);assert.equal(after.netPaymentsCents,beforeFuture.netPaymentsCents+100);assert.equal(report(db,'2099-06-01').business.totalCents,100)
 })
 const app=createApp(db,{dbFile:file,apiKey:'eod',port:0,appVersion:'0.3.42'}),server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve))
 try{
  const url=`http://127.0.0.1:${(server.address() as any).port}`,headers={'X-Api-Key':'eod','Content-Type':'application/json'}
  const denied=await fetch(url+'/api/end-of-day?date='+date),ok=await fetch(url+'/api/end-of-day?date='+date,{headers}),tills=await fetch(url+'/api/end-of-day/tills',{headers}),history=await fetch(url+'/api/end-of-day/closeouts?date='+date,{headers})
  check('end-of-day endpoints are paired and expose till selection and saved immutable snapshots',()=>{assert.equal(denied.status,401);assert.equal(ok.status,200);assert.equal(history.status,200)})
  assert.deepEqual(await tills.json(),['Till A','Till B']);const old=await history.json();assert.equal(old[0].report.netPaymentsCents,240)
  const current=await ok.json();const post=await fetch(url+'/api/end-of-day/closeouts',{method:'POST',headers,body:JSON.stringify({requestId:crypto.randomUUID(),date,till:null,sourceHash:current.sourceHash,inputs:counts})})
  check('saving through the API returns a numbered closeout without printing or changing sales',()=>assert.equal(post.status,201))
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));db.close()}
}
