import { useEffect, useState } from 'react'
import type { BootInfo, StoreSettings } from '../../../shared/types'
import { SERVER_PORT } from '../../../shared/constants'
import type { SmtpSettingsView } from '../../../shared/marketing'
import { api } from '../api'
import { Icons, type IconName } from '../icons'
import KioskSettings from './KioskSettings'
import PrintSettings from './PrintSettings'
import TaxSettings from './TaxSettings'
import MenuSettings from './MenuSettings'
import LabelDesigner from './LabelDesigner'
import ReceiptDesigner from './ReceiptDesigner'
import { EmailSettings } from './Marketing'

type Section = 'store' | 'taxes' | 'menus' | 'computer' | 'kiosk' | 'email' | 'printing' | 'labels' | 'receipt'

/** The Settings menu: one tile per area. Add a tile here (and a section below) for each new kind of setting. */
const TILES: { id: Section; icon: IconName; label: string; text: string }[] = [
  { id: 'store', icon: 'store', label: 'Store', text: 'Name, address, receipt footer, feedback email' },
  { id: 'taxes', icon: 'tax', label: 'Taxes', text: 'Sales tax rates (add several, pick one on a sale)' },
  { id: 'menus', icon: 'home', label: 'Menus', text: '"I want to…" menu and Home screen buttons for this computer' },
  { id: 'computer', icon: 'computer', label: 'This Computer', text: 'Till name, server connection, pairing code' },
  { id: 'printing', icon: 'printer', label: 'Printing', text: 'Receipt, full-page and Zebra label printers' },
  { id: 'labels', icon: 'itemList', label: 'Label Designer', text: 'Build price tags and part labels: drag fields where you want them' },
  { id: 'receipt', icon: 'salesHistory', label: 'Receipt Layout', text: 'Choose what prints on receipts, in what order and size' },
  { id: 'email', icon: 'email', label: 'Email', text: 'Account for mailers, work order and feedback emails' },
  { id: 'kiosk', icon: 'tablet', label: 'Customer Kiosk', text: 'iPad sign-up screen and store logo' }
]

export default function Settings({ boot, onChange }: { boot: BootInfo; onChange: (b: BootInfo) => void }) {
  const { config } = boot
  const [store, setStore] = useState<StoreSettings | null>(null)
  const [tillName, setTillName] = useState(config.tillName)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [section, setSection] = useState<Section | null>(null)
  const [smtp, setSmtp] = useState<SmtpSettingsView | null>(null)

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setStore(s)
      })
      .catch((e) => setError(e.message))
  }, [])
  useEffect(() => {
    setMsg('')
    setError('')
    if (section === 'email' && !smtp) api.mkSmtp().then(setSmtp).catch((e) => setError(e.message))
  }, [section])

  async function saveStore() {
    if (!store) return
    setError('')
    try {
      // Tax rates are saved on the Taxes page
      const { taxRates: _r, defaultTaxRateId: _d, taxRate: _t, ...rest } = store
      void _r
      void _d
      void _t
      const saved = await api.saveSettings(rest)
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

  const tile = TILES.find((t) => t.id === section)

  if (!section)
    return (
      <div className="page settings">
        <h2>Settings</h2>
        {error && <div className="error-text">{error}</div>}
        <div className="settings-tiles">
          {TILES.map((t) => (
            <button key={t.id} className="settings-tile" onClick={() => setSection(t.id)}>
              <span className="st-icon">{Icons[t.icon]}</span>
              <b>{t.label}</b>
              <span className="muted small">{t.text}</span>
            </button>
          ))}
        </div>
      </div>
    )

  return (
    <div className={section === 'labels' || section === 'receipt' ? 'page wide settings' : 'page settings'}>
      <div>
        <button className="link" onClick={() => setSection(null)}>
          ← Settings
        </button>
      </div>
      <h2>
        <span className="st-head-icon">{tile && Icons[tile.icon]}</span> {tile?.label}
      </h2>
      {msg && <div className="ok-text">{msg}</div>}
      {error && <div className="error-text">{error}</div>}

      {section === 'computer' && (
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
      )}

      {section === 'store' &&
        (store ? (

        <div className="card form">
          <h3>Store (shared by all tills)</h3>
          <label>
            Store name
            <input value={store.storeName} onChange={(e) => setStore({ ...store, storeName: e.target.value })} />
          </label>
          <label>
            Store address (printed on full-page receipts, work orders and marketing emails)
            <textarea
              className="comments"
              rows={2}
              value={store.storeAddress}
              placeholder="123 Main St, Fresno, CA 93650"
              onChange={(e) => setStore({ ...store, storeAddress: e.target.value })}
            />
          </label>
          <label>
            Email feedback &amp; requests to
            <input
              type="email"
              value={store.feedbackEmail ?? ''}
              onChange={(e) => setStore({ ...store, feedbackEmail: e.target.value })}
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
        ) : (
          <p className="muted">Loading…</p>
        ))}

      {section === 'menus' && <MenuSettings boot={boot} onChange={onChange} />}
      {section === 'taxes' && store && <TaxSettings store={store} onSaved={setStore} />}
      {section === 'kiosk' && store && <KioskSettings boot={boot} store={store} onStoreChange={setStore} />}
      {section === 'email' && (smtp ? <EmailSettings smtp={smtp} onSaved={setSmtp} /> : <p className="muted">Loading…</p>)}
      {section === 'printing' && <PrintSettings boot={boot} onChange={onChange} />}
      {section === 'labels' && <LabelDesigner />}
      {section === 'receipt' && <ReceiptDesigner />}
    </div>
  )
}
