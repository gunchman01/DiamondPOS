import { confirmAction } from '../dialogs'
import { useEffect, useState } from 'react'
import type { ApprovalConfig } from '../../../shared/approvals'
import { api } from '../api'
import { dateTime } from '../format'
export default function ApprovalSettings() {
  const [config, setConfig] = useState<ApprovalConfig | null>(null),
    [key, setKey] = useState(''),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('')
  useEffect(() => {
    api
      .approvalConfig()
      .then(setConfig)
      .catch((e) => setError(e.message))
  }, [])
  async function run(action: 'save' | 'test' | 'sync') {
    if (!config) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      let c = config
      if (action !== 'sync') c = await api.saveApprovalConfig({ ...config, key })
      if (action === 'test') c = await api.testApprovalConnection()
      if (action === 'sync') c = await api.syncApprovals()
      setConfig(c)
      setMessage(
        action === 'test'
          ? 'Website connection verified. You may now enable online approvals and save.'
          : action === 'sync'
            ? 'Customer decisions checked.'
            : 'Approval and follow-up settings saved.'
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="card form">
      <h3>Estimate approvals &amp; customer follow-up</h3>
      {error && <p className="error-text">{error}</p>}
      {message && <p className="ok-text">{message}</p>}
      {config && (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={config.followUpEnabled}
              onChange={(e) => setConfig({ ...config, followUpEnabled: e.target.checked })}
            />
            Flag unanswered estimates for a customer call
          </label>
          <label>
            Flag after this many calendar days
            <input
              type="number"
              min="1"
              max="90"
              value={config.afterDays}
              onChange={(e) => setConfig({ ...config, afterDays: Number(e.target.value) })}
            />
          </label>
          <p className="muted small">
            The timer starts after the estimate email is successfully sent. Record a call on the ticket to set the next reminder.
            Approval/decline clears the flag. Revised estimates need a new decision. Waiting on Customer does not remove parts from
            inventory.
          </p>
          <label>
            Approval website folder (HTTPS)
            <input value={config.url} onChange={(e) => setConfig({ ...config, url: e.target.value })} />
          </label>
          <label>
            New integration key (blank keeps saved key)
            <input
              type={show ? 'text' : 'password'}
              value={key}
              autoComplete="off"
              onChange={(e) => setKey(e.target.value)}
              placeholder={config.hasKey ? 'A key is saved' : 'Generate a key'}
            />
          </label>
          <div className="row gap">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (key && !(await confirmAction('Replace the unsaved key shown here?'))) return
                const bytes = crypto.getRandomValues(new Uint8Array(32))
                setKey([...bytes].map((b) => b.toString(16).padStart(2, '0')).join(''))
                setShow(true)
              }}
            >
              Generate key
            </button>
            <button type="button" onClick={() => setShow(!show)}>
              {show ? 'Hide' : 'Show'} new key
            </button>
          </div>
          <p className="muted small">
            Copy the generated key into the PRIVATE cPanel configuration and save it here. No key is returned from the server after saving.
            Save and Test connection before enabling approvals. Keep staging connected to test work orders only.
          </p>
          <label className="check">
            <input
              type="checkbox"
              disabled={!config.serviceId || !config.hasKey}
              checked={config.enabled}
              onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
            />
            Enable online estimate approvals
          </label>
          <div className="row gap">
            <button disabled={busy} onClick={() => void run('save')}>
              Save approval settings
            </button>
            <button disabled={busy} onClick={() => void run('test')}>
              Save &amp; test connection
            </button>
            <button disabled={busy || !config.enabled} onClick={() => void run('sync')}>
              Check customer responses now
            </button>
          </div>
          <p className="muted small">
            The Store Server checks every minute while running. Customers can respond while it is closed; decisions are retrieved after it
            reconnects. Last successful check: {config.lastSyncAt ? dateTime(config.lastSyncAt) : 'Not yet'}
          </p>
          {config.error && <p className="error-text">Last connection problem: {config.error}</p>}
        </>
      )}
    </section>
  )
}
