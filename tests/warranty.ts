import assert from 'node:assert/strict'
import path from 'node:path'
import crypto from 'node:crypto'
import {openDatabase} from '../src/main/server/db'
import {createApp,createSale,readSettings} from '../src/main/server'
import {loadWorkOrder} from '../src/main/server/workorders'
import {snapshot,estimateHash} from '../src/main/server/approvals'
import {customerAccount,receiveAccountPayment} from '../src/main/server/accounts'
import {getQbConfig,saveQbConfig,saveQbLists} from '../src/main/server/quickbooks/store'
import {invoiceAdd,receivePaymentAdd,accountSteps,type AccountStep} from '../src/main/server/quickbooks/accountSync'
import {individualSummaries} from '../src/main/server/quickbooks/summary'
import {parseXml,child} from '../src/main/server/quickbooks/xml'
import {receiptHtml} from '../src/renderer/src/receipt'
import {fullPageSaleHtml,workOrderHtml} from '../src/renderer/src/printTemplates'
import {getCustomer} from '../src/main/server/customers'
export async function testWarranty(check:(n:string,f:()=>void)=>void,dir:string){
 const file=path.join(dir,'warranty.db'),db=openDatabase(file)
 const owner=Number(db.prepare("INSERT INTO customers(first_name,last_name,on_account_enabled) VALUES ('Repair','Owner',1)").run().lastInsertRowid)
 const payer=Number(db.prepare("INSERT INTO customers(company,track_as_company,on_account_enabled,tax_exempt,tax_exempt_id) VALUES ('Mower Company',1,1,1,'TEST-EXEMPT')").run().lastInsertRowid)
 const vendor=Number(db.prepare("INSERT INTO vendors(company_name) VALUES ('Mower Vendor')").run().lastInsertRowid)
 const unit=Number(db.prepare("INSERT INTO customer_units(customer_id,model,serial) VALUES (?,'Mower','SN-123')").run(owner).lastInsertRowid)
 db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES ('tax_rates',?)").run(JSON.stringify([{id:'test',name:'Test',rate:.1}]))
 db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES ('tax_rate_default','test')").run()
 const product=Number(db.prepare("INSERT INTO products(name,type,price_cents,on_hand,taxable) VALUES ('Warranty Part','inventory',10000,20,1)").run().lastInsertRowid)
 const app=createApp(db,{dbFile:file,apiKey:'test-warranty',port:0,appVersion:'0.3.70'}),server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r))
 const base=`http://127.0.0.1:${(server.address() as any).port}`
 const call=async(url:string,body?:unknown,method=body===undefined?'GET':'POST')=>{const r=await fetch(base+url,{method,headers:{'X-Api-Key':'test-warranty','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()}}
 const wo=(id:number)=>loadWorkOrder(db,id,readSettings(db).taxRate)!
 const ticket=async()=>{const id=Number(db.prepare("INSERT INTO work_orders(customer_id,unit_id,fee_status,fee_cents) VALUES (?,?,'none',0)").run(owner,unit).lastInsertRowid);await call(`/api/workorders/${id}/lines`,{kind:'part',productId:product,qty:1});await call(`/api/workorders/${id}/lines`,{kind:'labor',description:'Repair labor',qty:1.5,unitPriceCents:10000,taxable:false});return id}
 const cover=async(id:number,all=false)=>call(`/api/workorders/${id}/warranty`,{revision:wo(id).warrantyRevision,vendorId:vendor,payerId:payer,claimReference:'CLAIM-001',coverage:Object.fromEntries(wo(id).lines.map(l=>[l.id,all?Math.round(l.qty*l.unitPriceCents):l.kind==='part'?8000:10000])),by:'Staff'})
 const checkout=(id:number,extra:any={})=>({requestId:crypto.randomUUID(),tillName:'Warranty test',customerId:owner,items:[],payments:[{method:'cash',amountCents:wo(id).warranty!.customerBalanceCents}],workOrder:{id,mode:'repair' as const},warrantyRevision:wo(id).warrantyRevision,...extra})
 try{
  const id=await ticket(),beforeHash=estimateHash(wo(id)),covered=await cover(id),w=wo(id)
  check('warranty coverage keeps owner/unit, validates separate account and computes separate tax exemptions',()=>{assert.equal(covered.status,200);assert.equal(w.customerId,owner);assert.equal(w.unit.customerId,owner);assert.equal(w.warranty!.providerTotalCents,18000);assert.equal(w.warranty!.customerTotalCents,7200);assert.equal(w.warranty!.customerBalanceCents,7200)})
  check('customer estimate excludes provider coverage and coverage changes invalidate approval',()=>{const s=snapshot(w);assert.equal(s.totalCents,7200);assert.equal(s.taxCents,200);assert.match(s.partsNotice,/Mower Vendor/);assert.notEqual(estimateHash(w),beforeHash)})
  const badOwner=await call(`/api/workorders/${id}/warranty`,{revision:w.warrantyRevision,vendorId:vendor,payerId:owner,coverage:{}})
  const excessive=await call(`/api/workorders/${id}/warranty`,{revision:w.warrantyRevision,vendorId:vendor,payerId:payer,coverage:{[w.lines[0].id]:100000}})
  const unknown=await call(`/api/workorders/${id}/warranty`,{revision:w.warrantyRevision,vendorId:vendor,payerId:payer,coverage:{999999:1}})
  check('warranty rejects owner as provider, excessive amounts, and lines belonging to another ticket',()=>{assert.equal(badOwner.status,400);assert.equal(excessive.status,400);assert.equal(unknown.status,400);assert.equal(wo(id).warranty!.providerTotalCents,18000)})
  await call(`/api/workorders/${id}/status`,{status:'ready_pickup'})
  const stock=db.prepare('SELECT on_hand FROM products WHERE id=?').get(product).on_hand
  const count=()=>db.prepare('SELECT count(*) AS n FROM sales').get().n
  const before=count(),bad=checkout(id,{payments:[{method:'cash',amountCents:1}]})
  check('split checkout rolls back provider invoice and customer sale together on invalid payment',()=>{assert.throws(()=>createSale(db,bad),/payment|enough|amount|balance/i);assert.equal(count(),before);assert.equal(wo(id).status,'ready_pickup');assert.equal(db.prepare('SELECT count(*) AS n FROM warranty_checkouts').get().n,0)})
  const request=checkout(id),sale=createSale(db,request),link=wo(id).warrantySales!,providerSale=db.prepare('SELECT * FROM sales WHERE id=?').get(link.providerSaleId)
  check('split warranty checkout creates two linked receipts and invoices provider without charging owner twice',()=>{assert.equal(count(),before+2);assert.equal(sale.totalCents,7200);assert.equal(providerSale.total_cents,18000);assert.equal(providerSale.customer_id,payer);assert.equal(providerSale.on_account,1);assert.equal(sale.customerId,owner);assert.equal(wo(id).status,'closed');assert.equal(db.prepare('SELECT on_hand FROM products WHERE id=?').get(product).on_hand,stock);assert.equal(db.prepare('SELECT customer_id FROM customer_units WHERE id=?').get(unit).customer_id,owner);assert.equal(db.prepare('SELECT receivable_kind FROM account_invoices WHERE sale_id=?').get(link.providerSaleId).receivable_kind,'warranty')})
  check('retry after lost split-checkout response returns original receipts without another sale or stock deduction',()=>{assert.equal(createSale(db,request).id,sale.id);assert.equal(count(),before+2);assert.throws(()=>createSale(db,{...request,tillName:'Changed'}),/reused/);assert.equal(db.prepare('SELECT on_hand FROM products WHERE id=?').get(product).on_hand,stock)})
  const locked=await cover(id)
  check('billed warranty coverage is read-only and receipts disclose both parties and claim',()=>{assert.equal(locked.status,400);assert.match(receiptHtml(sale,readSettings(db),null),/CLAIM-001/);assert.match(fullPageSaleHtml(sale,readSettings(db),null),/Mower Company/);assert.equal(sale.warrantyBilling!.providerSaleId,link.providerSaleId)})
  const all=await ticket();await cover(all,true);await call(`/api/workorders/${all}/status`,{status:'ready_pickup'});const full=createSale(db,checkout(all,{payments:[]}))
  check('fully covered warranty bills only provider with no empty customer receipt',()=>{assert.equal(full.onAccount,true);assert.equal(full.customerId,payer);assert.equal(wo(all).warrantySales!.customerSaleId,null);assert.equal(full.totalCents,25000)})
  const accountJob=await ticket();await cover(accountJob);await call(`/api/workorders/${accountJob}/status`,{status:'ready_pickup'});const account=createSale(db,checkout(accountJob,{payments:[],onAccount:true}))
  check('customer remainder can be charged on account separately from warranty provider',()=>{assert.equal(account.onAccount,true);assert.equal(customerAccount(db,owner).balanceCents,7200);assert.equal(customerAccount(db,payer).balanceCents,61000)})
  const stale=await ticket();await cover(stale);await call(`/api/workorders/${stale}/status`,{status:'ready_pickup'});const staleReq=checkout(stale);db.prepare('UPDATE work_order_lines SET unit_price_cents=unit_price_cents+100 WHERE work_order_id=? AND kind=\'labor\'').run(stale)
  check('checkout rejects stale warranty prices and mixed scanned items before writing receipts',()=>{const n=count();assert.throws(()=>createSale(db,staleReq),/changed/);assert.throws(()=>createSale(db,checkout(stale,{items:[{productId:product,qty:1}]})),/separately/);assert.equal(count(),n)})
  const deposit=await ticket();await cover(deposit,true);db.prepare("UPDATE work_orders SET fee_status='paid',fee_cents=1000,status='ready_pickup' WHERE id=?").run(deposit)
  check('fully covered job cannot silently keep or transfer a customer deposit',()=>assert.throws(()=>createSale(db,checkout(deposit,{payments:[]})),/unused customer deposit/))
  const beforeReport=await call('/api/reports/warranty')
  check('vendor report lists completed and unbilled warranty jobs without counting customer share',()=>{assert.equal(beforeReport.status,200);const row=beforeReport.data.find((r:any)=>r.workOrderId===id);assert.equal(row.vendorId,vendor);assert.equal(row.amountCents,18000);assert.equal(row.balanceCents,18000);assert.equal(row.providerSaleId,link.providerSaleId);assert.equal(beforeReport.data.filter((r:any)=>r.workOrderId===id).length,1);assert.equal(beforeReport.data.find((r:any)=>r.workOrderId===stale).balanceCents,null)})
  receiveAccountPayment(db,payer,{requestId:crypto.randomUUID(),amountCents:5000,method:'cash',by:'Staff',till:'Test'})
  const after=await call('/api/reports/warranty'),invalid=await call('/api/reports/warranty?from=2026-02-30')
  check('warranty outstanding report follows allocated provider payments and rejects invalid dates',()=>{assert.equal(after.data.find((r:any)=>r.workOrderId===id).balanceCents,13000);assert.equal(invalid.status,400)})
  saveQbLists(db,{accounts:[{name:'Trade A/R',type:'AccountsReceivable'},{name:'Warranty A/R',type:'AccountsReceivable'},{name:'Sales',type:'Income'}],salesTaxItems:[{name:'Test Tax',rate:10}]})
  saveQbConfig(db,{enabled:true,startDate:'2000-01-01',accountsReceivable:'Trade A/R',warrantyReceivable:'Warranty A/R',salesTaxItem:'Test Tax',defaultIncomeAccount:'Sales'})
  const cfg=getQbConfig(db),date=db.prepare("SELECT date(created_at,'localtime') d FROM sales WHERE id=?").get(account.id).d
  const summary=individualSummaries(db,date,cfg,.1,.1,[account.id],true)[0]
  check('normal and warranty invoices target chosen A/R, separate from Sales income mapping',()=>{assert.match(invoiceAdd(summary,cfg,date),/<ARAccountRef><FullName>Trade A\/R<\/FullName><\/ARAccountRef><TxnDate>/);assert.match(receivePaymentAdd({id:1,date,method:'cash',amount_cents:5000,request_id:'test'},[{ar_account:'Warranty A/R',txn_id:'INV',amount_cents:5000}],'Provider',cfg),/<ARAccountRef><FullName>Warranty A\/R/);assert.equal(summary.lines[0].account,'Sales')})
  // Exercise the actual query-before-add planner with simulated QB responses.
  const queue:AccountStep[]=[],failures:string[]=[];queue.push(...accountSteps(db,cfg,.1,.1,s=>queue.unshift(...s),m=>failures.push(m)))
  const adds:{xml:string;step:Extract<AccountStep,{kind:'rq'}>}[]=[]
  for(let n=0;queue.length&&n<1000;n++){const step=queue.shift()!;if(step.kind==='plan'){step.run();continue}if(step.xml.includes('<InvoiceQueryRq')&&!step.xml.includes('<TxnID>'))step.onOk?.({node:parseXml('<InvoiceQueryRs/>')} as any);else if(step.xml.includes('<InvoiceAddRq'))adds.push({xml:step.xml,step});else step.onOk?.({node:parseXml('<Response><CustomerRet/></Response>')} as any)}
  check('warranty mapping is selected and persisted when invoice add is prepared',()=>{assert.ok(adds.some(a=>a.xml.includes('<ARAccountRef><FullName>Warranty A/R')));assert.equal(db.prepare('SELECT ar_account FROM account_invoices WHERE sale_id=?').get(link.providerSaleId).ar_account,'Warranty A/R');assert.equal(db.prepare('SELECT ar_account FROM account_invoices WHERE sale_id=?').get(account.id).ar_account,'Trade A/R')})
  const providerAdd=adds.find(a=>a.xml.includes(`<RefNumber>${db.prepare('SELECT ref_number FROM account_invoices WHERE sale_id=?').get(link.providerSaleId).ref_number}</RefNumber>`))!
  const invoiceRow=db.prepare('SELECT * FROM account_invoices WHERE sale_id=?').get(link.providerSaleId)
  const reply=(ar:string)=>({node:parseXml(`<InvoiceAddRs><InvoiceRet><TxnID>WARRANTY-TXN</TxnID><CustomerRef><FullName>${invoiceRow.customer_name}</FullName></CustomerRef><ARAccountRef><FullName>${ar}</FullName></ARAccountRef><Memo>DiamondPOS account sale #${link.providerSaleId}; unpaid invoice</Memo><TotalAmount>180.00</TotalAmount><BalanceRemaining>180.00</BalanceRemaining></InvoiceRet></InvoiceAddRs>`)} as any)
  check('confirmation refuses a different A/R account and accepts the original invoice mapping',()=>{assert.throws(()=>providerAdd.step.onOk!(reply('Wrong A/R')),/differs/);providerAdd.step.onOk!(reply('Warranty A/R'));assert.equal(db.prepare('SELECT status FROM account_invoices WHERE sale_id=?').get(link.providerSaleId).status,'sent');assert.match(providerAdd.xml,/CLAIM-001/);assert.match(providerAdd.xml,/Repair Owner/)})
  saveQbConfig(db,{warrantyReceivable:'Trade A/R'})
  check('changing configuration does not rewrite an already prepared invoice A/R mapping',()=>assert.equal(db.prepare('SELECT ar_account FROM account_invoices WHERE sale_id=?').get(wo(all).warrantySales!.providerSaleId).ar_account,'Warranty A/R'))
  db.prepare("UPDATE account_invoices SET ar_account='Trade A/R' WHERE sale_id=?").run(link.providerSaleId)
  db.prepare("UPDATE account_invoices SET ar_account='Warranty A/R' WHERE sale_id=?").run(wo(all).warrantySales!.providerSaleId)
  check('a payment spanning different A/R accounts is rejected before payment is recorded',()=>assert.throws(()=>receiveAccountPayment(db,payer,{requestId:crypto.randomUUID(),amountCents:20000,method:'cash',by:'Staff',till:'Test'}),/different Accounts Receivable/))
 }finally{await new Promise<void>(r=>server.close(()=>r()));db.close()}
}
