/**
 * Feedback from staff (ideas / enhancement requests, problems, questions).
 * Every message is saved in the store database first, then emailed through the
 * store's email account (Marketing → Email settings). If email isn't set up or
 * fails, it stays "not sent yet" and is retried with the next feedback or the
 * Send again button, so nothing is lost.
 */
import type express from 'express'
import type { DB } from './db'
import type { StoreSettings } from '../../shared/types'
import { DEFAULT_FEEDBACK_EMAIL, FEEDBACK_KINDS, type Feedback, type FeedbackInput, type FeedbackKind } from '../../shared/feedback'
import { sendEmail } from './marketing/mailer'

type Row = {
  id: number
  kind: FeedbackKind
  subject: string
  message: string
  name: string
  reply_email: string
  till_name: string
  app_version: string
  screen: string
  status: Feedback['status']
  error: string | null
  sent_to: string | null
  sent_at: string | null
  created_at: string
}
const iso = (s: string | null) => (s ? s.replace(' ', 'T') + 'Z' : null)
const toFeedback = (r: Row): Feedback => ({
  id: r.id,
  kind: r.kind,
  subject: r.subject,
  message: r.message,
  name: r.name,
  replyEmail: r.reply_email,
  tillName: r.till_name,
  appVersion: r.app_version,
  screen: r.screen,
  status: r.status,
  error: r.error,
  sentTo: r.sent_to,
  sentAt: iso(r.sent_at),
  createdAt: iso(r.created_at)!
})
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

class FeedbackError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

function validate(b: Partial<FeedbackInput>): Required<FeedbackInput> {
  const kind = (FEEDBACK_KINDS.some((k) => k.kind === b.kind) ? b.kind : 'idea') as FeedbackKind
  const subject = String(b.subject ?? '').trim().slice(0, 150)
  const message = String(b.message ?? '').trim().slice(0, 5000)
  const replyEmail = String(b.replyEmail ?? '').trim().slice(0, 150)
  if (!subject) throw new FeedbackError(400, 'Give it a short title')
  if (!message) throw new FeedbackError(400, 'Describe the idea or problem')
  if (replyEmail && !EMAIL.test(replyEmail)) throw new FeedbackError(400, 'That email address doesn\'t look right')
  const s = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n)
  return {
    kind,
    subject,
    message,
    name: s(b.name, 80),
    replyEmail,
    tillName: s(b.tillName, 60),
    appVersion: s(b.appVersion, 30),
    screen: s(b.screen, 40)
  }
}

/** Build the email for one piece of feedback */
export function feedbackEmail(f: Feedback, store: StoreSettings) {
  const label = FEEDBACK_KINDS.find((k) => k.kind === f.kind)?.label ?? f.kind
  const tag = f.kind === 'problem' ? 'Problem' : f.kind === 'question' ? 'Question' : 'Idea'
  const rows: [string, string][] = [
    ['Type', label],
    ['From', [f.name, f.replyEmail].filter(Boolean).join(' · ') || '(not given)'],
    ['Store', store.storeName],
    ['Till', f.tillName || '-'],
    ['Screen', f.screen || '-'],
    ['Version', f.appVersion ? `v${f.appVersion}` : '-'],
    ['Sent', new Date(f.createdAt).toLocaleString()],
    ['Feedback #', String(f.id)]
  ]
  return {
    subject: `[DiamondPOS ${tag}] ${f.subject}`,
    text: `${f.subject}\n\n${f.message}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n`,
    html: `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#222">
      <h2 style="margin:0 0 8px;color:#8b0d1f">${esc(f.subject)}</h2>
      <div style="white-space:pre-wrap;margin-bottom:14px">${esc(f.message)}</div>
      <table style="border-collapse:collapse;font-size:13px">${rows
        .map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#666">${esc(k)}</td><td>${esc(v)}</td></tr>`)
        .join('')}</table></div>`
  }
}

export function registerFeedbackRoutes(app: express.Express, db: DB, readSettings: (db: DB) => StoreSettings) {
  const get = (id: number) => {
    const r = db.prepare('SELECT * FROM feedback WHERE id = ?').get(id) as Row | undefined
    return r ? toFeedback(r) : null
  }

  /** Email one piece of feedback; records sent / failed. Returns the updated record. */
  async function deliver(id: number): Promise<Feedback> {
    const f = get(id)!
    const store = readSettings(db)
    const to = store.feedbackEmail || DEFAULT_FEEDBACK_EMAIL
    try {
      const mail = feedbackEmail(f, store)
      await sendEmail(db, store, { to, ...mail, ...(f.replyEmail ? { replyTo: f.replyEmail } : {}) })
      db.prepare("UPDATE feedback SET status = 'sent', error = NULL, sent_to = ?, sent_at = datetime('now') WHERE id = ?").run(to, id)
    } catch (e) {
      db.prepare("UPDATE feedback SET status = 'failed', error = ? WHERE id = ?").run(String((e as Error).message).slice(0, 500), id)
    }
    return get(id)!
  }

  const wrap = (fn: (req: express.Request, res: express.Response) => Promise<void>) => (req: express.Request, res: express.Response, next: express.NextFunction) =>
    fn(req, res).catch((e) => (e instanceof FeedbackError ? res.status(e.status).json({ error: e.message }) : next(e)))

  app.get('/api/feedback', (_req, res) => {
    res.json((db.prepare('SELECT * FROM feedback ORDER BY id DESC LIMIT 100').all() as Row[]).map(toFeedback))
  })

  app.post(
    '/api/feedback',
    wrap(async (req, res) => {
      const f = validate(req.body ?? {})
      const info = db
        .prepare(
          `INSERT INTO feedback (kind, subject, message, name, reply_email, till_name, app_version, screen)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(f.kind, f.subject, f.message, f.name, f.replyEmail, f.tillName, f.appVersion, f.screen)
      const saved = await deliver(Number(info.lastInsertRowid))
      // Anything that couldn't be sent earlier goes now too, if email works again
      if (saved.status === 'sent') {
        const waiting = db.prepare("SELECT id FROM feedback WHERE status != 'sent' AND id != ? ORDER BY id LIMIT 20").all(saved.id) as { id: number }[]
        for (const w of waiting) await deliver(w.id)
      }
      res.status(201).json(saved)
    })
  )

  app.post(
    '/api/feedback/:id/resend',
    wrap(async (req, res) => {
      const id = Number(req.params.id)
      if (!get(id)) throw new FeedbackError(404, 'Feedback not found')
      res.json(await deliver(id))
    })
  )
}
