import { useEffect, useRef, useState } from 'react'
import type { Sale } from '../../shared/types'
import type { PrinterInfo, PrintSettings } from '../../shared/printing'
import { currentPrintSettings, printSaleAs, suggestedFormat, type SaleFormat } from './printing'

/**
 * Asks where to print a sale: receipt printer or a full page, on any printer.
 * The usual choice is picked already, so Enter prints it. If "Ask which printer every time"
 * is switched off (Settings → Printing), it prints straight away on the usual printer.
 */
export default function PrintChooser(props: { sale: Sale; onDone: (message: string) => void; onCancel: () => void }) {
  const [s, setS] = useState<PrintSettings | null>(null)
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [format, setFormat] = useState<SaleFormat>('receipt')
  const [printer, setPrinter] = useState<Record<SaleFormat, string>>({ receipt: '', fullPage: '' })
  const [copies, setCopies] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const started = useRef(false)

  useEffect(() => {
    Promise.all([currentPrintSettings(), window.pos.listPrinters().catch(() => [] as PrinterInfo[])]).then(([ps, list]) => {
      const f = suggestedFormat(props.sale, ps)
      setS(ps)
      setPrinters(list)
      setFormat(f)
      setPrinter({ receipt: ps.receiptPrinter, fullPage: ps.fullPagePrinter })
      setCopies(f === 'fullPage' ? ps.fullPageCopies : ps.receiptCopies)
      // Not asking: print on the usual printer now
      if (!ps.askPrinter && !started.current) {
        started.current = true
        go(f, f === 'fullPage' ? ps.fullPagePrinter : ps.receiptPrinter, f === 'fullPage' ? ps.fullPageCopies : ps.receiptCopies)
      }
    })
  }, [])

  async function go(f: SaleFormat, p: string, c: number) {
    setBusy(true)
    setError('')
    try {
      await printSaleAs(props.sale, f, p, c)
      const name = p ? printers.find((x) => x.name === p)?.displayName ?? p : 'the default printer'
      props.onDone(`Receipt #${props.sale.id} sent to ${name}${f === 'fullPage' ? ' (full page)' : ''}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  if (!s || !s.askPrinter) return null
  const def = printers.find((p) => p.isDefault)
  const Picker = ({ f }: { f: SaleFormat }) => (
    <select
      value={printer[f]}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        setPrinter({ ...printer, [f]: e.target.value })
        setFormat(f)
      }}
    >
      <option value="">Windows default{def ? ` (${def.displayName})` : ''}</option>
      {printers.map((p) => (
        <option key={p.name} value={p.name}>
          {p.displayName}
        </option>
      ))}
    </select>
  )
  const Card = ({ f, icon, title, text }: { f: SaleFormat; icon: string; title: string; text: string }) => (
    <div
      className={format === f ? 'pc-card active' : 'pc-card'}
      onClick={() => {
        setFormat(f)
        setCopies(f === 'fullPage' ? s.fullPageCopies : s.receiptCopies)
      }}
    >
      <div className="pc-head">
        <span className="pc-icon">{icon}</span>
        <div>
          <b>{title}</b>
          <div className="muted small">{text}</div>
        </div>
      </div>
      <label>
        Printer
        <Picker f={f} />
      </label>
    </div>
  )

  return (
    <div className="modal-backdrop">
      <form
        className="modal print-chooser"
        onSubmit={(e) => {
          e.preventDefault()
          if (!busy) go(format, printer[format], copies)
        }}
        onKeyDown={(e) => e.key === 'Escape' && !busy && props.onCancel()}
      >
        <h2>Print receipt #{props.sale.id}</h2>
        <div className="pc-cards">
          <Card f="receipt" icon="🧾" title="Receipt" text="Roll receipt, using the Receipt Layout" />
          <Card f="fullPage" icon="📄" title="Full page" text="Letter page with customer details and signature line" />
        </div>
        <div className="row gap">
          <label className="inline">
            Copies
            <input type="number" min={1} max={5} value={copies} style={{ width: 60 }} onChange={(e) => setCopies(Math.max(1, Math.min(5, Number(e.target.value) || 1)))} />
          </label>
        </div>
        {error && <div className="error-text">{error}</div>}
        <div className="row gap end">
          <button type="button" onClick={props.onCancel} disabled={busy}>
            Don't print
          </button>
          <button type="submit" className="primary" autoFocus disabled={busy}>
            {busy ? 'Printing…' : format === 'fullPage' ? '📄 Print full page' : '🧾 Print receipt'}
          </button>
        </div>
      </form>
    </div>
  )
}
