import type express from 'express'
import type {DB} from './db'
import {isIsoDate} from './customers'
import {TRANSACTION_KINDS,type TransactionHistoryPage,type TransactionHistoryRow,type AccountPaymentDetail} from '../../shared/transactionHistory'
export interface HistoryOptions {search?:string;kind?:string;from?:string;to?:string;page?:number}
const customerName=`COALESCE(NULLIF(CASE WHEN c.track_as_company=1 THEN c.company ELSE TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')) END,''),NULLIF(c.company,''),'Walk-in')`
export function transactionHistory(db:DB,options:HistoryOptions={}):TransactionHistoryPage {
 const page=options.page??1,pageSize=50,kind=options.kind??'',from=options.from??'',to=options.to??''
 if(!Number.isSafeInteger(page)||page<1||page>1000000)throw Error('Invalid page')
 if(kind&&!Object.hasOwn(TRANSACTION_KINDS,kind))throw Error('Invalid transaction type')
 if((from&&!isIsoDate(from))||(to&&!isIsoDate(to)))throw Error('Dates must be valid YYYY-MM-DD dates')
 if(from&&to&&from>to)throw Error('From date must not be after Through date')
 const search=(options.search??'').trim().slice(0,120),like='%'+search.replace(/[\\%_]/g,'\\$&')+'%'
 const sql=`WITH transactions AS (
 SELECT 'sale' AS source,s.id,s.created_at AS createdAt,${customerName} AS customerName,s.customer_id AS customerId,
 s.till_name AS tillName,s.total_cents AS totalCents,s.tax_cents AS taxCents,s.status,
 CASE WHEN s.status='void' THEN 'void' WHEN s.total_cents<0 THEN 'refund'
 WHEN EXISTS(SELECT 1 FROM sale_items si WHERE si.sale_id=s.id AND (si.kind='return' OR si.qty<0)) THEN 'exchange'
 WHEN s.work_order_id IS NOT NULL THEN 'work_order' WHEN s.on_account=1 THEN 'account_sale' ELSE 'sale' END AS kind,
 CASE WHEN s.on_account=1 THEN 'account' ELSE COALESCE((SELECT GROUP_CONCAT(DISTINCT p.method) FROM payments p WHERE p.sale_id=s.id),'') END AS methods,
 s.work_order_id AS workOrderId,s.on_account AS onAccount,
 COALESCE((SELECT e.ref_number FROM qb_sale_exports e WHERE e.sale_id=s.id),(SELECT i.ref_number FROM account_invoices i WHERE i.sale_id=s.id)) AS reference
 FROM sales s LEFT JOIN customers c ON c.id=s.customer_id
 UNION ALL
 SELECT 'account_payment',p.id,p.created_at,${customerName},p.customer_id,p.till_name,p.amount_cents,NULL,p.status,'account_payment',p.method,NULL,0,p.reference
 FROM account_payments p LEFT JOIN customers c ON c.id=p.customer_id
 ), filtered AS (SELECT * FROM transactions WHERE (?='' OR kind=?)
 AND (?='' OR date(createdAt,'localtime')>=?) AND (?='' OR date(createdAt,'localtime')<=?)
 AND (?='' OR CAST(id AS TEXT) LIKE ? ESCAPE '\\' OR customerName LIKE ? ESCAPE '\\' OR tillName LIKE ? ESCAPE '\\' OR COALESCE(reference,'') LIKE ? ESCAPE '\\' OR ((CASE WHEN source='sale' THEN '#' ELSE 'AP #' END)||id) LIKE ? ESCAPE '\\' OR ('WO-' || printf('%06d',workOrderId)) LIKE ? ESCAPE '\\'))`
 const args=[kind,kind,from,from,to,to,search,like,like,like,like,like,like]
 const total=(db.prepare(sql+' SELECT COUNT(*) AS n FROM filtered').get(...args) as {n:number}).n
 const rows=db.prepare(sql+` SELECT * FROM filtered ORDER BY createdAt DESC,source DESC,id DESC LIMIT ? OFFSET ?`).all(...args,pageSize,(page-1)*pageSize) as (Omit<TransactionHistoryRow,'onAccount'>&{onAccount:number})[]
 return {total,page,pageSize,rows:rows.map(r=>({...r,createdAt:r.createdAt.replace(' ','T')+'Z',onAccount:!!r.onAccount}))}
}
export function accountPaymentDetail(db:DB,id:number):AccountPaymentDetail|null {
 const row=db.prepare(`SELECT p.id,p.customer_id AS customerId,${customerName} AS customerName,p.created_at AS createdAt,p.amount_cents AS amountCents,
 p.method,p.card_brand AS cardBrand,p.reference,p.till_name AS tillName,p.by_name AS by,p.status,p.error
 FROM account_payments p LEFT JOIN customers c ON c.id=p.customer_id WHERE p.id=?`).get(id) as Omit<AccountPaymentDetail,'allocations'>|undefined
 if(!row)return null
 const allocations=db.prepare(`SELECT a.sale_id AS saleId,a.amount_cents AS amountCents,i.ref_number AS refNumber FROM account_allocations a JOIN account_invoices i ON i.sale_id=a.sale_id WHERE a.payment_id=? ORDER BY a.sale_id`).all(id) as AccountPaymentDetail['allocations']
 return {...row,createdAt:row.createdAt.replace(' ','T')+'Z',allocations}
}
export function registerTransactionHistoryRoutes(app:express.Express,db:DB){
 app.get('/api/transaction-history',(req,res)=>{
  try{res.json(transactionHistory(db,{search:String(req.query.search??''),kind:String(req.query.kind??''),from:String(req.query.from??''),to:String(req.query.to??''),page:Number(req.query.page??1)}))}
  catch(e){res.status(400).json({error:(e as Error).message})}
 })
 app.get('/api/transaction-history/account-payments/:id',(req,res)=>{
  const id=Number(req.params.id)
  if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({error:'Invalid account payment ID'})
  const payment=accountPaymentDetail(db,id)
  if(!payment)return res.status(404).json({error:'Account payment not found'})
  res.json(payment)
 })
}
