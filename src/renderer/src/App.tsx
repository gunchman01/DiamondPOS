import { useEffect, useRef, useState } from 'react'
import type { BootInfo, Health } from '../../shared/types'
import type { WoSaleMode } from '../../shared/workorders'
import { compareVersions } from '../../shared/version'
import { api, configureApi } from './api'
import Setup from './screens/Setup'
import Home from './screens/Home'
import Sell from './screens/Sell'
import Products from './screens/Products'
import Customers from './screens/Customers'
import QuickBooks from './screens/QuickBooks'
import Marketing from './screens/Marketing'
import WorkOrders from './screens/WorkOrders'
import Reports from './screens/Reports'
import Settings from './screens/Settings'
import Updates from './screens/Updates'
import Help from './screens/Help'
import { Icons } from './icons'

type Tab =
  | 'home'
  | 'sell'
  | 'products'
  | 'customers'
  | 'reports'
  | 'settings'
  | 'updates'
  | 'quickbooks'
  | 'marketing'
  | 'workorders'
  | 'help'
/** Screen names shown in the header (navigation is done from the Home screen) */
const TITLES: Record<Tab, string> = {
  home: 'Home',
  sell: 'Make a Sale',
  products: 'Item List',
  customers: 'Customer List',
  quickbooks: 'QuickBooks',
  marketing: 'Marketing',
  workorders: 'Work Orders',
  reports: 'Reports',
  settings: 'Settings',
  updates: 'Updates',
  help: 'Help'
}

/** Help section to open for each screen (ids are the manual's "## " headings, slugified) */
const HELP_TOPIC: Record<Tab, string> = {
  home: 'the-home-screen',
  sell: 'making-a-sale',
  products: 'items',
  customers: 'customer-list',
  quickbooks: 'quickbooks',
  marketing: 'marketing-mailers',
  workorders: 'work-orders-repairs',
  reports: 'sales-history-and-reports',
  settings: 'settings',
  updates: 'updates',
  help: 'getting-started'
}

export default function App() {
  const [boot, setBoot] = useState<BootInfo | null>(null)
  const [tab, setTab] = useState<Tab>('home')
  /** A work order sent from its ticket to the Sale screen to be paid */
  const [saleWo, setSaleWo] = useState<{ id: number; mode: WoSaleMode } | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [online, setOnline] = useState(true)
  const [helpTopic, setHelpTopic] = useState<string | null>(null)
  const openHelp = () => {
    if (tab === 'help') return
    setHelpTopic(HELP_TOPIC[tab])
    setTab('help')
  }

  // F1 opens Help on the section for the current screen
  const f1 = useRef(openHelp)
  f1.current = openHelp
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault()
        f1.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
          <button className="help-btn" onClick={openHelp} title="Help (F1)">
            ? Help
          </button>
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

      <main className={tab === 'sell' || tab === 'home' || tab === 'help' ? 'content flush' : 'content'}>
        {tab === 'home' && <Home onNavigate={setTab} />}
        {tab === 'sell' && <Sell boot={boot} workOrder={saleWo} onWorkOrderDone={() => setSaleWo(null)} />}
        {tab === 'products' && <Products />}
        {tab === 'customers' && <Customers />}
        {tab === 'quickbooks' && <QuickBooks boot={boot} onBootChange={setBoot} />}
        {tab === 'marketing' && <Marketing />}
        {tab === 'workorders' && (
          <WorkOrders
            boot={boot}
            onPayAtTill={(id, mode) => {
              setSaleWo({ id, mode })
              setTab('sell')
            }}
          />
        )}
        {tab === 'reports' && <Reports />}
        {tab === 'settings' && <Settings boot={boot} onChange={setBoot} />}
        {tab === 'updates' && <Updates boot={boot} onChange={setBoot} health={health} />}
        {tab === 'help' && <Help topic={helpTopic} />}
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
