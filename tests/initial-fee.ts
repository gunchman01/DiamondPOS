import assert from 'node:assert/strict'
import type { DB } from '../src/main/server/db'
import { getWoSettings,saveWoSettings,prepareWorkOrderSale } from '../src/main/server/workorders'
import { readSettings } from '../src/main/server'

export async function testInitialFee(check:(name:string,fn:()=>void)=>void,db:DB,call:(url:string,method?:string,value?:unknown)=>Promise<{status:number;data:any}>) {
 const settings=getWoSettings(db)
 saveWoSettings(db,{estimateFee:{...settings.estimateFee,cents:{mower:7000,handheld:3500,other:0}}})
 const customer=Number(db.prepare("INSERT INTO customers(first_name,last_name) VALUES ('Initial','Fee')").run().lastInsertRowid)
 const units=Object.fromEntries(['mower','handheld','other'].map(category=>[category,Number(db.prepare('INSERT INTO customer_units(customer_id,category,model,hours) VALUES (?,?,?,7)').run(customer,category,'Fee test').lastInsertRowid)]))
 const create=(category:string,extra:Record<string,unknown>={})=>call('/api/workorders','POST',{customerId:customer,unitId:units[category],problem:'Test check-in',by:'Fee test staff',...extra})
 const mower=await create('mower'),handheld=await create('handheld'),other=await create('other')
 check('check-in uses the equipment default when the client omits a fee',()=>{
  assert.equal(mower.status,201);assert.equal(mower.data.feeCents,7000);assert.equal(mower.data.feeStatus,'unpaid')
  assert.equal(handheld.data.feeCents,3500);assert.equal(other.data.feeCents,0);assert.equal(other.data.feeStatus,'none')
 })
 const lower=await create('mower',{feeCents:1250}),higher=await create('handheld',{feeCents:8800}),fromZero=await create('other',{feeCents:2000})
 check('initial fee can be adjusted down or up and can be added to a zero-default category',()=>{
  for(const r of [lower,higher,fromZero])assert.equal(r.status,201)
  assert.equal(lower.data.feeCents,1250);assert.equal(higher.data.feeCents,8800);assert.equal(fromZero.data.feeCents,2000)
  assert.ok(lower.data.history.some((h:any)=>h.note.includes('$12.50')&&h.note.includes('$70.00')))
  assert.deepEqual(getWoSettings(db).estimateFee.cents,{mower:7000,handheld:3500,other:0})
 })
 const zero=await create('mower',{feeCents:0}),legacyWaive=await create('mower',{noFee:true})
 check('zero fee waives the ticket and the older noFee request remains supported',()=>{
  for(const r of [zero,legacyWaive]){assert.equal(r.status,201);assert.equal(r.data.feeCents,0);assert.equal(r.data.feeStatus,'none')}
 })
 check('fee collection uses the ticket amount rather than the configured default',()=>{
  const sale=prepareWorkOrderSale(db,lower.data.id,'fee',readSettings(db).taxRate)
  assert.equal(sale.lines[0].unitPriceCents,1250)
  assert.throws(()=>prepareWorkOrderSale(db,zero.data.id,'fee',readSettings(db).taxRate),/fee/)
 })
 const before=db.prepare('SELECT COUNT(*) AS n FROM work_orders').get().n
 for(const feeCents of [-1,1.5,'2500',null,Number.MAX_SAFE_INTEGER+1]){
  const r=await create('mower',{feeCents,hoursIn:99});assert.equal(r.status,400)
 }
 check('invalid fee amounts are rejected without creating tickets or changing hour readings',()=>{
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM work_orders').get().n,before)
  assert.equal(db.prepare('SELECT hours FROM customer_units WHERE id=?').get(units.mower).hours,7)
 })
}
