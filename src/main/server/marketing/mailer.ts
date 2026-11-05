/**
 * Sending mailers by email (SMTP, via nodemailer).
 *
 * Sending happens slowly in the background (perMinute) so the mail provider
 * doesn't block the account. Progress is stored per recipient, so if the
 * server restarts it carries on where it stopped. If the mail server refuses
 * the login or can't be reached, sending PAUSES (nobody is marked failed) and
 * retries every few minutes.
 */
import nodemailer from 'nodemailer'
import type { DB } from '../db'
import type { StoreSettings } from '../../../shared/types'
import type { SmtpSettings, SmtpSettingsView } from '../../../shared/marketing'
import { FLYER_CID, mailerHtml, mailerText } from '../../../shared/mailerTemplate'

const DEFAULT_SMTP: SmtpSettings = {
  host: '',
  port: 587,
  security: 'starttls',
  username: '',
  password: '',
  fromName: '',
  fromEmail: '',
  replyTo: '',
  perMinute: 20
}

export function getSmtp(db: DB): SmtpSettings {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'smtp_config'").get() as { value: string } | undefined
  try {
    return { ...DEFAULT_SMTP, ...(row ? JSON.parse(row.value) : {}) }
  } catch {
    return { ...DEFAULT_SMTP }
  }
}

export function smtpView(s: SmtpSettings): SmtpSettingsView {
  const { password, ...rest } = s
  return { ...rest, hasPassword: !!password }
}

export function saveSmtp(db: DB, input: Partial<SmtpSettings>): SmtpSettings {
  const cur = getSmtp(db)
  const str = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max)
  const next: SmtpSettings = {
    host: input.host !== undefined ? str(input.host) : cur.host,
    port: input.port !== undefined ? Number(input.port) : cur.port,
    security: input.security ?? cur.security,
    username: input.username !== undefined ? str(input.username) : cur.username,
    // blank = keep the saved password (it is never sent to the screen)
    password: input.password ? String(input.password) : cur.password,
    fromName: input.fromName !== undefined ? str(input.fromName) : cur.fromName,
    fromEmail: input.fromEmail !== undefined ? str(input.fromEmail) : cur.fromEmail,
    replyTo: input.replyTo !== undefined ? str(input.replyTo) : cur.replyTo,
    perMinute: input.perMinute !== undefined ? Number(input.perMinute) : cur.perMinute
  }
  if (!Number.isInteger(next.port) || next.port < 1 || next.port > 65535) throw new Error('Port must be a number like 587')
  if (!['starttls', 'ssl', 'none'].includes(next.security)) throw new Error('Unknown security option')
  if (!Number.isFinite(next.perMinute) || next.perMinute < 1 || next.perMinute > 120)
    throw new Error('Emails per minute must be between 1 and 120')
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (next.fromEmail && !email.test(next.fromEmail)) throw new Error('The "from" email address doesn\'t look right')
  if (next.replyTo && !email.test(next.replyTo)) throw new Error('The reply-to email address doesn\'t look right')
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('smtp_config', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(JSON.stringify(next))
  return next
}

export function smtpProblems(s: SmtpSettings): string[] {
  const out: string[] = []
  if (!s.host) out.push('Enter the SMTP server')
  if (!s.fromEmail) out.push('Enter the "from" email address')
  if (s.security !== 'none' && (!s.username || !s.password)) out.push('Enter the email account user name and password')
  return out
}

function transport(s: SmtpSettings) {
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.security === 'ssl',
    requireTLS: s.security === 'starttls',
    auth: s.username ? { user: s.username, pass: s.password } : undefined,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000
  })
}

export interface OutgoingMailer {
  to: string
  recipientName: string
  subject: string
  message: string
  flyer: string | null // data: URL
}

/** Errors that mean "the mail server/login is the problem", not this recipient */
export function isServerProblem(err: unknown): boolean {
  const e = err as { code?: string; responseCode?: number }
  return (
    ['EAUTH', 'ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNREFUSED', 'ETLS'].includes(e?.code ?? '') ||
    (typeof e?.responseCode === 'number' && (e.responseCode === 421 || e.responseCode === 454 || e.responseCode === 535))
  )
}

export async function sendMailer(db: DB, store: StoreSettings, m: OutgoingMailer): Promise<string> {
  const s = getSmtp(db)
  const problems = smtpProblems(s)
  if (problems.length) throw Object.assign(new Error(problems.join('; ')), { code: 'EAUTH' })
  const replyTo = s.replyTo || s.fromEmail
  const flyer = m.flyer?.match(/^data:(image\/(?:jpeg|png));base64,(.+)$/)
  const content = {
    storeName: store.storeName,
    storeAddress: store.storeAddress,
    replyTo,
    subject: m.subject,
    message: m.message,
    flyerSrc: flyer ? `cid:${FLYER_CID}` : null,
    recipientName: m.recipientName
  }
  const info = await transport(s).sendMail({
    from: { name: s.fromName || store.storeName, address: s.fromEmail },
    to: m.to,
    replyTo,
    subject: m.subject,
    html: mailerHtml(content),
    text: mailerText(content),
    attachments: flyer
      ? [
          {
            filename: flyer[1] === 'image/png' ? 'flyer.png' : 'flyer.jpg',
            content: Buffer.from(flyer[2], 'base64'),
            contentType: flyer[1],
            cid: FLYER_CID
          }
        ]
      : [],
    headers: { 'List-Unsubscribe': `<mailto:${replyTo}?subject=Unsubscribe>` }
  })
  return String(info?.messageId ?? '')
}

/** Send any email (e.g. work order updates) from the store's email account */
export async function sendEmail(
  db: DB,
  store: StoreSettings,
  m: { to: string; subject: string; html: string; text: string }
): Promise<string> {
  const s = getSmtp(db)
  const problems = smtpProblems(s)
  if (problems.length) throw new Error(`Email isn't set up yet (Marketing → Email settings): ${problems.join('; ')}`)
  const info = await transport(s).sendMail({
    from: { name: s.fromName || store.storeName, address: s.fromEmail },
    to: m.to,
    replyTo: s.replyTo || s.fromEmail,
    subject: m.subject,
    html: m.html,
    text: m.text
  })
  return String(info?.messageId ?? '')
}

/** Simple "it works" email for the Email settings screen */
export async function sendSmtpTest(db: DB, store: StoreSettings, to: string): Promise<void> {
  await sendMailer(db, store, {
    to,
    recipientName: '',
    subject: `Test email from ${store.storeName}`,
    message: 'This is a test email from DiamondPOS. Your email settings are working.',
    flyer: null
  })
}

// ---------------- Background sender ----------------

let timer: ReturnType<typeof setTimeout> | null = null
let busy = false

export function startMarketingSender(db: DB, readSettings: (db: DB) => StoreSettings) {
  stopMarketingSender()
  const schedule = (ms: number) => {
    timer = setTimeout(tick, ms)
  }
  const tick = async () => {
    if (busy) return
    busy = true
    let wait = 5_000
    try {
      const campaign = db
        .prepare("SELECT id, subject, message, flyer FROM marketing_campaigns WHERE status = 'sending' ORDER BY id LIMIT 1")
        .get() as { id: number; subject: string; message: string; flyer: string | null } | undefined
      if (campaign) {
        const next = db
          .prepare(
            `SELECT ms.id, ms.email, c.first_name, c.last_name, c.company, c.track_as_company
             FROM marketing_sends ms JOIN customers c ON c.id = ms.customer_id
             WHERE ms.campaign_id = ? AND ms.status = 'pending' ORDER BY ms.id LIMIT 1`
          )
          .get(campaign.id) as
          | { id: number; email: string; first_name: string | null; last_name: string | null; company: string | null; track_as_company: number }
          | undefined
        if (!next) {
          db.prepare("UPDATE marketing_campaigns SET status = 'sent', sent_at = datetime('now'), last_error = NULL WHERE id = ?").run(
            campaign.id
          )
        } else {
          const name =
            next.track_as_company && next.company ? next.company : next.first_name || next.company || next.last_name || ''
          try {
            await sendMailer(db, readSettings(db), {
              to: next.email,
              recipientName: name,
              subject: campaign.subject,
              message: campaign.message,
              flyer: campaign.flyer
            })
            db.prepare("UPDATE marketing_sends SET status = 'sent', error = NULL, sent_at = datetime('now') WHERE id = ?").run(next.id)
            db.prepare('UPDATE marketing_campaigns SET last_error = NULL WHERE id = ?').run(campaign.id)
          } catch (err) {
            const msg = (err as Error).message || String(err)
            if (isServerProblem(err)) {
              // The mail account/server is the problem: pause and try again later
              db.prepare('UPDATE marketing_campaigns SET last_error = ? WHERE id = ?').run(
                `Paused: ${msg}. Retrying in 5 minutes. Check Email settings.`.slice(0, 500),
                campaign.id
              )
              wait = 5 * 60_000
              return
            }
            db.prepare("UPDATE marketing_sends SET status = 'failed', error = ? WHERE id = ?").run(msg.slice(0, 500), next.id)
          }
          wait = Math.max(500, Math.round(60_000 / getSmtp(db).perMinute))
        }
      }
    } catch (err) {
      console.error('[marketing]', err)
    } finally {
      busy = false
      if (timer !== null) schedule(wait)
    }
  }
  timer = setTimeout(tick, 2_000)
}

export function stopMarketingSender() {
  if (timer) clearTimeout(timer)
  timer = null
}
