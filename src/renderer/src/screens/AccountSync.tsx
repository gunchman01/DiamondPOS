import { useEffect, useState } from 'react'
import type { Customer } from '../../../shared/types'
import { api } from '../api'
import { dateTime } from '../format'
import CustomerAccountDialog from './CustomerAccount'
export default function AccountSync() {
  const [rows, setRows] = useState<
      { kind: string; customerId: number; customerName: string; reference: string; status: string; error: string | null; date: string }[]
    >([]),
    [customer, setCustomer] = useState<Customer | null>(null),
    [error, setError] = useState('')
  const load = () =>
    api
      .accountSyncStatus()
      .then(setRows)
      .catch((e) => setError(e.message))
  useEffect(() => {
    void load()
    const timer = setInterval(load, 15000)
    return () => clearInterval(timer)
  }, [])
  return (
    <section className="card">
      <div className="row between">
        <h3>Customer account invoices &amp; payments</h3>
        <button onClick={() => void load()}>Refresh</button>
      </div>
      <p className="muted small">
        Account sales post as unpaid invoices; later payments apply to those invoices. Open the customer account to review balances or retry
        problems. After sync, print/email the invoice from QuickBooks. The Sales Receipt preview below covers paid-at-checkout sales.
      </p>
      {error && <p className="error-text">{error}</p>}
      <div className="report-table">
        <table className="table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Type / reference</th>
              <th>Date</th>
              <th>QuickBooks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <button
                    className="link"
                    onClick={async () => {
                      try {
                        setCustomer((await api.getCustomer(r.customerId)).customer)
                      } catch (e) {
                        setError((e as Error).message)
                      }
                    }}
                  >
                    {r.customerName}
                  </button>
                </td>
                <td>
                  {r.kind} · {r.reference}
                </td>
                <td>{dateTime(r.date)}</td>
                <td>
                  {r.status}
                  {r.error && <div className="error-text">{r.error}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="muted">No customer account transactions yet.</p>}
      <p className="muted small">Latest 100 records, with problems and pending records first.</p>
      {customer && (
        <CustomerAccountDialog
          customer={customer}
          onClose={() => {
            setCustomer(null)
            void load()
          }}
        />
      )}
    </section>
  )
}
