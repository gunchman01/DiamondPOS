import { useEffect, useMemo, useRef, useState } from 'react'
import type { BootInfo, PaymentMethod, Product, Sale, StoreSettings } from '../../../shared/types'
import { api } from '../api'
import { money, parseMoney } from '../format'
import { receiptHtml } from '../receipt'

interface CartLine {
  product: Product
  qty: number
}

type Message = { kind: 'error' | 'info'; text: string } | null

/**
 * Register-style sale screen:
 *   - Receipt grid (left): the items on the current sale
 *   - All Items (middle): every product, searchable; click to add
 *   - Totals + tender (right)
 *   - Function-key bar (bottom), also driven by the keyboard
 */
export default function Sell({ boot }: { boot: BootInfo }) {
  const [cart, setCart] = useState<CartLine[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [settings, setSettings] = useState<StoreSettings | null>(null)
  const [itemSearch, setItemSearch] = useState('')
  const [code, setCode] = useState('')
  const [paying, setPaying] = useState<PaymentMethod | null>(null)
  const [editingQty, setEditingQty] = useState(false)
  const [lastSale, setLastSale] = useState<Sale | null>(null)
  const [message, setMessage] = useState<Message>(null)
  const scanRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const loadItems = () => {
    Promise.all([api.listProducts(), api.getSettings()])
      .then(([p, s]) => {
        setProducts(p)
        setSettings(s)
      })
      .catch((e) => setMessage({ kind: 'error', text: e.message }))
  }
  useEffect(loadItems, [])

  // ----- derived values -----
  const total = cart.reduce((s, l) => s + l.product.priceCents * l.qty, 0)
  const itemCount = cart.reduce((s, l) => s + l.qty, 0)
  const rate = settings?.taxRate ?? 0.15
  const gst = Math.round((total * rate) / (1 + rate))
  const selectedLine = cart.find((l) => l.product.id === selectedId) ?? null

  const filtered = useMemo(() => {
    const q = itemSearch.trim().toLowerCase()
    if (!q) return products
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q) ||
        (p.barcode ?? '').includes(q)
    )
  }, [products, itemSearch])

  const focusScan = () => setTimeout(() => scanRef.current?.focus(), 0)

  // ----- cart actions -----
  function addToCart(p: Product, qty = 1) {
    setCart((c) => {
      const existing = c.find((l) => l.product.id === p.id)
      if (existing) return c.map((l) => (l === existing ? { ...l, qty: l.qty + qty } : l))
      return [...c, { product: p, qty }]
    })
    setSelectedId(p.id)
    setLastSale(null)
    setMessage(null)
    setCode('')
    focusScan()
  }

  function setQty(id: number, qty: number) {
    setCart((c) => c.map((l) => (l.product.id === id ? { ...l, qty } : l)).filter((l) => l.qty > 0))
    if (qty <= 0) setSelectedId(null)
  }

  function removeSelected() {
    if (selectedId === null) return
    setQty(selectedId, 0)
    focusScan()
  }

  function clearSale() {
    if (cart.length && !confirm('Clear all items from this sale?')) return
    setCart([])
    setSelectedId(null)
    focusScan()
  }

  function startPayment(method: PaymentMethod) {
    if (!cart.length) return
    setPaying(method)
  }

  // Barcode scanners "type" the code and press Enter
  async function onScan(e: React.FormEvent) {
    e.preventDefault()
    const value = code.trim()
    if (!value) return
    try {
      addToCart(await api.lookupProduct(value))
    } catch {
      const q = value.toLowerCase()
      const matches = products.filter((p) => p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase() === q)
      if (matches.length === 1) addToCart(matches[0])
      else {
        setItemSearch(value)
        setCode('')
        setMessage(
          matches.length
            ? { kind: 'info', text: `${matches.length} items match "${value}". Pick one from All Items.` }
            : { kind: 'error', text: `No item matches "${value}"` }
        )
      }
    }
  }

  async function completeSale(method: PaymentMethod, amountCents: number, reference: string) {
    const sale = await api.createSale({
      tillName: boot.config.tillName,
      items: cart.map((l) => ({ productId: l.product.id, qty: l.qty })),
      payments: [{ method, amountCents, reference: reference || undefined }]
    })
    setPaying(null)
    setCart([])
    setSelectedId(null)
    setLastSale(sale)
    setMessage({ kind: 'info', text: `Sale #${sale.id} saved` })
    focusScan()
  }

  async function printReceipt(sale: Sale) {
    try {
      const s = settings ?? (await api.getSettings())
      await window.pos.printReceipt(receiptHtml(sale, s))
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message })
    }
  }

  // ----- keyboard shortcuts (F-keys) -----
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {})
  keyHandler.current = (e: KeyboardEvent) => {
    if (paying || editingQty) return
    const inInput = (e.target as HTMLElement)?.tagName === 'INPUT'
    const actions: Record<string, () => void> = {
      F2: () => searchRef.current?.focus(),
      F3: () => selectedLine && setEditingQty(true),
      F4: removeSelected,
      F6: clearSale,
      F7: () => startPayment('cash'),
      F8: () => startPayment('card'),
      Escape: () => {
        setItemSearch('')
        focusScan()
      }
    }
    if (e.key === 'Delete' && !inInput) actions.Delete = removeSelected
    const action = actions[e.key]
    if (action) {
      e.preventDefault()
      action()
    }
  }
  useEffect(() => {
    const listener = (e: KeyboardEvent) => keyHandler.current?.(e)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  return (
    <div className="register">
      {/* ---------- Header strip ---------- */}
      <div className="reg-head">
        <h2>{cart.length ? 'Sale in progress' : 'New Sale'}</h2>
        <div className="field">
          Store<b>{settings?.storeName ?? '—'}</b>
        </div>
        <div className="field">
          Till<b>{boot.config.tillName}</b>
        </div>
        <div className="field">
          Last receipt<b>{lastSale ? `#${lastSale.id}` : '—'}</b>
        </div>
        {message && <div className={`msg ${message.kind}`}>{message.text}</div>}
      </div>

      {/* ---------- Receipt (current sale) ---------- */}
      <section className="panel receipt">
        <div className="panel-title">
          <span>Receipt</span>
          <span className="count">
            {cart.length} line{cart.length === 1 ? '' : 's'} · {itemCount} item{itemCount === 1 ? '' : 's'}
          </span>
        </div>
        <div className="grid-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th style={{ width: 110 }}>Item #</th>
                <th>Description</th>
                <th className="num" style={{ width: 60 }}>
                  Qty
                </th>
                <th className="num" style={{ width: 90 }}>
                  Price
                </th>
                <th className="num" style={{ width: 100 }}>
                  Ext. Price
                </th>
              </tr>
            </thead>
            <tbody>
              {cart.map((l, i) => (
                <tr
                  key={l.product.id}
                  className={l.product.id === selectedId ? 'selected' : ''}
                  onClick={() => setSelectedId(l.product.id)}
                  onDoubleClick={() => {
                    setSelectedId(l.product.id)
                    setEditingQty(true)
                  }}
                >
                  <td className="dim">{i + 1}</td>
                  <td className="dim">{l.product.sku ?? ''}</td>
                  <td>{l.product.name}</td>
                  <td className="num">{l.qty}</td>
                  <td className="num">{money(l.product.priceCents)}</td>
                  <td className="num">{money(l.product.priceCents * l.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {cart.length === 0 && (
            <div className="grid-empty">Scan a barcode, type an item # below, or click an item in All Items.</div>
          )}
        </div>
        <div className="line-actions">
          <button disabled={!selectedLine} onClick={() => selectedLine && setQty(selectedLine.product.id, selectedLine.qty - 1)}>
            − 1
          </button>
          <button disabled={!selectedLine} onClick={() => selectedLine && addToCart(selectedLine.product)}>
            + 1
          </button>
          <button disabled={!selectedLine} onClick={() => setEditingQty(true)}>
            Change qty
          </button>
          <button disabled={!selectedLine} className="danger" onClick={removeSelected}>
            Remove line
          </button>
        </div>
        <form className="scanbar" onSubmit={onScan}>
          <label htmlFor="scan">Item # / Barcode</label>
          <input
            id="scan"
            ref={scanRef}
            autoFocus
            autoComplete="off"
            placeholder="Scan or type, then press Enter"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button type="submit" className="primary">
            Add
          </button>
        </form>
      </section>

      {/* ---------- All items ---------- */}
      <section className="panel items">
        <div className="panel-title">
          <span>All Items</span>
          <span className="count">
            {filtered.length} of {products.length}
          </span>
        </div>
        <div className="search-row">
          <input
            ref={searchRef}
            placeholder="Search name, item # or barcode  (F2)"
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filtered.length > 0) addToCart(filtered[0])
            }}
          />
          <button onClick={loadItems} title="Reload items from the server">
            ↻
          </button>
        </div>
        <div className="grid-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th style={{ width: 100 }}>Item #</th>
                <th>Description</th>
                <th className="num" style={{ width: 90 }}>
                  Price
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} onClick={() => addToCart(p)} title="Click to add to sale">
                  <td className="dim">{p.sku ?? ''}</td>
                  <td>{p.name}</td>
                  <td className="num">{money(p.priceCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="grid-empty">No items found</div>}
        </div>
      </section>

      {/* ---------- Totals + tender ---------- */}
      <section className="panel totals">
        <div className="panel-title">
          <span>Totals</span>
        </div>
        <div className="totals-body">
          <div className="tline">
            <span>Items</span>
            <span>{itemCount}</span>
          </div>
          <div className="tline">
            <span>Subtotal</span>
            <span>{money(total)}</span>
          </div>
          <div className="tline muted">
            <span>GST included ({Math.round(rate * 1000) / 10}%)</span>
            <span>{money(gst)}</span>
          </div>
          <div className="tbox">
            <span>Total</span>
            <strong>{money(total)}</strong>
          </div>

          {lastSale && cart.length === 0 && (
            <div className="last-sale">
              <div>
                <b>Sale #{lastSale.id} complete</b> · {money(lastSale.totalCents)}
              </div>
              {lastSale.changeCents > 0 && <div className="change">Change due: {money(lastSale.changeCents)}</div>}
              <button onClick={() => printReceipt(lastSale)}>Print receipt</button>
            </div>
          )}

          <div className="tender">
            <button className="primary" disabled={!cart.length} onClick={() => startPayment('cash')}>
              <span>Cash</span>
              <kbd>F7</kbd>
            </button>
            <button className="primary" disabled={!cart.length} onClick={() => startPayment('card')}>
              <span>Card (terminal)</span>
              <kbd>F8</kbd>
            </button>
          </div>
        </div>
      </section>

      {/* ---------- Function keys ---------- */}
      <div className="fkeys">
        <button className="fkey" onClick={() => searchRef.current?.focus()}>
          <kbd>F2</kbd> Find item
        </button>
        <button className="fkey" disabled={!selectedLine} onClick={() => setEditingQty(true)}>
          <kbd>F3</kbd> Quantity
        </button>
        <button className="fkey" disabled={!selectedLine} onClick={removeSelected}>
          <kbd>F4</kbd> Remove line
        </button>
        <button className="fkey" disabled={!cart.length} onClick={clearSale}>
          <kbd>F6</kbd> Clear sale
        </button>
        <button className="fkey spacer" disabled={!lastSale} onClick={() => lastSale && printReceipt(lastSale)}>
          Reprint last receipt
        </button>
      </div>

      {editingQty && selectedLine && (
        <QtyDialog
          line={selectedLine}
          onCancel={() => {
            setEditingQty(false)
            focusScan()
          }}
          onSave={(qty) => {
            setQty(selectedLine.product.id, qty)
            setEditingQty(false)
            focusScan()
          }}
        />
      )}

      {paying && (
        <PaymentDialog
          method={paying}
          totalCents={total}
          onCancel={() => {
            setPaying(null)
            focusScan()
          }}
          onConfirm={completeSale}
        />
      )}
    </div>
  )
}

function QtyDialog(props: { line: CartLine; onCancel: () => void; onSave: (qty: number) => void }) {
  const [text, setText] = useState(String(props.line.qty))
  const qty = Number(text)
  const valid = Number.isInteger(qty) && qty >= 0 && qty <= 9999
  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) props.onSave(qty)
        }}
        onKeyDown={(e) => e.key === 'Escape' && props.onCancel()}
      >
        <h2>Change quantity</h2>
        <div>{props.line.product.name}</div>
        <label>
          Quantity (0 removes the line)
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} onFocus={(e) => e.target.select()} />
        </label>
        <div className="row gap end">
          <button type="button" onClick={props.onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!valid}>
            OK
          </button>
        </div>
      </form>
    </div>
  )
}

function PaymentDialog(props: {
  method: PaymentMethod
  totalCents: number
  onCancel: () => void
  onConfirm: (method: PaymentMethod, amountCents: number, reference: string) => Promise<void>
}) {
  const { method, totalCents } = props
  const [tendered, setTendered] = useState((totalCents / 100).toFixed(2))
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const tenderedCents = method === 'cash' ? parseMoney(tendered) : totalCents
  const change = tenderedCents - totalCents
  const valid = !isNaN(tenderedCents) && tenderedCents >= totalCents

  async function confirm() {
    if (!valid || busy) return
    setBusy(true)
    setError('')
    try {
      await props.onConfirm(method, tenderedCents, reference.trim())
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault()
          confirm()
        }}
        onKeyDown={(e) => e.key === 'Escape' && !busy && props.onCancel()}
      >
        <h2>{method === 'cash' ? 'Cash payment' : 'Card payment'}</h2>
        <div className="total-big">Amount due: {money(totalCents)}</div>

        {method === 'cash' ? (
          <>
            <label>
              Amount received
              <input autoFocus value={tendered} onChange={(e) => setTendered(e.target.value)} onFocus={(e) => e.target.select()} />
            </label>
            <div className="row gap">
              {[totalCents, 1000, 2000, 5000, 10000]
                .filter((v, i, a) => v >= totalCents && a.indexOf(v) === i)
                .map((v) => (
                  <button type="button" key={v} onClick={() => setTendered((v / 100).toFixed(2))}>
                    {v === totalCents ? 'Exact' : money(v)}
                  </button>
                ))}
            </div>
            {valid && <div className="change">Change: {money(change)}</div>}
          </>
        ) : (
          <>
            <ol className="steps">
              <li>
                Enter <b>{money(totalCents)}</b> on the card terminal.
              </li>
              <li>Wait for the terminal to show APPROVED.</li>
              <li>Enter the approval / reference number (optional) and confirm.</li>
            </ol>
            <label>
              Terminal reference
              <input autoFocus value={reference} onChange={(e) => setReference(e.target.value)} />
            </label>
          </>
        )}

        {error && <div className="error-text">{error}</div>}
        <div className="row gap end">
          <button type="button" onClick={props.onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!valid || busy}>
            {busy ? 'Saving…' : method === 'card' ? 'Card approved – complete sale' : 'Complete sale'}
          </button>
        </div>
      </form>
    </div>
  )
}
