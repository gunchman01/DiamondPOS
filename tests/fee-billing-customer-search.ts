import assert from 'node:assert/strict'
import path from 'node:path'
import crypto from 'node:crypto'
import { openDatabase } from '../src/main/server/db'
import { createApp,createSale,readSettings } from '../src/main/server'
import { loadWorkOrder,prepareWorkOrderSale } from '../src/main/server/workorders'
import { searchCustomers } from '../src/main/server/customers'
import { WO_DEPARTMENTS } from '../src/shared/workorders'
export async function testFeeBillingAndCustomerSearch(check:(name:string,fn:()=>void)=>void,dir:string){
 const file=path.join(dir,'fee-billing-search.db'),db=openDatabase(file)
 const customer=Number(db.prepare("INSERT INTO customers(first_name,last_name,on_account_enabled) VALUES ('Greg','Customer',1)").run().lastInsertRowid)
 const unit=Number(db.prepare("INSERT INTO customer_units(customer_id,model) VALUES (?,'Mower')").run(customer).lastInsertRowid)
 const app=createApp(db,{dbFile:file,apiKey:'fee-search-test',port:0,appVersion:'pending'}),server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r))
 const base=`http://127.0.0.1:${(server.address() as any).port}`
 const call=async(url:string,body?:unknown,method=body===undefined?'GET':'POST')=>{const r=await fetch(base+url,{method,headers:{'X-Api-Key':'fee-search-test','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,data:await r.json()}}
 const ticket=()=>{const id=Number(db.prepare("INSERT INTO work_orders(customer_id,unit_id,fee_status,fee_cents) VALUES (?,?,'unpaid',3500)").run(customer,unit).lastInsertRowid);db.prepare("INSERT INTO work_order_lines(work_order_id,kind,description,qty,unit_price_cents,taxable) VALUES (?,'labor','Labor',1,10000,0)").run(id);return id}
 const wo=(id:number)=>loadWorkOrder(db,id,readSettings(db).taxRate)!
 try{
  await call('/api/workorders/settings',{estimateFee:{taxable:true}},'PUT')
  const id=ticket(),added=await call(`/api/workorders/${id}/bill-estimate-fee`,{by:'Test staff'}),again=await call(`/api/workorders/${id}/bill-estimate-fee`,{})
  check('unpaid estimate fee becomes one taxable bill item and repeat requests cannot duplicate it',()=>{
   assert.equal(added.status,200);assert.equal(again.status,200)
   assert.equal(wo(id).feeStatus,'billed');assert.equal(wo(id).lines.filter(l=>l.kind==='fee').length,1)
   assert.equal(wo(id).lines.find(l=>l.kind==='fee')!.taxable,true)
   assert.equal(wo(id).totals.miscCents,3500);assert.ok(wo(id).history.some(h=>h.note.includes('added to the bill')&&h.by==='Test staff'))
  })
  await call(`/api/workorders/${id}/status`,{status:'ready_pickup'})
  const prep=prepareWorkOrderSale(db,id,'repair',readSettings(db).taxRate)
  const sale=createSale(db,{requestId:crypto.randomUUID(),customerId:customer,tillName:'Test',onAccount:true,items:[],payments:[],workOrder:{id,mode:'repair'}})
  check('billed estimate fee is included in account checkout once without an upfront credit',()=>{
   assert.equal(prep.creditAvailableCents,0);assert.equal(prep.lines.filter(l=>l.department===WO_DEPARTMENTS.fee).length,1)
   assert.equal(sale.totalCents,added.data.balanceDueCents)
   assert.equal(wo(id).feeSaleId,sale.id);assert.equal(wo(id).status,'closed')
   assert.throws(()=>prepareWorkOrderSale(db,id,'fee',readSettings(db).taxRate),/not waiting/)
  })
  const paid=ticket(),feeTotal=3500+Math.round(3500*readSettings(db).taxRate)
  createSale(db,{requestId:crypto.randomUUID(),tillName:'Test',items:[],payments:[{method:'cash',amountCents:feeTotal}],workOrder:{id:paid,mode:'fee'}})
  const paidReject=await call(`/api/workorders/${paid}/bill-estimate-fee`,{})
  await call(`/api/workorders/${paid}/status`,{status:'ready_pickup'})
  check('an upfront fee cannot also be added to the bill and retains the original repair-credit behavior',()=>{
   assert.equal(paidReject.status,409);assert.equal(wo(paid).feeStatus,'paid')
   assert.equal(prepareWorkOrderSale(db,paid,'repair',readSettings(db).taxRate).creditAvailableCents,3500)
   assert.ok(!wo(paid).lines.some(l=>l.kind==='fee'))
  })
  const declined=ticket();await call(`/api/workorders/${declined}/bill-estimate-fee`,{});await call(`/api/workorders/${declined}/status`,{status:'not_fixed'})
  const free=await call(`/api/workorders/${declined}/pickup-not-fixed`,{})
  const onlyFee=prepareWorkOrderSale(db,declined,'repair',readSettings(db).taxRate)
  const declinedSale=createSale(db,{requestId:crypto.randomUUID(),tillName:'Test',items:[],payments:[{method:'cash',amountCents:wo(declined).balanceDueCents}],workOrder:{id:declined,mode:'repair'}})
  check('declined repairs collect the deferred estimate fee only and cannot bypass it through no-charge pickup',()=>{
   assert.equal(free.status,409);assert.equal(onlyFee.lines.length,1);assert.equal(onlyFee.lines[0].department,WO_DEPARTMENTS.fee)
   assert.equal(declinedSale.totalCents,feeTotal);assert.equal(wo(declined).status,'closed');assert.equal(wo(declined).totals.totalCents,feeTotal);assert.equal(wo(declined).balanceDueCents,feeTotal)
  })
  const waived=ticket();await call(`/api/workorders/${waived}/bill-estimate-fee`,{});const feeLine=wo(waived).lines.find(l=>l.kind==='fee')!
  await call(`/api/workorders/${waived}/lines/${feeLine.id}`,{unitPriceCents:2000},'PUT')
  check('adjusting the billed fee keeps its amount in sync with the ticket fee record',()=>assert.equal(wo(waived).feeCents,2000))
  await call(`/api/workorders/${waived}/lines/${feeLine.id}/remove`,{})
  check('removing the bill fee waives it instead of leaving an invisible unpaid charge',()=>{assert.equal(wo(waived).feeStatus,'none');assert.equal(wo(waived).feeCents,0)})
  const add=db.prepare('INSERT INTO customers(first_name,last_name,company,track_as_company,active,phone) VALUES (?,?,?,?,?,?)')
  add.run('Grace','Smith',null,0,1,'(918) 555-0100');add.run('John','Green',null,0,1,null);add.run('Owner','Jones','Green Garden',1,1,null);add.run('Agreg','Stone',null,0,1,null);add.run('Greg','Inactive',null,0,0,null)
  const names=await call('/api/customers?search=gr&startsWith=1')
  check('sale customer suggestions match case-insensitive first, last and company prefixes and exclude inactive/substring matches',()=>{
   assert.equal(names.status,200);assert.ok(names.data.some((c:any)=>c.firstName==='Greg'));assert.ok(names.data.some((c:any)=>c.firstName==='Grace'));assert.ok(names.data.some((c:any)=>c.lastName==='Green'));assert.ok(names.data.some((c:any)=>c.company==='Green Garden'))
   assert.ok(!names.data.some((c:any)=>c.firstName==='Agreg'||c.lastName==='Inactive'))
   assert.deepEqual(searchCustomers(db,'%_',false,true),[]);assert.equal(searchCustomers(db,'9185',false,true)[0].firstName,'Grace')
  })
 }finally{await new Promise<void>(r=>server.close(()=>r()));db.close()}
}
