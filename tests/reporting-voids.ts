import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import { openDatabase } from '../src/main/server/db'
import { createApp,createSale,getSale,readSettings } from '../src/main/server'
import { runReport,cleanReport,saveReport,savedReports } from '../src/main/server/reports'
import { blankReport,REPORT_PRESETS,reportCsv } from '../src/shared/reports'
import { voidSale,reviewVoid,saleVoid } from '../src/main/server/voids'
import { itemCosts } from '../src/main/server/itemCosts'
import { getQbConfig,saveQbConfig,saveQbLists } from '../src/main/server/quickbooks/store'
import { transactionQueue,queueTransactions } from '../src/main/server/quickbooks/queue'
import { parseXml,child,text,esc } from '../src/main/server/quickbooks/xml'
import { returnableSale } from '../src/main/server/returns'
import { operationsStatus } from '../src/main/server/operations'
import { receiptHtml } from '../src/renderer/src/receipt'
import { fullPageSaleHtml } from '../src/renderer/src/printTemplates'
import type { SaleRequest } from '../src/shared/types'
export async function testReportingVoids(check:(name:string,fn:()=>void)=>void,dir:string){
 const file=path.join(dir,'reporting-voids.db'),db=openDatabase(file)
 db.prepare("UPDATE products SET price_cents=100,cost_cents=50,on_hand=1000,taxable=0,reorder_point=5 WHERE id=1").run()
 db.prepare("UPDATE products SET active=0 WHERE id<>1").run()
 check('v24 to v25 upgrade keeps enabled QuickBooks configuration and receipt amounts',()=>{
   const upgradeFile=path.join(dir,'upgrade-v24.db'),upgrade=openDatabase(upgradeFile)
   upgrade.exec('DROP TABLE sale_voids');upgrade.exec('ALTER TABLE sale_items DROP COLUMN stock_removed')
   upgrade.prepare('DELETE FROM schema_migrations WHERE version=25').run()
   saveQbConfig(upgrade,{enabled:true});upgrade.close()
   const newer=openDatabase(upgradeFile)
   try{assert.equal(getQbConfig(newer).enabled,true);assert.ok(newer.prepare("SELECT name FROM sqlite_master WHERE name='sale_voids'").get())}finally{newer.close()}
 })
 const request=(extra:Partial<SaleRequest>={}):SaleRequest=>({requestId:crypto.randomUUID(),tillName:'Reports till',items:[{productId:1,qty:2}],payments:[{method:'cash',amountCents:250}],...extra})
 const a=createSale(db,request()),b=createSale(db,request({payments:[{method:'card',amountCents:100},{method:'cash',amountCents:100}]}))
 const sales={...blankReport('sales'),period:'all' as const}
 check('report receipt grain prevents multiple tenders or lines duplicating totals',()=>{
  const r=runReport(db,sales);assert.equal(r.recordCount,2);assert.equal(r.totals.total,400);assert.equal(r.totals.cash,300);assert.equal(r.totals.card,100);assert.equal(r.totals.net+r.totals.tax,r.totals.total)
 })
 check('report definitions reject SQL identifiers, invalid dates and invalid grouping',()=>{
  for(const bad of [{...sales,columns:['id;DROP TABLE sales']},{...sales,filters:[{field:'id',op:'eq OR 1=1',value:'1'}]},{...sales,period:'custom',start:'2026-02-30',end:'2026-03-01'},{...sales,period:'custom',start:'2026-03-01',end:'2026-02-01'},{...sales,groupBy:['till']},{...sales,columns:['total'],groupBy:['total'],sort:'total'},{...sales,sort:'notSelected'}])assert.throws(()=>cleanReport(bad))
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sales').get().n,2)
 })
 check('all canned report definitions execute on a real store schema',()=>{for(const p of REPORT_PRESETS)assert.ok(runReport(db,p.definition).columns.length)})
 check('report grouping totals and counts reconcile to detail',()=>{const r=runReport(db,REPORT_PRESETS.find(p=>p.id==='sales-till')!.definition);assert.equal(r.rows.length,1);assert.equal(r.rows[0].recordCount,2);assert.equal(r.rows[0].total,400)})
 check('report text contains treats wildcards literally and money filters use dollars',()=>{
  assert.equal(runReport(db,{...sales,filters:[{field:'till',op:'contains',value:'%'}]}).recordCount,0)
  assert.equal(runReport(db,{...sales,filters:[{field:'total',op:'gte',value:'2.00'}]}).recordCount,2)
 })
 check('custom date periods include boundary days and exclude receipts outside the range',()=>{
   db.prepare("UPDATE sales SET created_at='2026-01-15 12:00:00' WHERE id=?").run(a.id)
   const r=runReport(db,{...sales,period:'custom',start:'2026-01-15',end:'2026-01-15'})
   assert.equal(r.recordCount,1);assert.equal(r.rows[0].id,a.id)
   db.prepare("UPDATE sales SET created_at=datetime('now') WHERE id=?").run(a.id)
 })
 const saved=saveReport(db,{name:'Monthly takings',definition:{...sales,period:'month'}})
 check('custom report saves preserve relative periods, share definitions, and reject duplicates',()=>{
  assert.equal(savedReports(db)[0].id,saved.id);assert.equal(savedReports(db)[0].definition.period,'month')
  assert.throws(()=>saveReport(db,{name:'MONTHLY TAKINGS',definition:sales}),/already uses/)
  const updated=saveReport(db,{name:'Renamed takings',definition:sales},saved.id);assert.equal(updated.id,saved.id);assert.equal(savedReports(db).length,1)
 })
 const body={reason:'Wrong customer',by:'Greg',till:'Till 1',paymentNote:'Cash returned',paymentConfirmed:true,legacyStockConfirmed:false}
 check('void requires payment confirmation and refuses to run during connector sync',()=>{
  assert.throws(()=>voidSale(db,a.id,{...body,paymentConfirmed:false}),/Confirm/)
  assert.throws(()=>voidSale(db,a.id,body,true),/syncing/)
  assert.equal(db.prepare('SELECT status FROM sales WHERE id=?').get(a.id).status,'completed')
 })
 const stockBefore=db.prepare('SELECT on_hand FROM products WHERE id=1').get().on_hand
 voidSale(db,a.id,body)
 check('unsent void is permanent audit, restores actual stock once and is not returnable',()=>{
  assert.equal(saleVoid(db,a.id)!.qbStatus,'not_needed');assert.equal(getSale(db,a.id)!.status,'void');assert.equal(getSale(db,a.id)!.totalCents,200)
  assert.equal(db.prepare('SELECT on_hand FROM products WHERE id=1').get().on_hand,stockBefore+2)
  voidSale(db,a.id,body);assert.equal(db.prepare('SELECT on_hand FROM products WHERE id=1').get().on_hand,stockBefore+2)
  assert.equal(returnableSale(db,a.id,0),null);assert.equal(runReport(db,sales).totals.total,200)
  assert.equal(runReport(db,REPORT_PRESETS.find(p=>p.id==='sales-voids')!.definition).rows[0].id,a.id)
  assert.equal(transactionQueue(db,{ids:[a.id]}).rows[0].eligible,false)
  const settings=readSettings(db),sale=getSale(db,a.id)!
  assert.match(receiptHtml(sale,settings,80),/VOID — NOT A VALID SALE/)
  assert.match(fullPageSaleHtml(sale,settings,null,null,null),/VOID — NOT A VALID SALE/)
 })
 const serializedCustomer=Number(db.prepare("INSERT INTO customers(first_name,last_name) VALUES ('Serial','Buyer')").run().lastInsertRowid)
 db.prepare('UPDATE products SET use_serial=1 WHERE id=1').run()
 const serialSale=createSale(db,request({customerId:serializedCustomer,items:[{productId:1,qty:1,serial:'VOID-SERIAL'}],payments:[{method:'cash',amountCents:100}]}))
 voidSale(db,serialSale.id,body)
 check('void deactivates sold equipment so the same serial can be sold again',()=>{
  assert.equal(db.prepare('SELECT active FROM customer_units WHERE sale_id=?').get(serialSale.id).active,0)
  assert.ok(createSale(db,request({customerId:serializedCustomer,items:[{productId:1,qty:1,serial:'VOID-SERIAL'}],payments:[{method:'cash',amountCents:100}]})).id)
 })
 db.prepare('UPDATE products SET use_serial=0 WHERE id=1').run()
 const legacy=createSale(db,request());db.prepare('UPDATE sale_items SET stock_removed=NULL WHERE sale_id=?').run(legacy.id)
 check('older receipt stock reversal requires an explicit review acknowledgment',()=>{assert.ok(reviewVoid(db,legacy.id).legacyStock);assert.throws(()=>voidSale(db,legacy.id,body),/older/);voidSale(db,legacy.id,{...body,legacyStockConfirmed:true})})
 const returned=createSale(db,request());createSale(db,request({items:[],returns:[{saleItemId:returned.items[0].id!,qty:1,reason:'Other',restock:true}],payments:[{method:'cash',amountCents:-100}]}))
 check('returned originals, exchanges, work-order receipts and manual QB entries cannot be voided',()=>{
  assert.match(reviewVoid(db,returned.id).blockedReason!,/already been returned/)
  const refund=db.prepare("SELECT sale_id FROM sale_items WHERE kind='return' ORDER BY id DESC LIMIT 1").get().sale_id
  assert.equal(reviewVoid(db,refund).allowed,false)
  db.prepare("INSERT INTO qb_sale_exports(sale_id,customer_name,sale_date,method,ref_number,total_cents,status,txn_id) VALUES (?,'Manual','2026-11-14','cash','MANUALVOID',200,'sent','MANUAL')").run(b.id)
  assert.match(reviewVoid(db,b.id).blockedReason!,/manual QuickBooks/)
 })
 const app=createApp(db,{dbFile:file,apiKey:'test',port:0,appVersion:'0.3.32'}),server=app.listen(0,'127.0.0.1')
 await new Promise<void>(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${(server.address() as any).port}`,headers={'X-Api-Key':'test','Content-Type':'application/json'}
 const call=async(url:string,method='GET',value?:unknown)=>{const r=await fetch(base+url,{method,headers,body:value===undefined?undefined:JSON.stringify(value)});return {status:r.status,data:await r.json()}}
 try{
  const unauthorized=await fetch(base+'/api/reports/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(sales)})
  const unauthorizedVoid=await fetch(base+`/api/sales/${b.id}/void`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  const report=await call('/api/reports/run','POST',sales)
  const deleteSaved=await call('/api/reports/saved/'+saved.id,'DELETE')
  check('reports and void APIs require pairing and saved report deletion leaves sales unchanged',()=>{assert.equal(unauthorized.status,401);assert.equal(unauthorizedVoid.status,401);assert.equal(report.status,200);assert.equal(deleteSaved.status,200);assert.equal(savedReports(db).length,0);assert.ok(getSale(db,b.id))})
  const createRv=async(qty:number,cost:number,freight:number,spread?:boolean)=>call('/api/receivings','POST',{vendor:'Cost test',freightCents:freight,...(spread===undefined?{}:{freightToCost:spread}),lines:[{productId:1,qty,unitCostCents:cost}]})
  const r1=(await createRv(2,100,100)).data
  const p1=await call(`/api/receivings/${r1.id}/post`,'POST',{lines:[{lineId:r1.lines[0].id,updateCost:true,newPriceCents:175}]})
  const r2=(await createRv(1,400,100,true)).data
  await call(`/api/receivings/${r2.id}/post`,'POST',{})
  await createRv(100,999,999)
  check('receiving defaults exclude freight from cost and posted tag items expose final prices',()=>{
    assert.equal(r1.freightToCost,false);assert.equal(p1.status,200);assert.equal(p1.data.lines[0].landedCostCents,100);assert.equal(p1.data.totals.totalCents,300)
    assert.equal(r2.freightToCost,true);assert.equal(p1.data.lines[0].newPriceCents,175)
  })
  const costApi=await call('/api/products/1/cost-summary'),productApi=await call('/api/products/1')
  check('lifetime receiving costs use quantity weighting across all posted lines and exclude drafts',()=>{
    const c=itemCosts(db,1)!
    assert.equal(c.lifetimeQty,3);assert.equal(c.lifetimeInvoiceAvgCents,200);assert.equal(c.lifetimeLandedAvgCents,233);assert.equal(c.lastReceivedCostCents,400);assert.equal(c.receivingCount,2)
    assert.equal(c.currentAvgCents,db.prepare('SELECT cost_cents FROM products WHERE id=1').get().cost_cents)
    assert.equal(costApi.status,200);assert.equal(productApi.data.priceCents,175)
  })
  const r3=(await createRv(1,100,50,true)).data
  const update=await call(`/api/receivings/${r3.id}`,'PUT',{vendor:'Cost test',freightCents:50,lines:[{productId:1,qty:1,unitCostCents:100}]})
  check('editing an existing draft preserves its saved freight allocation when field is omitted',()=>assert.equal(update.data.freightToCost,true))
  check('receiving reports count freight once and exclude drafts by default',()=>{const r=runReport(db,{...blankReport('receiving'),period:'all'});assert.equal(r.recordCount,2);assert.equal(r.totals.items,600);assert.equal(r.totals.freight,200);assert.equal(r.totals.total,800)})
  check('inventory valuation preserves negative stock, flags unknown cost and low stock respects configured points',()=>{
    db.prepare('UPDATE products SET on_hand=-2,cost_cents=NULL WHERE id=1').run()
    const r=runReport(db,REPORT_PRESETS.find(p=>p.id==='inventory-value')!.definition);assert.equal(r.rows[0].unknownCost,1);assert.equal(r.rows[0].value,null)
    assert.equal(runReport(db,REPORT_PRESETS.find(p=>p.id==='inventory-low')!.definition).recordCount,1)
    db.prepare('UPDATE products SET cost_cents=50 WHERE id=1').run();assert.equal(runReport(db,blankReport('inventory')).totals.value,-100)
  })
  check('CSV quotes names safely, preserves signed numeric refunds and escapes formula-like text',()=>{const r=runReport(db,sales);r.columns=[{key:'name',label:'Name',type:'text'},{key:'total',label:'Total',type:'money'}];r.rows=[{name:'=HYPERLINK("x")',total:-123}];const csv=reportCsv(r);assert.ok(csv.includes("'=HYPERLINK"));assert.ok(csv.includes('"-1.23"'));assert.ok(csv.includes('""x""'))})
  db.prepare('UPDATE products SET price_cents=100,on_hand=100,cost_cents=50 WHERE id=1').run()
  saveQbConfig(db,{enabled:true,startDate:'2099-01-01',defaultIncomeAccount:'Sales',salesTaxItem:'State Tax',refreshLists:false})
  saveQbLists(db,{fetchedAt:new Date().toISOString(),salesTaxItems:[{name:'State Tax',rate:0}],otherChargeItems:['POS General','POS Tax Rounding']})
  const cfg=getQbConfig(db)
  const remote=new Map<string,{id:string;memo:string;customer:string;total:number}>()
  let voidCalls=0,rejectVoid=false,dropVoid=false,failVerification=false,duplicateMatch=false
  const soap=async(method:string,args:Record<string,string>={})=>{
    const response=await fetch(base+'/qbwc',{method:'POST',headers:{'Content-Type':'text/xml'},body:`<Envelope><Body><${method}>${Object.entries(args).map(([k,v])=>`<${k}>${esc(v)}</${k}>`).join('')}</${method}></Body></Envelope>`})
    assert.equal(response.status,200);return child(child(parseXml(await response.text()),'Body'),method+'Response')!
  }
  const begin=async()=>{const r=await soap('authenticate',{strUserName:cfg.username,strPassword:cfg.password});return child(child(r,'authenticateResult'),'string')!.text}
  const sync=async()=>{
    const ticket=await begin()
    try{for(let n=0;n<150;n++){
      const xml=text(await soap('sendRequestXML',{ticket}),'sendRequestXMLResult');if(!xml)break
      const req=child(parseXml(xml),'QBXMLMsgsRq')!.children[0],name=req.name
      let inner='',code='0'
      if(name==='CompanyQueryRq')inner='<CompanyRet><CompanyName>Diamond P test</CompanyName></CompanyRet>'
      else if(name==='SalesReceiptQueryRq'){
        const byId=text(req,'TxnID'),row=byId?[...remote.values()].find(v=>v.id===byId):remote.get(text(req,'RefNumber'))
        if(row)inner=`<SalesReceiptRet><TxnID>${row.id}</TxnID><Memo>${esc(row.memo)}</Memo><CustomerRef><FullName>${esc(row.customer)}</FullName></CustomerRef><TotalAmount>${(row.total/100).toFixed(2)}</TotalAmount></SalesReceiptRet>`
        else code='500'
        if(duplicateMatch&&inner)inner+=inner
      }else if(name==='TxnVoidRq'){
        assert.equal(text(req,'TxnVoidType'),'SalesReceipt');voidCalls++
        const row=[...remote.values()].find(v=>v.id===text(req,'TxnID'))!
        if(rejectVoid)code='3170'
        else{if(!failVerification){row.total=0;row.memo='VOID: '+row.memo}inner=`<TxnVoidRet><TxnID>${row.id}</TxnID></TxnVoidRet>`}
        if(dropVoid){dropVoid=false;return}
      }else throw new Error('Unexpected void test request '+name)
      const response=`<QBXML><QBXMLMsgsRs><${name.replace(/Rq$/,'Rs')} statusCode="${code}" statusMessage="${code==='0'?'OK':'Refused'}">${inner}</${name.replace(/Rq$/,'Rs')}></QBXMLMsgsRs></QBXML>`
      if(text(await soap('receiveResponseXML',{ticket,response}),'receiveResponseXMLResult')==='100')break
    }}finally{await soap('closeConnection',{ticket})}
  }
  function exported(state='sent',inRemote=true){
    const sale=createSale(db,request()),ref='VOIDTEST'+sale.id,customer='DiamondPOS Walk-in',txn='VT'+sale.id
    db.prepare(`INSERT INTO qb_sale_exports(sale_id,customer_name,sale_date,method,ref_number,total_cents,status,txn_id) VALUES (?,?,'2026-11-14','cash',?,200,?,?)`).run(sale.id,customer,ref,state,state==='sent'?txn:null)
    if(inRemote)remote.set(ref,{id:txn,memo:`DiamondPOS receipt #${sale.id}; cash test`,customer,total:200})
    voidSale(db,sale.id,body);return {sale,ref,txn}
  }
  const pending=exported()
  const ticket=await begin(),candidate=createSale(db,request())
  const during=await call(`/api/sales/${candidate.id}/void`,'POST',body)
  await soap('closeConnection',{ticket})
  check('void API prevents racing a connector session and pending voids are not eligible for sale repost',()=>{
    assert.equal(during.status,409);const row=transactionQueue(db,{ids:[pending.sale.id]}).rows[0];assert.equal(row.status,'waiting');assert.equal(row.eligible,false)
    assert.throws(()=>queueTransactions(db,[pending.sale.id],0,0),/Selection/)
  })
  await sync()
  check('synced sale void sends TxnVoid then verifies the same receipt is zero and retains audit',()=>{
    assert.equal(voidCalls,1);assert.equal(remote.get(pending.ref)!.total,0);assert.equal(saleVoid(db,pending.sale.id)!.qbStatus,'confirmed')
    assert.equal(transactionQueue(db,{ids:[pending.sale.id]}).rows[0].status,'synced')
    assert.match(transactionQueue(db,{ids:[pending.sale.id]}).rows[0].reason,/VOID/)
  })
  const lost=exported();dropVoid=true;await sync()
  check('lost QuickBooks void reply remains pending until checked again',()=>{assert.equal(saleVoid(db,lost.sale.id)!.qbStatus,'pending');assert.equal(remote.get(lost.ref)!.total,0)})
  const calls=voidCalls;await sync()
  check('lost-response retry confirms existing remote void without voiding twice',()=>{assert.equal(saleVoid(db,lost.sale.id)!.qbStatus,'confirmed');assert.equal(voidCalls,calls)})
  const unknown=exported('pending');await sync()
  check('uncertain original sale export is found by ref number before voiding, never added again',()=>{assert.equal(saleVoid(db,unknown.sale.id)!.qbStatus,'confirmed');assert.equal(remote.get(unknown.ref)!.total,0)})
  const absent=exported('error',false);await sync()
  check('failed original export absent in QuickBooks is verified as no correction needed',()=>assert.equal(saleVoid(db,absent.sale.id)!.qbStatus,'not_needed'))
  const failed=exported();rejectVoid=true;await sync();rejectVoid=false
  check('QuickBooks refusal is visible as failed correction and operations problem',()=>{assert.equal(saleVoid(db,failed.sale.id)!.qbStatus,'error');assert.equal(remote.get(failed.ref)!.total,200);assert.ok(operationsStatus(db).quickbooks.problems>0);assert.equal(transactionQueue(db,{ids:[failed.sale.id]}).rows[0].eligible,false)})
  const retry=await call(`/api/qb/voids/${failed.sale.id}/retry`,'POST');assert.equal(retry.status,200);await sync()
  check('explicit failed-void retry reconciles without duplicating inventory reversal',()=>{assert.equal(saleVoid(db,failed.sale.id)!.qbStatus,'confirmed');assert.equal(remote.get(failed.ref)!.total,0)})
  const collision=exported();remote.get(collision.ref)!.memo='Unrelated receipt';const beforeConflict=voidCalls;await sync()
  check('void checks ownership and refuses a conflicting remote transaction',()=>{assert.equal(voidCalls,beforeConflict);assert.equal(saleVoid(db,collision.sale.id)!.qbStatus,'error');assert.equal(remote.get(collision.ref)!.total,200)})
  const duplicates=exported();duplicateMatch=true;const beforeDuplicates=voidCalls;await sync();duplicateMatch=false
  check('multiple matching QuickBooks receipts are flagged instead of choosing one to void',()=>{assert.equal(voidCalls,beforeDuplicates);assert.equal(saleVoid(db,duplicates.sale.id)!.qbStatus,'error')})
  const unverifiable=exported();failVerification=true;await sync();failVerification=false
  check('a success reply without a verified zero-value receipt is not considered reconciled',()=>assert.equal(saleVoid(db,unverifiable.sale.id)!.qbStatus,'error'))
  const off=exported();saveQbConfig(db,{enabled:false});const beforeOff=voidCalls;await sync()
  check('turning off QuickBooks sending retains pending voids without pretending they synced',()=>{assert.equal(saleVoid(db,off.sale.id)!.qbStatus,'pending');assert.equal(voidCalls,beforeOff)})
  const voids=await call('/api/qb/voids');assert.ok(voids.data.some((v:any)=>v.saleId===off.sale.id))
  check('lifetime average includes older receiving lines beyond the 20-row history preview',()=>{
    for(let n=0;n<21;n++){const id=Number(db.prepare("INSERT INTO receivings(vendor,status,posted_at) VALUES ('History','posted',datetime('now'))").run().lastInsertRowid);db.prepare('INSERT INTO receiving_lines(receiving_id,product_id,qty,unit_cost_cents,landed_cost_cents) VALUES (?,1,1,1000,1000)').run(id)}
    assert.equal(itemCosts(db,1)!.lifetimeQty,24);assert.equal(itemCosts(db,1)!.lifetimeInvoiceAvgCents,900)
  })
  const capDb=openDatabase(path.join(dir,'report-cap.db'))
  try{
    capDb.prepare('UPDATE products SET active=0').run()
    capDb.transaction(()=>{for(let n=0;n<10001;n++)capDb.prepare("INSERT INTO products(name,price_cents,cost_cents,on_hand,type) VALUES ('Cap',100,50,1,'inventory')").run()})()
    check('report row cap is explicit and totals cover every match instead of only the visible page',()=>{const r=runReport(capDb,blankReport('inventory'));assert.equal(r.rows.length,10000);assert.equal(r.rowCount,10001);assert.equal(r.truncated,true);assert.equal(r.totals.value,500050)})
  }finally{capDb.close()}
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));db.close()}
}
