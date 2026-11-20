import { confirmAction } from '../dialogs'
import { useEffect, useMemo, useState } from 'react'
import type { Product } from '../../../shared/types'
import { api } from '../api'
import { ITEM_COLUMNS, DEFAULT_ITEM_COLUMNS, itemColumnIds } from '../itemColumns'
import { ColumnMenu } from '../saleColumns'
import TagPrintDialog from './TagPrintDialog'
import ItemEditor from './ItemEditor'
import { DELETE_EXPLAIN, deleteSummary } from '../deleteText'
import ImportItems from './ImportItems'
import { COLUMNS, extraHeadersOf, itemToRow } from '../../../shared/itemImport'
import { today } from '../format'
import { writeSpreadsheet } from '../spreadsheet'

/** Item List: every item, with Add / Edit opening the full item window. */
export default function Products({ startTags, onIntentDone }: { startTags?: boolean; onIntentDone?: () => void } = {}) {
  const columnKey = 'diamondpos:item-list-columns'
  const [colIds, setColIds] = useState<string[]>(() => { try { return itemColumnIds(JSON.parse(localStorage.getItem(columnKey) ?? 'null')) } catch { return [...DEFAULT_ITEM_COLUMNS] } })
  const [colMenu, setColMenu] = useState<{ x: number; y: number; target: string | null } | null>(null)
  const columns = colIds.map((id) => ITEM_COLUMNS.find((c) => c.id === id)!).filter(Boolean)
  function saveColumns(ids: string[]) { const next = itemColumnIds(ids); setColIds(next); try { localStorage.setItem(columnKey, JSON.stringify(next)) } catch { setError('Column choices could not be saved on this computer.') } }
  const [deleting, setDeleting] = useState(false)
  const [vendorNames, setVendorNames] = useState<string[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
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

  useEffect(() => { if (editing) api.vendors().then((vs) => setVendorNames(vs.map((v) => v.companyName))).catch((e) => setError(e.message)) }, [editing])

  // Suggestions for the editor's Department / Vendor boxes
  const lists = useMemo(() => {
    const uniq = (vals: (string | null)[]) => [...new Set(vals.filter((v): v is string => !!v))].sort()
    return {
      departments: uniq(products.map((p) => p.department)),
      vendors: uniq(products.map((p) => p.vendor))
    }
  }, [products])

  const shown = products
  const allTicked = shown.length > 0 && shown.every((p) => selected.has(p.id))

  async function deleteSelected() {
    const ids = [...selected]
    if (!ids.length || deleting) return
    if (!(await confirmAction(`Delete ${ids.length} item${ids.length === 1 ? '' : 's'}?\n\n${DELETE_EXPLAIN}`))) return
    setError('')
    setDeleting(true)
    try {
      const r = await api.deleteProducts(ids)
      setNotice(deleteSummary(r, 'item'))
      setSelected(new Set())
      load()
    } catch (e) {
      setError((e as Error).message)
    } finally { setDeleting(false) }
  }

  async function selectEntireList() {
    setDeleting(true); setError('')
    try { const all = await api.listAllProducts(); if (all.length > 50000) throw new Error('Select smaller batches of up to 50,000 items.'); setSelected(new Set(all.map((p) => p.id))); setNotice(`Selected all ${all.length} items, including inactive and items outside the current search.`) } catch(e) { setError((e as Error).message) } finally { setDeleting(false) }
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
            <button className="danger" onClick={deleteSelected} disabled={deleting}>
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
      </div>
      <div className="row gap list-tools">
        <button disabled={deleting || shown.length === 0} onClick={() => setSelected(new Set(shown.map((p) => p.id)))}>Select shown ({shown.length})</button>
        <button disabled={deleting} onClick={selectEntireList}>Select entire Item List…</button>
        <button disabled={deleting || selected.size === 0} onClick={() => setSelected(new Set())}>Clear selection</button>
        <span className="small muted">{selected.size} selected across all searches. Up to 500 rows shown. Export / back up before deleting.</span>
        <button onClick={(e) => setColMenu({ x: e.clientX, y: e.clientY, target: null })}>Columns…</button>
      </div>
      <p className="small muted">Right-click a column heading to choose columns or move it left/right. Choices are saved on this computer.</p>
      {error && <div className="error-text">{error}</div>}
      {notice && <div className="ok-text">{notice}</div>}

      <div className="item-list-scroll"><table className="table">
        <thead onContextMenu={(e) => { e.preventDefault(); setColMenu({ x: e.clientX, y: e.clientY, target: (e.target as HTMLElement).closest('th')?.dataset.col ?? null }) }}>
          <tr>
            <th className="sel-col">
              <input
                type="checkbox"
                title="Tick all shown"
                checked={allTicked}
                onChange={(e) => setSelected(e.target.checked ? new Set(shown.map((p) => p.id)) : new Set())}
              />
            </th>
            {columns.map((c) => <th key={c.id} data-col={c.id} className={c.num ? 'r' : ''} title="Right-click to choose columns">{c.label}</th>)}
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
              {columns.map((c) => <td key={c.id} className={c.id === 'onHand' && p.type === 'inventory' && p.reorderPoint !== null && p.onHand <= p.reorderPoint ? 'r low' : c.num ? 'r' : ''}>{c.cell(p)}</td>)}
            </tr>
          ))}
        </tbody>
      </table></div>
      {shown.length === 0 && <p className="muted">No items found.</p>}

      {colMenu && <ColumnMenu {...colMenu} shown={colIds} columns={ITEM_COLUMNS} defaults={DEFAULT_ITEM_COLUMNS} onChange={saveColumns} onClose={() => setColMenu(null)} />}
      {importing && <ImportItems onClose={() => setImporting(false)} onImported={load} />}

      {tagging && <TagPrintDialog initial={tagging} onClose={() => setTagging(null)} />}
      {editing && (
        <ItemEditor
          item={editing === 'new' ? null : editing}
          departments={lists.departments}
          vendors={vendorNames}
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
