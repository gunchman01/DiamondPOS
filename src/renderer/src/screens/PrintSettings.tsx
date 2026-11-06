import { useEffect, useState } from 'react'
import type { BootInfo } from '../../../shared/types'
import { LABEL_SIZES, printSettings, type PrinterInfo, type PrintSettings as PS } from '../../../shared/printing'
import { testPrint } from '../printing'

/** Settings → Printing: which printer prints what, on this computer. */
export default function PrintSettings({ boot, onChange }: { boot: BootInfo; onChange: (b: BootInfo) => void }) {
  const [s, setS] = useState<PS>(() => printSettings(boot.config.printing))
  const [printers, setPrinters] = useState<PrinterInfo[] | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    window.pos
      .listPrinters()
      .then(setPrinters)
      .catch(() => setPrinters([]))
  }, [])

  const set = (c: Partial<PS>) => {
    setS({ ...s, ...c })
    setDirty(true)
  }
  const setLabel = (c: Partial<PS['label']>) => set({ label: { ...s.label, ...c } })

  async function save() {
    try {
      onChange(await window.pos.saveConfig({ printing: s }))
      setDirty(false)
      setMsg({ ok: true, text: 'Printing settings saved for this computer' })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    }
  }
  async function test(kind: 'receipt' | 'fullPage' | 'label') {
    setMsg(null)
    try {
      await testPrint(kind, s)
      setMsg({ ok: true, text: 'Test page sent' })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    }
  }

  const def = printers?.find((p) => p.isDefault)
  const Picker = ({ value, onPick }: { value: string; onPick: (v: string) => void }) => (
    <select value={value} onChange={(e) => onPick(e.target.value)}>
      <option value="">Windows default printer{def ? ` (${def.displayName})` : ''}</option>
      {(printers ?? []).map((p) => (
        <option key={p.name} value={p.name}>
          {p.displayName}
        </option>
      ))}
      {value && printers && !printers.some((p) => p.name === value) && <option value={value}>{value} (not found on this PC)</option>}
    </select>
  )
  const sizeKey = `${s.label.widthIn}x${s.label.heightIn}`
  const preset = LABEL_SIZES.find((z) => `${z.widthIn}x${z.heightIn}` === sizeKey)

  return (
    <div className="print-settings">
      <p className="muted">
        These settings are for <b>this computer</b> ({boot.config.tillName}), because each till has its own printers.
        {printers && printers.length === 0 && ' No printers were found: install the printer drivers in Windows first.'}
      </p>

      <div className="card form">
        <h3>🧾 Receipt printer</h3>
        <div className="pset-grid">
          <label>
            Printer
            <Picker value={s.receiptPrinter} onPick={(v) => set({ receiptPrinter: v })} />
          </label>
          <label>
            Paper width
            <select value={s.receiptWidthMm} onChange={(e) => set({ receiptWidthMm: Number(e.target.value) as 80 | 58 })}>
              <option value={80}>80 mm (3 1/8")</option>
              <option value={58}>58 mm (2 1/4")</option>
            </select>
          </label>
          <label>
            Copies
            <input type="number" min={1} max={3} value={s.receiptCopies} onChange={(e) => set({ receiptCopies: Math.max(1, Math.min(3, Number(e.target.value) || 1)) })} />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={s.autoPrint} onChange={(e) => set({ autoPrint: e.target.checked })} />
          Print the receipt automatically when a sale is completed
        </label>
        <div>
          <button onClick={() => test('receipt')}>Print test receipt</button>
        </div>
      </div>

      <div className="card form">
        <h3>📄 Full-page printer (laser)</h3>
        <div className="pset-grid">
          <label>
            Printer
            <Picker value={s.fullPagePrinter} onPick={(v) => set({ fullPagePrinter: v })} />
          </label>
          <label>
            Copies
            <input type="number" min={1} max={3} value={s.fullPageCopies} onChange={(e) => set({ fullPageCopies: Math.max(1, Math.min(3, Number(e.target.value) || 1)) })} />
          </label>
        </div>
        <div className="muted small">Print these on a full Letter page here instead of the receipt printer:</div>
        <label className="check">
          <input type="checkbox" checked={s.fullPageFor.serialized} onChange={(e) => set({ fullPageFor: { ...s.fullPageFor, serialized: e.target.checked } })} />
          <span>
            Sales with a <b>serial-numbered unit</b> (mowers, saws, blowers…)
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={s.fullPageFor.workOrders} onChange={(e) => set({ fullPageFor: { ...s.fullPageFor, workOrders: e.target.checked } })} />
          <span>
            <b>Work order</b> receipts (estimate fee, repair pick-up). Work order tickets (🖨 Print on the ticket) always print here.
          </span>
        </label>
        <div>
          <button onClick={() => test('fullPage')}>Print test page</button>
        </div>
      </div>

      <div className="card form">
        <h3>🏷 Label printer (Zebra) for price tags</h3>
        <div className="pset-grid">
          <label>
            Printer
            <Picker value={s.labelPrinter} onPick={(v) => set({ labelPrinter: v })} />
          </label>
          <label>
            Label size
            <select
              value={preset ? sizeKey : 'custom'}
              onChange={(e) => {
                const z = LABEL_SIZES.find((x) => `${x.widthIn}x${x.heightIn}` === e.target.value)
                if (z) setLabel({ widthIn: z.widthIn, heightIn: z.heightIn })
                else setLabel({ widthIn: s.label.widthIn + 0.001 })
              }}
            >
              {LABEL_SIZES.map((z) => (
                <option key={z.label} value={`${z.widthIn}x${z.heightIn}`}>
                  {z.label}
                </option>
              ))}
              <option value="custom">Other size…</option>
            </select>
          </label>
          {!preset && (
            <div className="row gap">
              <label>
                Width (in)
                <input type="number" step={0.05} min={0.5} max={6} value={Math.round(s.label.widthIn * 100) / 100} onChange={(e) => setLabel({ widthIn: Number(e.target.value) || 2 })} />
              </label>
              <label>
                Height (in)
                <input type="number" step={0.05} min={0.5} max={6} value={Math.round(s.label.heightIn * 100) / 100} onChange={(e) => setLabel({ heightIn: Number(e.target.value) || 1 })} />
              </label>
            </div>
          )}
        </div>
        <div className="row gap wrap">
          {(
            [
              ['showStore', 'Store name'],
              ['showPrice', 'Price'],
              ['showBarcode', 'Barcode'],
              ['showSku', 'Item # / UPC']
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="check">
              <input type="checkbox" checked={s.label[k]} onChange={(e) => setLabel({ [k]: e.target.checked })} />
              {l}
            </label>
          ))}
        </div>
        <p className="muted small">
          Uses the Zebra Windows driver (ZDesigner). Set the same label size in the driver's printing preferences. Tags are
          printed from the Item List (🏷 Print tags) or an item's window (🏷 Tags).
        </p>
        <div>
          <button onClick={() => test('label')}>Print test tag</button>
        </div>
      </div>

      {msg && <div className={msg.ok ? 'ok-text' : 'error-text'}>{msg.text}</div>}
      <div className="row gap">
        <button className="primary" disabled={!dirty} onClick={save}>
          Save printing settings
        </button>
        {dirty && <span className="muted small">Not saved yet</span>}
      </div>
    </div>
  )
}
