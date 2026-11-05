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
 *   3. if the mapping is complete: make sure the summary customer and the
 *      "POS <Department>" items exist, then for every closed day not yet sent:
 *      look for the Sales Receipt No. first (never post twice), then add it.
 *
 * The Web Connector only allows plain http:// to "localhost", so it must run on
 * the store server PC itself, or reach it through the DiamondPOS QuickBooks
 * bridge (a till on the QuickBooks PC relays localhost:4581 → store server).
 */
import type express from 'express'
import crypto from 'crypto'
import type { DB } from '../db'
import type { StoreSettings } from '../../../shared/types'
import { QB_ROUNDING_ITEM, qbItemName, type QbConfig, type QbDailySummary, type QbStatus } from '../../../shared/quickbooks'
import { SERVER_PORT, QB_BRIDGE_PORT } from '../../../shared/constants'
import { child, esc, parseXml, text } from './xml'
import { envelope, parseResponse, readList, rq, salesReceiptTxnId, type QbResult } from './qbxml'
import { dailySummaries, salesDates } from './summary'
import {
  getExportRow,
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
}

const sessions = new Map<string, Session>()
let lastContact: string | null = null

const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** What still needs setting up before sales can be sent */
export function qbMissing(db: DB, cfg: QbConfig = getQbConfig(db)): string[] {
  const lists = getQbLists(db)
  const out: string[] = []
  if (!cfg.enabled) out.push('Sync is switched off')
  if (!lists.fetchedAt) out.push('Run the Web Connector once so DiamondPOS can read your QuickBooks lists')
  if (!cfg.customerName.trim()) out.push('Enter the QuickBooks customer name for daily sales')
  if (!cfg.salesTaxItem) out.push('Choose the QuickBooks sales tax item')
  if (!cfg.taxableCode || !cfg.nonTaxableCode) out.push('Choose the taxable and non-taxable sales tax codes')
  if (!cfg.defaultIncomeAccount) out.push('Choose the default income account')
  for (const m of ['cash', 'card'] as const)
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

  // ---------- Export bookkeeping ----------
  const upsertExport = (s: QbDailySummary) => {
    const row = getExportRow(db, s.saleDate, s.method)
    if (!row)
      db.prepare(
        'INSERT INTO qb_exports (sale_date, method, ref_number, total_cents, sale_count) VALUES (?, ?, ?, ?, ?)'
      ).run(s.saleDate, s.method, s.refNumber, s.totalCents, s.saleCount)
    else if (row.status === 'pending')
      db.prepare(
        "UPDATE qb_exports SET total_cents = ?, sale_count = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(s.totalCents, s.saleCount, row.id)
    return getExportRow(db, s.saleDate, s.method)!
  }
  const markSent = (id: number, txnId: string) =>
    db
      .prepare(
        "UPDATE qb_exports SET status = 'sent', txn_id = ?, error = NULL, attempts = attempts + 1, sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
      )
      .run(txnId, id)
  const markError = (id: number, msg: string) =>
    db
      .prepare(
        "UPDATE qb_exports SET status = 'error', error = ?, attempts = attempts + 1, updated_at = datetime('now') WHERE id = ?"
      )
      .run(msg.slice(0, 1000), id)

  const markManual = (id: number, sm: QbDailySummary) => {
    const msg =
      `Refunds were more than sales (${sm.method}) on ${sm.saleDate}: net -$${(-sm.totalCents / 100).toFixed(2)}. ` +
      `QuickBooks can't take a negative Sales Receipt, so enter it in QuickBooks as a Refund Receipt / Credit Memo, then click "Entered by hand".`
    db.prepare("UPDATE qb_exports SET status = 'manual', error = ?, updated_at = datetime('now') WHERE id = ?").run(msg, id)
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
        }
      }
    ]
    if (cfg.refreshLists || stale) {
      const listStep = (label: string, xml: string, read: (r: QbResult) => object): Step => ({
        kind: 'rq',
        label,
        xml,
        onOk: (r) => saveQbLists(db, read(r))
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
    if (cfg.customerName.trim())
      q.push({
        kind: 'rq',
        label: 'Customer',
        xml: rq.customer(cfg.customerName),
        onOk: (r) => saveQbLists(db, { customerExists: !!child(r.node, 'CustomerRet') })
      })
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
    for (const date of salesDates(db, cfg.startDate, localToday())) {
      for (const summary of dailySummaries(db, date, cfg, rate, qbRate)) {
        const row = upsertExport(summary)
        if (row.status === 'pending' && summary.totalCents < 0) {
          // More refunded than sold for this payment type: QuickBooks can't take a negative Sales Receipt
          markManual(row.id, summary)
          continue
        }
        if (row.status === 'pending') toSend.push({ summary, exportId: row.id })
      }
      if (toSend.length >= 40) break // keep each sync short; the rest go next time
    }
    if (toSend.length === 0) return

    const steps: Step[] = []
    if (!lists.customerExists)
      steps.push({
        kind: 'rq',
        label: `Create customer "${cfg.customerName}"`,
        xml: rq.addCustomer(cfg.customerName),
        onOk: () => {
          saveQbLists(db, { customerExists: true })
          qbLog(db, 'info', `Created QuickBooks customer "${cfg.customerName}"`)
        }
      })

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
        }
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
            markSent(exportId, existing)
            qbLog(db, 'info', `${label} was already in QuickBooks, so it was not sent again`)
            return
          }
          // Not there yet: add it next
          s.queue.unshift({
            kind: 'rq',
            label: `Add ${label}`,
            xml: rq.addSalesReceipt(summary, cfg),
            onOk: (res) => {
              markSent(exportId, salesReceiptTxnId(res))
              s.sent++
              qbLog(
                db,
                'info',
                `Sent ${label}: ${summary.saleDate} ${summary.method}, ${summary.saleCount} sale(s), $${(summary.totalCents / 100).toFixed(2)}`
              )
            },
            onFail: (msg) => {
              markError(exportId, msg)
              s.failed++
            }
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
        let status = '' // '' = use the company file that is open in QuickBooks
        if (p('strUserName') !== cfg.username || p('strPassword') !== cfg.password) {
          status = 'nvu'
          qbLog(db, 'error', 'Web Connector login failed: wrong user name or password. Download a new connector file.')
        } else if (!cfg.enabled) {
          status = 'none'
        } else {
          const s: Session = { ticket, queue: [], done: 0, lastError: '', sent: 0, failed: 0 }
          sessions.set(ticket, s)
          buildQueue(s)
        }
        return soap(method, `<authenticateResult><string>${esc(ticket)}</string><string>${status}</string></authenticateResult>`)
      }
      case 'sendRequestXML': {
        const s = sessions.get(p('ticket'))
        if (!s) return result(method, '')
        const step = nextRequest(s)
        if (!step || step.kind !== 'rq') return result(method, '')
        s.queue.shift()
        s.current = step
        return result(method, envelope(step.xml))
      }
      case 'receiveResponseXML': {
        const s = sessions.get(p('ticket'))
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
              if (r.ok) step.onOk?.(r)
              else failure = `${r.message || 'QuickBooks refused the request'} (code ${r.statusCode})`
            } catch (e) {
              failure = `Could not read QuickBooks' reply: ${(e as Error).message}`
            }
          }
          if (failure) {
            s.lastError = `${step.label}: ${failure}`
            qbLog(db, 'error', s.lastError)
            step.onFail?.(failure)
          }
        }
        return result(method, progress(s))
      }
      case 'connectionError': {
        const msg = p('message') || p('hresult')
        qbLog(db, 'error', `The Web Connector could not open QuickBooks: ${msg}. Is QuickBooks installed and the company file available?`)
        sessions.delete(p('ticket'))
        return result(method, 'done')
      }
      case 'getLastError': {
        const s = sessions.get(p('ticket'))
        return result(method, s?.lastError || 'No error')
      }
      case 'closeConnection': {
        const s = sessions.get(p('ticket'))
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
    res.end('<h1>DiamondPOS</h1><p>QuickBooks daily sales sync. Settings are on the QuickBooks screen in DiamondPOS.</p>')
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
    if (b.methods)
      clean.methods = {
        cash: { depositAccount: str(b.methods.cash?.depositAccount), paymentMethod: str(b.methods.cash?.paymentMethod) },
        card: { depositAccount: str(b.methods.card?.depositAccount), paymentMethod: str(b.methods.card?.paymentMethod) }
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
      `  <AppDescription>DiamondPOS daily sales summary</AppDescription>\n` +
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
      summaries: dailySummaries(db, date, cfg, readSettings(db).taxRate, qbTaxRate(cfg)),
      qbTaxRate: qbTaxRate(cfg),
      roundingItem: QB_ROUNDING_ITEM
    })
  })

  app.get('/api/qb/exports', (_req, res) => res.json(listExports(db)))

  app.post('/api/qb/exports/:id/retry', (req, res) => {
    db.prepare("UPDATE qb_exports SET status = 'pending', error = NULL, updated_at = datetime('now') WHERE id = ? AND status = 'error'").run(
      Number(req.params.id)
    )
    res.json(listExports(db))
  })

  // A day that had to be entered in QuickBooks by hand (refunds more than sales)
  app.post('/api/qb/exports/:id/manual-done', (req, res) => {
    db.prepare(
      "UPDATE qb_exports SET status = 'sent', txn_id = 'MANUAL', error = NULL, sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND status = 'manual'"
    ).run(Number(req.params.id))
    qbLog(db, 'info', `Export ${req.params.id} marked as entered in QuickBooks by hand`)
    res.json(listExports(db))
  })

  app.get('/api/qb/log', (_req, res) => res.json(readQbLog(db)))
}

export { qbItemName }
