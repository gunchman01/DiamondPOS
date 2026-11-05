import { useState } from 'react'
import { UNIT_TYPES, type CustomerUnit, type UnitCategory } from '../../../shared/workorders'
import { api } from '../api'

const CATEGORY_LABEL: Record<UnitCategory, string> = { handheld: 'Hand-held', mower: 'Mower', other: 'Other equipment' }

/** Add or edit a customer's unit (equipment). Mowers get an optional hour meter field. */
export default function UnitEditor(props: {
  customerId: number
  unit: CustomerUnit | null
  brands: string[]
  onSaved: (u: CustomerUnit) => void
  onCancel: () => void
}) {
  const u = props.unit
  const [category, setCategory] = useState<UnitCategory>(u?.category ?? 'handheld')
  const [unitType, setUnitType] = useState(u?.unitType ?? '')
  const [brand, setBrand] = useState(u?.brand ?? '')
  const [model, setModel] = useState(u?.model ?? '')
  const [serial, setSerial] = useState(u?.serial ?? '')
  const [hours, setHours] = useState(u?.hours === null || u?.hours === undefined ? '' : String(u.hours))
  const [notes, setNotes] = useState(u?.notes ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function pickType(t: string) {
    setUnitType(t)
    const known = UNIT_TYPES.find((x) => x.type.toLowerCase() === t.trim().toLowerCase())
    if (known) setCategory(known.category)
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      const body = { category, unitType, brand, model, serial, hours: category === 'mower' && hours.trim() ? Number(hours) : null, notes }
      props.onSaved(u ? await api.updateUnit(u.id, body) : await api.addUnit(props.customerId, body))
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <form
        className="modal unit-modal"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
        onKeyDown={(e) => e.key === 'Escape' && props.onCancel()}
      >
        <h2>{u ? 'Edit unit' : 'Add a unit'}</h2>
        <div className="unit-grid">
          <label>
            What is it?
            <input list="dl-unit-types" autoFocus value={unitType} placeholder="e.g. Blower" onChange={(e) => pickType(e.target.value)} />
          </label>
          <label>
            Type
            <select value={category} onChange={(e) => setCategory(e.target.value as UnitCategory)}>
              {(Object.keys(CATEGORY_LABEL) as UnitCategory[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Brand
            <input list="dl-unit-brands" value={brand} placeholder="e.g. Stihl" onChange={(e) => setBrand(e.target.value)} />
          </label>
          <label>
            Model number
            <input value={model} placeholder="e.g. BR 600" onChange={(e) => setModel(e.target.value)} />
          </label>
          <label>
            Serial number
            <input value={serial} placeholder="Type or scan" onChange={(e) => setSerial(e.target.value)} />
          </label>
          {category === 'mower' ? (
            <label>
              Hours (optional, leave blank if there's no hour meter)
              <input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
            </label>
          ) : (
            <span />
          )}
        </div>
        <label>
          Notes (colour, attachments, condition…)
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {error && <div className="error-text">{error}</div>}
        <div className="row gap end">
          <button type="button" onClick={props.onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save unit'}
          </button>
        </div>
        <datalist id="dl-unit-types">
          {UNIT_TYPES.map((t) => (
            <option key={t.type} value={t.type} />
          ))}
        </datalist>
        <datalist id="dl-unit-brands">
          {props.brands.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
      </form>
    </div>
  )
}
