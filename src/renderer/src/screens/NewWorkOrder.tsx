import { useEffect, useState } from 'react'
import { customerDisplayName, type Customer } from '../../../shared/types'
import { unitLabel, type CustomerUnit, type WorkOrder } from '../../../shared/workorders'
import { api } from '../api'
import CustomerPicker from './CustomerPicker'
import UnitEditor from './UnitEditor'

/** Check in a unit: 1. customer → 2. unit (theirs, or add one) → 3. what's wrong. */
export default function NewWorkOrder(props: { by: string; onCreated: (wo: WorkOrder) => void; onCancel: () => void }) {
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [picking, setPicking] = useState(true)
  const [units, setUnits] = useState<CustomerUnit[]>([])
  const [unit, setUnit] = useState<CustomerUnit | null>(null)
  const [addingUnit, setAddingUnit] = useState(false)
  const [brands, setBrands] = useState<string[]>([])
  const [problem, setProblem] = useState('')
  const [hours, setHours] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.mkOptions().then((o) => setBrands(o.manufacturers)).catch(() => {})
  }, [])
  useEffect(() => {
    if (!customer) return
    api.units(customer.id).then((u) => {
      const active = u.filter((x) => x.active)
      setUnits(active)
      if (active.length === 0) setAddingUnit(true)
    })
  }, [customer])
  useEffect(() => setHours(unit?.hours !== null && unit?.hours !== undefined ? String(unit.hours) : ''), [unit])

  async function create() {
    if (!customer || !unit) return
    setBusy(true)
    setError('')
    try {
      props.onCreated(
        await api.woCreate({
          customerId: customer.id,
          unitId: unit.id,
          problem,
          hoursIn: unit.category === 'mower' && hours.trim() ? Number(hours) : null,
          by: props.by
        })
      )
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  if (picking)
    return (
      <CustomerPicker
        onPick={(c) => {
          setCustomer(c)
          setUnit(null)
          setPicking(false)
        }}
        onCancel={() => (customer ? setPicking(false) : props.onCancel())}
      />
    )

  return (
    <div className="modal-backdrop">
      <div className="modal new-wo" onKeyDown={(e) => e.key === 'Escape' && !addingUnit && props.onCancel()}>
        <h2>New work order</h2>

        <div className="wo-step">
          <span className="step-no">1</span>
          <div className="step-body">
            <b>{customer ? customerDisplayName(customer) : ''}</b>
            <span className="muted small"> {[customer?.phone || customer?.mobile, customer?.email].filter(Boolean).join(' · ')}</span>
          </div>
          <button className="link" onClick={() => setPicking(true)}>
            Change
          </button>
        </div>

        <div className="wo-step col">
          <div className="row between">
            <span>
              <span className="step-no">2</span> <b>Which unit?</b>
            </span>
            <button onClick={() => setAddingUnit(true)}>+ Add a unit</button>
          </div>
          {units.length === 0 ? (
            <p className="muted small">No units on file for this customer yet. Add the one being repaired.</p>
          ) : (
            <div className="unit-list">
              {units.map((u) => (
                <button key={u.id} className={unit?.id === u.id ? 'unit-card selected' : 'unit-card'} onClick={() => setUnit(u)}>
                  <b>{unitLabel(u)}</b>
                  <span className="muted small">
                    {u.serial ? `S/N ${u.serial}` : 'No serial'}
                    {u.hours !== null ? ` · ${u.hours} hrs` : ''}
                    {u.purchasedHere ? ' · bought here' : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={unit ? 'wo-step col' : 'wo-step col disabled'}>
          <span>
            <span className="step-no">3</span> <b>What's wrong with it?</b>
          </span>
          <textarea
            className="comments"
            rows={3}
            disabled={!unit}
            value={problem}
            placeholder="What the customer says, e.g. Hard to start, runs rough at full throttle"
            onChange={(e) => setProblem(e.target.value)}
          />
          {unit?.category === 'mower' && (
            <label className="inline">
              Hour meter now (optional)
              <input inputMode="decimal" style={{ width: 120 }} value={hours} onChange={(e) => setHours(e.target.value)} />
            </label>
          )}
        </div>

        {error && <div className="error-text">{error}</div>}
        <div className="row gap end">
          <button onClick={props.onCancel}>Cancel</button>
          <button className="primary" disabled={!unit || !problem.trim() || busy} onClick={create}>
            {busy ? 'Creating…' : 'Check in (Needs Estimate)'}
          </button>
        </div>
      </div>

      {addingUnit && customer && (
        <UnitEditor
          customerId={customer.id}
          unit={null}
          brands={brands}
          onCancel={() => setAddingUnit(false)}
          onSaved={(u) => {
            setUnits((list) => [u, ...list])
            setUnit(u)
            setAddingUnit(false)
          }}
        />
      )}
    </div>
  )
}
