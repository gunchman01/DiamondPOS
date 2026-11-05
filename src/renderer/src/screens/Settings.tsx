import { useEffect, useState } from 'react'
import type { BootInfo, StoreSettings } from '../../../shared/types'
import { SERVER_PORT } from '../../../shared/constants'
import { api } from '../api'
import KioskSettings from './KioskSettings'

export default function Settings({ boot, onChange }: { boot: BootInfo; onChange: (b: BootInfo) => void }) {
  const { config } = boot
  const [store, setStore] = useState<StoreSettings | null>(null)
  const [taxText, setTaxText] = useState('')
  const [tillName, setTillName] = useState(config.tillName)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setStore(s)
        setTaxText(String(Math.round(s.taxRate * 10000) / 100))
      })
      .catch((e) => setError(e.message))
  }, [])

  async function saveStore() {
    if (!store) return
    setError('')
    try {
      const saved = await api.saveSettings({ ...store, taxRate: Number(taxText) / 100 })
      setStore(saved)
      setMsg('Store settings saved')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function saveTill() {
    onChange(await window.pos.saveConfig({ tillName }))
    setMsg('Computer name saved')
  }

  async function resetSetup() {
    if (!confirm('Reset this computer\'s setup? (Store data on the server is NOT deleted.)')) return
    onChange(await window.pos.saveConfig({ mode: null }))
  }

  return (
    <div className="page settings">
      <h2>Settings</h2>
      {msg && <div className="ok-text">{msg}</div>}
      {error && <div className="error-text">{error}</div>}

      <div className="card form">
        <h3>This computer</h3>
        <p>
          Role: <b>{config.mode === 'server' ? 'Store Server (+ till)' : 'Till'}</b>
        </p>
        {config.mode === 'server' ? (
          <div className="pairing">
            <p>To connect a till, enter these on the till's setup screen:</p>
            <p>
              Server IP address: <b>{boot.lanAddresses.join('  or  ') || 'not connected to a network'}</b>
              <span className="muted"> (port {SERVER_PORT})</span>
            </p>
            <p>
              Pairing code: <b className="code">{config.apiKey}</b>
            </p>
            <p className="muted small">
              Tip: give the server PC a fixed (reserved) IP address in your router so tills always find it.
            </p>
          </div>
        ) : (
          <p>
            Connected to: <b>{config.serverUrl}</b>
          </p>
        )}
        <label>
          Computer name (shown on receipts)
          <input value={tillName} onChange={(e) => setTillName(e.target.value)} />
        </label>
        <div className="row gap">
          <button onClick={saveTill}>Save name</button>
          <button className="danger" onClick={resetSetup}>
            Reset setup…
          </button>
        </div>
      </div>

      {store && (
        <div className="card form">
          <h3>Store (shared by all tills)</h3>
          <label>
            Store name
            <input value={store.storeName} onChange={(e) => setStore({ ...store, storeName: e.target.value })} />
          </label>
          <label>
            GST rate (%)
            <input value={taxText} onChange={(e) => setTaxText(e.target.value)} />
          </label>
          <label>
            Store postal address (printed at the bottom of marketing emails)
            <textarea
              className="comments"
              rows={2}
              value={store.storeAddress}
              placeholder="123 Main St, Fresno, CA 93650"
              onChange={(e) => setStore({ ...store, storeAddress: e.target.value })}
            />
          </label>
          <label>
            Receipt footer
            <input value={store.receiptFooter} onChange={(e) => setStore({ ...store, receiptFooter: e.target.value })} />
          </label>
          <button className="primary" onClick={saveStore}>
            Save store settings
          </button>
        </div>
      )}

      {store && <KioskSettings boot={boot} store={store} onStoreChange={setStore} />}
    </div>
  )
}
