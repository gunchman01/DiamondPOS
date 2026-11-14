import { useState } from 'react'
import { stage, stageStyle, unitLabel, type EquipmentMatch, type WoStatus } from '../../../shared/workorders'
import { api } from '../api'
import SaleDialog from './SaleDialog'
export default function EquipmentLookup({ colors, onClose, onTicket }: {
  colors: Record<WoStatus, string>; onClose: () => void; onTicket: (id: number) => void
}) {
  const [serial, setSerial] = useState('')
  const [matches, setMatches] = useState<EquipmentMatch[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sale, setSale] = useState<number | null>(null)
  async function find() {
    setBusy(true); setError(''); setMatches(null)
    try { setMatches(await api.equipmentBySerial(serial.trim())) }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  return <div className="modal-backdrop"><div className="modal return-dlg" role="dialog" aria-modal="true" aria-label="Find equipment by serial">
    <h2>Find equipment by serial</h2>
    <form className="row gap" onSubmit={(e) => { e.preventDefault(); if (!busy) void find() }}>
      <input autoFocus aria-label="Equipment serial number" maxLength={80} value={serial} disabled={busy} onChange={(e) => { setSerial(e.target.value); setMatches(null); setError('') }} placeholder="Scan or enter the full serial number" />
      <button type="submit" disabled={busy || !serial.trim()}>{busy ? 'Finding…' : 'Find'}</button>
    </form>
    {error && <div className="error-text">{error}</div>}
    {matches?.length === 0 && <p>No equipment record found for that serial number.</p>}
    <div className="equipment-results">{matches?.map(({ unit, customerName, tickets }) => <article key={unit.id} className="card form">
      <b>{unitLabel(unit)} · S/N {unit.serial}</b><div>{unit.active ? 'Associated customer' : 'Previous / inactive record'}: <b>{customerName}</b></div>
      {unit.saleId ? <button onClick={() => setSale(unit.saleId)}>View sale receipt #{unit.saleId}</button> : <div className="muted small">No linked sale receipt (equipment may have been entered for service).</div>}
      <div className="small muted">Recent service tickets (up to 50)</div>
      {tickets.map((t) => <button key={t.id} onClick={() => onTicket(t.id)}>{t.number} <span className="stage-badge" style={stageStyle(t.status, colors)}>{stage(t.status).label}</span></button>)}
      {!tickets.length && <div className="muted small">No service tickets recorded for this unit.</div>}
    </article>)}</div>
    <div className="row end"><button onClick={onClose}>Close</button></div>
    {sale && <SaleDialog saleId={sale} onClose={() => setSale(null)} />}
  </div></div>
}
