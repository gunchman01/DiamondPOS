import type { DB } from './db'
import type { ReceivingWorkOrderMatch } from '../../shared/receiving'
import { loadWorkOrder } from './workorders'
import { unitLabel } from '../../shared/workorders'
/** Read-only matching: posting has already reserved ticket stock under existing inventory rules. */
export function waitingPartsForReceiving(db:DB,receivingId:number):ReceivingWorkOrderMatch[]{
 const posted=db.prepare("SELECT 1 FROM receivings WHERE id=? AND status='posted'").get(receivingId)
 if(!posted)return []
 const received=db.prepare(`SELECT l.product_id,SUM(l.qty) qty,p.sku,p.name FROM receiving_lines l JOIN products p ON p.id=l.product_id
 WHERE l.receiving_id=? AND p.type='inventory' GROUP BY l.product_id`).all(receivingId) as {product_id:number;qty:number;sku:string|null;name:string}[]
 if(!received.length)return []
 const candidates=db.prepare(`SELECT DISTINCT w.id FROM work_orders w JOIN work_order_lines l ON l.work_order_id=w.id
 WHERE w.status='waiting_parts' AND l.kind='part' AND l.qty>0 AND l.product_id IN (SELECT product_id FROM receiving_lines WHERE receiving_id=?) ORDER BY w.id`).all(receivingId) as {id:number}[]
 const matches:ReceivingWorkOrderMatch[]=[]
 for(const candidate of candidates){
  // Only equipment identity and stock availability are read; monetary totals are not used here.
  const wo=loadWorkOrder(db,candidate.id,0)
  if(!wo)continue
  const parts=received.flatMap(part=>{const qty=wo.lines.filter(l=>l.kind==='part'&&l.productId===part.product_id).reduce((n,l)=>n+l.qty,0);return qty>0?[{productId:part.product_id,sku:part.sku,name:part.name,ticketQty:qty,receivedQty:part.qty}]:[]})
  if(parts.length)matches.push({id:wo.id,number:wo.number,customerName:wo.customerName,unitLabel:unitLabel(wo.unit),mechanicName:wo.mechanicName,allPartsAvailable:!wo.lines.some(l=>l.kind==='part'&&l.short),parts})
 }
 return matches
}
