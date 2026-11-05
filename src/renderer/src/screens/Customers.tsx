import { useEffect, useState } from 'react'
import { customerDisplayName, type Customer } from '../../../shared/types'
import { api } from '../api'
import CustomerEditor from './CustomerEditor'

/** Customer List: search, add and edit customers / businesses. */
export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [error, setError] = useState('')

  const load = () =>
    api
      .listCustomers(search, showInactive)
      .then(setCustomers)
      .catch((e) => setError(e.message))

  useEffect(() => {
    const t = setTimeout(load, 150)
    return () => clearTimeout(t)
  }, [search, showInactive])

  return (
    <div className="page wide">
      <div className="row between">
        <h2>Customer List</h2>
        <button className="primary" onClick={() => setEditing('new')}>
          + New customer
        </button>
      </div>
      <div className="row gap">
        <input
          autoFocus
          placeholder="Search name, company, phone, email or Customer ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, width: 'auto' }}
        />
        <label className="check">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>
      {error && <div className="error-text">{error}</div>}

      <table className="table">
        <thead>
          <tr>
            <th>Customer ID</th>
            <th>Name</th>
            <th>Company / Contact</th>
            <th>Phone</th>
            <th>Mobile</th>
            <th>E-mail</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id} onClick={() => setEditing(c.id)} className={c.active ? 'clickable' : 'clickable muted'}>
              <td>{c.customerNo}</td>
              <td>
                <b>{customerDisplayName(c)}</b>
                {c.trackAsCompany && <span className="pill company-pill">Business</span>}
              </td>
              <td>{c.trackAsCompany ? [c.firstName, c.lastName].filter(Boolean).join(' ') : c.company}</td>
              <td>{c.phone}</td>
              <td>{c.mobile}</td>
              <td>{c.email}</td>
              <td>{c.customerType}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {customers.length === 0 && <p className="muted">No customers found.</p>}

      {editing !== null && (
        <CustomerEditor
          customerId={editing === 'new' ? null : editing}
          onSaved={load}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
