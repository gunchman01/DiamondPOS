/**
 * CUSTOMER KIOSK (iPad)
 *
 * The store server hosts a web page at  http://<server-ip>:4580/kiosk
 * that an iPad shows full-screen (Safari + Guided Access).
 *
 *  1. Pairing: the kiosk shows a 6-digit code; a till enters it in Settings.
 *     The kiosk then receives its own secret token (stored in the iPad's browser).
 *  2. Idle: the kiosk shows the store logo + welcome message.
 *  3. A till presses "Send to kiosk": a session is created and the sign-up form
 *     is pushed to the kiosk instantly (Server-Sent Events).
 *  4. The customer submits: the customer is created (or matched by mobile /
 *     email), the session is marked submitted, and the till (which polls the
 *     session) attaches the customer to the current sale.
 *
 * Security: kiosk endpoints live under /kiosk (no store pairing code needed)
 * but can only show the logo and submit a form for an open session. They never
 * return customer data. Till endpoints live under /api and need the pairing code.
 */
import type express from 'express'
import type { Response } from 'express'
import crypto from 'crypto'
import type { DB } from './db'
import { ValidationError } from './products'
import { CUSTOMER_DEFAULTS, getCustomer, insertCustomer, updateCustomer, validateCustomer } from './customers'
import type { Customer, KioskInfo, KioskSession, StoreSettings } from '../../shared/types'
import { kioskPageHtml } from './kioskPage'

const SESSION_TIMEOUT_MS = 5 * 60 * 1000 // form returns to the logo after 5 minutes
const PAIR_CODE_TTL_MS = 10 * 60 * 1000

interface KioskRow {
  id: number
  name: string
  till_name: string
  token: string
  paired_at: string
  active: number
}

class HttpErr extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

// ---- In-memory state (fine to lose on restart: kiosks reconnect, sessions are short-lived)
const pairCodes = new Map<string, { created: number; token: string | null; name: string | null }>()
const streams = new Map<number, Set<Response>>() // kioskId -> open event streams
const sessions = new Map<string, KioskSession & { created: number; timer: ReturnType<typeof setTimeout> }>()

function send(kioskId: number, event: Record<string, unknown>) {
  for (const res of streams.get(kioskId) ?? []) res.write(`data: ${JSON.stringify(event)}\n\n`)
}

function openSessionFor(kioskId: number) {
  return [...sessions.values()].find((s) => s.kioskId === kioskId && s.status === 'waiting')
}

function publicSession(s: KioskSession): KioskSession {
  const { id, kioskId, kioskName, tillName, status, customer, matchedExisting } = s
  return { id, kioskId, kioskName, tillName, status, customer, matchedExisting }
}

function finish(s: KioskSession & { timer: ReturnType<typeof setTimeout> }, status: KioskSession['status']) {
  clearTimeout(s.timer)
  s.status = status
  // Forget finished sessions after a minute (the till only needs to read the result once)
  setTimeout(() => sessions.delete(s.id), 60_000)
}

export function registerKioskRoutes(app: express.Express, db: DB, readSettings: (db: DB) => StoreSettings) {
  const kioskByToken = (token: unknown): KioskRow => {
    const row = db.prepare('SELECT * FROM kiosks WHERE token = ? AND active = 1').get(String(token ?? '')) as
      | KioskRow
      | undefined
    if (!row) throw new HttpErr(401, 'This kiosk is not paired. Pair it again from Settings on a till.')
    return row
  }
  const toInfo = (k: KioskRow): KioskInfo => ({
    id: k.id,
    name: k.name,
    tillName: k.till_name,
    online: (streams.get(k.id)?.size ?? 0) > 0,
    pairedAt: k.paired_at.replace(' ', 'T') + 'Z'
  })
  const wrap =
    (fn: (req: express.Request, res: express.Response) => void) => (req: express.Request, res: express.Response) => {
      try {
        fn(req, res)
      } catch (e) {
        if (e instanceof HttpErr) res.status(e.status).json({ error: e.message })
        else if (e instanceof ValidationError) res.status(400).json({ error: e.message })
        else throw e
      }
    }

  // ===================== Kiosk-facing (iPad) =====================

  app.get('/kiosk', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(kioskPageHtml)
  })

  app.get('/kiosk/logo', (_req, res) => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'store_logo'").get() as { value: string } | undefined
    const m = row?.value.match(/^data:(image\/[a-z+]+);base64,(.+)$/)
    if (!m) return res.sendStatus(404)
    res.setHeader('Content-Type', m[1])
    res.setHeader('Cache-Control', 'no-cache')
    res.end(Buffer.from(m[2], 'base64'))
  })

  // Step 1 of pairing: the kiosk asks for a code to show on screen
  app.post('/kiosk/api/pair-request', (_req, res) => {
    for (const [code, p] of pairCodes) if (Date.now() - p.created > PAIR_CODE_TTL_MS) pairCodes.delete(code)
    let code: string
    do code = String(crypto.randomInt(100000, 1000000))
    while (pairCodes.has(code))
    pairCodes.set(code, { created: Date.now(), token: null, name: null })
    res.json({ code })
  })

  // The kiosk polls this until a till has entered the code
  app.get('/kiosk/api/pair-status/:code', (req, res) => {
    const p = pairCodes.get(req.params.code)
    if (!p || Date.now() - p.created > PAIR_CODE_TTL_MS) return res.json({ expired: true })
    if (!p.token) return res.json({ paired: false })
    pairCodes.delete(req.params.code)
    res.json({ paired: true, token: p.token, name: p.name })
  })

  app.get(
    '/kiosk/api/info',
    wrap((req, res) => {
      const k = kioskByToken(req.query.token)
      const s = readSettings(db)
      res.json({ kioskName: k.name, storeName: s.storeName, welcome: s.kioskWelcome, hasLogo: s.hasLogo })
    })
  )

  // Live events to the kiosk: {type:'form', sessionId} | {type:'idle'}
  app.get(
    '/kiosk/api/events',
    wrap((req, res) => {
      const k = kioskByToken(req.query.token)
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      })
      if (!streams.has(k.id)) streams.set(k.id, new Set())
      streams.get(k.id)!.add(res)
      const open = openSessionFor(k.id)
      res.write(`data: ${JSON.stringify(open ? { type: 'form', sessionId: open.id } : { type: 'idle' })}\n\n`)
      const ping = setInterval(() => res.write(': ping\n\n'), 20_000) // keeps Wi-Fi / proxies from closing it
      // Note: listen on the RESPONSE. req 'close' fires as soon as the request has been read.
      res.on('close', () => {
        clearInterval(ping)
        streams.get(k.id)?.delete(res)
      })
    })
  )

  // The customer submits the sign-up form
  app.post(
    '/kiosk/api/submit',
    wrap((req, res) => {
      const b = (req.body ?? {}) as Record<string, unknown>
      const k = kioskByToken(b.token)
      const s = sessions.get(String(b.sessionId ?? ''))
      if (!s || s.kioskId !== k.id || s.status !== 'waiting')
        throw new HttpErr(409, 'This sign-up has finished. Please ask the staff member to send it again.')

      const str = (v: unknown) => String(v ?? '').trim().slice(0, 100)
      const firstName = str(b.firstName)
      const lastName = str(b.lastName)
      const mobile = str(b.mobile)
      const email = str(b.email).toLowerCase()
      const okToEmail = b.okToEmail === true
      if (!firstName || !lastName) throw new ValidationError('Please enter your first and last name')
      if (!mobile && !email) throw new ValidationError('Please enter a mobile number or an email address')

      // Match an existing customer by mobile digits or email, so people aren't added twice
      const digits = mobile.replace(/\D/g, '')
      const existingRow = db
        .prepare(
          `SELECT id FROM customers WHERE active = 1 AND (
             (? <> '' AND LOWER(email) = ?)
             OR (LENGTH(?) >= 6 AND (
               REPLACE(REPLACE(REPLACE(COALESCE(mobile,''),' ',''),'-',''),'+','') = ?
               OR REPLACE(REPLACE(REPLACE(COALESCE(phone,''),' ',''),'-',''),'+','') = ?)))
           ORDER BY id LIMIT 1`
        )
        .get(email, email, digits, digits, digits) as { id: number } | undefined

      let customer: Customer
      if (existingRow) {
        const current = getCustomer(db, existingRow.id)!
        // Only fill in blanks (and the email opt-in); never overwrite what the store already has
        const update = validateCustomer(
          {
            mobile: current.mobile || mobile || null,
            email: current.email || email || null,
            okToEmail: current.okToEmail || okToEmail
          },
          current
        )
        updateCustomer(db, current.id, update)
        customer = getCustomer(db, current.id)!
        s.matchedExisting = true
      } else {
        const stamp = new Date().toLocaleString('en-NZ')
        const id = insertCustomer(
          db,
          validateCustomer(
            {
              firstName,
              lastName,
              mobile: mobile || null,
              email: email || null,
              okToEmail,
              customerType: 'Retail',
              notes: `${stamp} - Signed up at kiosk "${k.name}"`
            },
            CUSTOMER_DEFAULTS
          )
        )
        customer = getCustomer(db, id)!
      }
      s.customer = customer
      finish(s, 'submitted')
      // Tell the kiosk to say thanks; it goes back to the logo by itself
      send(k.id, { type: 'thanks', firstName })
      res.json({ ok: true, firstName }) // never send customer data back to the kiosk
    })
  )

  // The customer taps "Cancel" on the kiosk
  app.post(
    '/kiosk/api/cancel',
    wrap((req, res) => {
      const b = (req.body ?? {}) as Record<string, unknown>
      const k = kioskByToken(b.token)
      const s = sessions.get(String(b.sessionId ?? ''))
      if (s && s.kioskId === k.id && s.status === 'waiting') finish(s, 'cancelled')
      send(k.id, { type: 'idle' })
      res.json({ ok: true })
    })
  )

  // ===================== Till-facing (needs the store pairing code) =====================

  app.get('/api/kiosks', (_req, res) => {
    const rows = db.prepare('SELECT * FROM kiosks WHERE active = 1 ORDER BY name').all() as KioskRow[]
    res.json(rows.map(toInfo))
  })

  // Step 2 of pairing: a till enters the code shown on the kiosk
  app.post(
    '/api/kiosks/pair',
    wrap((req, res) => {
      const b = (req.body ?? {}) as Record<string, unknown>
      const code = String(b.code ?? '').replace(/\D/g, '')
      const name = String(b.name ?? '').trim().slice(0, 60) || 'Customer Kiosk'
      const tillName = String(b.tillName ?? '').trim().slice(0, 60)
      if (!tillName) throw new ValidationError('Choose which till this kiosk belongs to')
      const p = pairCodes.get(code)
      if (!p || p.token || Date.now() - p.created > PAIR_CODE_TTL_MS)
        throw new ValidationError('That code is not valid or has expired. Reload the kiosk page for a new code.')
      const token = crypto.randomBytes(24).toString('hex')
      const info = db.prepare('INSERT INTO kiosks (name, till_name, token) VALUES (?, ?, ?)').run(name, tillName, token)
      p.token = token
      p.name = name
      const row = db.prepare('SELECT * FROM kiosks WHERE id = ?').get(Number(info.lastInsertRowid)) as KioskRow
      res.status(201).json(toInfo(row))
    })
  )

  app.put(
    '/api/kiosks/:id',
    wrap((req, res) => {
      const b = (req.body ?? {}) as Record<string, unknown>
      const id = Number(req.params.id)
      const row = db.prepare('SELECT * FROM kiosks WHERE id = ? AND active = 1').get(id) as KioskRow | undefined
      if (!row) throw new HttpErr(404, 'Kiosk not found')
      const name = b.name === undefined ? row.name : String(b.name).trim().slice(0, 60) || row.name
      const till = b.tillName === undefined ? row.till_name : String(b.tillName).trim().slice(0, 60) || row.till_name
      db.prepare('UPDATE kiosks SET name = ?, till_name = ? WHERE id = ?').run(name, till, id)
      res.json(toInfo({ ...row, name, till_name: till }))
    })
  )

  // Unpair: the kiosk's token stops working immediately
  app.post(
    '/api/kiosks/:id/remove',
    wrap((req, res) => {
      const id = Number(req.params.id)
      db.prepare('UPDATE kiosks SET active = 0, token = token || ? WHERE id = ?').run(`-removed-${Date.now()}`, id)
      send(id, { type: 'unpaired' })
      for (const r of streams.get(id) ?? []) r.end()
      streams.delete(id)
      res.json({ ok: true })
    })
  )

  // Logo shown on the kiosk (and available for receipts later)
  app.put(
    '/api/settings/logo',
    wrap((req, res) => {
      const dataUrl = (req.body ?? {}).dataUrl as string | null
      if (dataUrl === null) db.prepare("DELETE FROM settings WHERE key = 'store_logo'").run()
      else {
        if (typeof dataUrl !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,/.test(dataUrl))
          throw new ValidationError('The logo must be a PNG, JPEG, WebP or GIF image')
        if (dataUrl.length > 3_000_000) throw new ValidationError('The logo is too large (max about 2 MB)')
        db.prepare(
          "INSERT INTO settings (key, value) VALUES ('store_logo', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        ).run(dataUrl)
      }
      for (const id of streams.keys()) send(id, { type: 'branding' }) // kiosks reload the logo
      res.json(readSettings(db))
    })
  )

  // Send the sign-up form to the kiosk that belongs to this till
  app.post(
    '/api/kiosk-sessions',
    wrap((req, res) => {
      const b = (req.body ?? {}) as Record<string, unknown>
      const tillName = String(b.tillName ?? '').trim()
      const all = db.prepare('SELECT * FROM kiosks WHERE active = 1 ORDER BY id').all() as KioskRow[]
      if (all.length === 0) throw new HttpErr(404, 'No kiosk is paired yet. Pair the iPad in Settings first.')
      const kiosk =
        (b.kioskId ? all.find((k) => k.id === Number(b.kioskId)) : undefined) ??
        all.find((k) => k.till_name.toLowerCase() === tillName.toLowerCase()) ??
        (all.length === 1 ? all[0] : undefined)
      if (!kiosk) throw new HttpErr(404, `No kiosk is linked to till "${tillName}". Link one in Settings.`)
      if (!(streams.get(kiosk.id)?.size ?? 0))
        throw new HttpErr(409, `The kiosk "${kiosk.name}" is offline. Check the iPad is on, on Wi-Fi and showing the kiosk page.`)

      // A newer request replaces an older unanswered one on the same kiosk
      const old = openSessionFor(kiosk.id)
      if (old) finish(old, 'cancelled')

      const id = crypto.randomUUID()
      const timer = setTimeout(() => {
        const s = sessions.get(id)
        if (s && s.status === 'waiting') {
          finish(s, 'expired')
          send(kiosk.id, { type: 'idle' })
        }
      }, SESSION_TIMEOUT_MS)
      const session = {
        id,
        kioskId: kiosk.id,
        kioskName: kiosk.name,
        tillName,
        status: 'waiting' as const,
        customer: null,
        matchedExisting: false,
        created: Date.now(),
        timer
      }
      sessions.set(id, session)
      send(kiosk.id, { type: 'form', sessionId: id })
      res.status(201).json(publicSession(session))
    })
  )

  app.get(
    '/api/kiosk-sessions/:id',
    wrap((req, res) => {
      const s = sessions.get(req.params.id)
      if (!s) throw new HttpErr(404, 'This kiosk request has finished')
      res.json(publicSession(s))
    })
  )

  // The cashier cancels
  app.post(
    '/api/kiosk-sessions/:id/cancel',
    wrap((req, res) => {
      const s = sessions.get(req.params.id)
      if (s && s.status === 'waiting') {
        finish(s, 'cancelled')
        send(s.kioskId, { type: 'idle' })
      }
      res.json({ ok: true })
    })
  )
}
