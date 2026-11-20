import type { DB } from './db'
import { unitLabel, type WorkOrderGroup, type RelatedWorkOrder } from '../../shared/workorders'

export function groupInfo(db:DB,id:number):WorkOrderGroup|null {
 const row=db.prepare('SELECT group_id FROM work_orders WHERE id=?').get(id) as {group_id:number|null}|undefined
 if(!row?.group_id)return null
 const members=db.prepare('SELECT id FROM work_orders WHERE group_id=? ORDER BY id').all(row.group_id) as {id:number}[]
 return members.length>1?{id:row.group_id,position:members.findIndex(m=>m.id===id)+1,count:members.length}:null
}
export function relatedOrders(db:DB,id:number):RelatedWorkOrder[] {
 const row=db.prepare('SELECT customer_id,group_id FROM work_orders WHERE id=?').get(id) as {customer_id:number;group_id:number|null}|undefined
 if(!row)return []
 return (db.prepare(`SELECT w.id,w.status,w.group_id,u.brand,u.model,u.unit_type,u.serial FROM work_orders w JOIN customer_units u ON u.id=w.unit_id
 WHERE w.customer_id=? ORDER BY w.id`).all(row.customer_id) as any[]).map(w=>({id:w.id,number:`WO-${String(w.id).padStart(6,'0')}`,status:w.status,unitLabel:unitLabel({brand:w.brand,model:w.model,unitType:w.unit_type}),serial:w.serial,linked:!!row.group_id&&w.group_id===row.group_id,group:groupInfo(db,w.id)}))
}
/** Caller runs this inside its mutation transaction. Groups are explicit visits, never automatic customer-wide merges. */
export function linkOrders(db:DB,id:number,otherId:number,by:string):void {
 const a=db.prepare('SELECT id,customer_id,group_id FROM work_orders WHERE id=?').get(id) as any
 const b=db.prepare('SELECT id,customer_id,group_id FROM work_orders WHERE id=?').get(otherId) as any
 if(!a||!b||id===otherId)throw new Error('Choose another work order')
 if(a.customer_id!==b.customer_id)throw new Error('Only work orders for the same customer can be grouped')
 if(a.group_id&&a.group_id===b.group_id)return
 const target=a.group_id??a.id
 const members=db.prepare('SELECT id FROM work_orders WHERE id IN (?,?) OR group_id IN (?,?)').all(id,otherId,a.group_id??-1,b.group_id??-1) as {id:number}[]
 for(const m of members){
  db.prepare("UPDATE work_orders SET group_id=?,updated_at=datetime('now') WHERE id=?").run(target,m.id)
  db.prepare('INSERT INTO work_order_history(work_order_id,note,by_name) VALUES (?,?,?)').run(m.id,`Grouped customer visit with WO-${String(id===m.id?otherId:id).padStart(6,'0')}`,by)
 }
}
export function unlinkOrder(db:DB,id:number,by:string):void {
 const row=db.prepare('SELECT group_id FROM work_orders WHERE id=?').get(id) as {group_id:number|null}|undefined
 if(!row?.group_id)return
 const members=db.prepare('SELECT id FROM work_orders WHERE group_id=? ORDER BY id').all(row.group_id) as {id:number}[]
 for(const m of members){
  db.prepare("UPDATE work_orders SET group_id=?,updated_at=datetime('now') WHERE id=?").run(m.id===id||members.length===2?null:row.group_id,m.id)
  db.prepare('INSERT INTO work_order_history(work_order_id,note,by_name) VALUES (?,?,?)').run(m.id,`WO-${String(id).padStart(6,'0')} removed from customer visit group`,by)
 }
}
