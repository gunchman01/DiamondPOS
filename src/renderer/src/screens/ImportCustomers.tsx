import { useMemo, useRef, useState } from 'react'
import type { ImportRowResult, ImportSummary } from '../../../shared/types'
import { CUSTOMER_COLUMNS, customerToRow, importName, mapCustomerHeaders, rowToCustomer, type ImportCustomer } from '../../../shared/customerImport'
import type { Customer } from '../../../shared/types'
import { api } from '../api'
import { readSpreadsheet, writeSpreadsheet } from '../spreadsheet'

type Step = 'pick' | 'preview' | 'done'

interface Parsed {
  fileName: string
  rowCount: number
  matched: string[] // recognised column headers
  unknown: string[] // ignored columns
  items: ImportCustomer[] // rows that converted cleanly
  clientErrors: ImportRowResult[] // rows with bad cell values
}

/** Bulk import customers from Excel / CSV (e.g. a QuickBooks POS customer export), with a preview before anything is saved. */
export default function ImportCustomers({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [step, setStep] = useState<Step>('pick')
  const [updateExisting, setUpdateExisting] = useState(true)
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [errorsOnly, setErrorsOnly] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function onFile(file: File | undefined) {
    if (!file) return
    setError('')
    setBusy(true)
    try {
      const sheet = await readSpreadsheet(file)
      if (sheet.rows.length === 0) throw new Error('No customer rows found. Row 1 should be the column headers.')
      const { map, unknown } = mapCustomerHeaders(sheet.headers)
      if (![...map.values()].some((c) => c.key === 'lastName' || c.key === 'firstName' || c.key === 'company'))
        throw new Error('Could not find a "Last Name", "First Name" or "Company" column. Download the template to see the expected headers.')

      const items: ImportCustomer[] = []
      const clientErrors: ImportRowResult[] = []
      for (const r of sheet.rows) {
        const { customer, errors } = rowToCustomer(r.values, map, r.rowNumber)
        if (errors.length) clientErrors.push({ row: r.rowNumber, name: importName(customer), action: 'error', message: errors.join('; ') })
        else items.push(customer)
      }
      const p: Parsed = {
        fileName: file.name,
        rowCount: sheet.rows.length,
        matched: [...map.values()].map((c) => c.header),
        unknown,
        items,
        clientErrors
      }
      setParsed(p)
      setSummary(items.length ? await api.importCustomers(items, { dryRun: true, updateExisting }) : null)
      setStep('preview')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function runImport() {
    if (!parsed) return
    setBusy(true)
    setError('')
    try {
      setSummary(await api.importCustomers(parsed.items, { dryRun: false, updateExisting }))
      setStep('done')
      onImported()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function downloadTemplate() {
    const example = {
      id: 0, company: '', lastName: 'Smith', firstName: 'John', title: 'Mr.', street: '123 Main St', street2: '', city: 'Claremore', region: 'OK',
      postcode: '74017', phone: '918-555-0101', mobile: '', altContact: '', altPhone: '', discountPct: null, taxExempt: true, email: 'john@example.com',
      okToEmail: true, pastDueCents: 0, notes: '', customField1: 'EXM-12345678-03', customerNo: '', customerType: 'Retail', taxExemptId: 'EXM-12345678-03',
      taxExemptExpires: '2027-06-30', taxExemptCardCopied: true, active: true
    } as unknown as Customer
    writeSpreadsheet('Diamond POS customer import template.xlsx', [
      { name: 'Customers', headers: CUSTOMER_COLUMNS.map((c) => c.header), rows: [customerToRow(example)] },
      {
        name: 'Instructions',
        headers: ['How to use this template'],
        widths: [110],
        rows: [
          'One customer per row. A QuickBooks Point of Sale customer export can be imported as it is (same column names).',
          'Each row needs a Last Name, First Name or Company.',
          'Existing customers are matched by Customer ID, or by the same name, company and Phone 1, and updated. Leave a cell blank to keep the current value.',
          'Tax-exempt: "Exempt" (or Yes) makes the customer tax exempt. Custom Field 1 is used as the Farm Tax ID when there is no Farm Tax ID column.',
          'EMail cells that are not email addresses are kept in the Notes. EMail Notification: Yes or No.',
          'Past Due is an amount (negative = credit). Tax ID Expires is a date.',
          'You can delete columns you do not need. Extra columns are ignored.'
        ].map((t) => ({ 'How to use this template': t }))
      }
    ])
  }


  const allResults = useMemo(() => {
    const rows = [...(summary?.results ?? []), ...(parsed?.clientErrors ?? [])].sort((a, b) => a.row - b.row)
    // Big files: show problems first, and at most 1,000 rows
    return (errorsOnly ? rows.filter((r) => r.action === 'error') : rows).slice(0, 1000)
  }, [summary, parsed, errorsOnly])

  const errorCount = (summary?.errors ?? 0) + (parsed?.clientErrors.length ?? 0)
  const goodCount = (summary?.created ?? 0) + (summary?.updated ?? 0)

  return (
    <div className="modal-backdrop">
      <div className="item-dialog import-dialog" onKeyDown={(e) => e.key === 'Escape' && !busy && onClose()}>
        <div className="id-title">
          <span>Import Customers from Excel</span>
          <button type="button" className="title-btn" onClick={onClose} disabled={busy} title="Close">
            ✕
          </button>
        </div>

        <div className="import-body">
          {step === 'pick' && (
            <div className="import-pick">
              <ol className="steps">
                <li>
                  Use a <b>QuickBooks Point of Sale customer export</b> as it is, or download the template. Row 1 must be the column
                  headers, such as <b>Company, Last Name, First Name, Street, City, State, ZIP, Phone 1, EMail, Tax-exempt</b>.
                </li>
                <li>One customer per row, saved as .xlsx, .xls or .csv.</li>
                <li>Choose the file below. You'll see a preview before anything is saved.</li>
              </ol>
              <div className="row gap">
                <button onClick={downloadTemplate}>⬇ Download template</button>
                <button className="primary" disabled={busy} onClick={() => fileRef.current?.click()}>
                  {busy ? 'Reading file…' : 'Choose spreadsheet…'}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  hidden
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
              </div>
              <label className="check">
                <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
                Update existing customers (matched by Customer ID, or the same name, company and phone). Untick to only add new
                customers.
              </label>
            </div>
          )}

          {step !== 'pick' && parsed && (
            <>
              <div className="import-summary">
                <div>
                  <b>{parsed.fileName}</b> · {parsed.rowCount} row{parsed.rowCount === 1 ? '' : 's'}
                </div>
                <div className="badges">
                  <span className="badge new">{summary?.created ?? 0} new</span>
                  <span className="badge upd">{summary?.updated ?? 0} update{summary?.updated === 1 ? '' : 's'}</span>
                  <span className="badge err">{errorCount} with problems</span>
                </div>
              </div>
              <div className="import-cols small">
                <span className="muted">Columns used: </span>
                {parsed.matched.join(', ')}
                {parsed.unknown.length > 0 && (
                  <div className="muted">Ignored columns (not recognised): {parsed.unknown.join(', ')}</div>
                )}
              </div>
              {step === 'done' && (
                <div className="import-done">
                  ✓ Import complete: {summary?.created ?? 0} customers added, {summary?.updated ?? 0} updated
                  {errorCount ? `, ${errorCount} skipped` : ''}.
                </div>
              )}
              <div className="row between">
                <span className="small muted">
                  {step === 'preview' ? 'Preview: nothing has been saved yet.' : 'Results'}
                  {(summary?.results.length ?? 0) > 1000 ? ' Showing the first 1,000 rows.' : ''}
                </span>
                <label className="check small">
                  <input type="checkbox" checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)} />
                  Show problems only
                </label>
              </div>
              <div className="grid-wrap import-results">
                <table className="grid">
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>Row</th>
                      <th>Customer</th>
                      <th style={{ width: 110 }}>Result</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allResults.map((r) => (
                      <tr key={`${r.row}-${r.action}`}>
                        <td className="dim">{r.row}</td>
                        <td>{r.name}</td>
                        <td>
                          <span className={`badge ${r.action === 'create' ? 'new' : r.action === 'update' ? 'upd' : 'err'}`}>
                            {r.action === 'create' ? 'New' : r.action === 'update' ? 'Update' : 'Problem'}
                          </span>
                        </td>
                        <td className={r.action === 'error' ? 'err-text' : 'dim'}>{r.message ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {allResults.length === 0 && <div className="grid-empty">Nothing to show</div>}
              </div>
            </>
          )}
          {error && <div className="error-text">{error}</div>}
        </div>

        <div className="id-foot">
          {step === 'preview' && (
            <button onClick={() => setStep('pick')} disabled={busy}>
              ← Choose another file
            </button>
          )}
          <div className="id-msg" />
          {step === 'preview' && (
            <button className="primary" disabled={busy || goodCount === 0} onClick={runImport}>
              {busy ? 'Importing… (this can take a minute)' : `Import ${goodCount} customer${goodCount === 1 ? '' : 's'}`}
            </button>
          )}
          <button onClick={onClose} disabled={busy}>
            {step === 'done' ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}
