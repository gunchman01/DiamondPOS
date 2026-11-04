import { useEffect, useState } from 'react'
import type { Product, ProductInput } from '../../../shared/types'
import { api } from '../api'
import { money, parseMoney } from '../format'

const empty = { name: '', sku: '', barcode: '', price: '', active: true }

/** Add and edit products. Changes are visible on every till immediately. */
export default function Products() {
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Product | 'new' | null>(null)
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')

  const load = () =>
    api
      .listProducts(search, true)
      .then(setProducts)
      .catch((e) => setError(e.message))

  useEffect(() => {
    load()
  }, [search])

  function open(p: Product | 'new') {
    setError('')
    setEditing(p)
    setForm(
      p === 'new'
        ? empty
        : { name: p.name, sku: p.sku ?? '', barcode: p.barcode ?? '', price: (p.priceCents / 100).toFixed(2), active: p.active }
    )
  }

  async function save() {
    const priceCents = parseMoney(form.price)
    if (isNaN(priceCents)) return setError('Enter a valid price, e.g. 4.50')
    const input: ProductInput = {
      name: form.name,
      sku: form.sku || null,
      barcode: form.barcode || null,
      priceCents,
      active: form.active
    }
    try {
      if (editing === 'new') await api.createProduct(input)
      else if (editing) await api.updateProduct(editing.id, input)
      setEditing(null)
      load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="page">
      <div className="row between">
        <h2>Products</h2>
        <button className="primary" onClick={() => open('new')}>
          + Add product
        </button>
      </div>
      <input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {error && !editing && <div className="error-text">{error}</div>}

      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>SKU</th>
            <th>Barcode</th>
            <th className="r">Price</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} onClick={() => open(p)} className={p.active ? 'clickable' : 'clickable muted'}>
              <td>{p.name}</td>
              <td>{p.sku}</td>
              <td>{p.barcode}</td>
              <td className="r">{money(p.priceCents)}</td>
              <td>{p.active ? 'Active' : 'Inactive'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <div className="modal-backdrop">
          <div className="modal form">
            <h2>{editing === 'new' ? 'Add product' : 'Edit product'}</h2>
            <label>
              Name
              <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              Price (incl. GST)
              <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </label>
            <label>
              SKU
              <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </label>
            <label>
              Barcode (click here and scan)
              <input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
            </label>
            <label className="check">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
              Active (available for sale)
            </label>
            {error && <div className="error-text">{error}</div>}
            <div className="row gap end">
              <button onClick={() => setEditing(null)}>Cancel</button>
              <button className="primary" onClick={save}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
