import { useEffect, useState } from 'react'
import { customerDisplayName, type Customer } from '../../../shared/types'
import { unitLabel, type CustomerUnit, type WoSettings, type WorkOrder } from '../../../shared/workorders'
import { money, parseMoney } from '../format'
import { api } from '../api'
import RepairKiosk from './RepairKiosk'
import CustomerPicker from './CustomerPicker'
import KioskSignup from './KioskSignup'
import UnitEditor from './UnitEditor'

/** Check in a unit: 1. customer → 2. unit (theirs, or add one) → 3. what's wrong. */
export default function NewWorkOrder(props: {
  initialCustomerId?: number
  linkToId?: number
  by: string
  /** collectFee = go straight to the till to take the estimate fee */
  onCreated: (wo: WorkOrder, collectFee: boolean) => void
  onCancel: () => void
}) {
  const [intakeTicket,setIntakeTicket]=useState<WorkOrder|null>(null)
  const [kioskOpen,setKioskOpen]=useState(false)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [picking, setPicking] = useState(!props.initialCustomerId)
  const [units, setUnits] = useState<CustomerUnit[]>([])
  const [unit, setUnit] = useState<CustomerUnit | null>(null)
  const [addingUnit, setAddingUnit] = useState(false)
  const [brands, setBrands] = useState<string[]>([])
  const [problem, setProblem] = useState('')
  const [hours, setHours] = useState('')
  const [error, setError] = useState('')
  const [settings, setSettings] = useState<WoSettings | null>(null)
  const [feeText, setFeeText] = useState('')
  const [settingsError,setSettingsError] = useState('')
  const [busy, setBusy] = useState(false)

  async function loadSettings(){setSettingsError('');try{setSettings(await api.woSettings())}catch(e){setSettingsError((e as Error).message)}}
  useEffect(() => {
    if(props.initialCustomerId)api.getCustomer(props.initialCustomerId).then(d=>setCustomer(d.customer)).catch(e=>setError(e.message))
    api.mkOptions().then((o) => setBrands(o.manufacturers)).catch(() => {})
    void loadSettings()
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

  const defaultFee = unit && settings ? settings.estimateFee.cents[unit.category] : 0
  useEffect(()=>{setFeeText(unit&&settings?(settings.estimateFee.cents[unit.category]/100).toFixed(2):'')},[unit?.id,unit?.category,settings])
  const feeCents = parseMoney(feeText)
  const validFee = Number.isSafeInteger(feeCents) && feeCents >= 0

  async function create(collectNow: boolean,sendQuestions=false) {
    if (busy || !customer || !unit || !settings) return
    if (!validFee) {setError('Enter an estimate fee of $0.00 or more, or use No fee.');return}
    setBusy(true)
    setError('')
    try {
      const created = await api.woCreate({
        customerId: customer.id,
        linkToId: props.linkToId,
        unitId: unit.id,
        problem,
        hoursIn: unit.category === 'mower' && hours.trim() ? Number(hours) : null,
        by: props.by,
        feeCents
      })
      if(sendQuestions){setIntakeTicket(created);return}
      props.onCreated(created, collectNow && created.feeCents > 0)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  if(intakeTicket)return <RepairKiosk id={intakeTicket.id} tillName={props.by} onClose={()=>props.onCreated(intakeTicket,false)}/>
  if (picking)
    return (
      <>
      <CustomerPicker
        onSendToKiosk={()=>setKioskOpen(true)}
        onPick={(c) => {
          setCustomer(c)
          setUnit(null)
          setPicking(false)
        }}
        onCancel={() => (customer ? setPicking(false) : props.onCancel())}
      />
      {kioskOpen&&<KioskSignup tillName={props.by} onClose={()=>setKioskOpen(false)} onDone={c=>{setCustomer(c);setUnit(null);setKioskOpen(false);setPicking(false)}}/>}
      </>
    )

  return (
    <div className="modal-backdrop">
      <div className="modal new-wo" onKeyDown={(e) => e.key === 'Escape' && !addingUnit && !busy && props.onCancel()}>
        <h2>New work order</h2>

        <div className="wo-step">
          <span className="step-no">1</span>
          <div className="step-body">
            <b>{customer ? customerDisplayName(customer) : ''}</b>
            <span className="muted small"> {[customer?.phone || customer?.mobile, customer?.email].filter(Boolean).join(' · ')}</span>
          </div>
          <button className="link" disabled={!!props.linkToId} onClick={() => setPicking(true)}>
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
          <div className="fee-check">
            <label>Estimate fee for this ticket ($)
              <input aria-label="Estimate fee for this ticket" inputMode="decimal" maxLength={30} value={feeText} disabled={!unit||!settings||busy} onChange={e=>setFeeText(e.target.value)} placeholder="0.00"/>
            </label>
            <div className="row gap">
              <button type="button" disabled={!unit||!settings||busy} onClick={()=>setFeeText((defaultFee/100).toFixed(2))}>Use default {money(defaultFee)}</button>
              <button type="button" disabled={!unit||!settings||busy} onClick={()=>setFeeText('0.00')}>No fee</button>
            </div>
            <p className="muted small">Change this ticket's fee or enter 0.00 to waive it. The configured default is unchanged. A paid fee is credited toward the repair or a new purchase and kept if they decline.</p>
            {!settings&&!settingsError&&<p className="muted small">Loading estimate fee defaults…</p>}
            {settingsError&&<p className="error-text">Could not load fee defaults: {settingsError} <button type="button" onClick={()=>void loadSettings()}>Retry</button></p>}
            {unit&&settings&&!validFee&&<p className="error-text">Enter an amount of 0.00 or more with up to two decimal places.</p>}
          </div>
          {unit?.category === 'mower' && (
            <label className="inline">
              Hour meter now (optional)
              <input inputMode="decimal" style={{ width: 120 }} value={hours} onChange={(e) => setHours(e.target.value)} />
            </label>
          )}
        </div>

        {error && <div className="error-text">{error}</div>}
        <div className="row gap end">
          <button disabled={busy} onClick={props.onCancel}>Cancel</button>
          <button disabled={!unit||!settings||!validFee||!problem.trim()||busy} onClick={()=>void create(false,true)}>Check in &amp; send questions to kiosk</button>
          {validFee && feeCents > 0 ? (
            <>
              <button disabled={!unit || !settings || !validFee || !problem.trim() || busy} onClick={() => create(false)}>
                Check in (collect fee later)
              </button>
              <button className="primary" disabled={!unit || !settings || !validFee || !problem.trim() || busy} onClick={() => create(true)}>
                {busy ? 'Creating…' : `Check in & collect ${money(feeCents)} at till`}
              </button>
            </>
          ) : (
            <button className="primary" disabled={!unit || !settings || !validFee || !problem.trim() || busy} onClick={() => create(false)}>
              {busy ? 'Creating…' : 'Check in (Needs Estimate)'}
            </button>
          )}
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
