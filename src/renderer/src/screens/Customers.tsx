import { useEffect, useState } from 'react'
import { customerDisplayName, type Customer } from '../../../shared/types'
import { api } from '../api'
import CustomerEditor from './CustomerEditor'
import ImportCustomers from './ImportCustomers'
import { DELETE_EXPLAIN, deleteSummary } from '../deleteText'
import { CUSTOMER_COLUMNS, customerToRow } from '../../../shared/customerImport'
import { writeSpreadsheet } from '../spreadsheet'
import { today } from '../format'
import TaxExemptBadge from '../TaxExemptBadge'

/** Customer List: search, add and edit customers / businesses. */
export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  /** Customers ticked for Delete selected */
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [notice, setNotice] = useState('')

  async function deleteSelected() {
    const ids = customers.filter((c) => selected.has(c.id)).map((c) => c.id)
    if (!ids.length) return
    if (!confirm(`Delete ${ids.length} customer${ids.length === 1 ? '' : 's'}?\n\n${DELETE_EXPLAIN}`)) return
    setError('')
    try {
      const r = await api.deleteCustomers(ids)
      setNotice(deleteSummary(r, 'customer'))
      setSelected(new Set())
      load()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const [exporting, setExporting] = useState(false)

  /** Every customer to Excel, in the QuickBooks POS column layout (+ Diamond POS columns) */
  async function exportCustomers() {
    setExporting(true)
    setError('')
    try {
      const all = await api.allCustomers()
      writeSpreadsheet(`Diamond POS customers ${today()}.xlsx`, [
        { name: 'Customers', headers: CUSTOMER_COLUMNS.map((c) => c.header), rows: all.map(customerToRow) }
      ])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setExporting(false)
    }
  }

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
        <div className="row gap">
          <button onClick={() => setImporting(true)}>Import from Excel</button>
          <button onClick={exportCustomers} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export to Excel'}
          </button>
          {selected.size > 0 && (
            <button className="danger" onClick={deleteSelected}>
              🗑 Delete selected ({selected.size})
            </button>
          )}
          <button className="primary" onClick={() => setEditing('new')}>
            + New customer
          </button>
        </div>
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
      {notice && <div className="ok-text">{notice}</div>}

      <table className="table">
        <thead>
          <tr>
            <th className="sel-col">
              <input
                type="checkbox"
                title="Tick all shown"
                checked={customers.length > 0 && customers.every((c) => selected.has(c.id))}
                onChange={(e) => setSelected(e.target.checked ? new Set(customers.map((c) => c.id)) : new Set())}
              />
            </th>
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
              <td className="sel-col" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={(e) => {
                    const next = new Set(selected)
                    if (e.target.checked) next.add(c.id)
                    else next.delete(c.id)
                    setSelected(next)
                  }}
                />
              </td>
              <td>{c.customerNo}</td>
              <td>
                <b>{customerDisplayName(c)}</b>
                {c.trackAsCompany && <span className="pill company-pill">Business</span>}{' '}
                <TaxExemptBadge customer={c} />
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
          onDeleted={(msg) => {
            setEditing(null)
            setNotice(msg)
            load()
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {importing && <ImportCustomers onClose={() => setImporting(false)} onImported={load} />}
    </div>
  )
}
