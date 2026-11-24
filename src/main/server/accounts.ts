import crypto from 'node:crypto'
import type express from 'express'
import type { DB } from './db'
import type { AccountPaymentRequest, CustomerAccount } from '../../shared/accounts'
import { getCustomer } from './customers'
import { customerDisplayName } from '../../shared/types'
import type { AccountBalanceCustomer } from '../../shared/accounts'
import { CARD_BRANDS } from '../../shared/types'
export class AccountError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}
export function invoiceDue(db: DB, saleId: number): number {
  const row = db
    .prepare(
      `SELECT s.total_cents,i.qb_balance_cents,i.qb_pos_paid_cents,COALESCE((SELECT SUM(a.amount_cents) FROM account_allocations a WHERE a.sale_id=i.sale_id),0) AS paid FROM account_invoices i JOIN sales s ON s.id=i.sale_id WHERE i.sale_id=?`
    )
    .get(saleId) as any
  if (!row) return 0
  return Math.max(
    0,
    Math.min(
      row.total_cents - row.paid,
      row.qb_balance_cents === null ? row.total_cents - row.paid : row.qb_balance_cents - (row.paid - row.qb_pos_paid_cents)
    )
  )
}
export function customerAccount(db: DB, id: number): CustomerAccount {
  const c = db.prepare('SELECT on_account_enabled FROM customers WHERE id=?').get(id) as any
  if (!c) throw new AccountError(404, 'Customer not found')
  const rows = db
    .prepare(
      `SELECT i.*,s.created_at,s.total_cents FROM account_invoices i JOIN sales s ON s.id=i.sale_id WHERE i.customer_id=? ORDER BY s.id DESC`
    )
    .all(id) as any[]
  const invoices = rows.map((r) => ({
    saleId: r.sale_id,
    refNumber: r.ref_number,
    date: r.created_at.replace(' ', 'T') + 'Z',
    dueDate: r.due_date,
    totalCents: r.total_cents,
    balanceCents: invoiceDue(db, r.sale_id),
    status: r.status,
    error: r.error,
    qbCheckedAt: r.qb_checked_at,arAccount:r.ar_account,receivableKind:r.receivable_kind
  }))
  const payments = (db.prepare('SELECT * FROM account_payments WHERE customer_id=? ORDER BY id DESC').all(id) as any[]).map((r) => ({
    id: r.id,
    date: r.created_at.replace(' ', 'T') + 'Z',
    amountCents: r.amount_cents,
    method: r.method,
    reference: r.reference,
    cardBrand: r.card_brand,
    status: r.status,
    error: r.error
  }))
  return {
    customerId: id,
    enabled: c.on_account_enabled === 1,
    balanceCents: invoices.reduce((n, i) => n + i.balanceCents, 0),
    invoices,
    payments
  }
}
export function createAccountInvoice(db: DB, saleId: number, customerId: number) {
  const c = db.prepare('SELECT account_terms_days FROM customers WHERE id=?').get(customerId) as any
  const s = db.prepare("SELECT date(created_at,'localtime') AS d FROM sales WHERE id=?").get(saleId) as { d: string }
  const date = new Date(s.d + 'T12:00:00Z')
  date.setUTCDate(date.getUTCDate() + c.account_terms_days)
  db.prepare('INSERT INTO account_invoices(sale_id,customer_id,ref_number,due_date) VALUES (?,?,?,?)').run(
    saleId,
    customerId,
    'DA' + saleId.toString(36).toUpperCase(),
    date.toISOString().slice(0, 10)
  )
}
export function receiveAccountPayment(db: DB, customerId: number, b: AccountPaymentRequest) {
  if (!b || typeof b.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(b.requestId))
    throw new AccountError(400, 'A payment request ID is required')
  const amount = Number(b.amountCents)
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new AccountError(400, 'Enter a positive payment amount')
  if (!['cash', 'card', 'check'].includes(b.method)) throw new AccountError(400, 'Choose cash, card or check')
  if (b.method === 'check' && !String(b.reference ?? '').trim()) throw new AccountError(400, 'Enter the check number')
  if (b.cardBrand !== undefined && (b.method !== 'card' || !Object.hasOwn(CARD_BRANDS, b.cardBrand)))
    throw new AccountError(400, 'Invalid card brand')
  const value = {
    customerId,
    amount,
    method: b.method,
    reference: String(b.reference ?? '')
      .trim()
      .slice(0, 60),
    cardBrand: b.method === 'card' ? (b.cardBrand ?? 'unknown') : null,
    by: String(b.by ?? 'Staff').slice(0, 60),
    till: String(b.till ?? 'Till').slice(0, 60)
  }
  const hash = crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
  return db.transaction(() => {
    const old = db.prepare('SELECT id,request_hash FROM account_payments WHERE request_id=?').get(b.requestId) as any
    if (old) {
      if (old.request_hash !== hash) throw new AccountError(409, 'This payment request was already used with different details')
      return { paymentId: old.id, account: customerAccount(db, customerId) }
    }
    const account = customerAccount(db, customerId)
    if (amount > account.balanceCents)
      throw new AccountError(400, 'Payment exceeds this POS account balance. Refresh and check QuickBooks before collecting money.')
    let remaining = amount
    const allocations: { id: number; amount: number }[] = []
    for (const i of [...account.invoices].reverse()) {
      const part = Math.min(remaining, i.balanceCents)
      if (!part) continue
      if (i.status === 'error') throw new AccountError(409, 'Resolve the invoice sync problem before taking a payment against it')
      allocations.push({ id: i.saleId, amount: part })
      remaining -= part
      if (!remaining) break
    }
    const arGroups=new Set(allocations.map(a=>(db.prepare('SELECT ar_account FROM account_invoices WHERE sale_id=?').get(a.id) as any).ar_account??''))
    if(arGroups.size>1)throw new AccountError(409,'This payment spans different Accounts Receivable accounts. Record a separate payment for each account (oldest invoices first).')
    if (remaining) throw new AccountError(409, 'Account balance changed. Refresh before collecting the payment.')
    const id = Number(
      db
        .prepare(
          'INSERT INTO account_payments(request_id,request_hash,customer_id,amount_cents,method,reference,card_brand,by_name,till_name) VALUES (?,?,?,?,?,?,?,?,?)'
        )
        .run(b.requestId, hash, customerId, amount, value.method, value.reference || null, value.cardBrand, value.by, value.till)
        .lastInsertRowid
    )
    for (const a of allocations) db.prepare('INSERT INTO account_allocations VALUES (?,?,?)').run(id, a.id, a.amount)
    return { paymentId: id, account: customerAccount(db, customerId) }
  })()
}
export function recordQbBalance(db: DB, saleId: number, balance: number) {
  const paid = (
    db
      .prepare(
        "SELECT COALESCE(SUM(a.amount_cents),0) AS n FROM account_allocations a JOIN account_payments p ON p.id=a.payment_id WHERE a.sale_id=? AND p.status='sent'"
      )
      .get(saleId) as { n: number }
  ).n
  db.prepare('UPDATE account_invoices SET qb_balance_cents=?,qb_pos_paid_cents=?,qb_checked_at=? WHERE sale_id=?').run(
    balance,
    paid,
    new Date().toISOString(),
    saleId
  )
}
/** Outstanding DiamondPOS invoice balances, using the same reconciliation rules as invoiceDue. */
export function accountBalanceCustomers(db:DB,search=''):AccountBalanceCustomer[]{
 const rows=db.prepare(`WITH paid AS (SELECT sale_id,SUM(amount_cents) amount FROM account_allocations GROUP BY sale_id),
 due AS (SELECT i.customer_id,MAX(0,MIN(s.total_cents-COALESCE(p.amount,0),CASE WHEN i.qb_balance_cents IS NULL THEN s.total_cents-COALESCE(p.amount,0) ELSE i.qb_balance_cents-(COALESCE(p.amount,0)-i.qb_pos_paid_cents) END)) balance
 FROM account_invoices i JOIN sales s ON s.id=i.sale_id LEFT JOIN paid p ON p.sale_id=i.sale_id)
 SELECT customer_id,SUM(balance) balance,COUNT(*) invoices FROM due WHERE balance>0 GROUP BY customer_id`).all() as {customer_id:number;balance:number;invoices:number}[]
 const terms=search.trim().toLowerCase().split(/\s+/).filter(Boolean)
 return rows.flatMap(row=>{const customer=getCustomer(db,row.customer_id);if(!customer)return []
  const text=[customerDisplayName(customer),customer.firstName,customer.lastName,customer.company,customer.customerNo,customer.phone,customer.mobile,customer.email,(customer.phone??'').replace(/\D/g,''),(customer.mobile??'').replace(/\D/g,'')].filter(Boolean).join(' ').toLowerCase()
  return terms.every(term=>text.includes(term))?[{customer,balanceCents:row.balance,invoiceCount:row.invoices}]:[]
 }).sort((a,b)=>customerDisplayName(a.customer).localeCompare(customerDisplayName(b.customer)))
}

export function registerAccountRoutes(app: express.Express, db: DB, syncing: () => boolean = () => false) {
  const wrap = (fn: (req: express.Request, res: express.Response) => void) => (req: express.Request, res: express.Response) => {
    try {
      fn(req, res)
    } catch (e) {
      res.status(e instanceof AccountError ? e.status : 400).json({ error: (e as Error).message })
    }
  }
  app.get('/api/accounts/balances',wrap((req,res)=>{res.json(accountBalanceCustomers(db,String(req.query.search??'').slice(0,200)))}))
  app.get(
    '/api/accounts/sync-status',
    wrap((_req, res) => {
      const rows = db
        .prepare(
          `SELECT 'invoice' AS kind,i.customer_id AS customerId,i.ref_number AS reference,i.status,i.error,s.created_at AS date FROM account_invoices i JOIN sales s ON s.id=i.sale_id
      UNION ALL SELECT 'payment',p.customer_id,p.id,p.status,p.error,p.created_at FROM account_payments p`
        )
        .all() as any[]
      const result = rows.map((row) => {
        const c = db.prepare('SELECT first_name,last_name,company,track_as_company FROM customers WHERE id=?').get(row.customerId) as any
        return {
          ...row,
          reference: row.kind === 'payment' ? 'AP' + Number(row.reference).toString(36).toUpperCase() : row.reference,
          customerName: c.track_as_company ? c.company : [c.first_name, c.last_name].filter(Boolean).join(' '),
          date: row.date.replace(' ', 'T') + 'Z'
        }
      })
      result.sort(
        (a, b) =>
          (b.status === 'error' ? 2 : b.status === 'pending' ? 1 : 0) - (a.status === 'error' ? 2 : a.status === 'pending' ? 1 : 0) ||
          b.date.localeCompare(a.date)
      )
      res.json(result.slice(0, 100))
    })
  )
  app.get(
    '/api/customers/:id/account',
    wrap((req, res) => res.json(customerAccount(db, Number(req.params.id))))
  )
  app.post(
    '/api/customers/:id/account-payments',
    wrap((req, res) => res.status(201).json(receiveAccountPayment(db, Number(req.params.id), req.body)))
  )
  app.post(
    '/api/accounts/retry',
    wrap((req, res) => {
      if (syncing()) throw new AccountError(409, 'QuickBooks is syncing. Wait for it to finish before retrying account transactions.')
      const customerId = Number(req.body?.customerId)
      db.prepare("UPDATE account_invoices SET status='pending',error=NULL WHERE customer_id=? AND status='error'").run(customerId)
      db.prepare("UPDATE account_payments SET status='pending',error=NULL WHERE customer_id=? AND status='error'").run(customerId)
      res.json(customerAccount(db, customerId))
    })
  )
}
