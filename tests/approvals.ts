import assert from 'node:assert/strict'
import {
  approvalConfig,
  approvalView,
  saveApprovalConfig,
  testApprovalConnection,
  sendEstimate,
  estimateInfo,
  estimateHash,
  applyDecision,
  syncApprovals,
  type Transport
} from '../src/main/server/approvals'
import { loadWorkOrder, prepareWorkOrderSale } from '../src/main/server/workorders'
import { readSettings } from '../src/main/server'
import type { DB } from '../src/main/server/db'
export async function testApprovals(
  check: (name: string, fn: () => void) => void,
  db: DB,
  call: (url: string, method?: string, value?: unknown) => Promise<{ status: number; data: any }>
) {
  const customer = Number(
    db.prepare("INSERT INTO customers(first_name,last_name,email) VALUES ('Approval','Customer','test@example.com')").run().lastInsertRowid
  )
  const unit = Number(db.prepare("INSERT INTO customer_units(customer_id,model) VALUES (?,'Test mower')").run(customer).lastInsertRowid)
  const id = Number(db.prepare('INSERT INTO work_orders(customer_id,unit_id) VALUES (?,?)').run(customer, unit).lastInsertRowid)
  const wo = () => loadWorkOrder(db, id, readSettings(db).taxRate)!
  db.prepare("UPDATE products SET type='inventory',on_hand=10 WHERE id=1").run()
  db.prepare(
    "INSERT INTO work_order_lines(work_order_id,kind,product_id,description,qty,unit_price_cents) VALUES (?,'part',1,'Test part',1,100)"
  ).run(id)
  const published: any[] = [],
    cancelled: string[] = [],
    events: any[] = []
  const remote: Transport = async (_c, op, payload: any) => {
    if (op === 'health') return { protocol: 1, serviceId: 'test-service' }
    if (op === 'publish') {
      published.push(payload)
      return { serviceId: 'test-service' }
    }
    if (op === 'cancel') {
      cancelled.push(payload.id)
      return { serviceId: 'test-service' }
    }
    if (op === 'decisions') return { serviceId: 'test-service', events: events.filter((e) => e.sequence > payload.after) }
    throw new Error('Unknown operation')
  }
  check('approval defaults are disabled, follow-up defaults to 3 days, and secret is not returned', () => {
    assert.equal(approvalView(db).enabled, false)
    assert.equal(approvalView(db).afterDays, 3)
    assert.equal(approvalView(db).followUpEnabled, true)
    assert.ok(!('key' in approvalView(db)))
    for (const url of [
      'http://morethanmowers.com/approval/',
      'https://localhost/',
      'https://evil.example/',
      'https://morethanmowers.com/?key=x'
    ])
      assert.throws(() => saveApprovalConfig(db, { url }))
    for (const afterDays of [0, 1.5, 91]) assert.throws(() => saveApprovalConfig(db, { afterDays }))
  })
  saveApprovalConfig(db, { key: 'a'.repeat(64) })
  await testApprovalConnection(db, remote)
  saveApprovalConfig(db, { enabled: true })
  check('connection must be tested before enabling and preserves a saved key without exposing it', () => {
    assert.equal(approvalView(db).enabled, true)
    assert.equal(approvalView(db).hasKey, true)
    assert.equal(approvalConfig(db).key, 'a'.repeat(64))
    assert.ok(!JSON.stringify(approvalView(db)).includes('a'.repeat(64)))
  })
  await assert.rejects(
    sendEstimate(
      db,
      wo(),
      'Test staff',
      async () => {
        throw new Error('SMTP failed')
      },
      remote
    ),
    /SMTP failed/
  )
  check('SMTP failure does not start follow-up, move stage, or permit an uncertain link decision', () => {
    const info = wo().estimate!
    assert.equal(info.state, 'failed')
    assert.equal(info.sentAt, null)
    assert.equal(info.due, false)
    assert.equal(wo().status, 'needs_estimate')
    assert.ok(cancelled.includes(info.id))
  })
  let emailedLink = ''
  await sendEstimate(
    db,
    wo(),
    'Test staff',
    async (link) => {
      emailedLink = link
      const pending = wo()
      assert.throws(
        () =>
          applyDecision(db, {
            id: pending.estimate!.id,
            hash: estimateHash(pending),
            decision: 'approved',
            name: 'Early customer',
            comment: '',
            at: new Date().toISOString()
          }),
        /still being sent/
      )
    },
    remote
  )
  check('successful estimate send starts waiting stage and creates a revision-bound HTTPS link', () => {
    assert.equal(wo().status, 'waiting_customer')
    assert.equal(wo().estimate!.state, 'pending')
    assert.ok(wo().estimate!.sentAt)
    assert.ok(emailedLink.startsWith('https://oho.staging.tulsapickem.com/pos-approval/index.php?token='))
    assert.equal(db.prepare('SELECT on_hand FROM products WHERE id=1').get().on_hand, 10)
    assert.equal(wo().estimate!.due, false)
  })
  db.prepare('UPDATE work_order_estimates SET sent_at=? WHERE id=?').run(
    new Date(Date.now() - 4 * 86400000).toISOString(),
    wo().estimate!.id
  )
  check('follow-up flags only waiting unanswered sent estimates at the configured threshold', () => {
    assert.equal(wo().estimate!.due, true)
    saveApprovalConfig(db, { afterDays: 7 })
    assert.equal(wo().estimate!.due, false)
    saveApprovalConfig(db, { afterDays: 3, followUpEnabled: false })
    assert.equal(wo().estimate!.due, false)
    saveApprovalConfig(db, { followUpEnabled: true })
    assert.equal(wo().estimate!.due, true)
  })
  const calls = await call('/api/workorders?status=needs_call')
  assert.ok(calls.data.some((w: any) => w.id === id))
  const record = await call(`/api/workorders/${id}/follow-up`, 'POST', { note: 'Left voicemail', days: 2, by: 'Staff' })
  check('call list includes overdue tickets and contact log reschedules without changing the decision', () => {
    assert.equal(record.status, 200)
    assert.equal(wo().estimate!.due, false)
    assert.equal(wo().estimate!.state, 'pending')
    assert.ok(wo().history.some((h) => h.note.includes('Left voicemail')))
  })
  assert.throws(() => saveApprovalConfig(db, { url: 'https://morethanmowers.com/pos-approval/' }), /pending estimates/)
  const before = wo()
  db.prepare('UPDATE work_order_lines SET unit_price_cents=200 WHERE work_order_id=?').run(id)
  const old = {
    id: before.estimate!.id,
    hash: estimateHash(before),
    decision: 'approved',
    name: 'Test customer',
    comment: 'Yes',
    at: new Date().toISOString()
  }
  applyDecision(db, old)
  check('an old estimate response cannot authorize changed prices and is flagged for staff review', () => {
    assert.equal(wo().status, 'waiting_customer')
    assert.equal(wo().estimate!.state, 'review')
    assert.equal(wo().estimate!.needsResend, true)
    assert.equal(db.prepare('SELECT on_hand FROM products WHERE id=1').get().on_hand, 10)
  })
  await sendEstimate(db, wo(), 'Staff', async () => {}, remote)
  const latest = wo()
  events.push({ ...old, id: latest.estimate!.id, hash: estimateHash(latest), sequence: 1 })
  await syncApprovals(db, remote)
  check('matching website approval changes stage, clears follow-up and takes stock exactly once', () => {
    assert.equal(wo().status, 'approved')
    assert.equal(wo().estimate!.state, 'approved')
    assert.equal(wo().estimate!.due, false)
    assert.equal(db.prepare('SELECT on_hand FROM products WHERE id=1').get().on_hand, 9)
  })
  await syncApprovals(db, remote)
  check('repeated polling is idempotent and a changed website identity is rejected', () => {
    assert.equal(db.prepare('SELECT on_hand FROM products WHERE id=1').get().on_hand, 9)
    assert.equal(approvalConfig(db).cursor, 1)
    assert.ok(cancelled.includes(latest.estimate!.id))
    assert.equal(wo().estimate!.needsResend, false)
  })
  await assert.rejects(
    syncApprovals(db, async () => ({ serviceId: 'wrong-site', events: [] })),
    /identity/
  )
  check('connection failure is visible and does not pretend customer decisions were synchronized', () => {
    assert.match(approvalView(db).error!, /identity/)
    assert.equal(approvalConfig(db).cursor, 1)
  })
  check('changing an approved repair total requires new approval before checkout', () => {
    db.prepare("UPDATE work_orders SET status='ready_pickup' WHERE id=?").run(id)
    assert.ok(prepareWorkOrderSale(db, id, 'repair', readSettings(db).taxRate))
    db.prepare('UPDATE work_order_lines SET unit_price_cents=250 WHERE work_order_id=?').run(id)
    assert.throws(() => prepareWorkOrderSale(db, id, 'repair', readSettings(db).taxRate), /current estimate/)
  })
  db.prepare("UPDATE work_orders SET status='needs_estimate' WHERE id=?").run(id)
  await sendEstimate(db, wo(), 'Staff', async () => {}, remote)
  const decline = wo()
  applyDecision(db, { ...old, id: decline.estimate!.id, hash: estimateHash(decline), decision: 'declined', comment: 'No thanks' })
  check('declining stops follow-up and moves to Not Fixed without taking more inventory', () => {
    assert.equal(wo().status, 'not_fixed')
    assert.equal(wo().estimate!.state, 'declined')
    assert.equal(wo().estimate!.due, false)
  })
  // Reading previews never sends mail or creates approval records.
  const n = db.prepare('SELECT COUNT(*) AS n FROM work_order_estimates').get().n
  const preview = await call(`/api/workorders/${id}/email-preview?estimate=1`)
  const unread=await call('/api/workorders/responses')
  check('website decisions create durable unread notices including approvals, declines and review cases',()=>{
    assert.equal(unread.status,200)
    assert.ok(unread.data.some((r:any)=>r.id===decline.estimate!.id&&r.decision==='declined'))
    assert.ok(unread.data.some((r:any)=>r.id===latest.estimate!.id&&r.decision==='approved'))
    assert.ok(unread.data.some((r:any)=>r.review))
  })
  const seenId=unread.data[0].id
  await call('/api/workorders/responses/read','POST',{ids:[seenId]})
  await call('/api/workorders/responses/read','POST',{ids:[seenId]})
  const remaining=await call('/api/workorders/responses')
  check('click acknowledgement is idempotent and does not clear responses outside the clicked list',()=>{
    assert.equal(remaining.data.length,unread.data.length-1)
    assert.ok(!remaining.data.some((r:any)=>r.id===seenId))
    assert.ok(db.prepare('SELECT seen_at FROM estimate_notifications WHERE estimate_id=?').get(seenId).seen_at)
  })
  check('estimate preview shows approval-link explanation without publishing a live token', () => {
    assert.equal(preview.status, 200)
    assert.ok(preview.data.html.includes('links will be added'))
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM work_order_estimates').get().n, n)
  })
  saveApprovalConfig(db, { enabled: false })
}
