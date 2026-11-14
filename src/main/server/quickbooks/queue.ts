import type express from 'express'
import type { DB } from '../db'
import type { StoreSettings } from '../../../shared/types'
import type { QbQueuePage, QbQueueRow, QbQueueState } from '../../../shared/quickbooks'
import { getQbConfig, qbLog } from './store'
import { individualSummaries } from './summary'

const states: QbQueueState[] = ['waiting', 'synced', 'failed', 'manual', 'excluded']
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
export interface QueueOptions { status?: string; search?: string; from?: string; to?: string; page?: number; ids?: number[] }

/** Includes sales with no export row yet. Reading the queue never changes export state. */
export function transactionQueue(db: DB, options: QueueOptions = {}): QbQueuePage {
  const cfg = getQbConfig(db)
  const page = Math.max(1, Math.floor(options.page ?? 1))
  const pageSize = options.ids ? 100 : 50
  const ids = options.ids?.length ? ` AND s.id IN (${options.ids.map(() => '?').join(',')})` : ''
  const cte = `WITH tenders AS (
    SELECT p.sale_id, p.method, SUM(p.amount_cents) - CASE WHEN p.method = 'cash' THEN MAX(s.change_cents) ELSE 0 END AS net
    FROM payments p JOIN sales s ON s.id = p.sale_id GROUP BY p.sale_id, p.method
  ), paid AS (
    SELECT sale_id, SUM(CASE WHEN net <> 0 THEN 1 ELSE 0 END) AS methods, SUM(net) AS total FROM tenders GROUP BY sale_id
  ), base AS (
    SELECT s.id AS saleId, date(s.created_at, 'localtime') AS saleDate, s.created_at AS createdAt,
      s.total_cents AS totalCents, s.status AS saleStatus, e.id AS exportId, e.ref_number AS refNumber,
      v.qb_status AS voidStatus, v.qb_error AS voidError, e.txn_id AS txnId, e.sent_at AS sentAt, e.status AS exportStatus,
      CASE WHEN EXISTS (SELECT 1 FROM qb_exports old WHERE old.sale_date = date(s.created_at, 'localtime'))
        OR s.total_cents <= 0 OR COALESCE(paid.methods,0) <> 1 OR paid.total <> s.total_cents OR e.status = 'manual'
        THEN 1 ELSE 0 END AS manualRequired,
      COALESCE(e.customer_name, NULLIF(CASE WHEN c.track_as_company = 1 THEN c.company
        ELSE TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')) END, ''), ?) AS customerName,
      CASE
        WHEN s.status = 'void' THEN CASE v.qb_status WHEN 'confirmed' THEN 'VOID: QuickBooks confirmed the correction.' WHEN 'not_needed' THEN 'VOID: not exported to QuickBooks.' WHEN 'error' THEN COALESCE(v.qb_error,'Void correction failed.') WHEN 'pending' THEN 'VOID: QuickBooks correction pending.' ELSE 'Void / noncompleted receipt.' END
        WHEN s.status <> 'completed' THEN 'Sale is not completed.'
        WHEN date(s.created_at, 'localtime') < ? THEN 'Before the configured sync start date.'
        WHEN date(s.created_at, 'localtime') > ? THEN 'Future-dated sale; not eligible yet.'
        WHEN EXISTS (SELECT 1 FROM qb_exports old WHERE old.sale_date = date(s.created_at, 'localtime')) THEN 'Old daily export exists: reconcile in QuickBooks to avoid duplicates.'
        WHEN s.total_cents <= 0 THEN 'Refund or zero-total exchange: enter/reconcile in QuickBooks by hand.'
        WHEN COALESCE(paid.methods,0) <> 1 THEN 'Split or missing payment: enter/reconcile in QuickBooks by hand.'
        WHEN paid.total <> s.total_cents THEN 'Payments do not match the sale total; review in QuickBooks.'
        WHEN e.status = 'manual' THEN COALESCE(e.error, 'Manual entry required.')
        ELSE COALESCE(e.error, '') END AS reason
    FROM sales s LEFT JOIN sale_voids v ON v.sale_id=s.id LEFT JOIN customers c ON c.id = s.customer_id
    LEFT JOIN qb_sale_exports e ON e.sale_id = s.id LEFT JOIN paid ON paid.sale_id = s.id
    WHERE 1=1 ${ids}
  ), classified AS (
    SELECT *, CASE
      WHEN saleStatus = 'void' THEN CASE voidStatus WHEN 'confirmed' THEN 'synced' WHEN 'pending' THEN 'waiting' WHEN 'error' THEN 'failed' ELSE 'excluded' END
      WHEN exportStatus = 'sent' THEN 'synced'
      WHEN saleStatus <> 'completed' OR saleDate < ? OR saleDate > ? THEN 'excluded'
      WHEN manualRequired = 1 THEN 'manual'
      WHEN exportStatus = 'error' THEN 'failed'
      ELSE 'waiting' END AS status FROM base
  ), filtered AS (
    SELECT * FROM classified WHERE (? = '' OR CAST(saleId AS TEXT) LIKE ? ESCAPE '\\' OR customerName LIKE ? ESCAPE '\\' OR COALESCE(refNumber,'') LIKE ? ESCAPE '\\')
      AND (? = '' OR saleDate >= ?) AND (? = '' OR saleDate <= ?)
  )`
  const search = (options.search ?? '').trim().replace(/^#/, '').slice(0, 120)
  const like = `%${search.replace(/[\\%_]/g, '\\$&')}%`
  const from = options.from ?? '', to = options.to ?? ''
  const args = [cfg.customerName, cfg.startDate, localToday(), ...(options.ids ?? []), cfg.startDate, localToday(), search, like, like, like, from, from, to, to]
  const state = options.status && states.includes(options.status as QbQueueState) ? options.status : ''
  const where = state ? ' WHERE status = ?' : ''
  const selection = state ? [state] : []
  const total = (db.prepare(cte + ` SELECT COUNT(*) AS n FROM filtered${where}`).get(...args, ...selection) as { n: number }).n
  const counts = Object.fromEntries(states.map((s) => [s, 0])) as Record<QbQueueState, number>
  for (const r of db.prepare(cte + ' SELECT status, COUNT(*) AS n FROM filtered GROUP BY status').all(...args) as { status: QbQueueState; n: number }[]) counts[r.status] = r.n
  const rows = db.prepare(cte + ` SELECT * FROM filtered${where} ORDER BY saleId DESC LIMIT ? OFFSET ?`).all(...args, ...selection, pageSize, (page - 1)*pageSize) as
    (QbQueueRow & { exportStatus: string | null; saleStatus:string })[]
  return { total, page, pageSize, counts, rows: rows.map((r) => ({
    saleId: r.saleId, saleDate: r.saleDate, createdAt: r.createdAt.replace(' ','T')+'Z', customerName: r.customerName,
    totalCents: r.totalCents, status: r.status,
    reason: r.status === 'synced' && r.saleStatus !== 'void' ? (r.txnId === 'MANUAL' ? 'Marked as entered by hand.' : 'QuickBooks confirmed this transaction.') : r.reason,
    exportId: r.exportId, refNumber: r.refNumber, txnId: r.txnId,
    sentAt: r.sentAt ? r.sentAt.replace(' ','T')+'Z' : null,
    eligible: r.saleStatus === 'completed' && (r.status === 'waiting' || r.status === 'failed'), queued: r.saleStatus === 'completed' && r.exportStatus === 'pending'
  })) }
}

export function queueTransactions(db: DB, saleIds: number[], storeRate: number, qbRate: number | null): number {
  return db.transaction(() => {
    if (!saleIds.length || saleIds.length > 100 || saleIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw new Error('Select 1–100 valid POS receipt IDs')
    const ids = [...new Set(saleIds)]
    const rows = transactionQueue(db, { ids }).rows
    if (rows.length !== ids.length || rows.some((r) => !r.eligible)) throw new Error('Selection changed or contains synced, excluded or manual transactions. Refresh the queue and select eligible rows.')
    const cfg = getQbConfig(db)
    const dates = [...new Set(rows.map((r) => r.saleDate))]
    for (const date of dates) {
      const summaries = individualSummaries(db, date, cfg, storeRate, qbRate, ids)
      for (const s of summaries) {
        if (s.manualReason) throw new Error('A selected transaction needs manual reconciliation. Refresh the queue.')
        db.prepare(`INSERT INTO qb_sale_exports (sale_id, customer_name, sale_date, method, ref_number, total_cents, sale_count)
          VALUES (?, ?, ?, ?, ?, ?, 1) ON CONFLICT(sale_id) DO UPDATE SET status = 'pending', error = NULL, updated_at = datetime('now')
          WHERE qb_sale_exports.status IN ('pending', 'error')`).run(s.saleId!, s.customerName!, s.saleDate, s.method, s.refNumber, s.totalCents)
      }
    }
    qbLog(db, 'info', `Queued POS receipts for the next connector run: ${ids.join(', ')}`)
    return ids.length
  })()
}
export function registerQueueRoutes(app: express.Express, db: DB, settings: (db: DB) => StoreSettings, rate: () => number | null, syncing: () => boolean) {
  app.get('/api/qb/queue', (req, res) => {
    const q = req.query
    for (const date of [q.from, q.to]) if (date && !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return res.status(400).json({ error: 'Dates must be YYYY-MM-DD' })
    if (q.from && q.to && String(q.from) > String(q.to)) return res.status(400).json({ error: 'From date must not be after To date' })
    const page = Number(q.page ?? 1)
    if (!Number.isSafeInteger(page) || page < 1) return res.status(400).json({ error: 'Invalid page' })
    if (q.status && !states.includes(String(q.status) as QbQueueState)) return res.status(400).json({ error: 'Invalid status' })
    res.json(transactionQueue(db, { page, status: String(q.status ?? ''), search: String(q.search ?? ''), from: String(q.from ?? ''), to: String(q.to ?? '') }))
  })
  app.post('/api/qb/queue', (req, res) => {
    const ids = req.body?.saleIds
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100 || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) return res.status(400).json({ error: 'Select 1–100 valid POS receipt IDs' })
    if (syncing()) return res.status(409).json({ error: 'QuickBooks is syncing. Wait for it to finish, then refresh the queue.' })
    try { res.json({ queued: queueTransactions(db, ids, settings(db).taxRate, rate()) }) }
    catch (error) { res.status(409).json({ error: (error as Error).message }) }
  })
}
