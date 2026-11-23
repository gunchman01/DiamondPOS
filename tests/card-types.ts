import { defaultDesigns,normaliseDesigns } from '../src/shared/printDesigns'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import { openDatabase } from '../src/main/server/db'
import { createSale,readSettings } from '../src/main/server'
import { paymentLabel,CARD_TYPES } from '../src/shared/types'
import { returnableSale } from '../src/main/server/returns'
import { receiptHtml } from '../src/renderer/src/receipt'
import { endOfDayReport } from '../src/main/server/endOfDay'
import { getQbConfig, saveQbLists } from '../src/main/server/quickbooks/store'
import { individualSummaries } from '../src/main/server/quickbooks/summary'
import { rq } from '../src/main/server/quickbooks/qbxml'
import { customerAccount,receiveAccountPayment } from '../src/main/server/accounts'
import { receivePaymentAdd } from '../src/main/server/quickbooks/accountSync'
export function testCardTypes(check:(name:string,fn:()=>void)=>void,dir:string){
 const db=openDatabase(path.join(dir,'card-types.db'))
 try{
  const productId=Number(db.prepare("INSERT INTO products(name,type,price_cents,on_hand,taxable) VALUES ('Card test item','inventory',100,10,0)").run().lastInsertRowid)
  db.prepare('UPDATE products SET alu=? WHERE id=?').run('ALT<&1>',productId)
 const request=(brand:'credit'|'debit')=>({requestId:crypto.randomUUID(),tillName:'Card test',items:[{productId,qty:1}],payments:[{method:'card' as const,amountCents:100,cardBrand:brand}]})
  const cr=request('credit'),credit=createSale(db,cr),debit=createSale(db,request('debit'))
  check('new card choices are only Credit and Debit and each persists without rewriting legacy brand columns',()=>{
   assert.deepEqual(Object.values(CARD_TYPES),['Credit','Debit']);assert.equal(credit.payments[0].cardBrand,'credit');assert.equal(debit.payments[0].cardBrand,'debit')
   assert.equal(paymentLabel(credit.payments[0]),'Credit');assert.equal(paymentLabel(debit.payments[0]),'Debit')
   const row=db.prepare('SELECT card_brand,card_type FROM payments WHERE sale_id=?').get(credit.id) as any
   assert.equal(row.card_brand,null);assert.equal(row.card_type,'credit');assert.equal(createSale(db,cr).id,credit.id)
   assert.ok(receiptHtml(debit,readSettings(db),80).includes('Debit'))
  })
  db.prepare('UPDATE products SET alu=? WHERE id=?').run('CHANGED',productId)
  const readCredit=createSale(db,cr)
  check('receipt ALU is captured at checkout, safely printed, and configurable on receipt layouts',()=>{
   assert.equal(readCredit.items[0].alu,'ALT<&1>')
   assert.ok(receiptHtml(readCredit,readSettings(db),80).includes('Alt lookup: ALT&lt;&amp;1&gt;'))
   const layout=defaultDesigns().receipt;layout.blocks=layout.blocks.map(b=>({...b,showAlu:false}))
   assert.ok(!receiptHtml(readCredit,readSettings(db),80,layout).includes('Alt lookup:'))
   assert.equal(normaliseDesigns({receipt:{blocks:[{type:'items',on:true,showAlu:false}]}}).receipt.blocks.find(b=>b.type==='items')!.showAlu,false)
  })
  const original=returnableSale(db,debit.id)!,refund=createSale(db,{requestId:crypto.randomUUID(),tillName:'Card test',items:[],returns:[{saleItemId:original.lines[0].saleItemId,qty:1,reason:'Other',restock:true}],payments:[{method:'card',amountCents:-100,cardBrand:'debit'}]})
  check('debit receipt lookups and card refunds retain Debit as the card classification',()=>{assert.equal(original.payments[0].cardBrand,'debit');assert.equal(refund.payments[0].cardBrand,'debit');assert.equal(refund.items[0].alu,'ALT<&1>')})
  const date=(db.prepare("SELECT date(created_at,'localtime') d FROM sales WHERE id=?").get(credit.id) as any).d
  saveQbLists(db,{salesTaxItems:[{name:'Test Tax',rate:readSettings(db).taxRate*100}]})
  const cfg=getQbConfig(db);cfg.salesTaxItem='Test Tax';cfg.cardBrands.credit='Credit Card';cfg.cardBrands.debit='Debit Card';cfg.methods.card.paymentMethod='General Card'
  const summaries=individualSummaries(db,date,cfg,0,0),summary=summaries.find(s=>s.saleId===credit.id)!
  check('QuickBooks can distinguish Credit and Debit while end-of-day nets refunds by type',()=>{
   const xml=rq.addSalesReceipt(summary,cfg);assert.ok(xml.includes('<FullName>Credit Card</FullName>'));assert.ok(xml.includes('Card type: Credit'))
   const report=endOfDayReport(db,date);assert.equal(report.cards.find(c=>c.method==='credit')!.netCents,100);assert.equal(report.cards.find(c=>c.method==='debit')!.netCents,0)
  })
  const customer=Number(db.prepare("INSERT INTO customers(first_name,on_account_enabled) VALUES ('Card account',1)").run().lastInsertRowid)
  createSale(db,{requestId:crypto.randomUUID(),tillName:'Card test',customerId:customer,onAccount:true,items:[{productId,qty:1}],payments:[]})
  const result=receiveAccountPayment(db,customer,{requestId:crypto.randomUUID(),amountCents:50,method:'card',cardBrand:'debit',by:'Test',till:'Card test'})
  const saved=db.prepare('SELECT * FROM account_payments WHERE id=?').get(result.paymentId) as any
  check('account payments retain Debit and use its QuickBooks payment-method mapping',()=>{
   assert.equal(customerAccount(db,customer).payments[0].cardBrand,'debit')
   assert.ok(receivePaymentAdd(saved,[],'Card account',cfg).includes('<FullName>Debit Card</FullName>'))
  })
 }finally{db.close()}
}
