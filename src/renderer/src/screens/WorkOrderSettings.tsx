import { useEffect, useState } from 'react'
import {
  DEFAULT_WO_SETTINGS,
  TEMPLATE_PLACEHOLDERS,
  stage,
  type EmailableStatus,
  type UnitCategory,
  type WoSettings
} from '../../../shared/workorders'
import { api } from '../api'
import { parseMoney } from '../format'

const CAT_LABEL: Record<UnitCategory, string> = { handheld: 'Hand-held units', mower: 'Mowers', other: 'Other equipment' }
const centsText = (c: number) => (c / 100).toFixed(2)

/** Work order setup: labor rate, default shop supplies, and the email template for each stage. */
export default function WorkOrderSettings({ onBack }: { onBack: () => void }) {
  const [s, setS] = useState<WoSettings | null>(null)
  const [rate, setRate] = useState('')
  const [shop, setShop] = useState<Record<UnitCategory, { description: string; price: string }> | null>(null)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const show = (x: WoSettings) => {
    setS(x)
    setRate(centsText(x.laborRateCents))
    setShop({
      handheld: { description: x.shopSupplies.handheld.description, price: centsText(x.shopSupplies.handheld.priceCents) },
      mower: { description: x.shopSupplies.mower.description, price: centsText(x.shopSupplies.mower.priceCents) },
      other: { description: x.shopSupplies.other.description, price: centsText(x.shopSupplies.other.priceCents) }
    })
  }
  useEffect(() => {
    api.woSettings().then(show).catch((e) => setError(e.message))
  }, [])
  if (!s || !shop) return <div className="page">{error || 'Loading…'}</div>

  const loadedShop = shop
  async function save() {
    const shop = loadedShop
    setMsg('')
    setError('')
    const laborRateCents = parseMoney(rate)
    if (isNaN(laborRateCents)) return setError('Enter the labor rate like 85.00')
    const shopSupplies = {} as WoSettings['shopSupplies']
    for (const c of Object.keys(shop) as UnitCategory[]) {
      const p = parseMoney(shop[c].price)
      if (isNaN(p)) return setError(`Enter the ${CAT_LABEL[c].toLowerCase()} shop supplies price like 7.95`)
      shopSupplies[c] = { description: shop[c].description, priceCents: p }
    }
    try {
      show(await api.woSaveSettings({ ...s!, laborRateCents, shopSupplies }))
      setMsg('Work order settings saved')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const setTemplate = (k: EmailableStatus, changes: Partial<WoSettings['templates'][EmailableStatus]>) =>
    setS({ ...s, templates: { ...s.templates, [k]: { ...s.templates[k], ...changes } } })

  return (
    <div className="page wide wo-settings">
      <div className="row between">
        <button className="link" onClick={onBack}>
          ← Work orders
        </button>
        <button className="primary" onClick={save}>
          Save settings
        </button>
      </div>
      <h2>Work order settings</h2>
      {msg && <div className="ok-text">{msg}</div>}
      {error && <div className="error-text">{error}</div>}

      <div className="card form">
        <h3>Labor</h3>
        <div className="row gap">
          <label className="inline">
            Labor rate per hour
            <input style={{ width: 100 }} value={rate} onChange={(e) => setRate(e.target.value)} />
          </label>
          <label className="check">
            <input type="checkbox" checked={s.laborTaxable} onChange={(e) => setS({ ...s, laborTaxable: e.target.checked })} />
            Labor is taxable
          </label>
        </div>
      </div>

      <div className="card form">
        <h3>Shop supplies (added to every new work order)</h3>
        <p className="muted small">Fuel, oil, cleaners and so on. The amount depends on the unit type. It can be changed or removed on any ticket.</p>
        {(Object.keys(shop) as UnitCategory[]).map((c) => (
          <div key={c} className="shop-row">
            <b>{CAT_LABEL[c]}</b>
            <input value={shop[c].description} onChange={(e) => setShop({ ...shop, [c]: { ...shop[c], description: e.target.value } })} />
            <input className="money" value={shop[c].price} onChange={(e) => setShop({ ...shop, [c]: { ...shop[c], price: e.target.value } })} />
          </div>
        ))}
        <label className="check">
          <input type="checkbox" checked={s.shopTaxable} onChange={(e) => setS({ ...s, shopTaxable: e.target.checked })} />
          Shop supplies are taxable
        </label>
      </div>

      <div className="card form">
        <h3>Customer emails for each stage</h3>
        <div className="placeholders small">
          <b>You can use:</b>{' '}
          {TEMPLATE_PLACEHOLDERS.map((p) => (
            <span key={p.key} title={p.meaning}>
              <code>{p.key}</code>
            </span>
          ))}
        </div>
        {(Object.keys(s.templates) as EmailableStatus[]).map((k) => (
          <div key={k} className="template-box">
            <div className="row between">
              <span className="stage-badge" style={{ background: stage(k).color }}>
                {stage(k).label}
              </span>
              <div className="row gap">
                <label className="check small">
                  <input type="checkbox" checked={s.templates[k].includeBill} onChange={(e) => setTemplate(k, { includeBill: e.target.checked })} />
                  Include the itemized bill
                </label>
                <button className="link small" onClick={() => setTemplate(k, DEFAULT_WO_SETTINGS.templates[k])}>
                  Reset to default
                </button>
              </div>
            </div>
            <label>
              Subject
              <input value={s.templates[k].subject} onChange={(e) => setTemplate(k, { subject: e.target.value })} />
            </label>
            <label>
              Message
              <textarea className="comments" rows={5} value={s.templates[k].body} onChange={(e) => setTemplate(k, { body: e.target.value })} />
            </label>
          </div>
        ))}
        <p className="muted small">Ready for Review is for staff only, so it has no customer email.</p>
      </div>
      <div>
        <button className="primary" onClick={save}>
          Save settings
        </button>
      </div>
    </div>
  )
}
