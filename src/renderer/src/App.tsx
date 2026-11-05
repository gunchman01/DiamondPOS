import { useEffect, useState } from 'react'
import type { BootInfo, Health } from '../../shared/types'
import { compareVersions } from '../../shared/version'
import { api, configureApi } from './api'
import Setup from './screens/Setup'
import Sell from './screens/Sell'
import Products from './screens/Products'
import Reports from './screens/Reports'
import Settings from './screens/Settings'
import Updates from './screens/Updates'

type Tab = 'sell' | 'products' | 'reports' | 'settings' | 'updates'
const TABS: { id: Tab; label: string }[] = [
  { id: 'sell', label: 'Sell' },
  { id: 'products', label: 'Products' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'Settings' },
  { id: 'updates', label: 'Updates' }
]

export default function App() {
  const [boot, setBoot] = useState<BootInfo | null>(null)
  const [tab, setTab] = useState<Tab>('sell')
  const [health, setHealth] = useState<Health | null>(null)
  const [online, setOnline] = useState(true)

  useEffect(() => {
    window.pos.getBootInfo().then(setBoot)
  }, [])

  // Point the API client at this computer's store server whenever config changes
  useEffect(() => {
    if (boot?.config.mode) configureApi(boot.config.serverUrl, boot.config.apiKey)
  }, [boot])

  // Check the server connection every 10 seconds
  useEffect(() => {
    if (!boot?.config.mode) return
    const check = () =>
      api
        .health()
        .then((h) => {
          setHealth(h)
          setOnline(true)
        })
        .catch(() => setOnline(false))
    check()
    const t = setInterval(check, 10_000)
    return () => clearInterval(t)
  }, [boot])

  if (!boot) return <div className="center muted">Loading…</div>
  if (!boot.config.mode) return <Setup boot={boot} onDone={setBoot} />

  const tooOld = health && compareVersions(boot.appVersion, health.minClientVersion) < 0

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">DiamondPOS</div>
        <nav>
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="status">
          <span className={online ? 'dot ok' : 'dot bad'} />
          {online ? 'Connected' : 'Server offline'} · {boot.config.tillName} · v{boot.appVersion}
        </div>
      </header>

      {tooOld && (
        <div className="banner warn">
          This till (v{boot.appVersion}) is older than the server requires (v{health!.minClientVersion}). Please update
          from the Updates tab.
        </div>
      )}
      {!online && (
        <div className="banner error">
          Cannot reach the store server. Sales cannot be saved until the connection is restored.
        </div>
      )}

      <main className="content">
        {tab === 'sell' && <Sell boot={boot} />}
        {tab === 'products' && <Products />}
        {tab === 'reports' && <Reports />}
        {tab === 'settings' && <Settings boot={boot} onChange={setBoot} />}
        {tab === 'updates' && <Updates boot={boot} onChange={setBoot} health={health} />}
      </main>
    </div>
  )
}
