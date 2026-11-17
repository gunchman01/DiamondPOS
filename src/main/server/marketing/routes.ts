import { consentConfig } from './consent'
/** Marketing API: audiences, mailers (campaigns) and email settings. All need the store pairing code. */
import type express from 'express'
import type { DB } from '../db'
import type { StoreSettings } from '../../../shared/types'
import type { Campaign, CampaignSend, SmtpSettings } from '../../../shared/marketing'
import { audienceOptions, normaliseAudience, runAudience } from './audience'
import { isCampaignSending, getSmtp, saveSmtp, sendMailer, sendSmtpTest, smtpProblems, smtpView } from './mailer'

interface CampaignRow {
  id: number
  name: string
  subject: string
  message: string
  flyer: string | null
  audience: string
  status: Campaign['status']
  last_error: string | null
  created_at: string
  sent_at: string | null
  total: number
  sent: number
  skipped: number
  tracked_sent: number
  opened: number
  clicked: number
  failed: number
}

const iso = (t: string | null) => (t ? t.replace(' ', 'T') + 'Z' : null)

export function registerMarketingRoutes(app: express.Express, db: DB, readSettings: (db: DB) => StoreSettings) {
  const select = `SELECT mc.*,
      (SELECT COUNT(*) FROM marketing_sends s WHERE s.campaign_id = mc.id) AS total,
      (SELECT COUNT(*) FROM marketing_sends s WHERE s.campaign_id = mc.id AND s.status = 'sent') AS sent,
      (SELECT COUNT(*) FROM marketing_sends s WHERE s.campaign_id = mc.id AND s.status = 'failed') AS failed,
      (SELECT COUNT(*) FROM marketing_sends s WHERE s.campaign_id=mc.id AND s.status='skipped') AS skipped,
      (SELECT COUNT(*) FROM marketing_sends s WHERE s.campaign_id=mc.id AND s.status='sent' AND s.tracking_active=1) AS tracked_sent,
      (SELECT COUNT(*) FROM marketing_sends s WHERE s.campaign_id=mc.id AND s.status='sent' AND s.tracking_active=1 AND EXISTS(SELECT 1 FROM marketing_activity a WHERE a.send_id=s.id AND a.kind='open')) AS opened,
      (SELECT COUNT(*) FROM marketing_sends s WHERE s.campaign_id=mc.id AND s.status='sent' AND s.tracking_active=1 AND EXISTS(SELECT 1 FROM marketing_activity a WHERE a.send_id=s.id AND a.kind='click')) AS clicked
    FROM marketing_campaigns mc`
  const toCampaign = (r: CampaignRow, withFlyer = true): Campaign => ({
    id: r.id,
    name: r.name,
    subject: r.subject,
    message: r.message,
    flyer: withFlyer ? r.flyer : r.flyer ? 'yes' : null,
    audience: normaliseAudience(JSON.parse(r.audience || '{}')),
    status: r.status,
    createdAt: iso(r.created_at)!,
    sentAt: iso(r.sent_at),
    total: r.total,
    sent: r.sent,
    failed: r.failed,
    skipped: r.skipped,
    trackedSent: r.tracked_sent,
    opened: r.opened,
    clicked: r.clicked,
    lastError: r.last_error
  })
  // Polling/list rows never retrieve the multi-megabyte flyer payload.
  const listSelect=select.replace('mc.*',"mc.id,mc.name,mc.subject,mc.message,CASE WHEN mc.flyer IS NULL THEN NULL ELSE 'yes' END AS flyer,mc.audience,mc.status,mc.last_error,mc.created_at,mc.sent_at")
  const get = (id: number,withFlyer=true) => {
    const r = db.prepare(`${withFlyer?select:listSelect} WHERE mc.id = ?`).get(id) as CampaignRow | undefined
    return r ? toCampaign(r,withFlyer) : null
  }
  const fail = (res: express.Response, status: number, error: string) => res.status(status).json({ error })

  function readInput(b: Record<string, unknown>) {
    const str = (v: unknown, max: number) => String(v ?? '').slice(0, max)
    const flyer = b.flyer === null || b.flyer === undefined || b.flyer === '' ? null : String(b.flyer)
    if (flyer && !/^data:image\/(jpeg|png);base64,/.test(flyer)) throw new Error('The flyer must be a JPG or PNG picture')
    if (flyer && flyer.length > 6_000_000) throw new Error('The flyer picture is too large (keep it under about 4 MB)')
    return {
      name: str(b.name, 120).trim() || 'Untitled mailer',
      subject: str(b.subject, 200).trim(),
      message: str(b.message, 5000),
      flyer,
      audience: JSON.stringify(normaliseAudience(b.audience))
    }
  }
  const wrap =
    (fn: (req: express.Request, res: express.Response) => unknown) => async (req: express.Request, res: express.Response) => {
      try {
        await fn(req, res)
      } catch (e) {
        if (!res.headersSent) fail(res, 400, (e as Error).message)
      }
    }

  // ---------- Audience ----------
  app.get('/api/marketing/options', (_req, res) => res.json(audienceOptions(db)))
  app.post('/api/marketing/audience', (req, res) => res.json(runAudience(db, req.body?.audience, 500)))

  // ---------- Mailers ----------
  app.get('/api/marketing/campaigns', (_req, res) => {
    const rows = db.prepare(`${listSelect} ORDER BY mc.id DESC`).all() as CampaignRow[]
    res.json(rows.map((r) => toCampaign(r, false)))
  })

  app.get('/api/marketing/campaigns/:id', (req, res) => {
    const c = get(Number(req.params.id),req.query.summary!=='1')
    if (!c) return fail(res, 404, 'Mailer not found')
    res.json(c)
  })

  app.post(
    '/api/marketing/campaigns',
    wrap((req, res) => {
      const x = readInput(req.body ?? {})
      const info = db
        .prepare('INSERT INTO marketing_campaigns (name, subject, message, flyer, audience) VALUES (?, ?, ?, ?, ?)')
        .run(x.name, x.subject, x.message, x.flyer, x.audience)
      res.status(201).json(get(Number(info.lastInsertRowid)))
    })
  )

  app.put(
    '/api/marketing/campaigns/:id',
    wrap((req, res) => {
      const c = get(Number(req.params.id))
      if (!c) return fail(res, 404, 'Mailer not found')
      if (c.status !== 'draft') return fail(res, 409, 'This mailer has already been sent. Make a copy to change it.')
      const x = readInput(req.body ?? {})
      db.prepare('UPDATE marketing_campaigns SET name = ?, subject = ?, message = ?, flyer = ?, audience = ? WHERE id = ?').run(
        x.name,
        x.subject,
        x.message,
        x.flyer,
        x.audience,
        c.id
      )
      res.json(get(c.id))
    })
  )

  app.post('/api/marketing/campaigns/:id/copy', (req, res) => {
    const c = get(Number(req.params.id))
    if (!c) return fail(res, 404, 'Mailer not found')
    const info = db
      .prepare('INSERT INTO marketing_campaigns (name, subject, message, flyer, audience) VALUES (?, ?, ?, ?, ?)')
      .run(`${c.name} (copy)`.slice(0, 120), c.subject, c.message, c.flyer, JSON.stringify(c.audience))
    res.status(201).json(get(Number(info.lastInsertRowid)))
  })

  app.post('/api/marketing/campaigns/:id/remove', (req, res) => {
    const c = get(Number(req.params.id))
    if (!c) return fail(res, 404, 'Mailer not found')
    if (c.status === 'sending'||isCampaignSending(c.id)) return fail(res,409,'Stop sending first and wait for the current email to finish before deleting this campaign')
    db.transaction(()=>{db.prepare('DELETE FROM marketing_sends WHERE campaign_id=?').run(c.id);db.prepare('DELETE FROM marketing_campaigns WHERE id=?').run(c.id)})()
    res.json({ ok: true })
  })

  /** Problems that stop a mailer being sent */
  function sendProblems(c: Campaign): string[] {
    const out = smtpProblems(getSmtp(db)).map((p) => `Email settings: ${p}`)
    if (!readSettings(db).storeAddress.trim()) out.push('Add the store postal address in Settings (the law requires it in marketing emails)')
    if (!c.subject.trim()) out.push('Enter a subject')
    if (!c.flyer && !c.message.trim()) out.push('Add a flyer picture or a message')
    return out
  }

  app.post(
    '/api/marketing/campaigns/:id/test',
    wrap(async (req, res) => {
      const c = get(Number(req.params.id))
      if (!c) return fail(res, 404, 'Mailer not found')
      const to = String(req.body?.email ?? '').trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return fail(res, 400, 'Enter the email address to send the test to')
      const consent = consentConfig(db)
    if(!consent.enabled||!consent.url||!consent.apiKey)return fail(res,400,'Configure Website marketing consent in Settings → Email first')
    const problems = sendProblems(c)
      if (problems.length) return fail(res, 400, problems.join('. '))
      await sendMailer(db, readSettings(db), {
        to,
        recipientName: 'Test',
        subject: `[TEST] ${c.subject}`,
        message: c.message,
        flyer: c.flyer
      })
      res.json({ ok: true })
    })
  )

  // Send to the audience: recipients are fixed at this moment, then sent in the background
  app.post('/api/marketing/campaigns/:id/send', (req, res) => {
    const c = get(Number(req.params.id))
    if (!c) return fail(res, 404, 'Mailer not found')
    if (c.status !== 'draft') return fail(res, 409, 'This mailer has already been sent')
    const consent=consentConfig(db)
    if(!consent.enabled||!consent.url||!consent.apiKey)return fail(res,400,'Configure Website marketing consent in Settings → Email first')
    const problems = sendProblems(c)
    if (problems.length) return fail(res, 400, problems.join('. '))
    const audience = runAudience(db, c.audience)
    if (audience.recipients.length === 0) return fail(res, 400, 'Nobody in this audience can receive email')
    const add = db.prepare('INSERT OR IGNORE INTO marketing_sends (campaign_id, customer_id, email) VALUES (?, ?, ?)')
    db.transaction(() => {
      for (const r of audience.recipients) add.run(c.id, r.customerId, r.email)
      db.prepare("UPDATE marketing_campaigns SET status = 'sending', last_error = NULL WHERE id = ?").run(c.id)
    })()
    res.json(get(c.id))
  })

  app.post('/api/marketing/campaigns/:id/cancel', (req, res) => {
    db.prepare("UPDATE marketing_campaigns SET status = 'cancelled' WHERE id = ? AND status = 'sending'").run(Number(req.params.id))
    res.json(get(Number(req.params.id)))
  })

  app.get('/api/marketing/campaigns/:id/sends', (req, res) => {
    const rows = db
      .prepare(
        `SELECT ms.id,ms.tracking_active,ms.customer_id, ms.email, ms.status, ms.error, ms.sent_at, c.first_name, c.last_name, c.company, c.track_as_company,
         (SELECT COUNT(*) FROM marketing_activity a WHERE a.send_id=ms.id AND a.kind='open') AS open_count,
         (SELECT MIN(at) FROM marketing_activity a WHERE a.send_id=ms.id AND a.kind='open') AS first_open,
         (SELECT MAX(at) FROM marketing_activity a WHERE a.send_id=ms.id AND a.kind='open') AS last_open,
         (SELECT COUNT(*) FROM marketing_activity a WHERE a.send_id=ms.id AND a.kind='click') AS click_count,
         (SELECT MIN(at) FROM marketing_activity a WHERE a.send_id=ms.id AND a.kind='click') AS first_click,
         (SELECT MAX(at) FROM marketing_activity a WHERE a.send_id=ms.id AND a.kind='click') AS last_click
         FROM marketing_sends ms JOIN customers c ON c.id = ms.customer_id WHERE ms.campaign_id = ? ORDER BY ms.id`
      )
      .all(Number(req.params.id)) as {
      id:number
      tracking_active:number
      open_count:number
      first_open:string|null
      last_open:string|null
      click_count:number
      first_click:string|null
      last_click:string|null
      customer_id: number
      email: string
      status: CampaignSend['status']
      error: string | null
      sent_at: string | null
      first_name: string | null
      last_name: string | null
      company: string | null
      track_as_company: number
    }[]
    const list: CampaignSend[] = rows.map((r) => ({
      tracked:r.tracking_active===1,openCount:r.open_count,firstOpenedAt:r.first_open,lastOpenedAt:r.last_open,clickCount:r.click_count,firstClickedAt:r.first_click,lastClickedAt:r.last_click,
      clickedLinks:db.prepare("SELECT url,COUNT(*) AS count,MIN(at) AS firstAt,MAX(at) AS lastAt FROM marketing_activity WHERE send_id=? AND kind='click' GROUP BY url ORDER BY count DESC,url").all(r.id) as CampaignSend['clickedLinks'],
      customerId: r.customer_id,
      name:
        r.track_as_company && r.company ? r.company : [r.first_name, r.last_name].filter(Boolean).join(' ') || r.company || '',
      email: r.email,
      status: r.status,
      error: r.error,
      sentAt: iso(r.sent_at)
    }))
    res.json(list)
  })

  // ---------- Email (SMTP) settings ----------
  app.get('/api/marketing/smtp', (_req, res) => res.json(smtpView(getSmtp(db))))

  app.put(
    '/api/marketing/smtp',
    wrap((req, res) => {
      res.json(smtpView(saveSmtp(db, (req.body ?? {}) as Partial<SmtpSettings>)))
    })
  )

  app.post(
    '/api/marketing/smtp/test',
    wrap(async (req, res) => {
      const to = String(req.body?.email ?? '').trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return fail(res, 400, 'Enter the email address to send the test to')
      try {
        await sendSmtpTest(db, readSettings(db), to)
      } catch (e) {
        return fail(res, 400, `The test email could not be sent: ${(e as Error).message}`)
      }
      res.json({ ok: true })
    })
  )
}
