/**
 * QUICKBOOKS DESKTOP SYNC (via Intuit's QuickBooks Web Connector)
 *
 * The Web Connector runs on the PC with QuickBooks. Every N minutes it calls
 * POST /qbwc on this store server (SOAP). We hand it qbXML requests one at a
 * time; it runs them in QuickBooks and hands back the responses.
 *
 * Each sync session:
 *   1. company name (proves we're connected)
 *   2. reference lists (accounts, sales tax items/codes, payment methods,
 *      Other Charge items) - daily, or when "Refresh lists" is clicked
 *   3. if the mapping is complete: make sure each sale customer and the
 *      "POS <Department>" items exist, then for every individual sale not yet sent:
 *      look for the Sales Receipt No. first (never post twice), then add it.
 *
 * The Web Connector only allows plain http:// to "localhost", so it must run on
 * the store server PC itself, or reach it through the DiamondPOS QuickBooks
 * bridge (a till on the QuickBooks PC relays localhost:4581 → store server).
 */
import type express from 'express'
import crypto from 'crypto'
import { recordQbCompletion, recordQbFailure } from '../operations'
import type { DB } from '../db'
import type { StoreSettings } from '../../../shared/types'
import { QB_ROUNDING_ITEM, qbItemName, type QbConfig, type QbDailySummary, type QbStatus } from '../../../shared/quickbooks'
import { SERVER_PORT, QB_BRIDGE_PORT } from '../../../shared/constants'
import { child, esc, parseXml, text } from './xml'
import { envelope, parseResponse, readList, rq, salesReceiptTxnId, type QbResult } from './qbxml'
import { individualSummaries, salesDates } from './summary'
import {
  getQbConfig,
  getQbLists,
  listExports,
  newQbPassword,
  qbLog,
  readQbLog,
  saveQbConfig,
  saveQbLists
} from './store'

type Step =
  | { kind: 'rq'; label: string; xml: string; onOk?: (r: QbResult) => void; onFail?: (msg: string) => void }
  | { kind: 'plan'; label: string; run: () => void }

interface Session {
  ticket: string
  queue: Step[]
  done: number
  current?: Step
  lastError: string
  sent: number
  failed: number
  touchedAt: number
}

const sessions = new Map<string, Session>()
let lastContact: string | null = null


/** What still needs setting up before sales can be sent */
export function qbMissing(db: DB, cfg: QbConfig = getQbConfig(db)): string[] {
  const lists = getQbLists(db)
  const out: string[] = []
  if (!cfg.enabled) out.push('Sync is switched off')
  if (!lists.fetchedAt) out.push('Run the Web Connector once so Diamond POS can read your QuickBooks lists')
  if (!cfg.customerName.trim() || cfg.customerName.length > 41 || cfg.customerName.includes(':')) out.push('Enter a walk-in customer name of 1–41 characters without a colon')
  if (!cfg.salesTaxItem) out.push('Choose the QuickBooks sales tax item')
  if (!cfg.taxableCode || !cfg.nonTaxableCode) out.push('Choose the taxable and non-taxable sales tax codes')
  if (!cfg.defaultIncomeAccount) out.push('Choose the default income account')
  for (const m of ['cash', 'card', 'check'] as const)
    if (!cfg.methods[m].depositAccount) out.push(`Choose where ${m} sales are deposited`)
  return out
}

function departments(db: DB): string[] {
  return (
    db
      .prepare(
        `SELECT DISTINCT COALESCE(department, '') AS d FROM products
         UNION SELECT DISTINCT COALESCE(department, '') FROM sale_items ORDER BY 1`
      )
      .all() as { d: string }[]
  ).map((r) => r.d)
}

export function registerQuickBooksRoutes(app: express.Express, db: DB, readSettings: (db: DB) => StoreSettings) {
  const qbTaxRate = (cfg: QbConfig): number | null => {
    const item = getQbLists(db).salesTaxItems.find((t) => t.name === cfg.salesTaxItem)
    return item && item.rate !== null ? item.rate / 100 : null
  }

  const tomorrow = () => {
    const d = new Date(); d.setDate(d.getDate() + 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  // ---------- Export bookkeeping ----------
  const upsertExport = (s: QbDailySummary) => {
    db.prepare(`INSERT OR IGNORE INTO qb_sale_exports
      (sale_id, customer_name, sale_date, method, ref_number, total_cents, sale_count)
      VALUES (?, ?, ?, ?, ?, ?, 1)`).run(s.saleId!, s.customerName!, s.saleDate, s.method, s.refNumber, s.totalCents)
    return db.prepare('SELECT id, status FROM qb_sale_exports WHERE sale_id = ?').get(s.saleId!) as { id: number; status: string }
  }
  const markSent = (id: number, txnId: string) =>
    db
      .prepare(
        "UPDATE qb_sale_exports SET status = 'sent', txn_id = ?, error = NULL, attempts = attempts + 1, sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
      )
      .run(txnId, id)
  const markError = (id: number, msg: string) =>
    db
      .prepare(
        "UPDATE qb_sale_exports SET status = 'error', error = ?, attempts = attempts + 1, updated_at = datetime('now') WHERE id = ?"
      )
      .run(msg.slice(0, 1000), id)

  const markManual = (id: number, sm: QbDailySummary) => {
    const msg = `Receipt #${sm.saleId} (${sm.customerName}): ${sm.manualReason}`
    db.prepare("UPDATE qb_sale_exports SET status = 'manual', error = ?, updated_at = datetime('now') WHERE id = ?").run(msg, id)
    qbLog(db, 'warn', msg)
  }

  // ---------- Building a session's work ----------
  function buildQueue(s: Session) {
    const cfg = getQbConfig(db)
    const lists = getQbLists(db)
    const stale = !lists.fetchedAt || Date.now() - Date.parse(lists.fetchedAt) > 24 * 3600 * 1000
    const q: Step[] = [
      {
        kind: 'rq',
        label: 'Company',
        xml: rq.company(),
        onOk: (r) => {
          const company = readList.company(r)
          saveQbLists(db, company)
        },
        onFail: () => { s.queue = [] }
      }
    ]
    if (cfg.refreshLists || stale) {
      const listStep = (label: string, xml: string, read: (r: QbResult) => object): Step => ({
        kind: 'rq',
        label,
        xml,
        onOk: (r) => saveQbLists(db, read(r)),
        onFail: () => { s.queue = [] }
      })
      q.push(
        listStep('Accounts', rq.accounts(), readList.accounts),
        listStep('Sales tax items', rq.salesTaxItems(), readList.salesTaxItems),
        listStep('Sales tax codes', rq.salesTaxCodes(), readList.salesTaxCodes),
        listStep('Payment methods', rq.paymentMethods(), readList.paymentMethods),
        listStep('Other Charge items', rq.otherChargeItems(), readList.otherChargeItems),
        {
          kind: 'plan',
          label: 'Lists done',
          run: () => {
            saveQbLists(db, { fetchedAt: new Date().toISOString() })
            saveQbConfig(db, { refreshLists: false })
            qbLog(db, 'info', 'Read accounts, sales tax items, codes and payment methods from QuickBooks')
          }
        }
      )
    }
    q.push({ kind: 'plan', label: 'Plan exports', run: () => planExports(s) })
    s.queue = q
  }

  function planExports(s: Session) {
    const cfg = getQbConfig(db)
    const missing = qbMissing(db, cfg)
    if (missing.length) {
      if (cfg.enabled) qbLog(db, 'warn', `Not sending sales yet: ${missing.join('; ')}`)
      return
    }
    const lists = getQbLists(db)
    const rate = readSettings(db).taxRate
    const qbRate = qbTaxRate(cfg)
    const toSend: { summary: QbDailySummary; exportId: number }[] = []
    for (const date of salesDates(db, cfg.startDate, tomorrow())) {
      for (const summary of individualSummaries(db, date, cfg, rate, qbRate)) {
        const row = upsertExport(summary)
        if (row.status === 'pending' && summary.manualReason) {
          // Refunds, split tenders, and legacy daily exports require reconciliation
          markManual(row.id, summary)
          continue
        }
        if (row.status === 'pending') toSend.push({ summary, exportId: row.id })
        if (toSend.length >= 40) break
      }
      if (toSend.length >= 40) break // keep each sync short; the rest go next time
    }
    if (toSend.length === 0) return

    const steps: Step[] = []
    // The "POS <Department>" Other Charge items each line uses
    const have = new Set(lists.otherChargeItems.map((n) => n.toLowerCase()))
    const needed = new Map<string, string>()
    for (const { summary } of toSend)
      for (const l of summary.lines) if (!have.has(l.itemName.toLowerCase())) needed.set(l.itemName, l.account)
    for (const [name, account] of needed)
      steps.push({
        kind: 'rq',
        label: `Create item "${name}"`,
        xml: rq.addOtherChargeItem(name, account),
        onOk: () => {
          saveQbLists(db, { otherChargeItems: [...getQbLists(db).otherChargeItems, name] })
          qbLog(db, 'info', `Created QuickBooks item "${name}" (income account: ${account})`)
        },
        onFail: () => { s.queue = [] } 
      })

    for (const { summary, exportId } of toSend) {
      const label = `Sales Receipt ${summary.refNumber}`
      steps.push({
        kind: 'rq',
        label: `Check ${label}`,
        xml: rq.findSalesReceipt(summary.refNumber),
        onOk: (r) => {
          const existing = salesReceiptTxnId(r)
          if (existing) {
            const receipt = child(r.node, 'SalesReceiptRet')
            const customer = text(child(receipt, 'CustomerRef'), 'FullName')
            const total = Math.round(Number(text(receipt, 'TotalAmount')) * 100)
            if (!text(receipt, 'Memo').startsWith(`DiamondPOS receipt #${summary.saleId};`) ||
                customer.toLowerCase() !== summary.customerName!.toLowerCase() || total !== summary.totalCents) {
              recordQbFailure(db, 'A QuickBooks receipt number conflicts with this POS sale')
              markError(exportId, 'That receipt number already exists in QuickBooks with different details. Reconcile it before retrying.')
              s.failed++
              return
            }
            markSent(exportId, existing)
            qbLog(db, 'info', `${label} was already in QuickBooks, so it was not sent again`)
            return
          }
          const addReceipt = () => s.queue.unshift({
            kind: 'rq', label: `Add ${label}`, xml: rq.addSalesReceipt(summary, cfg),
            onOk: (res) => {
              const txn = salesReceiptTxnId(res)
              if (!txn) throw new Error('QuickBooks returned no transaction ID; retry will check before adding')
              markSent(exportId, txn)
              s.sent++
              qbLog(db, 'info', `Sent ${label} for ${summary.customerName}: $${(summary.totalCents / 100).toFixed(2)}`)
            },
            onFail: (msg) => { markError(exportId, msg); s.failed++ }
          })
          // Query the exact POS-specific customer name. Never merge same-name people.
          s.queue.unshift({
            kind: 'rq', label: `Customer ${summary.customerName}`, xml: rq.customer(summary.customerName!),
            onOk: (customer) => {
              if (child(customer.node, 'CustomerRet')) addReceipt()
              else s.queue.unshift({
                kind: 'rq', label: `Create customer ${summary.customerName}`, xml: rq.addCustomer(summary.customerName!),
                onOk: () => addReceipt(),
                onFail: (msg) => { markError(exportId, `Customer: ${msg}`); s.failed++ }
              })
            },
            onFail: (msg) => { markError(exportId, `Customer: ${msg}`); s.failed++ }
          })
        },
        onFail: (msg) => {
          markError(exportId, msg)
          s.failed++
        }
      })
    }
    s.queue.unshift(...steps)
  }

  /** Run "plan" steps at the front of the queue; return the next request (or undefined) */
  function nextRequest(s: Session): Step | undefined {
    while (s.queue.length && s.queue[0].kind === 'plan') {
      const p = s.queue.shift() as Extract<Step, { kind: 'plan' }>
      try {
        p.run()
      } catch (e) {
        qbLog(db, 'error', `${p.label}: ${(e as Error).message}`)
      }
    }
    return s.queue[0]
  }

  function progress(s: Session): number {
    if (!nextRequest(s)) return 100
    const left = s.queue.filter((q) => q.kind === 'rq').length
    return Math.min(99, Math.round((s.done / (s.done + left)) * 100))
  }

  // ---------- SOAP endpoint ----------
  const soap = (method: string, inner: string) =>
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">` +
    `<soap:Body><${method}Response xmlns="http://developer.intuit.com/">${inner}</${method}Response></soap:Body></soap:Envelope>`
  const result = (method: string, value: string | number) =>
    soap(method, `<${method}Result>${esc(value)}</${method}Result>`)

  function handle(method: string, p: (name: string) => string): string {
    lastContact = new Date().toISOString()
    switch (method) {
      case 'serverVersion':
        return result(method, 'DiamondPOS 1.0')
      case 'clientVersion':
        return result(method, '') // any Web Connector version is fine
      case 'authenticate': {
        const cfg = getQbConfig(db)
        const ticket = crypto.randomUUID()
        for (const [id, session] of sessions) if (Date.now() - session.touchedAt > 30 * 60 * 1000) sessions.delete(id)
        let status = '' // '' = use the company file that is open in QuickBooks
        if (p('strUserName') !== cfg.username || p('strPassword') !== cfg.password) {
          status = 'nvu'
          recordQbFailure(db, 'Web Connector login failed: wrong user name or password')
          qbLog(db, 'error', 'Web Connector login failed: wrong user name or password. Download a new connector file.')
        } else if (sessions.size > 0) {
          status = 'none'
        } else {
          const s: Session = { ticket, queue: [], done: 0, lastError: '', sent: 0, failed: 0, touchedAt: Date.now() }
          sessions.set(ticket, s)
          buildQueue(s)
        }
        return soap(method, `<authenticateResult><string>${esc(ticket)}</string><string>${status}</string></authenticateResult>`)
      }
      case 'sendRequestXML': {
        const s = sessions.get(p('ticket'))
        if (s) s.touchedAt = Date.now()
        if (!s) return result(method, '')
        const step = nextRequest(s)
        if (!step || step.kind !== 'rq') return result(method, '')
        s.queue.shift()
        s.current = step
        return result(method, envelope(step.xml))
      }
      case 'receiveResponseXML': {
        const s = sessions.get(p('ticket'))
        if (s) s.touchedAt = Date.now()
        if (!s) return result(method, 100)
        const step = s.current as Extract<Step, { kind: 'rq' }> | undefined
        s.current = undefined
        s.done++
        const hresult = p('hresult')
        if (step) {
          let failure = ''
          if (hresult) failure = `${p('message') || 'QuickBooks error'} (${hresult})`
          else {
            try {
              const r = parseResponse(p('response'))
              const expected = step.xml.match(/^<([A-Za-z]+)Rq/)?.[1] + 'Rs'
              if (r.name !== expected) throw new Error(`Expected ${expected}, received ${r.name}`)
              if (r.ok) step.onOk?.(r)
              else failure = `${r.message || 'QuickBooks refused the request'} (code ${r.statusCode})`
            } catch (e) {
              failure = `Could not read QuickBooks' reply: ${(e as Error).message}`
            }
          }
          if (failure) {
            s.lastError = `${step.label}: ${failure}`
            recordQbFailure(db, s.lastError)
            qbLog(db, 'error', s.lastError)
            step.onFail?.(failure)
          }
        }
        const completed = progress(s)
        if (step && completed === 100 && !s.lastError && s.failed === 0)
          recordQbCompletion(db, qbMissing(db).length === 0)
        return result(method, completed)
      }
      case 'connectionError': {
        const msg = p('message') || p('hresult')
        recordQbFailure(db, `QuickBooks connection failed: ${msg}`)
        qbLog(db, 'error', `The Web Connector could not open QuickBooks: ${msg}. Is QuickBooks installed and the company file available?`)
        sessions.delete(p('ticket'))
        return result(method, 'done')
      }
      case 'getLastError': {
        const s = sessions.get(p('ticket'))
        if (s) s.touchedAt = Date.now()
        return result(method, s?.lastError || 'No error')
      }
      case 'closeConnection': {
        const s = sessions.get(p('ticket'))
        if (s) s.touchedAt = Date.now()
        if (s) {
          sessions.delete(s.ticket)
          if (s.sent || s.failed)
            qbLog(db, s.failed ? 'warn' : 'info', `Sync finished: ${s.sent} Sales Receipt(s) sent, ${s.failed} problem(s)`)
        }
        return result(method, 'OK')
      }
      default:
        throw new Error(`Unknown Web Connector call "${method}"`)
    }
  }

  app.post('/qbwc', (req, res) => {
    res.setHeader('Content-Type', 'text/xml; charset=utf-8')
    try {
      const body = typeof req.body === 'string' ? req.body : ''
      const env = parseXml(body)
      const methodNode = child(env, 'Body')?.children[0]
      if (!methodNode) throw new Error('Empty SOAP request')
      res.end(handle(methodNode.name, (name) => text(methodNode, name)))
    } catch (e) {
      qbLog(db, 'error', `Web Connector request failed: ${(e as Error).message}`)
      res.status(500).end(
        `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>soap:Server</faultcode><faultstring>${esc((e as Error).message)}</faultstring></soap:Fault></soap:Body></soap:Envelope>`
      )
    }
  })

  // The Web Connector checks that the support link works
  app.get('/qbwc/support', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end('<h1>Diamond POS</h1><p>QuickBooks individual sales sync. Settings are on the QuickBooks screen in Diamond POS.</p>')
  })

  // ---------- Till-facing API (needs the store pairing code) ----------
  const status = (): QbStatus => {
    const cfg = getQbConfig(db)
    return {
      config: cfg,
      lists: getQbLists(db),
      missing: qbMissing(db, cfg),
      departments: departments(db),
      lastContact,
      syncing: sessions.size > 0
    }
  }

  app.get('/api/qb/status', (_req, res) => res.json(status()))

  app.put('/api/qb/config', (req, res) => {
    const b = (req.body ?? {}) as Partial<QbConfig>
    const clean: Partial<QbConfig> = {}
    const str = (v: unknown) => String(v ?? '').trim()
    if (b.enabled !== undefined) clean.enabled = b.enabled === true
    if (b.startDate !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(str(b.startDate))) return res.status(400).json({ error: 'Start date must be a date' })
      clean.startDate = str(b.startDate)
    }
    for (const k of ['customerName', 'salesTaxItem', 'taxableCode', 'nonTaxableCode', 'defaultIncomeAccount'] as const)
      if (b[k] !== undefined) clean[k] = str(b[k]).slice(0, 159)
    if (b.departmentAccounts && typeof b.departmentAccounts === 'object')
      clean.departmentAccounts = Object.fromEntries(
        Object.entries(b.departmentAccounts).map(([k, v]) => [k, str(v)]).filter(([, v]) => v)
      )
    if (b.methods) {
      // A method the screen didn't send (e.g. an older till without "check") keeps its saved mapping
      const cur = getQbConfig(db).methods
      const m = (k: 'cash' | 'card' | 'check') =>
        b.methods?.[k] ? { depositAccount: str(b.methods[k]!.depositAccount), paymentMethod: str(b.methods[k]!.paymentMethod) } : cur[k]
      clean.methods = { cash: m('cash'), card: m('card'), check: m('check') }
    }
    saveQbConfig(db, clean)
    res.json(status())
  })

  app.post('/api/qb/refresh-lists', (_req, res) => {
    saveQbConfig(db, { refreshLists: true })
    res.json(status())
  })

  app.post('/api/qb/new-password', (_req, res) => {
    newQbPassword(db)
    qbLog(db, 'warn', 'Web Connector password changed. Download the new connector file and add it again.')
    res.json(status())
  })

  // The .qwc file the Web Connector needs. via=direct: QuickBooks is on the store server PC.
  // via=bridge: QuickBooks is on another PC running DiamondPOS with the QuickBooks bridge on.
  app.get('/api/qb/qwc', (req, res) => {
    const cfg = getQbConfig(db)
    const port = req.query.via === 'bridge' ? QB_BRIDGE_PORT : SERVER_PORT
    const ids = getQbIds()
    const xml =
      `<?xml version="1.0"?>\n<QBWCXML>\n` +
      `  <AppName>DiamondPOS</AppName>\n  <AppID></AppID>\n` +
      `  <AppURL>http://localhost:${port}/qbwc</AppURL>\n` +
      `  <AppDescription>DiamondPOS individual sales and customer names</AppDescription>\n` +
      `  <AppSupport>http://localhost:${port}/qbwc/support</AppSupport>\n` +
      `  <UserName>${esc(cfg.username)}</UserName>\n` +
      `  <OwnerID>{${ids.ownerId}}</OwnerID>\n  <FileID>{${ids.fileId}}</FileID>\n` +
      `  <QBType>QBFS</QBType>\n` +
      `  <Scheduler>\n    <RunEveryNMinutes>30</RunEveryNMinutes>\n  </Scheduler>\n` +
      `  <IsReadOnly>false</IsReadOnly>\n</QBWCXML>\n`
    res.json({ fileName: 'DiamondPOS.qwc', xml })
  })

  function getQbIds(): { ownerId: string; fileId: string } {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'qb_ids'").get() as { value: string } | undefined
    if (row) return JSON.parse(row.value)
    const ids = { ownerId: crypto.randomUUID().toUpperCase(), fileId: crypto.randomUUID().toUpperCase() }
    db.prepare("INSERT INTO settings (key, value) VALUES ('qb_ids', ?)").run(JSON.stringify(ids))
    return ids
  }

  // Preview what would be sent for a day (works without QuickBooks)
  app.get('/api/qb/preview', (req, res) => {
    const date = String(req.query.date ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date=YYYY-MM-DD is required' })
    const cfg = getQbConfig(db)
    res.json({
      summaries: individualSummaries(db, date, cfg, readSettings(db).taxRate, qbTaxRate(cfg)),
      qbTaxRate: qbTaxRate(cfg),
      roundingItem: QB_ROUNDING_ITEM
    })
  })

  app.get('/api/qb/exports', (_req, res) => res.json(listExports(db)))

  app.post('/api/qb/exports/:id/retry', (req, res) => {
    db.prepare("UPDATE qb_sale_exports SET status = 'pending', error = NULL, updated_at = datetime('now') WHERE id = ? AND status = 'error'").run(
      Number(req.params.id)
    )
    res.json(listExports(db))
  })

  // A day that had to be entered in QuickBooks by hand (individual refunds / exceptions)
  app.post('/api/qb/exports/:id/manual-done', (req, res) => {
    db.prepare(
      "UPDATE qb_sale_exports SET status = 'sent', txn_id = 'MANUAL', error = NULL, sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND status = 'manual'"
    ).run(Number(req.params.id))
    qbLog(db, 'info', `Export ${req.params.id} marked as entered in QuickBooks by hand`)
    res.json(listExports(db))
  })

  app.get('/api/qb/log', (_req, res) => res.json(readQbLog(db)))
}

export { qbItemName }
