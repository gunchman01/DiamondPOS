import assert from 'node:assert/strict'
import path from 'node:path'
import crypto from 'node:crypto'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/server/migrations'
import { openDatabase } from '../src/main/server/db'
import { createSale, createApp } from '../src/main/server'
import { saleInstant, saleTimeFromLocal, localSaleTime } from '../src/shared/saleDates'
import { getQbConfig, saveQbLists } from '../src/main/server/quickbooks/store'
import { individualSummaries } from '../src/main/server/quickbooks/summary'
import { accountSteps, invoiceAdd } from '../src/main/server/quickbooks/accountSync'
import { transactionQueue } from '../src/main/server/quickbooks/queue'
import { blankReport } from '../src/shared/reports'
import { runReport } from '../src/main/server/reports'
import { receiptHtml } from '../src/renderer/src/receipt'
import { readSettings } from '../src/main/server'
type Check=(name:string,fn:()=>void)=>void
export async function testSaleDates(check:Check,dir:string){
  check('sale dates validate canonical timestamps and preserve local date/time inputs',()=>{
    for(const x of ['', '2026-02-30T12:00:00.000Z','yesterday',0,'2026-12-01'])assert.throws(()=>saleInstant(x))
    assert.equal(saleInstant(undefined),null);assert.equal(saleInstant('2026-03-15T16:30:00.000Z'),'2026-03-15T16:30:00.000Z')
    const local='2026-03-15T11:30';assert.equal(localSaleTime(saleTimeFromLocal(local)),local)
    assert.throws(()=>saleTimeFromLocal('2026-02-30T11:30'))
  })
  const file=path.join(dir,'sale-dates.db');let db=new Database(file)
  db.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT,applied_at TEXT DEFAULT CURRENT_TIMESTAMP)')
  for(const m of migrations.filter(m=>m.version<=28)){db.exec(m.up);db.prepare('INSERT INTO schema_migrations(version,name) VALUES(?,?)').run(m.version,m.name)}
  db.prepare("INSERT INTO sales(till_name,total_cents,tax_cents,change_cents,created_at) VALUES('Old till',100,0,0,'2025-02-01 15:30:00')").run()
  db.close();db=openDatabase(file)
  check('migration preserves original sale dates and backfills the true historical entry time',()=>{
    const s=db.prepare('SELECT * FROM sales WHERE id=1').get() as any;assert.equal(s.created_at,'2025-02-01 15:30:00');assert.equal(s.recorded_at,s.created_at);assert.equal(s.date_overridden,0)
  })
  db.prepare('UPDATE products SET price_cents=100,taxable=0,on_hand=100 WHERE id=1').run()
  const req=(extra:any={})=>({requestId:crypto.randomUUID(),tillName:'Date test',items:[{productId:1,qty:1,unitPriceCents:90}],payments:[{method:'cash',amountCents:90}],...extra})
  const request=req({saleAt:'2026-03-15T16:30:00.000Z'}),sale=createSale(db,request)
  check('backdated discounted sale keeps selected time, actual entry time and retry identity',()=>{
    assert.equal(sale.createdAt,request.saleAt);assert.ok(sale.recordedAt&&Date.parse(sale.recordedAt)>Date.parse(sale.createdAt));assert.equal(sale.dateOverridden,true)
    assert.equal(sale.totalCents,90);assert.equal(createSale(db,request).id,sale.id)
    assert.equal((db.prepare('SELECT on_hand FROM products WHERE id=1').get() as any).on_hand,99)
    assert.throws(()=>createSale(db,{...request,saleAt:'2026-03-16T16:30:00.000Z'}),/reused/)
  })
  check('ordinary sale defaults to checkout time and invalid override makes no sale or stock change',()=>{
    const n=createSale(db,req());assert.equal(n.createdAt,n.recordedAt);assert.equal(n.dateOverridden,false)
    const before=(db.prepare('SELECT COUNT(*) AS n FROM sales').get() as any).n
    assert.throws(()=>createSale(db,req({saleAt:'bad'})),/valid sale date/)
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM sales').get() as any).n,before)
  })
  const day=(db.prepare("SELECT date(created_at,'localtime') AS d FROM sales WHERE id=?").get(sale.id) as any).d
  check('sales reports expose selected sale time and a separate audit entry timestamp',()=>{
    const report=runReport(db,{...blankReport('sales'),period:'custom',start:day,end:day,columns:['id','day','saleTime','enteredAt','dateOverridden','total'],sort:'id'})
    assert.equal(report.rows[0].day,day);assert.equal(report.rows[0].dateOverridden,1);assert.notEqual(report.rows[0].enteredAt,report.rows[0].saleTime)
    assert.ok(receiptHtml(sale,readSettings(db)).includes('Receipt #'+sale.id))
  })
  saveQbLists(db,{salesTaxItems:[{name:'Test Tax',rate:readSettings(db).taxRate*100}]})
  const cfg={...getQbConfig(db),startDate:'2000-01-01',salesTaxItem:'Test Tax'}
  check('QuickBooks paid receipt summary uses the chosen business day and discounted total',()=>{
    const summaries=individualSummaries(db,day,cfg,0,null,[sale.id]);assert.equal(summaries.length,1);assert.equal(summaries[0].saleDate,day);assert.equal(summaries[0].totalCents,90)
  })
  const future=createSale(db,req({saleAt:'2099-06-01T16:00:00.000Z'}))
  check('future paid sales are excluded from QuickBooks until their chosen day',()=>{
    const row=transactionQueue(db,{ids:[future.id]}).rows[0];assert.equal(row.eligible,false);assert.match(row.reason,/Future/)
  })
  const cid=Number(db.prepare("INSERT INTO customers(first_name,on_account_enabled,account_terms_days) VALUES('Event customer',1,30)").run().lastInsertRowid)
  const charge=createSale(db,req({customerId:cid,onAccount:true,payments:[],saleAt:'2099-06-01T16:00:00.000Z'}))
  check('future account invoices remain pending without being planned for early sync',()=>{
    const steps=accountSteps(db,cfg,0,null,()=>{},()=>{});assert.ok(!steps.some(s=>s.label.startsWith('Plan account invoice')))
    const row=db.prepare('SELECT * FROM account_invoices WHERE sale_id=?').get(charge.id) as any;assert.equal(row.due_date,'2099-07-01');assert.equal(row.status,'pending')
    const sum=individualSummaries(db,'2099-06-01',cfg,0,null,[charge.id],true)[0];assert.ok(invoiceAdd(sum,cfg,row.due_date).includes('<TxnDate>2099-06-01</TxnDate>'))
  })
  db.prepare("UPDATE sales SET created_at=datetime('now','-1 day') WHERE id=?").run(charge.id)
  check('account sync picks up an invoice once its business day is no longer in the future',()=>{
    assert.ok(accountSteps(db,cfg,0,null,()=>{},()=>{}).some(s=>s.label.startsWith('Plan account invoice')))
  })
  const app=createApp(db,{dbFile:file,apiKey:'dates',port:0,appVersion:'0.3.41'}),server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r))
  const url=`http://127.0.0.1:${(server.address() as any).port}`,headers={'X-Api-Key':'dates','Content-Type':'application/json'}
  try{
    const response=await fetch(url+'/api/held',{method:'POST',headers,body:JSON.stringify({requestId:crypto.randomUUID(),saleAt:request.saleAt,tillName:'Date test',items:[{productId:1,qty:1}]})}),held=await response.json()
    const recall=await fetch(url+'/api/held/'+held.id,{headers}),recalled=await recall.json()
    check('held receipts preserve the selected sale date on save and recall',()=>{assert.equal(response.status,201);assert.equal(held.saleAt,request.saleAt);assert.equal(recalled.saleAt,request.saleAt)})
    const posted=createSale(db,req({heldId:held.id,saleAt:recalled.saleAt}));assert.equal(posted.createdAt,request.saleAt)
    const daily=await fetch(url+'/api/reports/daily?date='+day,{headers}),totals=await daily.json()
    check('daily report includes backdated receipts under the selected day',()=>{assert.equal(daily.status,200);assert.equal(totals.totalCents,180)})
  }finally{await new Promise<void>(r=>server.close(()=>r()));db.close()}
}
