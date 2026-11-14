import type express from 'express'
import type { DB } from './db'
import type { SaleVoid, VoidRequest, VoidReview } from '../../shared/voids'
import { qbLog } from './quickbooks/store'
class VoidError extends Error{constructor(public status:number,message:string){super(message)}}
export function saleVoid(db:DB,id:number):SaleVoid|null{
  const r=db.prepare('SELECT * FROM sale_voids WHERE sale_id=?').get(id) as any
  return r?{saleId:r.sale_id,reason:r.reason,by:r.voided_by,till:r.till_name,at:r.voided_at.replace(' ','T')+'Z',paymentNote:r.payment_note,qbStatus:r.qb_status,qbError:r.qb_error,qbConfirmedAt:r.qb_confirmed_at?r.qb_confirmed_at.replace(' ','T')+'Z':null}:null
}
export function reviewVoid(db:DB,id:number):VoidReview {
  const sale=db.prepare('SELECT * FROM sales WHERE id=?').get(id) as any
  if(!sale)throw new VoidError(404,'Sale not found')
  const existing=saleVoid(db,id)
  const items=db.prepare('SELECT si.*,p.type FROM sale_items si LEFT JOIN products p ON p.id=si.product_id WHERE si.sale_id=?').all(id) as any[]
  const stock=items.filter(i=>i.kind==='item'&&i.product_id!==null).map(i=>({productId:i.product_id,name:i.name,qty:i.stock_removed??(i.type==='inventory'?i.qty:0)})).filter(i=>i.qty!==0)
  const legacyStock=items.some(i=>i.kind==='item'&&i.product_id!==null&&i.stock_removed===null)
  const e=db.prepare('SELECT * FROM qb_sale_exports WHERE sale_id=?').get(id) as any
  let blockedReason:string|null=null
  if(sale.status!=='completed')blockedReason='This receipt is already void or is not completed.'
  else if(sale.work_order_id||items.some(i=>i.kind!=='item'))blockedReason='Refunds, exchanges and work-order payments cannot be voided here. Use the return/work-order workflow and reconcile QuickBooks.'
  else if(sale.total_cents<=0)blockedReason='Only positive completed sales can be voided.'
  else if(db.prepare("SELECT 1 FROM sale_items r JOIN sales s ON s.id=r.sale_id WHERE r.return_of_sale_id=? AND s.status='completed' LIMIT 1").get(id))blockedReason='This receipt has already been returned against. Use the return workflow.'
  else if(db.prepare('SELECT 1 FROM work_orders WHERE unit_id IN (SELECT id FROM customer_units WHERE sale_id=?) LIMIT 1').get(id))blockedReason='Equipment on this receipt has a work order. Review the work order before correcting this sale.'
  else if(db.prepare("SELECT 1 FROM qb_exports WHERE sale_date=date((SELECT created_at FROM sales WHERE id=?),'localtime') LIMIT 1").get(id))blockedReason='An old daily QuickBooks export covers this sale. Reconcile that export before any correction.'
  else if(e&&(e.status==='manual'||e.txn_id==='MANUAL'))blockedReason='This sale has a manual QuickBooks entry. Reconcile it before correcting the sale.'
  return {totalCents:sale.total_cents,allowed:!blockedReason,blockedReason,legacyStock,stock,void:existing,qbAction:e?'A QuickBooks receipt check and void will be queued. Until confirmed, the correction remains pending.':'This receipt has no QuickBooks export record. It will be excluded from future exports.'}
}
export function voidSale(db:DB,id:number,body:VoidRequest,syncing=false):SaleVoid{
  if(syncing)throw new VoidError(409,'QuickBooks is syncing. Wait for it to finish before voiding a receipt.')
  return db.transaction(()=>{
    const existing=saleVoid(db,id);if(existing)return existing // Retry after a lost response never restores stock twice.
    const review=reviewVoid(db,id)
    if(!review.allowed)throw new VoidError(409,review.blockedReason!)
    const reason=String(body?.reason??'').trim(),by=String(body?.by??'').trim(),till=String(body?.till??'').trim(),paymentNote=String(body?.paymentNote??'').trim()
    if(!reason||reason.length>500||!by||by.length>100||!till||till.length>100||!paymentNote||paymentNote.length>500)throw new VoidError(400,'Enter a reason, your name, till and payment-handling note.')
    if(body.paymentConfirmed!==true)throw new VoidError(400,'Confirm that cash, check or terminal payment has been cancelled or returned separately.')
    if(review.legacyStock&&body.legacyStockConfirmed!==true)throw new VoidError(400,'Review and confirm stock quantities for this older receipt.')
    const e=db.prepare('SELECT * FROM qb_sale_exports WHERE sale_id=?').get(id) as any
    db.prepare(`INSERT INTO sale_voids (sale_id,reason,voided_by,till_name,payment_note,stock_json,qb_status,qb_txn_id)
      VALUES (?,?,?,?,?,?,?,?)`).run(id,reason,by,till,paymentNote,JSON.stringify(review.stock),e?'pending':'not_needed',e?.txn_id??null)
    for(const line of review.stock)db.prepare("UPDATE products SET on_hand=on_hand+?,updated_at=datetime('now') WHERE id=?").run(line.qty,line.productId)
    db.prepare('UPDATE customer_units SET active=0 WHERE sale_id=?').run(id)
    db.prepare("UPDATE sales SET status='void' WHERE id=? AND status='completed'").run(id)
    qbLog(db,'warn',`Receipt #${id} voided by ${by} at ${till}: ${reason}. QuickBooks: ${e?'pending confirmation':'not exported'}`)
    return saleVoid(db,id)!
  })()
}
export function registerVoidRoutes(app:express.Express,db:DB,syncing:()=>boolean){
  const wrap=(fn:(req:express.Request,res:express.Response)=>void)=>(req:express.Request,res:express.Response)=>{try{fn(req,res)}catch(e){res.status(e instanceof VoidError?e.status:400).json({error:(e as Error).message})}}
  app.get('/api/sales/:id/void-review',wrap((req,res)=>res.json(reviewVoid(db,Number(req.params.id)))))
  app.post('/api/sales/:id/void',wrap((req,res)=>res.json(voidSale(db,Number(req.params.id),req.body,syncing()))))
  app.get('/api/qb/voids',wrap((_req,res)=>{const rows=db.prepare('SELECT sale_id FROM sale_voids ORDER BY sale_id DESC LIMIT 500').all() as {sale_id:number}[];res.json(rows.map(r=>saleVoid(db,r.sale_id)))}))
  app.post('/api/qb/voids/:id/retry',wrap((req,res)=>{if(syncing())throw new VoidError(409,'Wait for the current QuickBooks sync to finish.');db.prepare("UPDATE sale_voids SET qb_status='pending',qb_error=NULL WHERE sale_id=? AND qb_status='error'").run(Number(req.params.id));res.json(saleVoid(db,Number(req.params.id)))}))
}
