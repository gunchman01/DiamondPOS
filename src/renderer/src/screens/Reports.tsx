import { useEffect, useState } from 'react'
import type { DailyReport, SaleSummary } from '../../../shared/types'
import { api } from '../api'
import { dateTime, money, today } from '../format'
import { receiptHtml } from '../receipt'

/** End-of-day totals across ALL tills, plus a list of sales with reprint. */
export default function Reports() {
  const [date, setDate] = useState(today())
  const [report, setReport] = useState<DailyReport | null>(null)
  const [sales, setSales] = useState<SaleSummary[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    setError('')
    Promise.all([api.dailyReport(date), api.listSales(date)])
      .then(([r, s]) => {
        setReport(r)
        setSales(s)
      })
      .catch((e) => setError(e.message))
  }, [date])

  async function reprint(id: number) {
    try {
      const [sale, settings] = await Promise.all([api.getSale(id), api.getSettings()])
      await window.pos.printReceipt(receiptHtml(sale, settings))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="page">
      <div className="row between">
        <h2>Daily report</h2>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {error && <div className="error-text">{error}</div>}

      {report && (
        <div className="stats">
          <Stat label="Sales" value={String(report.saleCount)} />
          <Stat label="Total takings" value={money(report.totalCents)} />
          <Stat label="GST included" value={money(report.taxCents)} />
          <Stat label="Cash (net of change)" value={money(report.cashCents)} />
          <Stat label="Card (terminal)" value={money(report.cardCents)} />
          <Stat label={`Tax exempt sales (${report.taxExemptCount})`} value={`−${money(report.taxExemptCents)}`} />
        </div>
      )}
      <p className="muted small">
        Tip: compare “Card (terminal)” with the settlement total printed by the card terminal at end of day.
      </p>

      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Time</th>
            <th>Till</th>
            <th>Customer</th>
            <th className="r">Total</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sales.map((s) => (
            <tr key={s.id}>
              <td>{s.id}</td>
              <td>{dateTime(s.createdAt)}</td>
              <td>{s.tillName}</td>
              <td>{s.customerName ?? ''}</td>
              <td className="r">{money(s.totalCents)}</td>
              <td className="r">
                <button onClick={() => reprint(s.id)}>Reprint</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card stat">
      <div className="muted small">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  )
}
