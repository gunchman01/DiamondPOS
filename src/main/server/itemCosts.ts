import type { DB } from './db'
import type { ItemCostSummary } from '../../shared/receiving'
export function itemCosts(db:DB,id:number):ItemCostSummary|null{
  const p=db.prepare('SELECT cost_cents,order_cost_cents FROM products WHERE id=?').get(id) as {cost_cents:number|null;order_cost_cents:number|null}|undefined
  if(!p)return null
  const totals=db.prepare(`SELECT COALESCE(SUM(l.qty),0) AS qty,SUM(l.qty*l.unit_cost_cents) AS cost,
    SUM(l.qty*COALESCE(l.landed_cost_cents,l.unit_cost_cents)) AS landed,COUNT(DISTINCT r.id) AS n
    FROM receiving_lines l JOIN receivings r ON r.id=l.receiving_id WHERE l.product_id=? AND r.status='posted'`).get(id) as {qty:number;cost:number|null;landed:number|null;n:number}
  const last=db.prepare(`SELECT l.unit_cost_cents,l.landed_cost_cents,r.posted_at FROM receiving_lines l JOIN receivings r ON r.id=l.receiving_id
    WHERE l.product_id=? AND r.status='posted' ORDER BY r.posted_at DESC,r.id DESC,l.id DESC LIMIT 1`).get(id) as {unit_cost_cents:number;landed_cost_cents:number|null;posted_at:string|null}|undefined
  return {productId:id,currentAvgCents:p.cost_cents,orderCostCents:p.order_cost_cents,lastReceivedCostCents:last?.unit_cost_cents??null,lastLandedCostCents:last?(last.landed_cost_cents??last.unit_cost_cents):null,lastReceivedAt:last?.posted_at?last.posted_at.replace(' ','T')+'Z':null,lifetimeQty:totals.qty,lifetimeInvoiceAvgCents:totals.qty>0?Math.round((totals.cost??0)/totals.qty):null,lifetimeLandedAvgCents:totals.qty>0?Math.round((totals.landed??0)/totals.qty):null,receivingCount:totals.n}
}
