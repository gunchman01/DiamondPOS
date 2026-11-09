import { useEffect, useMemo, useState } from 'react'
import type { Product } from '../../../shared/types'
import { api } from '../api'
import { money } from '../format'
import TagPrintDialog from './TagPrintDialog'
import ItemEditor from './ItemEditor'
import { DELETE_EXPLAIN, deleteSummary } from '../deleteText'
import ImportItems from './ImportItems'
import { COLUMNS, extraHeadersOf, itemToRow } from '../../../shared/itemImport'
import { today } from '../format'
import { writeSpreadsheet } from '../spreadsheet'

const TYPE_LABEL: Record<Product['type'], string> = {
  inventory: 'Inventory',
  non_inventory: 'Non-inv.',
  service: 'Service'
}

/** Item List: every item, with Add / Edit opening the full item window. */
export default function Products({ startTags, onIntentDone }: { startTags?: boolean; onIntentDone?: () => void } = {}) {
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [quickOnly, setQuickOnly] = useState(false)
  const [editing, setEditing] = useState<Product | 'new' | null>(null)
  /** Print price tags dialog (with these items pre-filled) */
  /** Items ticked for Delete selected */
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [notice, setNotice] = useState('')
  const [tagging, setTagging] = useState<Product[] | null>(null)
  // Opened from "I want to… Print price tags"
  useEffect(() => {
    if (startTags) {
      setTagging([])
      onIntentDone?.()
    }
  }, [startTags])
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')

  // Export every item (including inactive) in the same layout the importer reads
  async function exportItems() {
    try {
      const all = await api.listAllProducts()
      writeSpreadsheet(`Diamond POS items ${today()}.xlsx`, [
        { name: 'Items', headers: [...COLUMNS.map((c) => c.header), ...extraHeadersOf(all)], rows: all.map(itemToRow) }
      ])
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const load = () =>
    api
      .listProducts(search, true)
      .then(setProducts)
      .catch((e) => setError(e.message))

  useEffect(() => {
    load()
  }, [search])

  // Suggestions for the editor's Department / Vendor / Quick Pick Group boxes
  const lists = useMemo(() => {
    const uniq = (vals: (string | null)[]) => [...new Set(vals.filter((v): v is string => !!v))].sort()
    return {
      departments: uniq(products.map((p) => p.department)),
      vendors: uniq(products.map((p) => p.vendor)),
      groups: uniq(products.map((p) => p.quickPickGroup))
    }
  }, [products])

  const shown = products.filter((p) => !quickOnly || p.quickPick)
  const allTicked = shown.length > 0 && shown.every((p) => selected.has(p.id))

  async function deleteSelected() {
    const ids = shown.filter((p) => selected.has(p.id)).map((p) => p.id)
    if (!ids.length) return
    if (!confirm(`Delete ${ids.length} item${ids.length === 1 ? '' : 's'}?\n\n${DELETE_EXPLAIN}`)) return
    setError('')
    try {
      const r = await api.deleteProducts(ids)
      setNotice(deleteSummary(r, 'item'))
      setSelected(new Set())
      load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="page wide">
      <div className="row between">
        <h2>Item List</h2>
        <div className="row gap">
          <button onClick={() => setImporting(true)}>Import from Excel</button>
          <button onClick={exportItems}>Export to Excel</button>
          <button onClick={() => setTagging([])}>🏷 Print tags</button>
          {selected.size > 0 && (
            <button className="danger" onClick={deleteSelected}>
              🗑 Delete selected ({selected.size})
            </button>
          )}
          <button className="primary" onClick={() => setEditing('new')}>
            + Add item
          </button>
        </div>
      </div>
      <div className="row gap">
        <input
          placeholder="Search name, item #, UPC, ALU or department…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, width: 'auto' }}
        />
        <label className="check">
          <input type="checkbox" checked={quickOnly} onChange={(e) => setQuickOnly(e.target.checked)} />
          Quick Picks only
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
                checked={allTicked}
                onChange={(e) => setSelected(e.target.checked ? new Set(shown.map((p) => p.id)) : new Set())}
              />
            </th>
            <th>Item No.</th>
            <th>Name</th>
            <th>Department</th>
            <th>Type</th>
            <th>UPC</th>
            <th className="r">On Hand</th>
            <th className="r">Price</th>
            <th>Quick Pick</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((p) => (
            <tr key={p.id} onClick={() => setEditing(p)} className={p.active ? 'clickable' : 'clickable muted'}>
              <td className="sel-col" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={(e) => {
                    const next = new Set(selected)
                    if (e.target.checked) next.add(p.id)
                    else next.delete(p.id)
                    setSelected(next)
                  }}
                />
              </td>
              <td>{p.sku}</td>
              <td>{p.name}</td>
              <td>{p.department}</td>
              <td>{TYPE_LABEL[p.type]}</td>
              <td>{p.barcode}</td>
              <td className={p.type === 'inventory' && p.reorderPoint !== null && p.onHand <= p.reorderPoint ? 'r low' : 'r'}>
                {p.type === 'inventory' ? p.onHand : ''}
              </td>
              <td className="r">{money(p.priceCents)}</td>
              <td className="qp-cell">{p.quickPick ? '✓' : ''}</td>
              <td>{p.active ? 'Active' : 'Inactive'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {shown.length === 0 && <p className="muted">No items found.</p>}

      {importing && <ImportItems onClose={() => setImporting(false)} onImported={load} />}

      {tagging && <TagPrintDialog initial={tagging} onClose={() => setTagging(null)} />}
      {editing && (
        <ItemEditor
          item={editing === 'new' ? null : editing}
          departments={lists.departments}
          vendors={lists.vendors}
          groups={lists.groups}
          onSaved={load}
          onDeleted={(msg) => {
            setEditing(null)
            setNotice(msg)
            load()
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
