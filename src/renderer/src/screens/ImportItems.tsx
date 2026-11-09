import { useMemo, useRef, useState } from 'react'
import type { ImportRowResult, ImportSummary } from '../../../shared/types'
import { COLUMNS, ImportItem, TEMPLATE_ROWS, extraColumns, mapHeaders, rowToItem } from '../../../shared/itemImport'
import { api } from '../api'
import { readSpreadsheet, writeSpreadsheet } from '../spreadsheet'

type Step = 'pick' | 'preview' | 'done'

interface Parsed {
  fileName: string
  rowCount: number
  matched: string[] // recognised column headers
  unknown: string[] // ignored columns (no data in them)
  extras: string[] // other columns with data: kept on each item
  items: ImportItem[] // rows that converted cleanly
  clientErrors: ImportRowResult[] // rows with bad cell values
}

/** Bulk import items from Excel / CSV, with a preview before anything is saved. */
export default function ImportItems({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
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
      if (sheet.rows.length === 0) throw new Error('No item rows found. Row 1 should be the column headers.')
      const { map, unknown } = mapHeaders(sheet.headers)
      if (![...map.values()].some((c) => c.key === 'name' || c.key === 'sku' || c.key === 'barcode'))
        throw new Error('Could not find an "Item Name", "Item No." or "UPC" column. Download the template to see the expected headers.')

      const extras = extraColumns(unknown, sheet.rows.map((r) => r.values))
      const items: ImportItem[] = []
      const clientErrors: ImportRowResult[] = []
      const skuRows = new Map<string, number>()
      for (const r of sheet.rows) {
        const { item, errors } = rowToItem(r.values, map, r.rowNumber, extras)
        // The same Item No. twice in one file would overwrite the first item
        if (item.sku) {
          const first = skuRows.get(item.sku.toUpperCase())
          if (first) errors.push(`Item No. ${item.sku} is already used on row ${first} of this file`)
          else skuRows.set(item.sku.toUpperCase(), r.rowNumber)
        }
        if (errors.length)
          clientErrors.push({ row: r.rowNumber, name: String(item.name ?? ''), action: 'error', message: errors.join('; ') })
        else items.push(item)
      }
      const p: Parsed = {
        fileName: file.name,
        rowCount: sheet.rows.length,
        matched: [...map.values()].map((c) => c.header),
        unknown: unknown.filter((u) => !extras.includes(u)),
        extras,
        items,
        clientErrors
      }
      setParsed(p)
      setSummary(items.length ? await api.importProducts(items, { dryRun: true, updateExisting }) : null)
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
      setSummary(await api.importProducts(parsed.items, { dryRun: false, updateExisting }))
      setStep('done')
      onImported()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function downloadTemplate() {
    writeSpreadsheet('Diamond POS item import template.xlsx', [
      { name: 'Items', headers: COLUMNS.map((c) => c.header), rows: TEMPLATE_ROWS },
      {
        name: 'Instructions',
        headers: ['How to use this template'],
        widths: [110],
        rows: [
          'Fill in one item per row on the "Items" sheet. Only "Item Name" and "Reg Price" are required for new items.',
          'Existing items are matched by Item No. (or UPC if there is no Item No.) and updated.',
          'When updating, leave a cell blank to keep the current value.',
          'Prices and costs are dollar amounts before sales tax, e.g. 5.50',
          'Type: Inventory, Non-inventory or Service.   Tax: Tax or Non-taxable.   Yes/No columns: Yes or No.',
          'Format the UPC column as Text in Excel so leading zeros are kept.',
          'You can delete columns you do not need. Extra columns are ignored.'
        ].map((t) => ({ 'How to use this template': t }))
      }
    ])
  }

  const allResults = useMemo(() => {
    const rows = [...(summary?.results ?? []), ...(parsed?.clientErrors ?? [])].sort((a, b) => a.row - b.row)
    // Big files: show at most 1,000 rows (tick "problems only" to see every problem)
    return (errorsOnly ? rows.filter((r) => r.action === 'error') : rows).slice(0, 1000)
  }, [summary, parsed, errorsOnly])

  const errorCount = (summary?.errors ?? 0) + (parsed?.clientErrors.length ?? 0)
  const goodCount = (summary?.created ?? 0) + (summary?.updated ?? 0)

  return (
    <div className="modal-backdrop">
      <div className="item-dialog import-dialog" onKeyDown={(e) => e.key === 'Escape' && !busy && onClose()}>
        <div className="id-title">
          <span>Import Items from Excel</span>
          <button type="button" className="title-btn" onClick={onClose} disabled={busy} title="Close">
            ✕
          </button>
        </div>

        <div className="import-body">
          {step === 'pick' && (
            <div className="import-pick">
              <ol className="steps">
                <li>
                  Use a <b>QuickBooks Point of Sale inventory export</b> as it is, or download the template. Row 1 must be the column headers, such as{' '}
                  <b>Item Name, Item No., UPC, Department, Reg Price, On-Hand Qty</b>.
                </li>
                <li>Fill in one item per row and save the file (.xlsx, .xls or .csv).</li>
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
                Update existing items (matched by Item No., or UPC). Untick to only add new items.
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
                {parsed.extras.length > 0 && (
                  <div className="muted">
                    Also kept on each item (shown under "Other details" in the item window): {parsed.extras.join(', ')}
                  </div>
                )}
                {parsed.unknown.length > 0 && <div className="muted">Skipped (no data in them): {parsed.unknown.join(', ')}</div>}
              </div>
              {step === 'done' && (
                <div className="import-done">
                  ✓ Import complete: {summary?.created ?? 0} items added, {summary?.updated ?? 0} updated
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
                      <th>Item Name</th>
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
              {busy ? 'Importing… (this can take a minute)' : `Import ${goodCount} item${goodCount === 1 ? '' : 's'}`}
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
