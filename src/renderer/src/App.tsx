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
import Feedback from './screens/Feedback'
import Logo from './Logo'
import HeldReceipts from './screens/HeldReceipts'
import Receiving from './screens/Receiving'
import { Icons } from './icons'
import { menuEntries, type Intent, type MenuEntry } from './menus'

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
  | 'feedback'
  | 'held'
  | 'receiving'
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
  help: 'Help',
  feedback: 'Feedback & Requests',
  held: 'Held Receipts',
  receiving: 'Receiving'
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
  help: 'getting-started',
  feedback: 'feedback-and-requests',
  held: 'held-receipts',
  receiving: 'receiving'
}

export default function App() {
  const [boot, setBoot] = useState<BootInfo | null>(null)
  const [tab, setTab] = useState<Tab>('home')
  /** A work order sent from its ticket to the Sale screen to be paid */
  const [saleWo, setSaleWo] = useState<{ id: number; mode: WoSaleMode } | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [online, setOnline] = useState(true)
  const [helpTopic, setHelpTopic] = useState<string | null>(null)
  /** A held receipt to open on the Sale screen */
  const [saleHeld, setSaleHeld] = useState<number | null>(null)
  /** Something to do when a screen opens from the "I want to…" menu (e.g. start a return) */
  const [intent, setIntent] = useState<Intent>(null)
  /** Open a menu entry: its screen, plus what to do there */
  function go(e: MenuEntry) {
    if (e.screen === 'help') return openHelp()
    if (e.screen === 'feedback') return openFeedback()
    setIntent(e.intent ?? null)
    setTab(e.screen)
  }
  /** Screen the user was on when they opened Feedback (included in the email) */
  const [feedbackFrom, setFeedbackFrom] = useState<string | null>(null)
  const openFeedback = () => {
    if (tab === 'feedback') return
    setFeedbackFrom(tab === 'home' || tab === 'help' ? null : TITLES[tab])
    setTab('feedback')
  }
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
          <Logo size={30} /> Diamond POS
        </div>
        <div className="header-nav">
          <IWantTo entries={menuEntries(boot.config.menus?.top, 'top')} onGo={go} />
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
          <button className="help-btn" onClick={openFeedback} title="Send an idea, request or problem">
            💬 Feedback
          </button>
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
        {tab === 'home' && (
          <Home buttons={menuEntries(boot.config.menus?.home, 'home')} onGo={go} onNavigate={(t) => (t === 'feedback' ? openFeedback() : setTab(t))} />
        )}
        {tab === 'sell' && <Sell
            boot={boot}
            workOrder={saleWo}
            onWorkOrderDone={() => setSaleWo(null)}
            onBootChange={setBoot}
            heldToLoad={saleHeld}
            onHeldLoaded={() => setSaleHeld(null)}
            startReturn={intent === 'return'}
            onIntentDone={() => setIntent(null)}
          />}
        {tab === 'products' && <Products startTags={intent === 'tags'} onIntentDone={() => setIntent(null)} />}
        {tab === 'customers' && <Customers />}
        {tab === 'quickbooks' && <QuickBooks boot={boot} onBootChange={setBoot} />}
        {tab === 'marketing' && <Marketing />}
        {tab === 'workorders' && (
          <WorkOrders
            boot={boot}
            startCheckIn={intent === 'checkin'}
            onIntentDone={() => setIntent(null)}
            onPayAtTill={(id, mode) => {
              setSaleWo({ id, mode })
              setTab('sell')
            }}
          />
        )}
        {tab === 'reports' && <Reports />}
        {tab === 'settings' && <Settings boot={boot} onChange={setBoot} />}
        {tab === 'updates' && <Updates boot={boot} onChange={setBoot} health={health} />}
        {tab === 'help' && <Help topic={helpTopic} onFeedback={openFeedback} boot={boot} />}
        {tab === 'feedback' && <Feedback boot={boot} fromScreen={feedbackFrom} />}
        {tab === 'receiving' && <Receiving boot={boot} startNew={intent === 'receive'} onIntentDone={() => setIntent(null)} />}
        {tab === 'held' && (
          <HeldReceipts
            onOpenAtTill={(id) => {
              setSaleHeld(id)
              setTab('sell')
            }}
          />
        )}
      </main>
    </div>
  )
}

/** "I want to…" dropdown in the top bar */
function IWantTo({ entries, onGo }: { entries: MenuEntry[]; onGo: (e: MenuEntry) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div className="iwant" ref={ref}>
      <button className="home-btn" onClick={() => setOpen(!open)} title="Choose what to do">
        <span className="hb-icon">{Icons.home}</span> I want to… <span className="caret">▾</span>
      </button>
      {open && (
        <div className="iwant-menu">
          {entries.map((e) => (
            <button
              key={e.id}
              onClick={() => {
                setOpen(false)
                onGo(e)
              }}
            >
              <span className="iw-icon">{Icons[e.icon]}</span>
              {e.label}
            </button>
          ))}
          {entries.length === 0 && <div className="muted small">No entries. Choose them in Settings → Menus.</div>}
        </div>
      )}
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
