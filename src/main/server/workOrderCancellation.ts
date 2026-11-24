import type {DB} from './db'
export interface WorkOrderCancellation {reason:string;by:string;at:string;feeStatus:string;feeCents:number;feeSaleId:number|null}
export function workOrderCancellation(db:DB,id:number):WorkOrderCancellation|null{
 const r=db.prepare('SELECT * FROM work_order_cancellations WHERE work_order_id=?').get(id) as any
 return r?{reason:r.reason,by:r.by_name,at:r.cancelled_at,feeStatus:r.fee_status,feeCents:r.fee_cents,feeSaleId:r.fee_sale_id}:null
}
export function cancelWorkOrder(db:DB,id:number,b:{reason?:unknown;by?:unknown;stockConfirmed?:unknown}):WorkOrderCancellation{
 return db.transaction(()=>{
  const previous=workOrderCancellation(db,id);if(previous)return previous
  const w=db.prepare('SELECT * FROM work_orders WHERE id=?').get(id) as any
  if(!w)throw Error('Work order not found')
  if(w.status==='closed'||w.sale_id||db.prepare('SELECT 1 FROM warranty_checkouts WHERE work_order_id=?').get(id))throw Error('Completed or invoiced repairs cannot be cancelled. Review their receipts and QuickBooks instead.')
  const reason=String(b.reason??'').trim(),by=String(b.by??'').trim()
  if(!reason||reason.length>500||!by||by.length>100)throw Error('Enter a cancellation reason (up to 500 characters) and staff name')
  const rows=db.prepare('SELECT id,product_id,stock_taken FROM work_order_lines WHERE work_order_id=? AND stock_taken<>0').all(id) as any[]
  if(rows.length&&b.stockConfirmed!==true)throw Error('Review and confirm reserved parts can be returned to inventory before cancelling')
  for(const line of rows){if(line.product_id!==null)db.prepare("UPDATE products SET on_hand=on_hand+?,updated_at=datetime('now') WHERE id=?").run(Math.round(line.stock_taken),line.product_id);db.prepare('UPDATE work_order_lines SET stock_taken=0 WHERE id=?').run(line.id)}
  db.prepare('INSERT INTO work_order_cancellations(work_order_id,reason,by_name,cancelled_at,fee_status,fee_cents,fee_sale_id,stock_json) VALUES (?,?,?,?,?,?,?,?)').run(id,reason,by,new Date().toISOString(),w.fee_status,w.fee_cents,w.fee_sale_id,JSON.stringify(rows))
  db.prepare("UPDATE work_order_estimates SET state='superseded' WHERE work_order_id=? AND state IN ('pending','prepared')").run(id)
  db.prepare("UPDATE work_orders SET status='closed',fee_status=CASE WHEN fee_status IN ('unpaid','billed','billed_only') THEN 'none' ELSE fee_status END,updated_at=datetime('now') WHERE id=?").run(id)
  db.prepare("INSERT INTO work_order_history(work_order_id,status,note,by_name) VALUES (?,'closed',?,?)").run(id,('CANCELLED: '+reason+'. Reserved parts returned; unpaid repair charges cancelled. Paid estimate fee/payment unchanged; no automatic refund.').slice(0,500),by)
  return workOrderCancellation(db,id)!
 })()
}
