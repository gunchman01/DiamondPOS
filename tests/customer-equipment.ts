import assert from 'node:assert/strict'
import path from 'node:path'
import crypto from 'node:crypto'
import { openDatabase } from '../src/main/server/db'
import { createApp, createSale } from '../src/main/server'
import { customerEquipment } from '../src/main/server/workorders'
type Check=(name:string,fn:()=>void)=>void
export async function testCustomerEquipment(check:Check,dir:string){
 const file=path.join(dir,'customer-equipment.db'),db=openDatabase(file)
 const customer=Number(db.prepare("INSERT INTO customers(first_name) VALUES('Equipment owner')").run().lastInsertRowid)
 const other=Number(db.prepare("INSERT INTO customers(first_name) VALUES('Other owner')").run().lastInsertRowid)
 const u1=Number(db.prepare("INSERT INTO customer_units(customer_id,category,unit_type,brand,model,serial,notes) VALUES(?,'mower','Tractor','Husqvarna','Test model','INTAKE-001','Existing dent')").run(customer).lastInsertRowid)
 const u2=Number(db.prepare("INSERT INTO customer_units(customer_id,category,unit_type,brand,model,serial,active) VALUES(?,'handheld','Chainsaw','STIHL','Test saw','ARCHIVED-001',0)").run(customer).lastInsertRowid)
 db.prepare("INSERT INTO customer_units(customer_id,model,serial) VALUES(?,'Private other unit','OTHER-001')").run(other)
 const w1=Number(db.prepare("INSERT INTO work_orders(customer_id,unit_id,status,problem) VALUES(?,?,'needs_estimate','Does not start')").run(customer,u1).lastInsertRowid)
 const w2=Number(db.prepare("INSERT INTO work_orders(customer_id,unit_id,status,problem) VALUES(?,?,'closed','Previous repair')").run(customer,u1).lastInsertRowid)
 check('customer equipment includes service-intake units without sales and keeps active/closed work orders',()=>{
  const rows=customerEquipment(db,customer);assert.equal(rows.length,2);const tractor=rows.find(r=>r.unit.id===u1)!;assert.equal(tractor.unit.purchasedHere,false);assert.equal(tractor.unit.notes,'Existing dent');assert.equal(tractor.workOrders.length,2);assert.equal(tractor.workOrders[0].id,w2);assert.equal(tractor.workOrders[1].id,w1);assert.equal(tractor.workOrders[0].status,'closed')
 })
 check('equipment customer ownership and inactive units are shown accurately without creating duplicates',()=>{
  const before=(db.prepare('SELECT COUNT(*) AS n FROM customer_units').get() as any).n
  const rows=customerEquipment(db,customer);assert.ok(!rows.some(r=>r.unit.serial==='OTHER-001'));assert.equal(rows.find(r=>r.unit.id===u2)!.unit.active,false)
  customerEquipment(db,customer);assert.equal((db.prepare('SELECT COUNT(*) AS n FROM customer_units').get() as any).n,before)
  assert.throws(()=>customerEquipment(db,-1),/valid customer/);assert.throws(()=>customerEquipment(db,99999),/not found/)
 })
 db.prepare('UPDATE products SET use_serial=1,taxable=0,price_cents=100 WHERE id=1').run()
 const sale=createSale(db,{requestId:crypto.randomUUID(),tillName:'Equipment till',customerId:customer,items:[{productId:1,qty:1,serial:'SOLD-001'}],payments:[{method:'cash',amountCents:100}]})
 check('serialized equipment sold to a customer appears with its original purchase receipt',()=>{
  const sold=customerEquipment(db,customer).find(r=>r.unit.serial==='SOLD-001')!;assert.ok(sold);assert.equal(sold.unit.purchasedHere,true);assert.equal(sold.unit.saleId,sale.id);assert.equal(sold.workOrders.length,0)
 })
 const app=createApp(db,{dbFile:file,apiKey:'equipment',port:0,appVersion:'0.3.43'}),server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r))
 try{
  const base=`http://127.0.0.1:${(server.address() as any).port}`,headers={'X-Api-Key':'equipment','Content-Type':'application/json'}
  const denied=await fetch(base+`/api/customers/${customer}/equipment`),result=await fetch(base+`/api/customers/${customer}/equipment`,{headers}),rows=await result.json()
  check('customer equipment API requires pairing and returns the selected owner only',()=>{assert.equal(denied.status,401);assert.equal(result.status,200);assert.equal(rows.length,3);assert.ok(rows.every((r:any)=>r.unit.customerId===customer))})
  const unit=await fetch(base+`/api/customers/${customer}/units`,{method:'POST',headers,body:JSON.stringify({category:'handheld',unitType:'Blower',brand:'Husqvarna',model:'Repair only',serial:'NEW-INTAKE'})}),saved=await unit.json()
  const ticket=await fetch(base+'/api/workorders',{method:'POST',headers,body:JSON.stringify({customerId:customer,unitId:saved.id,problem:'Check damage',hoursIn:null,by:'Intake staff',noFee:true})})
  const refreshed=await fetch(base+`/api/customers/${customer}/equipment`,{headers}),next=await refreshed.json()
  check('actual check-in unit and ticket immediately appear on customer equipment refresh',()=>{assert.equal(unit.status,201);assert.equal(ticket.status,201);const row=next.find((r:any)=>r.unit.serial==='NEW-INTAKE');assert.ok(row);assert.equal(row.workOrders.length,1);assert.equal(row.workOrders[0].problem,'Check damage')})
  const intake=await fetch(base+`/api/customers/${customer}/units`,{method:'POST',headers,body:JSON.stringify({category:'mower',unitType:'Zero turn mower',brand:'Exmark',model:'',serial:''})}),pendingUnit=await intake.json()
  const checkin=await fetch(base+'/api/workorders',{method:'POST',headers,body:JSON.stringify({customerId:customer,unitId:pendingUnit.id,problem:'Serial not available at intake',by:'Intake staff',noFee:true})}),pendingTicket=await checkin.json()
  const before=db.prepare('SELECT COUNT(*) AS n FROM customer_units').get().n
  const updated=await fetch(base+`/api/units/${pendingUnit.id}`,{method:'PUT',headers,body:JSON.stringify({category:'mower',unitType:'Zero turn mower',brand:'eXmark',model:'Lazer Z',serial:'LATE-SERIAL-123',hours:124.5,notes:'Existing dent on deck',purchaseDate:'2024-04-15',customerId:other})}),edited=await updated.json()
  const ticketAfter=await fetch(base+`/api/workorders/${pendingTicket.id}`,{headers}).then(r=>r.json()),equipmentAfter=await fetch(base+`/api/customers/${customer}/equipment`,{headers}).then(r=>r.json())
  check('unit can be checked in without model or serial and completed later on the same customer/work-order record',()=>{assert.equal(intake.status,201);assert.equal(checkin.status,201);assert.equal(pendingUnit.serial,'');assert.equal(updated.status,200);assert.equal(edited.id,pendingUnit.id);assert.equal(edited.customerId,customer);assert.equal(ticketAfter.unit.serial,'LATE-SERIAL-123');assert.equal(ticketAfter.unit.model,'Lazer Z');assert.equal(ticketAfter.unit.hours,124.5);assert.equal(ticketAfter.unit.notes,'Existing dent on deck');assert.equal(equipmentAfter.find((r:any)=>r.unit.id===pendingUnit.id).unit.purchaseDate,'2024-04-15');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM customer_units').get().n,before);assert.equal(ticketAfter.status,pendingTicket.status);assert.deepEqual(ticketAfter.lines,pendingTicket.lines)})
  const sold=customerEquipment(db,customer).find(r=>r.unit.saleId===sale.id)!.unit
  await fetch(base+`/api/units/${sold.id}`,{method:'PUT',headers,body:JSON.stringify({serial:'CORRECTED-UNIT-SERIAL',notes:'Updated later'})})
  check('editing purchased equipment preserves ownership, original sale linkage and original sale serial',()=>{const current=customerEquipment(db,customer).find(r=>r.unit.id===sold.id)!.unit;assert.equal(current.customerId,customer);assert.equal(current.purchasedHere,true);assert.equal(current.saleId,sale.id);assert.equal(current.purchaseDate,sold.purchaseDate);assert.equal(db.prepare('SELECT serial FROM sale_items WHERE sale_id=?').get(sale.id).serial,'SOLD-001')})
 }finally{await new Promise<void>(r=>server.close(()=>r()));db.close()}
}
