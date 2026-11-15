import crypto from 'node:crypto'
import type { DB } from './db'
import type { WorkOrder } from '../../shared/workorders'
import type { ApprovalConfig, EstimateInfo, EstimateSnapshot } from '../../shared/approvals'
import { partsOrderingNotice } from '../../shared/workOrderEmail'
import { loadWorkOrder, reconcileStock, addHistory } from './workorders'
import { readSettings } from './index'
interface Config extends ApprovalConfig {
  key: string
  cursor: number
}
export function approvalConfig(db: DB): Config {
  const r = db.prepare("SELECT value FROM settings WHERE key='approval_config'").get() as { value: string } | undefined
  const v = r ? JSON.parse(r.value) : {}
  return {
    enabled: false,
    url: 'https://oho.staging.tulsapickem.com/pos-approval/',
    key: '',
    serviceId: '',
    cursor: 0,
    followUpEnabled: true,
    afterDays: 3,
    lastSyncAt: null,
    error: null,
    ...v,
    hasKey: !!v.key
  }
}
export function approvalView(db: DB): ApprovalConfig {
  const { key: _, cursor: __, ...v } = approvalConfig(db)
  return v
}
function write(db: DB, v: Config) {
  db.prepare("INSERT INTO settings(key,value) VALUES ('approval_config',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(
    JSON.stringify(v)
  )
}
export function saveApprovalConfig(db: DB, b: Record<string, unknown>): ApprovalConfig {
  const c = approvalConfig(db),
    url = String(b.url ?? c.url).trim(),
    key = String(b.key ?? '').trim() || c.key
  const u = new URL(url)
  if (
    u.protocol !== 'https:' ||
    !['oho.staging.tulsapickem.com', 'morethanmowers.com', 'www.morethanmowers.com'].includes(u.hostname) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.port
  )
    throw new Error('Use the HTTPS approval folder on the staging site or morethanmowers.com')
  const days = Number(b.afterDays ?? c.afterDays)
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error('Follow-up days must be a whole number from 1 to 90')
  for (const name of ['enabled', 'followUpEnabled'])
    if (b[name] !== undefined && typeof b[name] !== 'boolean') throw new Error('Use the settings checkboxes')
  if (key && !/^[a-f0-9]{64}$/i.test(key)) throw new Error('Use the 64-character generated integration key')
  const changed = url !== c.url || key !== c.key
  if (changed && db.prepare("SELECT 1 FROM work_order_estimates WHERE state IN ('pending','prepared') LIMIT 1").get())
    throw new Error('Resolve or cancel pending estimates before changing the approval connection')
  const next = {
    ...c,
    url,
    key,
    afterDays: days,
    enabled: (b.enabled ?? c.enabled) as boolean,
    followUpEnabled: (b.followUpEnabled ?? c.followUpEnabled) as boolean,
    ...(changed ? { serviceId: '', cursor: 0, enabled: false } : {})
  }
  if (next.enabled && (!next.key || !next.serviceId)) throw new Error('Save the connection and test it before enabling online approvals')
  write(db, next)
  return approvalView(db)
}
export type Transport = (c: Config, op: string, payload?: unknown) => Promise<any>
export const approvalRequest: Transport = async (c, op, payload) => {
  const url = new URL('index.php', c.url.endsWith('/') ? c.url : c.url + '/')
  url.searchParams.set('api', op)
  const r = await fetch(url, {
    method: payload === undefined ? 'GET' : 'POST',
    headers: { 'X-DiamondPOS-Key': c.key, 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
    redirect: 'error'
  })
  const result = (await r.json()) as any
  if (!r.ok) throw new Error(result.error || `Approval website returned ${r.status}`)
  return result
}
export async function testApprovalConnection(db: DB, transport: Transport = approvalRequest) {
  const c = approvalConfig(db)
  if (!c.key) throw new Error('Save an integration key first')
  const r = await transport(c, 'health')
  if (r.protocol !== 1 || typeof r.serviceId !== 'string' || !r.serviceId)
    throw new Error('The approval website returned an invalid health response')
  if (c.serviceId && c.serviceId !== r.serviceId)
    throw new Error('Website database identity changed. Resolve existing estimates before reconfiguring.')
  write(db, { ...c, serviceId: r.serviceId, error: null })
  return approvalView(db)
}
export function snapshot(wo: WorkOrder): EstimateSnapshot {
  return {
    number: wo.number,
    customer: wo.customerName.split(' ')[0] || 'Customer',
    unit: [wo.unit.brand, wo.unit.model, wo.unit.unitType].filter(Boolean).join(' '),
    diagnosis: wo.diagnosis,
    lines: wo.lines.map((l) => ({ description: l.description, qty: l.qty, unitPriceCents: l.unitPriceCents })),
    totalCents: wo.totals.totalCents,
    taxCents: wo.totals.taxCents,
    balanceDueCents: wo.balanceDueCents,
    partsNotice: partsOrderingNotice('waiting_customer', wo.lines)
  }
}
// Stock/parts notice is informative, so arrivals do not invalidate an otherwise identical estimate.
export function estimateHash(wo: WorkOrder) {
  const { partsNotice: _, balanceDueCents: __, ...s } = snapshot(wo)
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ ...s, customerId: wo.customerId, unitId: wo.unit.id }))
    .digest('hex')
}
export function estimateInfo(db: DB, wo: WorkOrder, now = Date.now()): EstimateInfo | null {
  const r = db.prepare('SELECT * FROM work_order_estimates WHERE work_order_id=? ORDER BY revision DESC LIMIT 1').get(wo.id) as any
  if (!r) return null
  const c = approvalConfig(db),
    due = r.sent_at ? r.follow_up_at || new Date(Date.parse(r.sent_at) + c.afterDays * 86400000).toISOString() : null
  return {
    id: r.id,
    revision: r.revision,
    state: r.state,
    sentAt: r.sent_at,
    dueAt: due,
    due: c.followUpEnabled && wo.status === 'waiting_customer' && r.state === 'pending' && !!due && Date.parse(due) <= now,
    needsResend: ((r.state === 'pending' || r.state === 'prepared') && r.remote_cancelled === 1) || r.hash !== estimateHash(wo),
    amountCents: JSON.parse(r.snapshot_json).totalCents,
    decisionAt: r.decision_at,
    decisionBy: r.decision_by,
    comment: r.comment
  }
}
const sending = new Set<number>()
export async function sendEstimate(
  db: DB,
  wo: WorkOrder,
  by: string,
  send: (link: string) => Promise<void>,
  transport: Transport = approvalRequest
) {
  if (!['needs_estimate', 'waiting_customer'].includes(wo.status))
    throw new Error('Send estimates from Needs Estimate or Waiting on Customer')
  if (sending.has(wo.id)) throw new Error('An estimate is already being sent for this ticket')
  const c = approvalConfig(db)
  if (!c.enabled || !c.key || !c.serviceId) throw new Error('Configure, test and enable the approval website in Work Order Settings first')
  sending.add(wo.id)
  let id = ''
  try {
    id = crypto.randomUUID()
    const token = crypto.randomBytes(32).toString('hex'),
      hash = estimateHash(wo),
      s = snapshot(wo)
    const revision = Number(
      (db.prepare('SELECT COALESCE(MAX(revision),0)+1 AS n FROM work_order_estimates WHERE work_order_id=?').get(wo.id) as { n: number }).n
    )
    db.prepare(
      "INSERT INTO work_order_estimates(id,work_order_id,revision,hash,snapshot_json,state,service_id) VALUES (?,?,?,?,?,'prepared',?)"
    ).run(id, wo.id, revision, hash, JSON.stringify(s), c.serviceId)
    const remote = await transport(c, 'publish', {
      id,
      workOrder: wo.id,
      revision,
      hash,
      token,
      snapshot: s,
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString()
    })
    if (remote.serviceId !== c.serviceId) throw new Error('Approval website identity does not match the tested connection')
    const link = new URL('index.php', c.url.endsWith('/') ? c.url : c.url + '/')
    link.searchParams.set('token', token)
    await send(link.href)
    db.transaction(() => {
      db.prepare(
        "UPDATE work_order_estimates SET state='superseded' WHERE work_order_id=? AND id<>? AND state IN ('pending','prepared')"
      ).run(wo.id, id)
      db.prepare("UPDATE work_order_estimates SET state='pending',sent_at=? WHERE id=?").run(new Date().toISOString(), id)
      const current = loadWorkOrder(db, wo.id, readSettings(db).taxRate)!
      if (['needs_estimate', 'waiting_customer'].includes(current.status))
        db.prepare(
          "UPDATE work_orders SET status='waiting_customer',last_emailed_at=datetime('now'),last_emailed_status='waiting_customer',updated_at=datetime('now') WHERE id=?"
        ).run(wo.id)
      else
        db.prepare(
          "UPDATE work_order_estimates SET state='review',comment='Ticket stage changed while estimate email was sending' WHERE id=?"
        ).run(id)
      addHistory(
        db,
        wo.id,
        `Estimate revision ${revision} emailed: $${(s.totalCents / 100).toFixed(2)}. Waiting for customer decision.`,
        by,
        'waiting_customer'
      )
    })()
  } catch (e) {
    if (id) {
      db.prepare("UPDATE work_order_estimates SET state='failed',comment=? WHERE id=? AND state='prepared'").run(
        (e as Error).message.slice(0, 500),
        id
      )
      try {
        await transport(c, 'cancel', { id })
      } catch {
        /* Local state prevents accepting an uncertain email's decision. */
      }
    }
    throw e
  } finally {
    sending.delete(wo.id)
  }
}
export function applyDecision(db: DB, event: any, by = 'Website customer') {
  if (
    !event ||
    !['approved', 'declined'].includes(event.decision) ||
    typeof event.id !== 'string' ||
    typeof event.hash !== 'string' ||
    typeof event.name !== 'string' ||
    !event.name.trim() ||
    event.name.length > 100 ||
    typeof event.comment !== 'string' ||
    event.comment.length > 1000 ||
    !Number.isFinite(Date.parse(event.at))
  )
    throw new Error('Invalid approval decision received')
  const row = db.prepare('SELECT * FROM work_order_estimates WHERE id=?').get(event.id) as any
  if (!row) return // Other installation's records cannot change a local ticket.
  if (row.state === 'prepared') throw new Error('Estimate email is still being sent; this decision will be checked again.')
  if (row.state !== 'pending') return
  db.transaction(() => {
    const wo = loadWorkOrder(db, row.work_order_id, readSettings(db).taxRate)!
    const matches =
      event.hash === row.hash &&
      row.hash === estimateHash(wo) &&
      wo.status === 'waiting_customer' &&
      row.service_id === approvalConfig(db).serviceId
    db.prepare('UPDATE work_order_estimates SET state=?,decision_at=?,decision_by=?,comment=? WHERE id=?').run(
      matches ? event.decision : 'review',
      event.at,
      event.name,
      event.comment,
      row.id
    )
    if (matches) {
      const stage = event.decision === 'approved' ? 'approved' : 'not_fixed'
      db.prepare("UPDATE work_orders SET status=?,updated_at=datetime('now') WHERE id=?").run(stage, wo.id)
      reconcileStock(db, wo.id)
    }
    addHistory(
      db,
      wo.id,
      `Estimate revision ${row.revision}: ${event.decision} by ${event.name}${matches ? '' : ' — estimate or stage changed; STAFF REVIEW REQUIRED'}. ${event.comment}`,
      by,
      matches ? (event.decision === 'approved' ? 'approved' : 'not_fixed') : null
    )
  })()
}
let syncing = false
export async function syncApprovals(db: DB, transport: Transport = approvalRequest) {
  const c = approvalConfig(db)
  if (!c.enabled || syncing) return approvalView(db)
  syncing = true
  try {
    const r = await transport(c, 'decisions', { after: c.cursor })
    if (r.serviceId !== c.serviceId || !Array.isArray(r.events) || r.events.length > 100)
      throw new Error('Approval website identity or response does not match')
    if (!approvalConfig(db).enabled) return approvalView(db)
    let cursor = c.cursor
    for (const event of r.events) {
      if (!Number.isSafeInteger(event.sequence) || event.sequence <= cursor) throw new Error('Invalid approval event order')
      applyDecision(db, event)
      cursor = event.sequence
      write(db, { ...approvalConfig(db), cursor })
    }
    // Invalidate stale/closed links at the website. Local hash checking also protects a decision arriving before this sync.
    const pending = db.prepare('SELECT id,work_order_id,hash,state FROM work_order_estimates WHERE remote_cancelled=0').all() as any[]
    for (const row of pending) {
      const wo = loadWorkOrder(db, row.work_order_id, readSettings(db).taxRate)
      if (
        !wo ||
        !['pending', 'prepared'].includes(row.state) ||
        estimateHash(wo) !== row.hash ||
        !['needs_estimate', 'waiting_customer'].includes(wo.status)
      ) {
        await transport(c, 'cancel', { id: row.id })
        db.prepare('UPDATE work_order_estimates SET remote_cancelled=1 WHERE id=?').run(row.id)
      }
    }
    write(db, { ...approvalConfig(db), lastSyncAt: new Date().toISOString(), error: null })
  } catch (e) {
    write(db, { ...approvalConfig(db), error: (e as Error).message.slice(0, 500) })
    throw e
  } finally {
    syncing = false
  }
  return approvalView(db)
}
export function startApprovalScheduler(db: DB) {
  let current: Promise<unknown> | null = null
  const run = () => {
    current = syncApprovals(db)
      .catch(() => {})
      .finally(() => {
        current = null
      })
  }
  const timer = setInterval(run, 60000)
  timer.unref()
  return async () => {
    clearInterval(timer)
    await current
  }
}
