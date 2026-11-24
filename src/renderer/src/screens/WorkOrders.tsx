import { useEffect, useState } from 'react'
import type { BootInfo } from '../../../shared/types'
import { STAGES, stage, stageStyle, DEFAULT_STAGE_COLORS, type WoSaleMode, type WoStatus, type WoSummary } from '../../../shared/workorders'
import { api } from '../api'
import { money } from '../format'
import NewWorkOrder from './NewWorkOrder'
import WorkOrderTicket from './WorkOrderTicket'
import WorkOrderSettings from './WorkOrderSettings'
import EquipmentLookup from './EquipmentLookup'

type View = { kind: 'list' } | { kind: 'ticket'; id: number } | { kind: 'settings' }

const age = (iso: string) => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  return days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'}`
}

/** Work orders: tickets by stage, check in a unit, open a ticket, settings. */
export default function WorkOrders({
  boot,
  onPayAtTill,
  startCheckIn,
  ticketToOpen,
  onTicketOpened,
  onIntentDone
}: {
  boot: BootInfo
  /** Opened from "I want to… Check in a repair" */
  ticketToOpen?: number|null
  onTicketOpened?:()=>void
  startCheckIn?: boolean
  onIntentDone?: () => void
  /** Open the Sale screen with this work order loaded */
  onPayAtTill: (id: number, mode: WoSaleMode) => void
}) {
  const [colors, setColors] = useState(DEFAULT_STAGE_COLORS)
  const [view, setView] = useState<View>({ kind: 'list' })
  useEffect(()=>{if(ticketToOpen){setView({kind:'ticket',id:ticketToOpen});onTicketOpened?.()}},[ticketToOpen])
  const [filter, setFilter] = useState<WoStatus | 'open' | 'all' | 'needs_call' | 'cancelled'>('open')
  const [search, setSearch] = useState('')
  const [list, setList] = useState<WoSummary[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [creating, setCreating] = useState(false)
  const [findingEquipment, setFindingEquipment] = useState(false)
  useEffect(() => {
    if (startCheckIn) {
      setCreating(true)
      onIntentDone?.()
    }
  }, [startCheckIn])
  const [error, setError] = useState('')
  const by = boot.config.tillName

  const load = () =>
    Promise.all([api.woList(filter, search), api.woCounts(), api.woSettings()])
      .then(([l, c, settings]) => {
        setColors(settings.stageColors ?? DEFAULT_STAGE_COLORS)
        setList(l)
        setCounts(c)
      })
      .catch((e) => setError(e.message))
  useEffect(() => {
    if (view.kind !== 'list') return
    const t = setTimeout(load, 150)
    const timer = setInterval(load, 30000)
    return () => { clearTimeout(t); clearInterval(timer) }
  }, [filter, search, view.kind])

  if (view.kind === 'ticket')
    return <WorkOrderTicket key={view.id} onOpenRelated={id=>setView({kind:'ticket',id})} id={view.id} by={by} onBack={() => setView({ kind: 'list' })} onPayAtTill={onPayAtTill} />
  if (view.kind === 'settings') return <WorkOrderSettings onBack={() => setView({ kind: 'list' })} />

  const openCount = STAGES.filter((s) => s.status !== 'closed').reduce((n, s) => n + (counts[s.status] ?? 0), 0)

  return (
    <div className="page wide">
      <div className="row between">
        <h2>Work Orders</h2>
        <div className="row gap">
          <button onClick={() => setFindingEquipment(true)}>Find equipment by serial</button>
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
        <button className={filter==='needs_call'?'chip active':'chip'} onClick={()=>setFilter('needs_call')}>Needs customer call</button>
        <button className={filter==='cancelled'?'chip active':'chip'} onClick={()=>setFilter('cancelled')}>Cancelled <b>{counts.cancelled??0}</b></button>
        {STAGES.map((s) => (
          <button
            key={s.status}
            className={filter === s.status ? 'chip active' : 'chip'}
            style={filter === s.status ? { ...stageStyle(s.status, colors), borderColor: stage(s.status, colors).color } : { borderLeftColor: stage(s.status, colors).color }}
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
            <th>Mechanic</th>
            <th>In shop</th>
            <th className="r">Total</th>
          </tr>
        </thead>
        <tbody>
          {list.map((w) => (
            <tr key={w.id} className="clickable" onClick={() => setView({ kind: 'ticket', id: w.id })}>
              <td>
                <b>{w.number}</b>{w.group&&<div className="muted small">{w.group.position} of {w.group.count}</div>}
              </td>
              <td>{w.customerName}{w.estimate?.due&&<span className="pill short-pill">Needs customer call</span>}{w.estimate?.needsResend&&w.status==='waiting_customer'&&<span className="pill">Revised estimate needs sending</span>}{w.estimate?.state==='review'&&<span className="pill short-pill">Decision needs review</span>}</td>
              <td>
                {w.unitLabel}
                {w.shortParts > 0 && w.status !== 'closed' && <span className="pill short-pill">{w.shortParts} part(s) not in stock</span>}
                {w.feeStatus === 'unpaid' && w.status !== 'closed' && <span className="pill fee-pill">fee not paid</span>}
              </td>
              <td className="muted">{w.serial}</td>
              <td>
                <span className="stage-badge" style={stageStyle(w.status, colors)}>
                  {w.cancelled?'Cancelled':stage(w.status).label}
                </span>
              </td>
              <td>{w.mechanicName || 'Unassigned'}</td>
              <td className="muted">{age(w.createdAt)}</td>
              <td className="r">
                {money(w.totalCents)}
                {w.feeStatus === 'paid' && w.status !== 'closed' && <div className="muted small">{money(w.balanceDueCents)} due</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {list.length === 0 && <p className="muted">No work orders here.</p>}

      {findingEquipment && <EquipmentLookup colors={colors} onClose={() => setFindingEquipment(false)} onTicket={(id) => { setFindingEquipment(false); setView({ kind: 'ticket', id }) }} />}

      {creating && (
        <NewWorkOrder
          by={by}
          onCancel={() => setCreating(false)}
          onCreated={(wo, collectFee) => {
            setCreating(false)
            if (collectFee) onPayAtTill(wo.id, 'fee')
            else setView({ kind: 'ticket', id: wo.id })
          }}
        />
      )}
    </div>
  )
}
