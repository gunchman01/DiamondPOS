import assert from 'node:assert/strict'
import path from 'node:path'
import crypto from 'node:crypto'
import {openDatabase} from '../src/main/server/db'
import {createSale,readSettings} from '../src/main/server'
import {getQbConfig, saveQbLists} from '../src/main/server/quickbooks/store'
import {dailySummaries,individualSummaries} from '../src/main/server/quickbooks/summary'
import {rq} from '../src/main/server/quickbooks/qbxml'
export function testQbGeneral(check:(name:string,fn:()=>void)=>void,dir:string){
 const db=openDatabase(path.join(dir,'qb-general.db'))
 try{
  db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES ('tax_rate','0.1')").run()
  const customer=Number(db.prepare("INSERT INTO customers(first_name,last_name,on_account_enabled) VALUES ('General','Customer',1)").run().lastInsertRowid)
  const product=(department:string,taxable:number)=>Number(db.prepare("INSERT INTO products(name,type,department,price_cents,taxable,on_hand) VALUES (?,'inventory',?,100,?,10)").run(department+' Item',department,taxable).lastInsertRowid)
  const a=product('Husqvarna',1),b=product('STIHL',0),c=product('Service Labor',1)
  const cash=createSale(db,{requestId:crypto.randomUUID(),customerId:customer,tillName:'Test',items:[{productId:a,qty:1},{productId:b,qty:1},{productId:c,qty:1}],payments:[{method:'cash',amountCents:320}]})
  const account=createSale(db,{requestId:crypto.randomUUID(),customerId:customer,tillName:'Test',items:[{productId:a,qty:1},{productId:c,qty:1}],payments:[],onAccount:true})
  saveQbLists(db,{salesTaxItems:[{name:'State Tax',rate:10}]})
  const cfg={...getQbConfig(db),salesTaxItem:'State Tax',defaultIncomeAccount:'Sales Income',departmentAccounts:{Husqvarna:'Old Vendor Income',STIHL:'Other Old Income','Service Labor':'Old Labor Income'}}
  const date=(db.prepare("SELECT date(created_at,'localtime') AS d FROM sales WHERE id=?").get(cash.id) as any).d
  const summaries=individualSummaries(db,date,cfg,0.1,0.1,undefined,true)
  check('cash and account export lines use POS General and default income despite saved vendor/service overrides',()=>{
   for(const sale of [cash,account]){const s=summaries.find(v=>v.saleId===sale.id)!;assert.ok(s);assert.ok(s.lines.every(l=>l.itemName==='POS General'&&l.account==='Sales Income'&&l.department===''));assert.equal(s.lines.reduce((n,l)=>n+l.amountCents,0)+s.taxCents-s.roundingCents,sale.totalCents)}
   assert.deepEqual((db.prepare('SELECT department FROM products WHERE id IN (?,?,?) ORDER BY id').all(a,b,c) as {department:string}[]).map(i=>i.department),['Husqvarna','STIHL','Service Labor'])
  })
  check('QuickBooks receipt XML references only the generic sales item while retaining customer and totals',()=>{
   const s=summaries.find(v=>v.saleId===cash.id)!,xml=rq.addSalesReceipt(s,cfg)
   assert.ok(xml.includes('<FullName>POS General</FullName>'));assert.ok(!xml.includes('<FullName>POS Husqvarna</FullName>'));assert.ok(!xml.includes('<FullName>POS STIHL</FullName>'));assert.ok(xml.includes(s.customerName!))
  })
  const daily=dailySummaries(db,date,cfg,0.1,0.1)
  check('legacy daily summaries group taxable and nontaxable sales under POS General without losing totals',()=>{
   assert.ok(daily.length);for(const s of daily){assert.ok(s.lines.every(l=>l.itemName==='POS General'&&l.account==='Sales Income'));assert.equal(s.lines.reduce((n,l)=>n+l.amountCents,0)+s.taxCents-s.roundingCents,s.totalCents)}
  })
 }finally{db.close()}
}
