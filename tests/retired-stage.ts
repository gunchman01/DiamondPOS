import assert from 'node:assert/strict'
import path from 'node:path'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/server/migrations'
import { openDatabase } from '../src/main/server/db'
import { getWoSettings, loadWorkOrder, reconcileStock } from '../src/main/server/workorders'
import { STAGES, stage, type WoStatus } from '../src/shared/workorders'

export function testRetiredStage(check:(name:string,fn:()=>void)=>void,dir:string) {
 const file=path.join(dir,'retire-bench.db')
 let db=new Database(file)
 db.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY,name TEXT,applied_at TEXT DEFAULT CURRENT_TIMESTAMP)')
 for(const m of migrations.filter(m=>m.version<=26)){db.exec(m.up);db.prepare('INSERT INTO schema_migrations(version,name) VALUES (?,?)').run(m.version,m.name)}
 const customer=Number(db.prepare("INSERT INTO customers(first_name,last_name) VALUES ('Stage','Test')").run().lastInsertRowid)
 const unit=Number(db.prepare("INSERT INTO customer_units(customer_id,model) VALUES (?,'Test mower')").run(customer).lastInsertRowid)
 const id=Number(db.prepare("INSERT INTO work_orders(customer_id,unit_id,status,last_emailed_status) VALUES (?,?,'on_bench','on_bench')").run(customer,unit).lastInsertRowid)
 db.prepare('UPDATE products SET on_hand=8 WHERE id=1').run()
 db.prepare("INSERT INTO work_order_lines(work_order_id,kind,product_id,description,qty,stock_taken) VALUES (?,'part',1,'Part already used',2,2)").run(id)
 db.prepare("INSERT INTO work_order_history(work_order_id,status,note,by_name) VALUES (?,'on_bench','Repair started','Mechanic')").run(id)
 db.prepare("INSERT INTO settings(key,value) VALUES ('wo_settings',?)").run(JSON.stringify({stageColors:{approved:'#123456',on_bench:'#abcdef'},templates:{on_bench:{subject:'Old subject',body:'Old message',includeBill:false}}}))
 db.close();db=openDatabase(file)
 check('bench retirement moves existing tickets to Approved to Fix without another stock movement',()=>{
  assert.equal(db.prepare('SELECT status FROM work_orders WHERE id=?').get(id).status,'approved')
  assert.equal(db.prepare('SELECT on_hand FROM products WHERE id=1').get().on_hand,8)
  assert.equal(db.prepare('SELECT stock_taken FROM work_order_lines WHERE work_order_id=?').get(id).stock_taken,2)
  reconcileStock(db,id);assert.equal(db.prepare('SELECT on_hand FROM products WHERE id=1').get().on_hand,8)
 })
 check('retirement preserves original history/email records and adds an explicit migration audit',()=>{
  const wo=loadWorkOrder(db,id,0)!
  assert.ok(wo.history.some(h=>h.note==='Repair started'&&String(h.status)==='on_bench'))
  assert.ok(wo.history.some(h=>h.note.includes('stage retired')&&h.by==='System update'))
  assert.equal(String(wo.lastEmailedStatus),'on_bench')
  assert.equal(stage('on_bench' as WoStatus).label,'On the Bench')
 })
 check('restored bench stage is offered with colors and no automatic email template',()=>{
  assert.ok(STAGES.some(s=>s.status==='on_bench'))
  assert.ok(stage('approved').next.includes('on_bench'))
  assert.ok(stage('approved').next.includes('ready_review'))
  assert.ok(stage('waiting_parts').next.includes('ready_review'))
  assert.ok(stage('ready_review').next.includes('approved'))
  const settings=getWoSettings(db)
  assert.equal(settings.stageColors.approved,'#123456')
  assert.ok('on_bench' in settings.stageColors);assert.ok(!('on_bench' in settings.templates))
 })
 const historyCount=db.prepare('SELECT COUNT(*) AS n FROM work_order_history WHERE work_order_id=?').get(id).n
 db.close();db=openDatabase(file)
 check('retirement migration is applied once and repeated startup leaves stock and history intact',()=>{
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM work_order_history WHERE work_order_id=?').get(id).n,historyCount)
  assert.equal(db.prepare('SELECT on_hand FROM products WHERE id=1').get().on_hand,8)
 })
 db.close()
}
