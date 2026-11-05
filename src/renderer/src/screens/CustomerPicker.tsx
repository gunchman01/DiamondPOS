import { useEffect, useState } from 'react'
import { customerDisplayName, type Customer } from '../../../shared/types'
import { api } from '../api'
import CustomerEditor from './CustomerEditor'

/**
 * Find a customer for the current sale (search by name, company, phone, email
 * or Customer ID), or add a new one on the spot.
 */
export default function CustomerPicker(props: { onPick: (c: Customer) => void; onCancel: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Customer[]>([])
  const [active, setActive] = useState(0)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const t = setTimeout(() => {
      api
        .listCustomers(query)
        .then((r) => {
          setResults(r)
          setActive(0)
          setError('')
        })
        .catch((e) => setError(e.message))
    }, 150)
    return () => clearTimeout(t)
  }, [query])

  // Use what was typed to pre-fill a new customer: digits → phone, words → first / last name
  function prefill() {
    const q = query.trim()
    if (!q) return {}
    if (/^[\d\s()+-]{5,}$/.test(q)) return { phone: q }
    if (q.includes('@')) return { email: q }
    const parts = q.split(/\s+/)
    return parts.length > 1 ? { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] } : { lastName: q }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (adding) return
    if (e.key === 'Escape') props.onCancel()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault()
      props.onPick(results[active])
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal find picker" onKeyDown={onKeyDown}>
        <h2>Select customer</h2>
        <div className="row gap">
          <input
            autoFocus
            placeholder="Name, company, phone, email or Customer ID…  (↑ ↓ Enter)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1, width: 'auto' }}
          />
          <button className="primary" onClick={() => setAdding(true)}>
            + New customer
          </button>
        </div>
        {error && <div className="error-text">{error}</div>}
        <div className="grid-wrap find-results">
          <table className="grid">
            <thead>
              <tr>
                <th style={{ width: 100 }}>Customer ID</th>
                <th>Name</th>
                <th>Phone</th>
                <th>E-mail</th>
              </tr>
            </thead>
            <tbody>
              {results.map((c, i) => (
                <tr
                  key={c.id}
                  className={i === active ? 'selected' : ''}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => props.onPick(c)}
                >
                  <td className="dim">{c.customerNo}</td>
                  <td>
                    {customerDisplayName(c)}
                    {c.trackAsCompany && <span className="pill company-pill">Business</span>}
                    {!c.trackAsCompany && c.company && <span className="dim"> · {c.company}</span>}
                  </td>
                  <td className="dim">{c.phone || c.mobile}</td>
                  <td className="dim">{c.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {results.length === 0 && (
            <div className="grid-empty">
              No customers found. <button onClick={() => setAdding(true)}>Add “{query || 'new customer'}”</button>
            </div>
          )}
        </div>
        <div className="row between">
          <span className="muted small">{results.length} customer(s)</span>
          <button onClick={props.onCancel}>Close</button>
        </div>
      </div>

      {adding && (
        <CustomerEditor
          customerId={null}
          single
          prefill={prefill()}
          onSaved={(c) => props.onPick(c)}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  )
}
