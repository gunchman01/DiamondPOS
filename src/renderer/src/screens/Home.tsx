import { useEffect, useState } from 'react'
import type { DailyReport } from '../../../shared/types'
import { api } from '../api'
import { money, today } from '../format'
import { IconName, Icons } from '../icons'

/** Tabs that already exist; tiles for these open the real page. */
export type NavTarget = 'sell' | 'products' | 'reports' | 'settings' | 'updates'

interface Tile {
  icon: IconName
  label: string
  go?: NavTarget // undefined = not built yet ("coming soon")
}

type Cell =
  | ({ kind: 'tile'; col: number; row: number } & Tile)
  | { kind: 'arrow'; col: number; row: number; dir: 'right' | 'down' | 'both' }

interface Section {
  title: string
  cells: Cell[]
}

// Grid positions: tiles on odd columns/rows (1,3,5…), arrows on the even ones in between.
const POS: Section = {
  title: 'Point of Sale',
  cells: [
    { kind: 'tile', col: 1, row: 1, icon: 'customers', label: 'Customer List' },
    { kind: 'arrow', col: 2, row: 1, dir: 'right' },
    { kind: 'tile', col: 3, row: 1, icon: 'workOrders', label: 'Work Orders' },
    { kind: 'arrow', col: 4, row: 1, dir: 'right' },
    { kind: 'tile', col: 5, row: 1, icon: 'makeSale', label: 'Make a Sale', go: 'sell' },
    { kind: 'arrow', col: 6, row: 1, dir: 'right' },
    { kind: 'tile', col: 7, row: 1, icon: 'salesHistory', label: 'Sales History', go: 'reports' },
    { kind: 'arrow', col: 8, row: 1, dir: 'right' },
    { kind: 'tile', col: 9, row: 1, icon: 'endOfDay', label: 'End of Day' },
    { kind: 'arrow', col: 5, row: 2, dir: 'both' },
    { kind: 'tile', col: 5, row: 3, icon: 'heldReceipts', label: 'Held Receipts' }
  ]
}

const PURCHASING: Section = {
  title: 'Purchasing',
  cells: [
    { kind: 'tile', col: 1, row: 1, icon: 'vendorList', label: 'Vendor List' },
    { kind: 'arrow', col: 2, row: 1, dir: 'right' },
    { kind: 'tile', col: 3, row: 1, icon: 'purchaseOrders', label: 'Purchase Orders' },
    { kind: 'arrow', col: 4, row: 1, dir: 'right' },
    { kind: 'tile', col: 5, row: 1, icon: 'receivingHistory', label: 'Receiving History' },
    { kind: 'arrow', col: 3, row: 2, dir: 'down' },
    { kind: 'tile', col: 3, row: 3, icon: 'poList', label: 'PO List' }
  ]
}

const INVENTORY: Section = {
  title: 'Inventory',
  cells: [
    { kind: 'tile', col: 1, row: 1, icon: 'itemList', label: 'Item List', go: 'products' },
    { kind: 'tile', col: 3, row: 1, icon: 'departmentList', label: 'Department List' }
  ]
}

const OPERATIONS: Section = {
  title: 'Operations',
  cells: [
    { kind: 'tile', col: 1, row: 1, icon: 'sync', label: 'Sync w/ QuickBooks' },
    { kind: 'tile', col: 3, row: 1, icon: 'reports', label: 'Reports', go: 'reports' },
    { kind: 'tile', col: 5, row: 1, icon: 'settings', label: 'Settings', go: 'settings' },
    { kind: 'tile', col: 7, row: 1, icon: 'updates', label: 'Updates', go: 'updates' }
  ]
}

const QUICK_BUTTONS: Tile[] = [
  { icon: 'makeSale', label: 'Make a Sale', go: 'sell' },
  { icon: 'workOrders', label: 'Work Orders' },
  { icon: 'itemList', label: 'Item List', go: 'products' },
  { icon: 'customers', label: 'Customer List' },
  { icon: 'salesHistory', label: 'Sales History', go: 'reports' },
  { icon: 'endOfDay', label: 'End of Day' }
]

/** Home screen: quick-launch buttons + today's totals on the left, the Navigator filling the rest. */
export default function Home({ onNavigate }: { onNavigate: (t: NavTarget) => void }) {
  const [report, setReport] = useState<DailyReport | null>(null)
  const [toast, setToast] = useState('')

  useEffect(() => {
    api.dailyReport(today()).then(setReport).catch(() => setReport(null))
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2500)
    return () => clearTimeout(t)
  }, [toast])

  const open = (t: Tile) => (t.go ? onNavigate(t.go) : setToast(`${t.label} is coming soon`))

  return (
    <div className="home">
      {/* ---------- Left: quick-launch buttons + today ---------- */}
      <aside className="home-left">
        {QUICK_BUTTONS.map((b) => (
          <button key={b.label} className="home-quick-btn" onClick={() => open(b)}>
            <span className="hq-icon">{Icons[b.icon]}</span>
            {b.label}
          </button>
        ))}

        <div className="side-card">
          <div className="side-title">Today</div>
          <div className="side-row">
            <span>Sales</span>
            <b>{report ? report.saleCount : '—'}</b>
          </div>
          <div className="side-row">
            <span>Takings</span>
            <b>{report ? money(report.totalCents) : '—'}</b>
          </div>
          <div className="side-row muted">
            <span>Cash</span>
            <span>{report ? money(report.cashCents) : '—'}</span>
          </div>
          <div className="side-row muted">
            <span>Card</span>
            <span>{report ? money(report.cardCents) : '—'}</span>
          </div>
        </div>
      </aside>

      {/* ---------- Navigator ---------- */}
      <section className="navigator">
        <div className="nav-head">Navigator</div>
        <div className="nav-body">
          <NavSection section={POS} onOpen={open} />
          <NavSection section={PURCHASING} onOpen={open} />
          <div className="nav-pair">
            <NavSection section={INVENTORY} onOpen={open} />
            <NavSection section={OPERATIONS} onOpen={open} />
          </div>
        </div>
      </section>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function NavSection({ section, onOpen }: { section: Section; onOpen: (t: Tile) => void }) {
  // Size the grid to exactly what this section uses: tiles on odd tracks, arrows on even tracks
  const maxCol = Math.max(...section.cells.map((c) => c.col))
  const maxRow = Math.max(...section.cells.map((c) => c.row))
  const cols = Array.from({ length: maxCol }, (_, i) => (i % 2 === 0 ? 'var(--tile-w)' : '34px')).join(' ')
  const rows = Array.from({ length: maxRow }, (_, i) => (i % 2 === 0 ? 'auto' : '18px')).join(' ')

  return (
    <div className="nav-section">
      <div className="nav-band">{section.title}</div>
      <div className="nav-flow" style={{ gridTemplateColumns: cols, gridTemplateRows: rows }}>
        {section.cells.map((c, i) =>
          c.kind === 'tile' ? (
            <NavTile key={i} tile={c} onClick={() => onOpen(c)} style={{ gridColumn: c.col, gridRow: c.row }} />
          ) : (
            <div key={i} className={`nav-arrow ${c.dir}`} style={{ gridColumn: c.col, gridRow: c.row }}>
              <Arrow dir={c.dir} />
            </div>
          )
        )}
      </div>
    </div>
  )
}

function NavTile({ tile, onClick, style }: { tile: Tile; onClick: () => void; style?: React.CSSProperties }) {
  return (
    <button className={tile.go ? 'nav-tile' : 'nav-tile soon'} onClick={onClick} style={style} title={tile.label}>
      <span className="nt-icon">{Icons[tile.icon]}</span>
      <span className="nt-label">{tile.label}</span>
    </button>
  )
}

function Arrow({ dir }: { dir: 'right' | 'down' | 'both' }) {
  if (dir === 'right')
    return (
      <svg width="30" height="12" viewBox="0 0 30 12" aria-hidden="true">
        <path d="M1 6h23" stroke="currentColor" strokeWidth="2" />
        <path d="M22 1.5l7 4.5-7 4.5z" fill="currentColor" />
      </svg>
    )
  return (
    <svg width="12" height="18" viewBox="0 0 12 18" aria-hidden="true">
      <path d={dir === 'both' ? 'M6 5v8' : 'M6 1v11'} stroke="currentColor" strokeWidth="2" />
      <path d="M1.5 11.5L6 17l4.5-5.5z" fill="currentColor" />
      {dir === 'both' && <path d="M1.5 6.5L6 1l4.5 5.5z" fill="currentColor" />}
    </svg>
  )
}
