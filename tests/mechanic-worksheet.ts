import assert from 'node:assert/strict'
import path from 'node:path'
import {openDatabase} from '../src/main/server/db'
import {readSettings} from '../src/main/server'
import {loadWorkOrder} from '../src/main/server/workorders'
import {mechanicWorksheetHtml} from '../src/renderer/src/mechanicWorksheet'
export function testMechanicWorksheet(check:(n:string,f:()=>void)=>void,dir:string){
 const db=openDatabase(path.join(dir,'mechanic-worksheet.db'))
 try{
  const c=Number(db.prepare("INSERT INTO customers(first_name,last_name,phone,email) VALUES ('Worksheet','Customer','9185551234','worksheet@example.com')").run().lastInsertRowid)
  const u=Number(db.prepare("INSERT INTO customer_units(customer_id,unit_type,brand,model,serial,category) VALUES (?,'Zero-turn mower','Exmark','Test Model','SN-123','mower')").run(c).lastInsertRowid)
  const id=Number(db.prepare("INSERT INTO work_orders(customer_id,unit_id,problem,diagnosis,work_done,internal_notes,hours_in) VALUES (?,?,'Hard to start <check> & runs rough','Existing diagnosis should not fill blank box','Existing finished work','PRIVATE STAFF NOTE',125)").run(c,u).lastInsertRowid)
  const wo=loadWorkOrder(db,id,0)!,before=JSON.stringify(wo),html=mechanicWorksheetHtml(wo,readSettings(db))
  check('checked-in mechanic worksheet prints customer, unit identity, work-order number, hours and reported issue',()=>{for(const value of ['Worksheet Customer','9185551234','worksheet@example.com',wo.number,'Zero-turn mower','Exmark','Test Model','SN-123','125','Hard to start &lt;check&gt; &amp; runs rough'])assert.ok(html.includes(value),value)})
  check('worksheet has blank handwriting box and ten part-number/name/quantity rows without copying approval or private notes',()=>{assert.ok(html.includes('Mechanic findings / diagnosis / recommended work'));assert.equal((html.match(/class="write-line"/g)||[]).length,4);assert.equal((html.match(/<tr><td>&nbsp;<\/td><td><\/td><td><\/td><\/tr>/g)||[]).length,10);assert.ok(html.includes('Part number'));assert.ok(html.includes('Part name / description'));for(const value of ['PRIVATE STAFF NOTE','Existing diagnosis should not fill blank box','Existing finished work','Customer signature','Balance due'])assert.ok(!html.includes(value))})
  check('worksheet is Letter portrait, allows long issues to expand safely',()=>{assert.ok(html.includes('size:letter portrait'));assert.ok(html.includes('white-space:pre-wrap'));assert.ok(!html.includes('Internal mechanic worksheet —'));const long=mechanicWorksheetHtml({...wo,problem:('A long reported issue & details\n').repeat(100)},readSettings(db));assert.equal((long.match(/A long reported issue &amp; details/g)||[]).length,100);assert.equal(JSON.stringify(loadWorkOrder(db,id,0)),before)})
  check('missing phone/serial/hours and grouped units remain readable without inventing equipment details',()=>{const output=mechanicWorksheetHtml({...wo,customerPhone:null,customerEmail:null,hoursIn:null,unit:{...wo.unit,serial:''},group:{id:1,position:2,count:4}},readSettings(db));assert.ok(output.includes('Unit 2 of 4'));assert.ok(output.includes('Not on file'));assert.ok(output.includes('Not recorded'));assert.ok(!output.includes('SN-123'))})
 }finally{db.close()}
}
