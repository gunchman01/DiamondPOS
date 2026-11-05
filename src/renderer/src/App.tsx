import { useEffect, useState } from 'react'
import type { BootInfo, Health } from '../../shared/types'
import { compareVersions } from '../../shared/version'
import { api, configureApi } from './api'
import Setup from './screens/Setup'
import Home from './screens/Home'
import Sell from './screens/Sell'
import Products from './screens/Products'
import Customers from './screens/Customers'
import QuickBooks from './screens/QuickBooks'
import Marketing from './screens/Marketing'
import Reports from './screens/Reports'
import Settings from './screens/Settings'
import Updates from './screens/Updates'
import { Icons } from './icons'

type Tab = 'home' | 'sell' | 'products' | 'customers' | 'reports' | 'settings' | 'updates' | 'quickbooks' | 'marketing'
/** Screen names shown in the header (navigation is done from the Home screen) */
const TITLES: Record<Tab, string> = {
  home: 'Home',
  sell: 'Make a Sale',
  products: 'Item List',
  customers: 'Customer List',
  quickbooks: 'QuickBooks',
  marketing: 'Marketing',
  reports: 'Reports',
  settings: 'Settings',
  updates: 'Updates'
}

export default function App() {
  const [boot, setBoot] = useState<BootInfo | null>(null)
  const [tab, setTab] = useState<Tab>('home')
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
        <div className="brand">
          <span className="brand-mark">◆</span> DiamondPOS
        </div>
        <div className="header-nav">
          {tab !== 'home' && (
            <button className="home-btn" onClick={() => setTab('home')} title="Back to Home">
              <span className="hb-icon">{Icons.home}</span> Home
            </button>
          )}
          <span className="screen-title">{TITLES[tab]}</span>
        </div>
        <div className="status">
          <span>
            <span className={online ? 'dot ok' : 'dot bad'} /> {online ? 'Connected' : 'Server offline'}
          </span>
          <span>
            Till: <b>{boot.config.tillName}</b>
          </span>
          <Clock />
          <span>v{boot.appVersion}</span>
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

      <main className={tab === 'sell' || tab === 'home' ? 'content flush' : 'content'}>
        {tab === 'home' && <Home onNavigate={setTab} />}
        {tab === 'sell' && <Sell boot={boot} />}
        {tab === 'products' && <Products />}
        {tab === 'customers' && <Customers />}
        {tab === 'quickbooks' && <QuickBooks boot={boot} onBootChange={setBoot} />}
        {tab === 'marketing' && <Marketing />}
        {tab === 'reports' && <Reports />}
        {tab === 'settings' && <Settings boot={boot} onChange={setBoot} />}
        {tab === 'updates' && <Updates boot={boot} onChange={setBoot} health={health} />}
      </main>
    </div>
  )
}

function Clock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(t)
  }, [])
  return (
    <span>
      <b>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b>{' '}
      {now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}
    </span>
  )
}
