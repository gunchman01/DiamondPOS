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
 * return customer data except a limited, staff-initiated contact verification form, scoped to the assigned active kiosk session. Till endpoints live under /api and need the pairing code.
 */
import {intakeSettings,saveIntakeSettings,intakeAnswers,withLatestIntakeIssue} from './repairIntake'
import type {IntakeQuestion} from '../../shared/repairIntake'
import type express from 'express'
import type { Response } from 'express'
import crypto from 'crypto'
import type { DB } from './db'
import { ValidationError } from './products'
import { CUSTOMER_DEFAULTS, getCustomer, insertCustomer, isIsoDate, updateCustomer, validateCustomer } from './customers'
import type { Customer, KioskInfo, KioskSession, StoreSettings } from '../../shared/types'
import { kioskPageHtml } from './kioskPage'

const CONTACT_FIELDS = ['firstName','lastName','company','phone','mobile','email','street','street2','city','region','postcode'] as const
function contactDetails(c: Customer) {
  return Object.fromEntries(CONTACT_FIELDS.map(k=>[k,c[k] ?? ''])) as Record<(typeof CONTACT_FIELDS)[number],string>
}
function taxDetails(c:Customer){return {taxExempt:c.taxExempt,taxExemptId:c.taxExempt?c.taxExemptId:null,taxExemptExpires:c.taxExempt?c.taxExemptExpires:null}}
type RepairSession={workOrderId:number;customerId:number;unitId:number;category:import('../../shared/workorders').UnitCategory;number:string;unitLabel:string;questions:IntakeQuestion[]}
type LiveSession = KioskSession & { repair?:RepairSession; created:number; timer:ReturnType<typeof setTimeout>; targetId?:number; originalContact?:ReturnType<typeof contactDetails>; originalTax?:ReturnType<typeof taxDetails> }

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
const sessions = new Map<string, LiveSession>()

function send(kioskId: number, event: Record<string, unknown>) {
  for (const res of streams.get(kioskId) ?? []) res.write(`data: ${JSON.stringify(event)}\n\n`)
}

function openSessionFor(kioskId: number) {
  return [...sessions.values()].find((s) => s.kioskId === kioskId && s.status === 'waiting')
}

function publicSession(s: KioskSession & {targetId?:number;repair?:RepairSession}): KioskSession {
  const { id, kioskId, kioskName, tillName, status, customer, matchedExisting } = s
  return { id, kioskId, kioskName, tillName, status, customer, matchedExisting, verificationCustomerId:s.targetId,repairWorkOrderId:s.repair?.workOrderId }
}

function finish(s: KioskSession & { timer: ReturnType<typeof setTimeout> }, status: KioskSession['status']) {
  clearTimeout(s.timer)
  s.status = status
  // Forget finished sessions after a minute (the till only needs to read the result once)
  setTimeout(() => sessions.delete(s.id), 60_000).unref()
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
      res.locals.kioskReviewVersion=req.query.review==='2'?2:0
      res.locals.kioskIntakeVersion=req.query.intake==='1'?1:0
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      })
      if (!streams.has(k.id)) streams.set(k.id, new Set())
      streams.get(k.id)!.add(res)
      const open = openSessionFor(k.id)
      res.write(`data: ${JSON.stringify(open && (!open.targetId || res.locals.kioskReviewVersion===2) && (!open.repair||res.locals.kioskIntakeVersion===1) ? { type: 'form', sessionId: open.id } : { type: 'idle' })}\n\n`)
      const ping = setInterval(() => res.write(': ping\n\n'), 20_000) // keeps Wi-Fi / proxies from closing it
      // Note: listen on the RESPONSE. req 'close' fires as soon as the request has been read.
      res.on('close', () => {
        clearInterval(ping)
        streams.get(k.id)?.delete(res)
      })
    })
  )

  // Only the paired kiosk assigned to this live session can retrieve the limited contact form.
  app.get('/kiosk/api/session', wrap((req,res)=>{
    res.setHeader('Cache-Control','no-store')
    const k=kioskByToken(req.query.token),s=sessions.get(String(req.query.sessionId || ''))
    if(!s || s.kioskId!==k.id || s.status!=='waiting') throw new HttpErr(409,'This request has finished. Ask staff to send it again.')
    if(s.repair)return res.json({mode:'repair',repair:{number:s.repair.number,unitLabel:s.repair.unitLabel,questions:s.repair.questions}})
    res.json(s.targetId ? {mode:'verify',contact:s.originalContact,taxExemption:s.originalTax} : {mode:'signup'})
  }))

  // The customer submits the sign-up form
  app.post(
    '/kiosk/api/submit',
    wrap((req, res) => {
      const b = (req.body ?? {}) as Record<string, unknown>
      const k = kioskByToken(b.token)
      const s = sessions.get(String(b.sessionId ?? ''))
      if (!s || s.kioskId !== k.id || s.status !== 'waiting')
        throw new HttpErr(409, 'This sign-up has finished. Please ask the staff member to send it again.')

      if(s.repair)throw new HttpErr(400,'Use the repair questionnaire to submit answers')
      if(s.targetId) {
        const customer=db.transaction(()=>{
          const current=getCustomer(db,s.targetId!)
          if(!current || !current.active)throw new HttpErr(409,'This customer is no longer available. Please see staff.')
          if(JSON.stringify(contactDetails(current))!==JSON.stringify(s.originalContact))throw new HttpErr(409,'Staff changed these details while you were reviewing them. Please ask staff to send them again.')
          if(JSON.stringify(taxDetails(current))!==JSON.stringify(s.originalTax))throw new HttpErr(409,'The cashier changed your tax exemption while you were reviewing it. Please ask staff to send your information again.')
          const changes:Record<string,unknown>={}
          if(b.confirm!==true){
            for(const key of CONTACT_FIELDS){
              if(typeof b[key]!=='string')throw new ValidationError('Please complete the contact form')
              changes[key]=String(b[key]).trim()
            }
          }
          if(b.confirm!==true && String(changes.email || '').trim().toLowerCase()!==String(current.email || '').trim().toLowerCase())changes.okToEmail=false
          // Marketing, tax exemptions, account balances and all other staff-only fields are never accepted here.
          changes.notes=`${new Date().toLocaleString()} - Customer ${b.confirm===true?'confirmed':'updated'} contact details and reviewed tax exemption at kiosk "${k.name}"\n${current.notes || ''}`
          updateCustomer(db,current.id,validateCustomer(changes,current))
          return getCustomer(db,current.id)!
        })()
        s.customer=customer;s.matchedExisting=true;finish(s,'submitted')
        send(k.id,{type:'thanks',firstName:customer.firstName,taxExempt:false})
        return res.json({ok:true,firstName:customer.firstName,taxExempt:false})
      }

      const f = readKioskForm(b)
      const digits = f.phone.replace(/\D/g, '')

      // Match an existing customer by email or phone digits, so people aren't added twice
      const existingRow = db
        .prepare(
          `SELECT id FROM customers WHERE active = 1 AND (
             LOWER(email) = ?
             OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(mobile,''),' ',''),'-',''),'+',''),'(',''),')','') = ?
             OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(phone,''),' ',''),'-',''),'+',''),'(',''),')','') = ?)
           ORDER BY id LIMIT 1`
        )
        .get(f.email, digits, digits) as { id: number } | undefined

      const stamp = new Date().toLocaleString()
      const note = `${stamp} - Signed up at kiosk "${k.name}"${f.taxExempt ? ` (tax exempt, Farm Tax ID ${f.taxExemptId}, expires ${f.taxExemptExpires})` : ''}`
      let customer: Customer
      if (existingRow) {
        const c = getCustomer(db, existingRow.id)!
        // Only fill in blanks (plus opt-ins); never overwrite what the store already has
        const fill = <T,>(current: T | null, value: T) => (current === null || current === '' ? value : current)
        // A tax-exempt ID typed at the kiosk is the customer's newest card, so it replaces
        // the stored one when the number or expiry differs. Staff must copy the new card.
        const newTaxId =
          f.taxExempt && (c.taxExemptId !== f.taxExemptId || c.taxExemptExpires !== f.taxExemptExpires)
        updateCustomer(
          db,
          c.id,
          validateCustomer(
            {
              company: fill(c.company, f.company || null),
              phone: fill(c.phone, f.phone),
              email: fill(c.email, f.email),
              street: fill(c.street, f.street),
              street2: fill(c.street2, f.street2 || null),
              mobile: fill(c.mobile, f.mobile || null),
              city: fill(c.city, f.city),
              region: fill(c.region, f.state),
              postcode: fill(c.postcode, f.zip),
              okToEmail: c.okToEmail || f.okToEmail,
              taxExempt: c.taxExempt || f.taxExempt,
              taxExemptId: newTaxId ? f.taxExemptId : c.taxExemptId,
              taxExemptExpires: newTaxId ? f.taxExemptExpires : c.taxExemptExpires,
              taxExemptCardCopied: newTaxId ? false : c.taxExemptCardCopied,
              notes: c.notes ? `${note}\n${c.notes}` : note
            },
            c
          )
        )
        customer = getCustomer(db, c.id)!
        s.matchedExisting = true
      } else {
        const id = insertCustomer(
          db,
          validateCustomer(
            {
              firstName: f.firstName,
              lastName: f.lastName,
              company: f.company || null,
              phone: f.phone,
              email: f.email,
              okToEmail: f.okToEmail,
              street: f.street,
              street2: f.street2,
              mobile: f.mobile || null,
              city: f.city,
              region: f.state,
              postcode: f.zip,
              taxExempt: f.taxExempt,
              taxExemptId: f.taxExempt ? f.taxExemptId : null,
              taxExemptExpires: f.taxExempt ? f.taxExemptExpires : null,
              customerType: 'Retail',
              notes: note
            },
            CUSTOMER_DEFAULTS
          )
        )
        customer = getCustomer(db, id)!
      }
      s.customer = customer
      finish(s, 'submitted')
      // Tell the kiosk to say thanks; it goes back to the logo by itself
      send(k.id, { type: 'thanks', firstName: f.firstName, taxExempt: f.taxExempt })
      res.json({ ok: true, firstName: f.firstName, taxExempt: f.taxExempt }) // never send customer data back to the kiosk
    })
  )

  app.post('/kiosk/api/repair-submit',wrap((req,res)=>{
    const b=req.body??{},k=kioskByToken(b.token),s=sessions.get(String(b.sessionId??''))
    if(!s||s.kioskId!==k.id||!s.repair||!['waiting','submitted'].includes(s.status))throw new HttpErr(409,'This repair request has finished. Ask staff to send it again.')
    if(s.status==='submitted')return res.json({ok:true})
    const repair=s.repair,answers=intakeAnswers(repair.questions,b.answers)
    db.transaction(()=>{
      const w=db.prepare('SELECT w.customer_id,w.unit_id,w.status,w.problem,u.category FROM work_orders w JOIN customer_units u ON u.id=w.unit_id WHERE w.id=?').get(repair.workOrderId) as any
      if(!w||w.status==='closed'||w.customer_id!==repair.customerId||w.unit_id!==repair.unitId||w.category!==repair.category)throw new HttpErr(409,'This work order changed. Ask staff to resend the questions.')
      db.prepare('INSERT INTO work_order_intakes(id,work_order_id,unit_id,customer_id,category,unit_label,questions_json,answers_json,submitted_at) VALUES (?,?,?,?,?,?,?,?,?)').run(s.id,repair.workOrderId,repair.unitId,repair.customerId,repair.category,repair.unitLabel,JSON.stringify(repair.questions),JSON.stringify(answers),new Date().toISOString())
      const problem=withLatestIntakeIssue(db,repair.workOrderId,w.problem)
      db.prepare("UPDATE work_orders SET problem=?,updated_at=datetime('now') WHERE id=?").run(problem,repair.workOrderId)
      db.prepare('INSERT INTO work_order_history(work_order_id,note,by_name) VALUES (?,?,?)').run(repair.workOrderId,'Customer completed repair intake questions on kiosk; answers added to reported issue for printing. Staff review required.',s.kioskName)
    })()
    finish(s,'submitted');send(k.id,{type:'thanks',firstName:'',taxExempt:false});res.json({ok:true})
  }))

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
      const open=openSessionFor(id)
      if(open)finish(open,'cancelled')
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
  const startSession = (verificationOnly:boolean|'intake') => wrap((req, res) => {
      const b = (req.body ?? {}) as Record<string, unknown>
      if(verificationOnly===true && b.customerId===undefined)throw new ValidationError('Select the customer to validate')
      let repair:RepairSession|undefined
      if(verificationOnly==='intake'){
        const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<=0)throw new ValidationError('Choose a valid work order')
        const w=db.prepare('SELECT w.id,w.customer_id,w.unit_id,w.status,u.category,u.unit_type,u.brand,u.model,u.serial FROM work_orders w JOIN customer_units u ON u.id=w.unit_id WHERE w.id=?').get(id) as any
        if(!w||w.status==='closed')throw new HttpErr(409,'Open an active work order before sending intake questions')
        const questions=intakeSettings(db)[w.category as keyof ReturnType<typeof intakeSettings>]
        if(!questions?.length)throw new ValidationError('Add questions for this equipment category in Work Order Settings first')
        repair={workOrderId:id,customerId:w.customer_id,unitId:w.unit_id,category:w.category,number:'WO-'+String(id).padStart(6,'0'),unitLabel:[w.brand,w.model,w.unit_type,w.serial?'S/N '+w.serial:''].filter(Boolean).join(' '),questions}
      }
      const tillName = String(b.tillName ?? '').trim()
      const all = db.prepare('SELECT * FROM kiosks WHERE active = 1 ORDER BY id').all() as KioskRow[]
      if (all.length === 0) throw new HttpErr(404, 'No kiosk is paired yet. Pair the iPad in Settings first.')
      if(b.customerId!==undefined && (!Number.isSafeInteger(b.customerId) || Number(b.customerId)<=0))throw new ValidationError('Choose a valid customer')
      const target=b.customerId===undefined ? null : getCustomer(db,Number(b.customerId))
      if(b.customerId!==undefined && (!target || !target.active))throw new HttpErr(404,'Active customer not found')
      if(b.kioskId && !all.some(k=>k.id===Number(b.kioskId)))throw new HttpErr(404,'Kiosk not found')
      const kiosk =
        (b.kioskId ? all.find((k) => k.id === Number(b.kioskId)) : undefined) ??
        all.find((k) => k.till_name.toLowerCase() === tillName.toLowerCase()) ??
        (all.length === 1 ? all[0] : undefined)
      if (!kiosk) throw new HttpErr(404, `No kiosk is linked to till "${tillName}". Link one in Settings.`)
      if (!(streams.get(kiosk.id)?.size ?? 0))
        throw new HttpErr(409, `The kiosk "${kiosk.name}" is offline. Check the iPad is on, on Wi-Fi and showing the kiosk page.`)

      if(target && [...(streams.get(kiosk.id)??[])].some(r=>r.locals.kioskReviewVersion!==2))throw new HttpErr(409,'Reload the kiosk browser page and close any other kiosk tabs, then try Validate on kiosk again. The open page does not support customer validation.')

      if(repair&&[...(streams.get(kiosk.id)??[])].some(r=>r.locals.kioskIntakeVersion!==1))throw new HttpErr(409,'Reload the kiosk browser page and close older kiosk tabs before sending repair questions.')
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
      timer.unref()
      const session: LiveSession = {
        repair,
        targetId: target?.id,
        originalContact: target ? contactDetails(target) : undefined,
        originalTax: target ? taxDetails(target) : undefined,
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
  app.get('/api/repair-intake/settings',wrap((_req,res)=>res.json(intakeSettings(db))))
  app.put('/api/repair-intake/settings',wrap((req,res)=>res.json(saveIntakeSettings(db,req.body))))
  app.post('/api/workorders/:id/intake-kiosk',startSession('intake'))
  app.post('/api/kiosk-sessions/verify',startSession(true))
  app.post('/api/kiosk-sessions',startSession(false))

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

/**
 * Read and check the kiosk sign-up form. Required: first & last name, street,
 * city, state, ZIP, phone and email. Business name is optional. Ticking
 * "tax exempt" makes the Farm Tax ID required.
 */
export function readKioskForm(b: Record<string, unknown>) {
  const str = (v: unknown, max = 100) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max)
  const f = {
    firstName: str(b.firstName, 60),
    lastName: str(b.lastName, 60),
    company: str(b.company, 100),
    street: str(b.street, 120),
    street2: str(b.street2,120),
    mobile: str(b.mobile,30),
    city: str(b.city, 60),
    state: str(b.state, 40),
    zip: str(b.zip, 12),
    phone: str(b.phone, 30),
    email: str(b.email, 100).toLowerCase(),
    okToEmail: b.okToEmail === true,
    taxExempt: b.taxExempt === true,
    taxExemptId: str(b.taxExemptId, 40),
    taxExemptExpires: str(b.taxExemptExpires, 10) // YYYY-MM-DD from the date picker
  }
  const missing: string[] = []
  if (!f.firstName) missing.push('first name')
  if (!f.lastName) missing.push('last name')
  if (!f.street) missing.push('street address')
  if (!f.city) missing.push('city')
  if (!f.state) missing.push('state')
  if (!f.zip) missing.push('ZIP code')
  if (!f.phone) missing.push('phone number')
  if (!f.email) missing.push('email')
  if (f.taxExempt && !f.taxExemptId) missing.push('Farm Tax ID')
  if (f.taxExempt && !f.taxExemptExpires) missing.push('Farm Tax ID expiration date')
  if (missing.length) throw new ValidationError(`Please enter your ${missing.join(', ')}`)
  if (f.phone.replace(/\D/g, '').length < 7) throw new ValidationError('Please check your phone number')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) throw new ValidationError('Please check your email address')
  if (!/^[A-Za-z0-9 -]{3,12}$/.test(f.zip)) throw new ValidationError('Please check your ZIP code')
  if (f.taxExempt) {
    if (!isIsoDate(f.taxExemptExpires)) throw new ValidationError('Please check the expiration date')
    if (f.taxExemptExpires < localToday())
      throw new ValidationError(
        'That Farm Tax ID has expired. Untick "tax exempt" to continue, and please see the cashier about your exemption.'
      )
  } else {
    f.taxExemptId = ''
    f.taxExemptExpires = ''
  }
  return f
}

/** Today's date (YYYY-MM-DD) in the store's local time */
function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function cancelWorkOrderKioskSessions(workOrderId:number){for(const s of sessions.values()){if(s.status==='waiting'&&s.repair?.workOrderId===workOrderId){finish(s,'cancelled');try{send(s.kioskId,{type:'idle'})}catch{/* Closed stream; the next kiosk request will also be rejected. */}}}}
