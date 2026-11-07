import { useState } from 'react'
import { taxRateLabel, type StoreSettings, type TaxRate } from '../../../shared/types'
import { api } from '../api'

type Row = { id: string; name: string; pct: string }
const pctText = (rate: number) => String(Math.round(rate * 100000) / 1000)

/** Settings → Taxes: the store's sales tax rates. The default is used unless another is picked on the Sale screen. */
export default function TaxSettings({ store, onSaved }: { store: StoreSettings; onSaved: (s: StoreSettings) => void }) {
  const [rows, setRows] = useState<Row[]>(() => (store.taxRates ?? []).map((t) => ({ id: t.id, name: t.name, pct: pctText(t.rate) })))
  const [def, setDef] = useState(store.defaultTaxRateId ?? store.taxRates?.[0]?.id ?? '')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [dirty, setDirty] = useState(false)

  const set = (i: number, c: Partial<Row>) => {
    setRows(rows.map((r, j) => (j === i ? { ...r, ...c } : r)))
    setDirty(true)
  }
  async function save() {
    setMsg(null)
    const list: TaxRate[] = []
    for (const r of rows) {
      const pct = Number(r.pct.replace('%', '').trim())
      if (!r.name.trim()) return setMsg({ ok: false, text: 'Give each tax rate a name' })
      if (!Number.isFinite(pct) || pct < 0 || pct >= 100) return setMsg({ ok: false, text: `${r.name}: enter the rate as a percent, e.g. 7.975` })
      list.push({ id: r.id, name: r.name.trim(), rate: pct / 100 })
    }
    if (!list.length) return setMsg({ ok: false, text: 'Add at least one tax rate' })
    try {
      const saved = await api.saveSettings({ taxRates: list, defaultTaxRateId: list.some((t) => t.id === def) ? def : list[0].id })
      onSaved(saved)
      setRows((saved.taxRates ?? []).map((t) => ({ id: t.id, name: t.name, pct: pctText(t.rate) })))
      setDef(saved.defaultTaxRateId ?? '')
      setDirty(false)
      setMsg({ ok: true, text: 'Tax rates saved for every till' })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    }
  }

  return (
    <div className="card form tax-settings">
      <p className="muted">
        Shelf prices are <b>before tax</b>. Sales tax is added at checkout on taxable items, at the rate picked on the sale. The
        <b> default</b> rate is used unless the cashier picks another one on the Sale screen (for example a different county).
        Tax-exempt customers pay no tax.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 80 }}>Default</th>
            <th>Name (shown on receipts)</th>
            <th style={{ width: 140 }}>Rate (%)</th>
            <th style={{ width: 60 }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td>
                <input
                  type="radio"
                  name="deftax"
                  checked={def === r.id}
                  onChange={() => {
                    setDef(r.id)
                    setDirty(true)
                  }}
                />
              </td>
              <td>
                <input value={r.name} placeholder="e.g. Fresno County" onChange={(e) => set(i, { name: e.target.value })} />
              </td>
              <td>
                <input className="money" value={r.pct} placeholder="7.975" onChange={(e) => set(i, { pct: e.target.value })} />
              </td>
              <td>
                <button
                  className="link danger-text"
                  disabled={rows.length <= 1}
                  title="Remove this rate"
                  onClick={() => {
                    setRows(rows.filter((_, j) => j !== i))
                    setDirty(true)
                  }}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row gap">
        <button
          onClick={() => {
            setRows([...rows, { id: `tax${Date.now().toString(36)}`, name: '', pct: '' }])
            setDirty(true)
          }}
        >
          + Add a tax rate
        </button>
        <span className="muted small">
          Now: {(store.taxRates ?? []).map((t) => `${taxRateLabel(t)}${t.id === store.defaultTaxRateId ? ' (default)' : ''}`).join(' · ')}
        </span>
      </div>
      {msg && <div className={msg.ok ? 'ok-text' : 'error-text'}>{msg.text}</div>}
      <div>
        <button className="primary" disabled={!dirty} onClick={save}>
          Save tax rates
        </button>
      </div>
    </div>
  )
}
