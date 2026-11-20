import assert from 'node:assert/strict'
import path from 'node:path'
import { openDatabase } from '../src/main/server/db'
import { createApp } from '../src/main/server'
import { waitingPartsForReceiving } from '../src/main/server/receivingWorkOrders'
export async function testReceivingAlerts(check:(name:string,fn:()=>void)=>void,dir:string){
 const file=path.join(dir,'receiving-alerts.db'),db=openDatabase(file)
 const customer=Number(db.prepare("INSERT INTO customers(first_name,last_name) VALUES ('Waiting','Parts')").run().lastInsertRowid)
 const unit=Number(db.prepare("INSERT INTO customer_units(customer_id,model) VALUES (?,'Chainsaw')").run(customer).lastInsertRowid)
 const product=Number(db.prepare("INSERT INTO products(name,type,price_cents,on_hand) VALUES ('Received part','inventory',100,-4)").run().lastInsertRowid)
 const missing=Number(db.prepare("INSERT INTO products(name,type,price_cents,on_hand) VALUES ('Other part','inventory',100,-1)").run().lastInsertRowid)
 const ticket=(status:string)=>Number(db.prepare('INSERT INTO work_orders(customer_id,unit_id,status) VALUES (?,?,?)').run(customer,unit,status).lastInsertRowid)
 const one=ticket('waiting_parts'),two=ticket('waiting_parts'),closed=ticket('closed'),approved=ticket('approved')
 const part=(id:number,pid:number,qty:number)=>db.prepare("INSERT INTO work_order_lines(work_order_id,kind,product_id,description,qty,stock_taken) VALUES (?,'part',?,'Part',?,?)").run(id,pid,qty,qty)
 part(one,product,1);part(one,product,1);part(one,missing,1);part(two,product,2);part(closed,product,1);part(approved,product,1)
 const app=createApp(db,{dbFile:file,apiKey:'receiving-alert-test',port:0,appVersion:'pending'}),server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve))
 const base=`http://127.0.0.1:${(server.address() as any).port}`
 const post=async(url:string,body:unknown)=>{const res=await fetch(base+url,{method:'POST',headers:{'X-Api-Key':'receiving-alert-test','Content-Type':'application/json'},body:JSON.stringify(body)});return {status:res.status,data:await res.json()}}
 try{
  const draft=await post('/api/receivings',{vendor:'Parts vendor',lines:[{productId:product,qty:1,unitCostCents:50},{productId:product,qty:1,unitCostCents:50}]})
  check('draft receiving does not notify waiting work orders',()=>assert.deepEqual(waitingPartsForReceiving(db,draft.data.id),[]))
  const posted=await post(`/api/receivings/${draft.data.id}/post`,{lines:[]}),matches=posted.data.waitingWorkOrders
  check('posting matches waiting tickets once each and aggregates repeated received and ticket part lines',()=>{
   assert.equal(posted.status,200);assert.deepEqual(matches.map((m:any)=>m.id),[one,two]);assert.equal(matches[0].parts.length,1)
   assert.equal(matches[0].parts[0].ticketQty,2);assert.equal(matches[0].parts[0].receivedQty,2)
   assert.ok(matches.every((m:any)=>!m.allPartsAvailable))
  })
  const retry=await post(`/api/receivings/${draft.data.id}/post`,{lines:[]})
  check('notice matching is read-only and a repeated post cannot add inventory again',()=>{
   assert.equal(retry.status,409);assert.equal(db.prepare('SELECT on_hand FROM products WHERE id=?').get(product).on_hand,-2)
   assert.equal(db.prepare('SELECT status FROM work_orders WHERE id=?').get(one).status,'waiting_parts')
   assert.equal(db.prepare('SELECT SUM(stock_taken) n FROM work_order_lines WHERE work_order_id=?').get(one).n,3)
  })
  const next=await post('/api/receivings',{lines:[{productId:product,qty:2,unitCostCents:50}]})
  const arrived=await post(`/api/receivings/${next.data.id}/post`,{lines:[]})
  check('availability checks all ticket parts and preserves another outstanding shortage',()=>{
   assert.equal(arrived.data.waitingWorkOrders.find((m:any)=>m.id===one).allPartsAvailable,false)
   assert.equal(arrived.data.waitingWorkOrders.find((m:any)=>m.id===two).allPartsAvailable,true)
  })
  db.prepare("UPDATE work_orders SET status='on_bench' WHERE id=?").run(two)
  check('reviewing an old posted receiving reflects current waiting stages without stale matches',()=>assert.deepEqual(waitingPartsForReceiving(db,draft.data.id).map(m=>m.id),[one]))
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));db.close()}
}
