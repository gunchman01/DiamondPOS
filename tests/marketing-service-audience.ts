import assert from 'node:assert/strict'
import path from 'node:path'
import { openDatabase } from '../src/main/server/db'
import { insertCustomer, CUSTOMER_DEFAULTS } from '../src/main/server/customers'
import { runAudience, normaliseAudience } from '../src/main/server/marketing/audience'
import { suppressMarketing } from '../src/main/server/marketing/consent'
type Check=(name:string,fn:()=>void)=>void
export function testServiceAudience(check:Check,dir:string){
 const db=openDatabase(path.join(dir,'service-audience.db'))
 try{
 const add=(name:string,email=name+'@example.com',extra={})=>insertCustomer(db,{...CUSTOMER_DEFAULTS,firstName:name,email,okToEmail:true,...extra})
 const mower=add('mower'),handheld=add('handheld'),other=add('other'),pending=add('pending'),declined=add('declined'),old=add('old'),owner=add('owner'),inactive=add('inactive','inactive@example.com',{active:false}),noConsent=add('noConsent','noconsent@example.com',{okToEmail:false}),suppressed=add('suppressed')
 const unit=(id:number,category:string)=>Number(db.prepare('INSERT INTO customer_units(customer_id,category) VALUES(?,?)').run(id,category).lastInsertRowid)
 const ticket=(id:number,category:string,status:string,date?:string)=>Number(db.prepare("INSERT INTO work_orders(customer_id,unit_id,status,created_at) VALUES(?,?,?,COALESCE(?,datetime('now')))").run(id,unit(id,category),status,date??null).lastInsertRowid)
 ticket(mower,'mower','closed');ticket(mower,'mower','ready_pickup');ticket(handheld,'handheld','ready_pickup');ticket(other,'other','closed');ticket(pending,'mower','waiting_parts');ticket(declined,'mower','not_fixed');ticket(old,'mower','closed','2020-01-01 00:00:00');unit(owner,'mower');ticket(inactive,'mower','closed');ticket(noConsent,'mower','closed');ticket(suppressed,'mower','closed');suppressMarketing(db,'suppressed@example.com')
 const declinedClosed=add('declinedClosed');const closedId=ticket(declinedClosed,'mower','closed');db.prepare("INSERT INTO work_order_history(work_order_id,status,note) VALUES(?,'not_fixed','Declined repair')").run(closedId)
 const audience={source:'service',allCustomers:false,rules:[],withinMonths:12,customerTypes:[],serviceCategory:'any',serviceCompletedOnly:true}
 const ids=(a:unknown)=>runAudience(db,a).recipients.map(r=>r.customerId).sort((a,b)=>a-b)
 check('general service audience includes repair-only customers without a sale and deduplicates multiple work orders',()=>{assert.deepEqual(ids(audience),[mower,handheld,other].sort((a,b)=>a-b));const result=runAudience(db,audience);assert.equal(result.matched,5);assert.equal(result.excludedNoConsent,2);assert.equal(result.recipients.find(r=>r.customerId===mower)!.purchases,2)})
 check('service category filters separately target mowers, handheld and other units',()=>{assert.deepEqual(ids({...audience,serviceCategory:'mower'}),[mower]);assert.deepEqual(ids({...audience,serviceCategory:'handheld'}),[handheld]);assert.deepEqual(ids({...audience,serviceCategory:'other'}),[other])})
 check('service stage and check-in date choices exclude not-fixed jobs, respect lookback, and can include active work',()=>{assert.deepEqual(ids({...audience,serviceCategory:'mower',serviceCompletedOnly:false}),[mower,pending]);assert.deepEqual(ids({...audience,serviceCategory:'mower',withinMonths:null}),[mower,old]);assert.ok(!ids({...audience,serviceCompletedOnly:false,withinMonths:null}).includes(declinedClosed));assert.ok(!ids({...audience,serviceCompletedOnly:false,withinMonths:null}).includes(owner))})
 db.prepare("UPDATE customers SET customer_type='Commercial' WHERE id=?").run(handheld)
 check('service audiences retain customer-type filtering and old campaigns retain purchase rules',()=>{assert.deepEqual(ids({...audience,customerTypes:['commercial']}),[handheld]);assert.equal(normaliseAudience({}).source,'purchases');assert.equal(normaliseAudience({source:'service',serviceCategory:'unsafe'}).serviceCategory,'any');assert.deepEqual(ids({allCustomers:false,rules:[],withinMonths:null,customerTypes:[]}),[])})
 }finally{db.close()}
}
