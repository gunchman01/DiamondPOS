import assert from 'node:assert/strict'
import path from 'node:path'
import crypto from 'node:crypto'
import {openDatabase} from '../src/main/server/db'
import {createSale,readSettings} from '../src/main/server'
import {getQbConfig,saveQbConfig,saveQbLists} from '../src/main/server/quickbooks/store'
import {individualSummaries} from '../src/main/server/quickbooks/summary'
import {taxChoices,taxMappingKey} from '../src/main/server/quickbooks/taxMapping'
import {rq} from '../src/main/server/quickbooks/qbxml'
import {invoiceAdd} from '../src/main/server/quickbooks/accountSync'
import {transactionQueue,queueTransactions} from '../src/main/server/quickbooks/queue'
export function testQbTaxMapping(check:(n:string,f:()=>void)=>void,dir:string){
 const db=openDatabase(path.join(dir,'qb-tax-mapping.db'))
 try{
  const rates=[{id:'store',name:'Store',rate:.1},{id:'exmark',name:'Exmark customer location',rate:.0825},{id:'other',name:'Other authority',rate:.0825}]
  db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES ('tax_rates',?)").run(JSON.stringify(rates))
  db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES ('tax_rate_default','store')").run()
  const c=Number(db.prepare("INSERT INTO customers(first_name,last_name,on_account_enabled) VALUES ('Tax','Customer',1)").run().lastInsertRowid)
  const product=Number(db.prepare("INSERT INTO products(name,type,price_cents,taxable,on_hand) VALUES ('Part','inventory',10000,1,50)").run().lastInsertRowid)
  const labor=Number(db.prepare("INSERT INTO products(name,type,department,price_cents,taxable,on_hand) VALUES ('Labor','service','Service Labor',10000,0,50)").run().lastInsertRowid)
  const make=(taxRateId:string,onAccount=false)=>createSale(db,{requestId:crypto.randomUUID(),customerId:c,tillName:'Test',taxRateId,items:[{productId:product,qty:1},{productId:labor,qty:1}],payments:onAccount?[]:[{method:'cash',amountCents:22000}],onAccount})
  const store=make('store'),exmark=make('exmark'),account=make('exmark',true),other=make('other')
  const date=(db.prepare("SELECT date(created_at,'localtime') AS d FROM sales WHERE id=?").get(store.id) as any).d
  saveQbLists(db,{fetchedAt:new Date().toISOString(),salesTaxItems:[{name:'Local Tax',rate:10},{name:'Exmark Tax',rate:8.25},{name:'Zero',rate:0}]})
  saveQbConfig(db,{enabled:true,startDate:date,salesTaxItem:'Local Tax',defaultIncomeAccount:'Sales',laborIncomeAccount:'Labor Income',taxMappings:{[taxMappingKey('exmark',.0825)]:'Exmark Tax'}})
  const summaries=()=>individualSummaries(db,date,getQbConfig(db),readSettings(db).taxRate,.1,undefined,true)
  check('mixed-location sales use their saved rates and matching QB tax items with no rate reconciliation line',()=>{
   for(const [sale,name] of [[store,'Local Tax'],[exmark,'Exmark Tax'],[account,'Exmark Tax']] as const){const s=summaries().find(v=>v.saleId===sale.id)!;assert.equal(s.salesTaxItem,name);assert.equal(s.taxMappingError,undefined);assert.equal(s.roundingCents,0);assert.ok(rq.addSalesReceipt(s,getQbConfig(db)).includes(`<ItemSalesTaxRef><FullName>${name}</FullName>`));if(sale===account)assert.ok(invoiceAdd(s,getQbConfig(db),date).includes('<ItemSalesTaxRef><FullName>Exmark Tax</FullName>'))}
  })
  check('sales and labor map to separate QB items and income accounts on paid and account sales',()=>{for(const sale of [exmark,account]){const s=summaries().find(v=>v.saleId===sale.id)!;assert.equal(s.lines[0].itemName,'POS General');assert.equal(s.lines[0].account,'Sales');assert.equal(s.lines[1].itemName,'POS Labor');assert.equal(s.lines[1].account,'Labor Income')}})
  check('an unmapped location cannot silently use another authority with the same percentage',()=>{const s=summaries().find(v=>v.saleId===other.id)!;assert.match(s.taxMappingError!,/Map Other authority/);assert.throws(()=>rq.addSalesReceipt(s,getQbConfig(db)),/Map Other/);assert.throws(()=>invoiceAdd(s,getQbConfig(db),date),/Map Other/);assert.match(transactionQueue(db,{ids:[other.id]}).rows[0].reason,/Map Other/);assert.throws(()=>queueTransactions(db,[other.id],.1,.1),/Map Other/)})
  check('wrong-rate, missing or unknown-rate QuickBooks mappings block instead of changing the sale tax',()=>{
   for(const name of ['Local Tax','Missing','Unknown']){saveQbLists(db,{salesTaxItems:[{name:'Local Tax',rate:10},{name:'Unknown',rate:null}]});saveQbConfig(db,{taxMappings:{[taxMappingKey('exmark',.0825)]:name}});const s=summaries().find(v=>v.saleId===exmark.id)!;assert.ok(s.taxMappingError);assert.throws(()=>rq.addSalesReceipt(s,getQbConfig(db)))}
  })
  saveQbLists(db,{salesTaxItems:[{name:'Local Tax',rate:10},{name:'Exmark Tax',rate:8.25}]})
  saveQbConfig(db,{taxMappings:{[taxMappingKey('exmark',.0825)]:'Exmark Tax'}})
  check('historical mappings survive tax-list edits and current default changes without rewriting saved sales',()=>{
   const changed=[{...rates[0],rate:.09},{...rates[1],rate:.07}];db.prepare("UPDATE settings SET value=? WHERE key='tax_rates'").run(JSON.stringify(changed));db.prepare("UPDATE settings SET value='exmark' WHERE key='tax_rate_default'").run();const s=summaries().find(v=>v.saleId===exmark.id)!;assert.equal(s.salesTaxItem,'Exmark Tax');assert.equal(s.taxMappingError,undefined);assert.ok(taxChoices(db,changed).some(t=>t.key===taxMappingKey('exmark',.0825)&&t.name.includes('previous sales')));assert.equal((db.prepare('SELECT tax_rate FROM sales WHERE id=?').get(exmark.id) as any).tax_rate,.0825)
  })
  check('fixing a mapping allows queue retry without creating duplicate export rows',()=>{
   saveQbConfig(db,{taxMappings:{[taxMappingKey('exmark',.0825)]:'Exmark Tax',[taxMappingKey('other',.0825)]:'Exmark Tax'}});assert.equal(queueTransactions(db,[other.id],.1,.1),1);assert.equal(queueTransactions(db,[other.id],.1,.1),1);assert.equal((db.prepare('SELECT COUNT(*) AS n FROM qb_sale_exports WHERE sale_id=?').get(other.id) as any).n,1)
  })
  check('blank labor mapping preserves general sales mapping for existing installations',()=>{saveQbConfig(db,{laborIncomeAccount:''});const s=summaries().find(v=>v.saleId===exmark.id)!;assert.ok(s.lines.every(l=>l.account==='Sales'&&l.itemName==='POS General'))})
 }finally{db.close()}
}
