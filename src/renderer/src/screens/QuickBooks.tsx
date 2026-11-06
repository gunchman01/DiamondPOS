import { PAYMENT_LABEL } from '../../../shared/types'
import { useEffect, useMemo, useState } from 'react'
import type { BootInfo } from '../../../shared/types'
import type { QbConfig, QbDailySummary, QbExport, QbLogEntry, QbStatus } from '../../../shared/quickbooks'
import { api } from '../api'
import { dateTime, money, today } from '../format'

const yesterday = () => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Save a text file (Windows shows a Save dialog) */
function saveFile(name: string, content: string) {
  const a = document.createElement('a')
  a.href = 'data:application/xml;charset=utf-8,' + encodeURIComponent(content)
  a.download = name
  a.click()
}

/** QuickBooks Desktop: connection, account mapping, preview and sync history. */
export default function QuickBooks({ boot, onBootChange }: { boot: BootInfo; onBootChange: (b: BootInfo) => void }) {
  const [st, setSt] = useState<QbStatus | null>(null)
  const [draft, setDraft] = useState<QbConfig | null>(null)
  const [exports, setExports] = useState<QbExport[]>([])
  const [log, setLog] = useState<QbLogEntry[]>([])
  const [previewDate, setPreviewDate] = useState(yesterday())
  const [preview, setPreview] = useState<QbDailySummary[] | null>(null)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [showPw, setShowPw] = useState(false)

  const load = async () => {
    try {
      const [s, e, l] = await Promise.all([api.qbStatus(), api.qbExports(), api.qbLog()])
      setSt(s)
      setDraft((d) => d ?? s.config)
      setExports(e)
      setLog(l)
    } catch (err) {
      setError((err as Error).message)
    }
  }
  useEffect(() => {
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [])

  async function run(fn: () => Promise<unknown>, ok: string) {
    setError('')
    setMsg('')
    try {
      await fn()
      setMsg(ok)
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const lists = st?.lists
  const income = useMemo(() => (lists?.accounts ?? []).filter((a) => /income/i.test(a.type)), [lists])
  const depositAccounts = useMemo(
    () => (lists?.accounts ?? []).filter((a) => /bank|currentasset/i.test(a.type)),
    [lists]
  )
  const taxItem = lists?.salesTaxItems.find((t) => t.name === draft?.salesTaxItem)

  if (!st || !draft || !lists) return <div className="page">{error ? <div className="error-text">{error}</div> : 'Loading…'}</div>

  const set = (changes: Partial<QbConfig>) => setDraft({ ...draft, ...changes })
  const setMethod = (m: 'cash' | 'card' | 'check', k: 'depositAccount' | 'paymentMethod', v: string) =>
    setDraft({ ...draft, methods: { ...draft.methods, [m]: { ...draft.methods[m], [k]: v } } })
  const dirty = JSON.stringify(draft) !== JSON.stringify(st.config)
  const isServer = boot.config.mode === 'server'

  const Select = (p: { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string }) => (
    <select value={p.value} onChange={(e) => p.onChange(e.target.value)}>
      <option value="">{p.placeholder ?? '— choose —'}</option>
      {p.value && !p.options.includes(p.value) && <option value={p.value}>{p.value} (not found in QuickBooks)</option>}
      {p.options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )

  return (
    <div className="page wide qb">
      <div className="row between">
        <h2>QuickBooks Desktop</h2>
        <label className="check qb-enable">
          <input
            type="checkbox"
            checked={st.config.enabled}
            onChange={(e) =>
              run(() => api.qbSaveConfig({ enabled: e.target.checked }), e.target.checked ? 'Sync switched on' : 'Sync switched off')
            }
          />
          Send daily sales to QuickBooks
        </label>
      </div>

      {/* ---------- Status ---------- */}
      <div className={st.missing.length ? 'card qb-status warn' : 'card qb-status ok'}>
        <div className="qb-status-main">
          <span className={lists.companyName ? 'dot ok' : 'dot bad'} />
          {lists.companyName ? (
            <span>
              Connected to <b>{lists.companyName}</b>
            </span>
          ) : (
            <span>Not connected yet</span>
          )}
          <span className="muted small">
            Last contact: {st.lastContact ? dateTime(st.lastContact) : 'never (since the server started)'}
            {st.syncing && ' · syncing now…'}
          </span>
        </div>
        {st.missing.length > 0 ? (
          <ul className="qb-missing">
            {st.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        ) : (
          <div className="ok-text">Ready. Each closed day is sent automatically the next time the Web Connector runs.</div>
        )}
      </div>
      {msg && <div className="ok-text">{msg}</div>}
      {error && <div className="error-text">{error}</div>}

      {/* ---------- Connect ---------- */}
      <div className="card form">
        <h3>1. Connect the QuickBooks Web Connector</h3>
        <div className="qb-connect">
          <div>
            <h4>Where is QuickBooks installed?</h4>
            <p className="small">
              <b>On the store server PC</b>{isServer ? ' (this computer)' : ''}: download the connector file below with{' '}
              <i>QuickBooks on the store server</i>.
            </p>
            <p className="small">
              <b>On another PC</b> (e.g. the back office): install Diamond POS on that PC as a <b>Till</b>, tick{' '}
              <i>Run the QuickBooks bridge</i> there, and use the <i>QuickBooks on another PC</i> file. Keep Diamond POS open
              on that PC.
            </p>
            {boot.config.mode === 'till' && (
              <label className="check bridge-check">
                <input
                  type="checkbox"
                  checked={boot.config.qbBridge}
                  onChange={async (e) => onBootChange(await window.pos.saveConfig({ qbBridge: e.target.checked }))}
                />
                Run the QuickBooks bridge on <b>this</b> computer (QuickBooks is installed here)
              </label>
            )}
            <div className="row gap">
              <button
                onClick={() =>
                  run(async () => {
                    const f = await api.qbConnectorFile('direct')
                    saveFile(f.fileName, f.xml)
                  }, 'Connector file saved')
                }
              >
                ⬇ Connector file: QuickBooks on the store server
              </button>
              <button
                onClick={() =>
                  run(async () => {
                    const f = await api.qbConnectorFile('bridge')
                    saveFile(f.fileName, f.xml)
                  }, 'Connector file saved')
                }
              >
                ⬇ Connector file: QuickBooks on another PC
              </button>
            </div>
          </div>
          <div>
            <h4>Then, on the QuickBooks PC</h4>
            <ol className="steps small">
              <li>Open QuickBooks Enterprise and your company file, signed in as Admin.</li>
              <li>
                Open <b>Web Connector</b> (QuickBooks: File → Update Web Services), click <b>Add an application</b> and
                choose the DiamondPOS.qwc file.
              </li>
              <li>
                When QuickBooks asks, choose <b>"Yes, always; allow access even if QuickBooks is not running"</b>.
              </li>
              <li>
                Back in Web Connector, enter this password, tick <b>Auto-Run</b>, then click <b>Update Selected</b>.
              </li>
            </ol>
            <div className="qb-login">
              <span>User</span>
              <b>{st.config.username}</b>
              <span>Password</span>
              <span>
                <b className="code">{showPw ? st.config.password : '••••••••••'}</b>{' '}
                <button className="link" onClick={() => setShowPw(!showPw)}>
                  {showPw ? 'hide' : 'show'}
                </button>{' '}
                <button className="link" onClick={() => navigator.clipboard?.writeText(st.config.password)}>
                  copy
                </button>{' '}
                <button
                  className="link"
                  onClick={() =>
                    confirm('Make a new password? You will need to download and add the connector file again.') &&
                    run(() => api.qbNewPassword(), 'New password created')
                  }
                >
                  change
                </button>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- Mapping ---------- */}
      <div className="card form">
        <div className="row between">
          <h3>2. Where sales go in QuickBooks</h3>
          <button onClick={() => run(() => api.qbRefreshLists(), 'Lists will be re-read from QuickBooks on the next sync')}>
            ↻ Re-read lists from QuickBooks
          </button>
        </div>
        {!lists.fetchedAt && (
          <p className="muted small">
            The drop-downs fill in after the Web Connector has run once. You can still type names exactly as they appear
            in QuickBooks.
          </p>
        )}
        <div className="qb-map">
          <label>
            Start sending from (earlier days are never sent)
            <input type="date" value={draft.startDate} max={today()} onChange={(e) => set({ startDate: e.target.value })} />
          </label>
          <label>
            QuickBooks customer for daily sales (created if missing)
            <input value={draft.customerName} onChange={(e) => set({ customerName: e.target.value })} />
          </label>
          <label>
            Sales tax item
            <Select
              value={draft.salesTaxItem}
              onChange={(v) => set({ salesTaxItem: v })}
              options={lists.salesTaxItems.map((t) => t.name)}
            />
            {taxItem && taxItem.rate !== null && <span className="small muted">Rate in QuickBooks: {taxItem.rate}%</span>}
          </label>
          <label>
            Taxable / non-taxable codes
            <div className="row gap">
              <Select
                value={draft.taxableCode}
                onChange={(v) => set({ taxableCode: v })}
                options={lists.salesTaxCodes.filter((c) => c.taxable).map((c) => c.name)}
              />
              <Select
                value={draft.nonTaxableCode}
                onChange={(v) => set({ nonTaxableCode: v })}
                options={lists.salesTaxCodes.filter((c) => !c.taxable).map((c) => c.name)}
              />
            </div>
          </label>
        </div>

        <h4>Income account for each department</h4>
        <table className="table qb-table">
          <thead>
            <tr>
              <th>Diamond POS department</th>
              <th>QuickBooks item (created for you)</th>
              <th>Income account</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <b>Default</b> <span className="muted small">(any department not set below, and tax rounding)</span>
              </td>
              <td className="muted">POS General</td>
              <td>
                <Select
                  value={draft.defaultIncomeAccount}
                  onChange={(v) => set({ defaultIncomeAccount: v })}
                  options={income.map((a) => a.name)}
                />
              </td>
            </tr>
            {st.departments
              .filter((d) => d)
              .map((d) => (
                <tr key={d}>
                  <td>{d}</td>
                  <td className="muted">{`POS ${d}`.slice(0, 31)}</td>
                  <td>
                    <Select
                      value={draft.departmentAccounts[d] ?? ''}
                      placeholder="— use default —"
                      onChange={(v) => set({ departmentAccounts: { ...draft.departmentAccounts, [d]: v } })}
                      options={income.map((a) => a.name)}
                    />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        <h4>Payments</h4>
        <table className="table qb-table">
          <thead>
            <tr>
              <th>Paid by</th>
              <th>Deposit to</th>
              <th>QuickBooks payment method</th>
            </tr>
          </thead>
          <tbody>
            {(['cash', 'card', 'check'] as const).map((m) => (
              <tr key={m}>
                <td>
                  <b>{m === 'cash' ? 'Cash' : m === 'check' ? 'Check' : 'Card (terminal)'}</b>
                </td>
                <td>
                  <Select
                    value={draft.methods[m].depositAccount}
                    onChange={(v) => setMethod(m, 'depositAccount', v)}
                    options={depositAccounts.map((a) => a.name)}
                  />
                </td>
                <td>
                  <Select
                    value={draft.methods[m].paymentMethod}
                    placeholder="— none —"
                    onChange={(v) => setMethod(m, 'paymentMethod', v)}
                    options={lists.paymentMethods}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row gap">
          <button className="primary" disabled={!dirty} onClick={() => run(() => api.qbSaveConfig(draft), 'Mapping saved')}>
            Save mapping
          </button>
          {dirty && (
            <button className="link" onClick={() => setDraft(st.config)}>
              Undo changes
            </button>
          )}
        </div>
      </div>

      {/* ---------- Preview ---------- */}
      <div className="card form">
        <div className="row between">
          <h3>3. Preview a day</h3>
          <div className="row gap">
            <input type="date" value={previewDate} max={today()} onChange={(e) => setPreviewDate(e.target.value)} />
            <button onClick={() => run(async () => setPreview((await api.qbPreview(previewDate)).summaries), '')}>Preview</button>
          </div>
        </div>
        {preview && preview.length === 0 && <p className="muted">No sales on that day.</p>}
        {preview?.map((s) => (
          <div key={s.refNumber} className="qb-preview">
            <div className="row between">
              <b>
                Sales Receipt {s.refNumber} · {PAYMENT_LABEL[s.method]} · {s.saleCount} sale(s)
                {s.taxExemptCount ? ` (${s.taxExemptCount} tax exempt)` : ''}
              </b>
              <b>{money(s.totalCents)}</b>
            </div>
            <table className="table qb-table">
              <tbody>
                {s.lines.map((l, i) => (
                  <tr key={i}>
                    <td>{l.itemName}</td>
                    <td className="muted">{l.taxable ? 'Taxable' : 'Non-taxable'}</td>
                    <td className="muted">{l.account || '(no account chosen)'}</td>
                    <td className="r">{money(l.amountCents)}</td>
                  </tr>
                ))}
                <tr>
                  <td>Sales tax (QuickBooks adds this)</td>
                  <td />
                  <td className="muted">{draft.salesTaxItem || '(no tax item chosen)'}</td>
                  <td className="r">{money(s.taxCents - s.roundingCents)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* ---------- History ---------- */}
      <div className="card form">
        <h3>4. Sent to QuickBooks</h3>
        {exports.length === 0 ? (
          <p className="muted small">Nothing sent yet.</p>
        ) : (
          <table className="table qb-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Paid by</th>
                <th>Sales Receipt No.</th>
                <th className="r">Total</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {exports.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.saleDate + 'T00:00:00').toLocaleDateString()}</td>
                  <td>{PAYMENT_LABEL[e.method]}</td>
                  <td>{e.refNumber}</td>
                  <td className="r">{money(e.totalCents)}</td>
                  <td>
                    <span className={`badge ${e.status === 'sent' ? 'new' : e.status === 'error' || e.status === 'manual' ? 'err' : 'upd'}`}>
                      {e.status === 'sent' ? 'Sent' : e.status === 'error' ? 'Problem' : e.status === 'manual' ? 'Enter by hand' : 'Waiting'}
                    </span>
                    {e.error && <div className="small err-text">{e.error}</div>}
                  </td>
                  <td className="r">
                    {e.status === 'error' && (
                      <button onClick={() => run(() => api.qbRetry(e.id), 'Will retry on the next sync')}>Retry</button>
                    )}
                    {e.status === 'manual' && (
                      <button
                        onClick={() =>
                          confirm(`Have you entered this ${money(e.totalCents)} refund day in QuickBooks yourself?`) &&
                          run(() => api.qbManualDone(e.id), 'Marked as entered by hand')
                        }
                      >
                        Entered by hand
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <details>
          <summary>Sync log</summary>
          <div className="qb-log">
            {log.map((l, i) => (
              <div key={i} className={`qb-log-${l.level}`}>
                <span className="muted">{dateTime(l.at)}</span> {l.message}
              </div>
            ))}
          </div>
        </details>
      </div>
    </div>
  )
}
