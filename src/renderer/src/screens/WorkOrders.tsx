import { useEffect, useState } from 'react'
import type { BootInfo } from '../../../shared/types'
import { STAGES, stage, type WoStatus, type WoSummary } from '../../../shared/workorders'
import { api } from '../api'
import { money } from '../format'
import NewWorkOrder from './NewWorkOrder'
import WorkOrderTicket from './WorkOrderTicket'
import WorkOrderSettings from './WorkOrderSettings'

type View = { kind: 'list' } | { kind: 'ticket'; id: number } | { kind: 'settings' }

const age = (iso: string) => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  return days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'}`
}

/** Work orders: tickets by stage, check in a unit, open a ticket, settings. */
export default function WorkOrders({ boot }: { boot: BootInfo }) {
  const [view, setView] = useState<View>({ kind: 'list' })
  const [filter, setFilter] = useState<WoStatus | 'open' | 'all'>('open')
  const [search, setSearch] = useState('')
  const [list, setList] = useState<WoSummary[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const by = boot.config.tillName

  const load = () =>
    Promise.all([api.woList(filter, search), api.woCounts()])
      .then(([l, c]) => {
        setList(l)
        setCounts(c)
      })
      .catch((e) => setError(e.message))
  useEffect(() => {
    if (view.kind !== 'list') return
    const t = setTimeout(load, 150)
    return () => clearTimeout(t)
  }, [filter, search, view.kind])

  if (view.kind === 'ticket') return <WorkOrderTicket id={view.id} by={by} onBack={() => setView({ kind: 'list' })} />
  if (view.kind === 'settings') return <WorkOrderSettings onBack={() => setView({ kind: 'list' })} />

  const openCount = STAGES.filter((s) => s.status !== 'closed').reduce((n, s) => n + (counts[s.status] ?? 0), 0)

  return (
    <div className="page wide">
      <div className="row between">
        <h2>Work Orders</h2>
        <div className="row gap">
          <button onClick={() => setView({ kind: 'settings' })}>⚙ Work order settings</button>
          <button className="primary" onClick={() => setCreating(true)}>
            + New work order
          </button>
        </div>
      </div>

      <div className="stage-chips">
        <button className={filter === 'open' ? 'chip active' : 'chip'} onClick={() => setFilter('open')}>
          All open <b>{openCount}</b>
        </button>
        {STAGES.map((s) => (
          <button
            key={s.status}
            className={filter === s.status ? 'chip active' : 'chip'}
            style={filter === s.status ? { background: s.color, borderColor: s.color } : { borderLeftColor: s.color }}
            onClick={() => setFilter(s.status)}
          >
            {s.label} <b>{counts[s.status] ?? 0}</b>
          </button>
        ))}
      </div>
      <div className="row gap">
        <input
          placeholder="Search customer, phone, serial #, brand, model or WO number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, width: 'auto' }}
        />
        <label className="check">
          <input type="checkbox" checked={filter === 'all'} onChange={(e) => setFilter(e.target.checked ? 'all' : 'open')} />
          Include picked up
        </label>
      </div>
      {error && <div className="error-text">{error}</div>}

      <table className="table">
        <thead>
          <tr>
            <th>WO #</th>
            <th>Customer</th>
            <th>Unit</th>
            <th>Serial #</th>
            <th>Stage</th>
            <th>In shop</th>
            <th className="r">Total</th>
          </tr>
        </thead>
        <tbody>
          {list.map((w) => (
            <tr key={w.id} className="clickable" onClick={() => setView({ kind: 'ticket', id: w.id })}>
              <td>
                <b>{w.number}</b>
              </td>
              <td>{w.customerName}</td>
              <td>
                {w.unitLabel}
                {w.shortParts > 0 && w.status !== 'closed' && <span className="pill short-pill">{w.shortParts} part(s) not in stock</span>}
              </td>
              <td className="muted">{w.serial}</td>
              <td>
                <span className="stage-badge" style={{ background: stage(w.status).color }}>
                  {stage(w.status).label}
                </span>
              </td>
              <td className="muted">{age(w.createdAt)}</td>
              <td className="r">{money(w.totalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {list.length === 0 && <p className="muted">No work orders here.</p>}

      {creating && (
        <NewWorkOrder
          by={by}
          onCancel={() => setCreating(false)}
          onCreated={(wo) => {
            setCreating(false)
            setView({ kind: 'ticket', id: wo.id })
          }}
        />
      )}
    </div>
  )
}
