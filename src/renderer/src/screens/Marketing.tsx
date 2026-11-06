import { useEffect, useState } from 'react'
import { SMTP_PRESETS, type AudienceOptions, type Campaign, type SmtpSettings, type SmtpSettingsView } from '../../../shared/marketing'
import type { StoreSettings } from '../../../shared/types'
import { api } from '../api'
import { dateTime } from '../format'
import MailerEditor from './MailerEditor'

/** Marketing: email mailers (flyers) to groups of customers, and the email account settings. */
export default function Marketing() {
  const [tab, setTab] = useState<'mailers' | 'email'>('mailers')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [options, setOptions] = useState<AudienceOptions | null>(null)
  const [store, setStore] = useState<StoreSettings | null>(null)
  const [smtp, setSmtp] = useState<SmtpSettingsView | null>(null)
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [error, setError] = useState('')

  const load = () =>
    Promise.all([api.mkCampaigns(), api.mkOptions(), api.getSettings(), api.mkSmtp()])
      .then(([c, o, s, m]) => {
        setCampaigns(c)
        setOptions(o)
        setStore(s)
        setSmtp(m)
      })
      .catch((e) => setError(e.message))
  useEffect(() => {
    load()
  }, [])

  if (!options || !store || !smtp) return <div className="page">{error || 'Loading…'}</div>

  if (editing !== null)
    return (
      <MailerEditor
        campaignId={editing === 'new' ? null : editing}
        options={options}
        store={store}
        replyTo={smtp.replyTo || smtp.fromEmail}
        onClose={() => {
          setEditing(null)
          load()
        }}
        onChanged={load}
      />
    )

  const setupProblems = [
    !smtp.host || !smtp.fromEmail ? 'Set up the email account (Email settings tab)' : '',
    !store.storeAddress.trim() ? 'Add the store postal address in Settings (required in marketing emails)' : ''
  ].filter(Boolean)

  return (
    <div className="page wide">
      <div className="row between">
        <h2>Marketing</h2>
        <div className="row gap">
          <button className={tab === 'mailers' ? 'primary' : ''} onClick={() => setTab('mailers')}>
            Mailers
          </button>
          <button className={tab === 'email' ? 'primary' : ''} onClick={() => setTab('email')}>
            Email settings
          </button>
        </div>
      </div>
      {error && <div className="error-text">{error}</div>}
      {setupProblems.length > 0 && (
        <div className="card qb-status warn">
          <b>Before you can send:</b>
          <ul className="qb-missing">
            {setupProblems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'mailers' ? (
        <>
          <div className="row between">
            <p className="muted small">
              Email a flyer (made in Canva) to customers who bought certain things, e.g. everyone who bought a chainsaw in the
              last year.
            </p>
            <button className="primary" onClick={() => setEditing('new')}>
              + New mailer
            </button>
          </div>
          {campaigns.length === 0 ? (
            <p className="muted">No mailers yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Mailer</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th className="r">Sent</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => setEditing(c.id)}>
                    <td>
                      <b>{c.name}</b> {c.flyer && <span className="pill">flyer</span>}
                    </td>
                    <td>{c.subject}</td>
                    <td>
                      <span className={`badge ${c.status === 'sent' ? 'new' : c.status === 'sending' ? 'upd' : c.status === 'draft' ? '' : 'err'}`}>
                        {c.status === 'draft' ? 'Draft' : c.status === 'sending' ? 'Sending…' : c.status === 'sent' ? 'Sent' : 'Stopped'}
                      </span>
                      {c.lastError && <div className="small err-text">{c.lastError}</div>}
                    </td>
                    <td className="r">
                      {c.total ? `${c.sent} / ${c.total}` : ''}
                      {c.failed ? <span className="err-text"> ({c.failed} failed)</span> : null}
                    </td>
                    <td>{dateTime(c.sentAt ?? c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : (
        <EmailSettings smtp={smtp} onSaved={setSmtp} />
      )}
    </div>
  )
}

export function EmailSettings({ smtp, onSaved }: { smtp: SmtpSettingsView; onSaved: (s: SmtpSettingsView) => void }) {
  const [f, setF] = useState<Omit<SmtpSettings, 'password'>>(smtp)
  const [password, setPassword] = useState('')
  const [testTo, setTestTo] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const preset = SMTP_PRESETS.find((p) => p.host === f.host) ?? SMTP_PRESETS[SMTP_PRESETS.length - 1]

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true)
    setMsg('')
    setError('')
    try {
      await fn()
      setMsg(ok)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const save = async () => {
    const s = await api.mkSaveSmtp({ ...f, password })
    setPassword('')
    onSaved(s)
  }

  return (
    <div className="card form email-settings">
      <h3>Email account used to send mailers</h3>
      <label>
        Email provider
        <select
          value={preset.label}
          onChange={(e) => {
            const p = SMTP_PRESETS.find((x) => x.label === e.target.value)!
            setF({ ...f, host: p.host, port: p.port, security: p.security })
          }}
        >
          {SMTP_PRESETS.map((p) => (
            <option key={p.label}>{p.label}</option>
          ))}
        </select>
      </label>
      <p className="small muted">{preset.note}</p>
      <div className="smtp-grid">
        <label>
          SMTP server
          <input value={f.host} placeholder="smtp.example.com" onChange={(e) => setF({ ...f, host: e.target.value })} />
        </label>
        <label>
          Port
          <input value={f.port} onChange={(e) => setF({ ...f, port: Number(e.target.value) || 0 })} />
        </label>
        <label>
          Security
          <select value={f.security} onChange={(e) => setF({ ...f, security: e.target.value as SmtpSettings['security'] })}>
            <option value="starttls">STARTTLS (usually port 587)</option>
            <option value="ssl">SSL/TLS (usually port 465)</option>
            <option value="none">None (internal relay only)</option>
          </select>
        </label>
        <label>
          User name (usually the email address)
          <input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
        </label>
        <label>
          Password / app password
          <input
            type="password"
            value={password}
            placeholder={smtp.hasPassword ? '(saved, leave blank to keep)' : ''}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          Emails per minute
          <input value={f.perMinute} onChange={(e) => setF({ ...f, perMinute: Number(e.target.value) || 0 })} />
        </label>
        <label>
          From name
          <input value={f.fromName} placeholder="e.g. Diamond Farm Supply" onChange={(e) => setF({ ...f, fromName: e.target.value })} />
        </label>
        <label>
          From email
          <input value={f.fromEmail} onChange={(e) => setF({ ...f, fromEmail: e.target.value })} />
        </label>
        <label>
          Replies / unsubscribe requests go to (optional)
          <input value={f.replyTo} placeholder={f.fromEmail} onChange={(e) => setF({ ...f, replyTo: e.target.value })} />
        </label>
      </div>
      <div className="row gap">
        <button className="primary" disabled={busy} onClick={() => run(save, 'Email settings saved')}>
          Save
        </button>
        <input style={{ flex: 1, width: 'auto', maxWidth: 320 }} placeholder="Send a test email to…" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
        <button
          disabled={busy || !testTo}
          onClick={() =>
            run(async () => {
              await save()
              await api.mkSmtpTest(testTo)
            }, `Test email sent to ${testTo}`)
          }
        >
          {busy ? 'Working…' : 'Save & send test'}
        </button>
      </div>
      {msg && <div className="ok-text">{msg}</div>}
      {error && <div className="error-text">{error}</div>}
      <p className="small muted">
        When someone replies "UNSUBSCRIBE", open their customer record and untick <b>OK to e-mail</b>. They won't get future
        mailers.
      </p>
    </div>
  )
}
