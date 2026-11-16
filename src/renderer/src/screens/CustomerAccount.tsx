import { useEffect, useRef, useState } from 'react'
import type { CustomerAccount as Account, AccountPaymentRequest } from '../../../shared/accounts'
import { CARD_BRANDS, customerDisplayName, type Customer, type PaymentMethod, type CardBrand } from '../../../shared/types'
import { api, serverBaseUrl } from '../api'
import { dateTime, escapeHtml, money, parseMoney } from '../format'
export default function CustomerAccount({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [data, setData] = useState<Account | null>(null),
    [amount, setAmount] = useState(''),
    [method, setMethod] = useState<PaymentMethod>('cash'),
    [reference, setReference] = useState(''),
    [brand, setBrand] = useState<CardBrand>('unknown'),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<AccountPaymentRequest | null>(null),
    [receipt, setReceipt] = useState<number | null>(null)
  const working = useRef(false),
    storageKey = `diamondpos-account-payment:${serverBaseUrl()}:${customer.id}`
  const load = () =>
    api
      .customerAccount(customer.id)
      .then(setData)
      .catch((e) => setError(e.message))
  useEffect(() => {
    void load()
    try {
      const value = localStorage.getItem(storageKey)
      if (value) setPending(JSON.parse(value))
    } catch {
      setError('Could not read pending payment recovery information. Resolve it before taking another payment.')
    }
  }, [customer.id])
  async function pay() {
    if (working.current) return
    working.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try {
      let request = pending
      if (!request) {
        const amountCents = parseMoney(amount)
        if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error('Enter a positive payment amount')
        if (!data || amountCents > data.balanceCents) throw new Error('Payment exceeds the current POS account balance')
        if (method === 'check' && !reference.trim()) throw new Error('Enter a check number')
        if (
          !confirm(
            `Record ${money(amountCents)} received by ${method} on this customer account? Confirm the actual payment separately on the terminal when applicable.`
          )
        )
          return
        const boot = await window.pos.getBootInfo()
        request = {
          requestId: crypto.randomUUID(),
          amountCents,
          method,
          reference: method === 'check' ? reference : undefined,
          cardBrand: method === 'card' ? brand : undefined,
          by: boot.config.tillName,
          till: boot.config.tillName
        }
        localStorage.setItem(storageKey, JSON.stringify(request))
        setPending(request)
      }
      const result = await api.receiveAccountPayment(customer.id, request)
      localStorage.removeItem(storageKey)
      setPending(null)
      setData(result.account)
      setReceipt(result.paymentId)
      setAmount('')
      setReference('')
      setMessage(`Account payment #${result.paymentId} recorded. It will sync after the invoice is confirmed in QuickBooks.`)
    } catch (e) {
      if ((e as any).definite) {
        localStorage.removeItem(storageKey)
        setPending(null)
      }
      setError((e as Error).message)
    } finally {
      working.current = false
      setBusy(false)
    }
  }
  async function print(id: number) {
    try {
      const p = data?.payments.find((p) => p.id === id)
      if (!p) return
      await window.pos.print({
        printer: '',
        html: `<!doctype html><html><head><meta charset="utf-8"><style>body{font:14px Arial;padding:10px}</style></head><body><h2>Payment received on account</h2><p>Payment #${p.id}<br>${escapeHtml(customerDisplayName(customer))}<br>${escapeHtml(dateTime(p.date))}</p><h2>${money(p.amountCents)}</h2><p>${escapeHtml(p.method)}${p.reference ? ' · Check ' + escapeHtml(p.reference) : ''}</p><p>POS account balance: ${money(data!.balanceCents)}</p><p>This payment is applied to existing invoices. It is not another sale.</p></body></html>`
      })
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <div className="modal-backdrop account-backdrop">
      <div
        className="modal account-dialog"
        role="dialog"
        aria-label="Customer account"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            if (!busy && !pending) onClose()
          }
        }}
      >
        <header className="row between">
          <h2>{customerDisplayName(customer)} · Account</h2>
          <button disabled={busy} onClick={() => void load()}>
            Refresh
          </button>
        </header>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        {data && (
          <>
            <h2>POS account balance: {money(data.balanceCents)}</h2>
            <p className="muted small">
              Tracks invoices raised by DiamondPOS, not imported past-due balances or unrelated back-office invoices. QuickBooks balance
              updates arrive with Web Connector. Check the last update before taking payment if the customer paid in the back office.
            </p>
            <div className="report-table">
              <table className="table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date / due</th>
                    <th>Total</th>
                    <th>Owed</th>
                    <th>QuickBooks</th>
                  </tr>
                </thead>
                <tbody>
                  {data.invoices.map((i) => (
                    <tr key={i.saleId}>
                      <td>
                        {i.refNumber} · Sale #{i.saleId}
                      </td>
                      <td>
                        {dateTime(i.date)}
                        <br />
                        {i.dueDate}
                      </td>
                      <td>{money(i.totalCents)}</td>
                      <td>{money(i.balanceCents)}</td>
                      <td>
                        {i.status === 'sent' ? 'Invoice confirmed' : i.status}
                        {i.qbCheckedAt && <div className="muted small">Balance checked {dateTime(i.qbCheckedAt)}</div>}
                        {i.error && <div className="error-text">{i.error}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <section className="card">
              <h3>Receive payment on account</h3>
              {pending ? (
                <>
                  <p className="error-text">
                    An original payment is awaiting confirmation: {money(pending.amountCents)} by {pending.method}. Do not collect it again.
                    Retry checks the same request.
                  </p>
                  <button disabled={busy} className="primary" onClick={() => void pay()}>
                    Check / retry original payment
                  </button>
                </>
              ) : (
                <div className="row gap account-payment-fields">
                  <label>
                    Amount ($)
                    <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  </label>
                  <label>
                    Payment method
                    <select
                      value={method}
                      onChange={(e) => {
                        setMethod(e.target.value as PaymentMethod)
                        setReference('')
                      }}
                    >
                      <option value="cash">Cash</option>
                      <option value="card">Card (standalone terminal)</option>
                      <option value="check">Check</option>
                    </select>
                  </label>
                  {method === 'check' && (
                    <label>
                      Check #<input value={reference} onChange={(e) => setReference(e.target.value)} />
                    </label>
                  )}
                  {method === 'card' && (
                    <label>
                      Card brand
                      <select value={brand} onChange={(e) => setBrand(e.target.value as CardBrand)}>
                        {Object.entries(CARD_BRANDS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button className="primary" disabled={busy || data.balanceCents <= 0} onClick={() => void pay()}>
                    {busy ? 'Recording…' : 'Record payment'}
                  </button>
                </div>
              )}
              <p className="muted small">
                Applied to oldest outstanding POS invoices first. Enter the amount actually received; no overpayment or cash change. This
                does not operate the card terminal.
              </p>
            </section>
            <h3>Account payment history</h3>
            <div className="report-table">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Date</th>
                    <th>Method</th>
                    <th>Amount</th>
                    <th>QuickBooks</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((p) => (
                    <tr key={p.id}>
                      <td>{p.id}</td>
                      <td>{dateTime(p.date)}</td>
                      <td>
                        {p.method}
                        {p.reference ? ' #' + p.reference : ''}
                      </td>
                      <td>{money(p.amountCents)}</td>
                      <td>
                        {p.status}
                        {p.error && <div className="error-text">{p.error}</div>}
                      </td>
                      <td>
                        <button onClick={() => void print(p.id)}>Receipt</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row gap">
              <button
                disabled={busy}
                onClick={async () => {
                  try {
                    setData(await api.retryAccountSync(customer.id))
                    setMessage('Failed account transactions queued for the next Web Connector run.')
                  } catch (e) {
                    setError((e as Error).message)
                  }
                }}
              >
                Retry failed account sync
              </button>
              {receipt && <button onClick={() => void print(receipt)}>Print last payment receipt</button>}
            </div>
          </>
        )}
        <footer className="row end">
          <button disabled={busy || !!pending} onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  )
}
