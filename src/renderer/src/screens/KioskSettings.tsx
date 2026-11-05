import { useEffect, useRef, useState } from 'react'
import type { BootInfo, KioskInfo, StoreSettings } from '../../../shared/types'
import { SERVER_PORT } from '../../../shared/constants'
import { api, serverBaseUrl } from '../api'

/** Shrink an uploaded logo so it loads instantly on the iPad (keeps PNG transparency). */
async function resizeLogo(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('That file is not an image Windows can read'))
      i.src = url
    })
    const scale = Math.min(1, 1000 / img.width, 600 / img.height)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return file.type === 'image/jpeg' ? canvas.toDataURL('image/jpeg', 0.9) : canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Settings → Customer Kiosk: logo, welcome message, pairing and linked tills. */
export default function KioskSettings(props: {
  boot: BootInfo
  store: StoreSettings
  onStoreChange: (s: StoreSettings) => void
}) {
  const { boot, store } = props
  const [kiosks, setKiosks] = useState<KioskInfo[]>([])
  const [welcome, setWelcome] = useState(store.kioskWelcome)
  const [code, setCode] = useState('')
  const [name, setName] = useState('Counter iPad')
  const [till, setTill] = useState(boot.config.tillName)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [logoVersion, setLogoVersion] = useState(Date.now())
  const fileRef = useRef<HTMLInputElement>(null)

  const load = () => api.listKiosks().then(setKiosks).catch((e) => setError(e.message))
  useEffect(() => {
    load()
    const t = setInterval(load, 5000) // keep the online dots fresh
    return () => clearInterval(t)
  }, [])

  // Address the iPad should open
  const base = serverBaseUrl()
  const host = base.includes('127.0.0.1') || base.includes('localhost') ? boot.lanAddresses : [new URL(base).hostname]
  const kioskUrls = host.map((h) => `http://${h}:${SERVER_PORT}/kiosk`)

  async function run(fn: () => Promise<unknown>, ok: string) {
    setError('')
    setMsg('')
    try {
      await fn()
      setMsg(ok)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="card form kiosk-card">
      <h3>Customer Kiosk (iPad)</h3>
      <p className="muted small">
        An iPad facing the customer shows your logo. When a new customer needs adding, press <kbd>F9</kbd> on the Sale
        screen (or <b>Send to kiosk</b> in the customer search) and they type in their own details.
      </p>

      <div className="kiosk-grid">
        {/* ---------- Branding ---------- */}
        <div className="form">
          <h4>What the iPad shows</h4>
          <div className="logo-box">
            {store.hasLogo ? (
              <img src={`${base}/kiosk/logo?v=${logoVersion}`} alt="Store logo" />
            ) : (
              <span className="muted">No logo yet. The store name is shown instead.</span>
            )}
          </div>
          <div className="row gap">
            <button onClick={() => fileRef.current?.click()}>{store.hasLogo ? 'Change logo…' : 'Upload logo…'}</button>
            {store.hasLogo && (
              <button
                className="danger"
                onClick={() =>
                  run(async () => props.onStoreChange(await api.setLogo(null)), 'Logo removed')
                }
              >
                Remove
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f)
                  run(async () => {
                    props.onStoreChange(await api.setLogo(await resizeLogo(f)))
                    setLogoVersion(Date.now())
                  }, 'Logo saved. The iPad updates straight away.')
              }}
            />
          </div>
          <label>
            Welcome message
            <input value={welcome} maxLength={200} onChange={(e) => setWelcome(e.target.value)} />
          </label>
          <div>
            <button
              onClick={() =>
                run(async () => props.onStoreChange(await api.saveSettings({ kioskWelcome: welcome })), 'Welcome message saved')
              }
            >
              Save message
            </button>
          </div>
        </div>

        {/* ---------- Pairing ---------- */}
        <div className="form">
          <h4>Set up an iPad</h4>
          <ol className="steps small">
            <li>
              Connect the iPad to the store Wi-Fi and open Safari at:
              {kioskUrls.map((u) => (
                <div key={u} className="kiosk-url">
                  {u}
                </div>
              ))}
            </li>
            <li>Tap Share → <b>Add to Home Screen</b>, then open it from the home screen (full screen).</li>
            <li>Type the 6-digit code it shows here and click <b>Pair</b>.</li>
            <li>
              Lock the iPad to the page with <b>Guided Access</b> (Settings → Accessibility → Guided Access, then
              triple-click the side/home button).
            </li>
          </ol>
          <div className="pair-row">
            <label>
              Code on the iPad
              <input
                className="pair-code"
                inputMode="numeric"
                placeholder="123 456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            <label>
              Kiosk name
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Belongs to till
              <input value={till} onChange={(e) => setTill(e.target.value)} />
            </label>
            <button
              className="primary"
              disabled={code.replace(/\D/g, '').length !== 6}
              onClick={() =>
                run(async () => {
                  await api.pairKiosk(code, name, till)
                  setCode('')
                  await load()
                }, 'Kiosk paired. The iPad now shows your logo.')
              }
            >
              Pair
            </button>
          </div>
        </div>
      </div>

      {msg && <div className="ok-text">{msg}</div>}
      {error && <div className="error-text">{error}</div>}

      <h4>Paired kiosks</h4>
      {kiosks.length === 0 ? (
        <p className="muted small">None yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Kiosk</th>
              <th>Belongs to till</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {kiosks.map((k) => (
              <tr key={k.id}>
                <td>{k.name}</td>
                <td>
                  <input
                    className="inline-input"
                    defaultValue={k.tillName}
                    onBlur={(e) =>
                      e.target.value.trim() &&
                      e.target.value !== k.tillName &&
                      run(async () => {
                        await api.updateKiosk(k.id, { tillName: e.target.value })
                        await load()
                      }, 'Kiosk updated')
                    }
                  />
                </td>
                <td>
                  <span className={k.online ? 'dot ok' : 'dot bad'} /> {k.online ? 'Online' : 'Offline'}
                </td>
                <td className="r">
                  <button
                    className="danger"
                    onClick={() =>
                      confirm(`Unpair "${k.name}"? The iPad will need a new code to reconnect.`) &&
                      run(async () => {
                        await api.removeKiosk(k.id)
                        await load()
                      }, 'Kiosk unpaired')
                    }
                  >
                    Unpair
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small">
        Each till uses the kiosk linked to its computer name (this one is <b>{boot.config.tillName}</b>). If only one
        kiosk is paired, every till uses it.
      </p>
    </div>
  )
}
