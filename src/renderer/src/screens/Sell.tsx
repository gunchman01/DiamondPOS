import { useEffect, useRef, useState } from 'react'
import { customerDisplayName, taxExemptState, type BootInfo, type Customer, type PaymentMethod, type Product, type Sale, type StoreSettings } from '../../../shared/types'
import { api } from '../api'
import { money, parseMoney, today } from '../format'
import { receiptHtml } from '../receipt'
import CustomerPicker from './CustomerPicker'
import KioskSignup from './KioskSignup'
import TaxExemptBadge from '../TaxExemptBadge'

interface CartLine {
  product: Product
  qty: number
}

type Message = { kind: 'error' | 'info'; text: string } | null

/**
 * Register-style sale screen.
 *   - Receipt grid: the items on the current sale
 *   - Entry bar (under the receipt): line buttons + scan/item # box
 *   - Quick Picks: buttons for items ticked as "Quick Pick" on the Items page.
 *     If there are none, the panel is hidden, the receipt uses the full width
 *     and the totals move to the bottom right.
 *   - Totals + tender
 *   - Function-key bar, also driven by the keyboard
 */
export default function Sell({ boot }: { boot: BootInfo }) {
  const [cart, setCart] = useState<CartLine[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [quickPicks, setQuickPicks] = useState<Product[]>([])
  const [settings, setSettings] = useState<StoreSettings | null>(null)
  const [code, setCode] = useState('')
  const [findQuery, setFindQuery] = useState<string | null>(null) // null = Find dialog closed
  const [paying, setPaying] = useState<PaymentMethod | null>(null)
  const [editingQty, setEditingQty] = useState(false)
  const [lastSale, setLastSale] = useState<Sale | null>(null)
  const [message, setMessage] = useState<Message>(null)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [pickingCustomer, setPickingCustomer] = useState(false)
  const [kioskOpen, setKioskOpen] = useState(false)
  const scanRef = useRef<HTMLInputElement>(null)

  const load = () => {
    Promise.all([api.listQuickPicks(), api.getSettings()])
      .then(([q, s]) => {
        setQuickPicks(q)
        setSettings(s)
      })
      .catch((e) => setMessage({ kind: 'error', text: e.message }))
  }
  useEffect(load, [])

  // ----- derived values -----
  const total = cart.reduce((s, l) => s + l.product.priceCents * l.qty, 0)
  const itemCount = cart.reduce((s, l) => s + l.qty, 0)
  const rate = settings?.taxRate ?? 0.15
  const taxableTotal = cart.filter((l) => l.product.taxable !== false).reduce((s, l) => s + l.product.priceCents * l.qty, 0)
  const gst = Math.round((taxableTotal * rate) / (1 + rate))
  const selectedLine = cart.find((l) => l.product.id === selectedId) ?? null
  const hasQuickPicks = quickPicks.length > 0
  const dialogOpen = paying !== null || editingQty || findQuery !== null || pickingCustomer || kioskOpen

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
    if ((cart.length || customer) && !confirm('Clear this sale (items and customer)?')) return
    setCart([])
    setSelectedId(null)
    setCustomer(null)
    focusScan()
  }

  /** Attach a customer to the sale and warn if their tax-exempt ID has expired */
  function attachCustomer(c: Customer, how: string) {
    setCustomer(c)
    setLastSale(null)
    const st = taxExemptState(c, today())
    if (st.kind === 'expired')
      setMessage({ kind: 'error', text: `${customerDisplayName(c)}: Farm Tax ID has EXPIRED. Ask for their new card.` })
    else if (st.kind === 'expiring')
      setMessage({ kind: 'error', text: `${customerDisplayName(c)}: Farm Tax ID expires in ${st.daysLeft} day(s).` })
    else setMessage({ kind: 'info', text: `${how}: ${customerDisplayName(c)}` })
  }

  function startPayment(method: PaymentMethod) {
    if (cart.length) setPaying(method)
  }

  // Barcode scanners "type" the code and press Enter.
  // Exact barcode / item # adds straight away; anything else opens Find Item.
  async function onScan(e: React.FormEvent) {
    e.preventDefault()
    const value = code.trim()
    if (!value) return
    try {
      addToCart(await api.lookupProduct(value))
    } catch {
      try {
        const matches = await api.listProducts(value)
        if (matches.length === 1) addToCart(matches[0])
        else {
          setCode('')
          setFindQuery(value)
        }
      } catch (err) {
        setMessage({ kind: 'error', text: (err as Error).message })
      }
    }
  }

  async function completeSale(method: PaymentMethod, amountCents: number, reference: string) {
    const sale = await api.createSale({
      tillName: boot.config.tillName,
      customerId: customer?.id ?? null,
      items: cart.map((l) => ({ productId: l.product.id, qty: l.qty })),
      payments: [{ method, amountCents, reference: reference || undefined }]
    })
    setPaying(null)
    setCart([])
    setSelectedId(null)
    setCustomer(null)
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
    if (dialogOpen) return
    const inInput = (e.target as HTMLElement)?.tagName === 'INPUT'
    const actions: Record<string, () => void> = {
      F2: () => setFindQuery(''),
      F3: () => selectedLine && setEditingQty(true),
      F4: removeSelected,
      F5: () => setPickingCustomer(true),
      F9: () => setKioskOpen(true),
      F6: clearSale,
      F7: () => startPayment('cash'),
      F8: () => startPayment('card')
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
    <div className={hasQuickPicks ? 'register' : 'register no-quick'}>
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
        <div className={customer ? 'cust-box set' : 'cust-box'}>
          {customer ? (
            <>
              <div className="cust-text">
                <span className="cust-label">Customer</span>
                <b>{customerDisplayName(customer)}</b>
                <span className="dim">
                  {[customer.customerNo, customer.phone || customer.mobile, customer.customerType].filter(Boolean).join(' · ')}
                </span>
                <TaxExemptBadge customer={customer} long />
              </div>
              <button onClick={() => setPickingCustomer(true)} title="Change customer (F5)">
                Change
              </button>
              <button className="danger" onClick={() => setCustomer(null)} title="Remove customer from this sale">
                ✕
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setPickingCustomer(true)}>
                <kbd>F5</kbd> Add customer
              </button>
              <button className="kiosk-btn" onClick={() => setKioskOpen(true)} title="Customer enters their details on the iPad">
                <kbd>F9</kbd> Kiosk sign-up
              </button>
            </>
          )}
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
                <th style={{ width: 120 }}>Item #</th>
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
            <div className="grid-empty">
              Scan a barcode or type an item # below{hasQuickPicks ? ', or tap a Quick Pick' : ''}. Press F2 to search
              for any item.
            </div>
          )}
        </div>
      </section>

      {/* ---------- Entry bar: line buttons + scan box ---------- */}
      <section className="panel entry">
        <div className="line-actions">
          <button
            disabled={!selectedLine}
            onClick={() => selectedLine && setQty(selectedLine.product.id, selectedLine.qty - 1)}
          >
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
        {!hasQuickPicks && (
          <div className="entry-hint">
            <span>
              Tip: tick <b>Quick Pick</b> on items in the <b>Items</b> tab to show them as buttons on this screen.
            </span>
          </div>
        )}
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

      {/* ---------- Quick Picks (only when some items are ticked) ---------- */}
      {hasQuickPicks && (
        <section className="panel quick">
          <div className="panel-title">
            <span>Quick Picks</span>
            <button className="title-btn" onClick={load} title="Reload Quick Picks">
              ↻
            </button>
          </div>
          <div className="quick-grid">
            {quickPicks.map((p) => (
              <button key={p.id} className="quick-tile" onClick={() => addToCart(p)}>
                <span className="qt-name">{p.name}</span>
                <span className="qt-price">{money(p.priceCents)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

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
              {lastSale.customerName && <div className="small">Customer: {lastSale.customerName}</div>}
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
              <span>Card</span>
              <kbd>F8</kbd>
            </button>
          </div>
        </div>
      </section>

      {/* ---------- Function keys ---------- */}
      <div className="fkeys">
        <button className="fkey" onClick={() => setFindQuery('')}>
          <kbd>F2</kbd> Find item
        </button>
        <button className="fkey" disabled={!selectedLine} onClick={() => setEditingQty(true)}>
          <kbd>F3</kbd> Quantity
        </button>
        <button className="fkey" disabled={!selectedLine} onClick={removeSelected}>
          <kbd>F4</kbd> Remove line
        </button>
        <button className="fkey" onClick={() => setPickingCustomer(true)}>
          <kbd>F5</kbd> Customer
        </button>
        <button className="fkey" onClick={() => setKioskOpen(true)}>
          <kbd>F9</kbd> Kiosk
        </button>
        <button className="fkey" disabled={!cart.length && !customer} onClick={clearSale}>
          <kbd>F6</kbd> Clear sale
        </button>
        <button className="fkey spacer" disabled={!lastSale} onClick={() => lastSale && printReceipt(lastSale)}>
          Reprint last receipt
        </button>
      </div>

      {kioskOpen && (
        <KioskSignup
          tillName={boot.config.tillName}
          onDone={(c, matched) => {
            attachCustomer(c, matched ? 'Found existing customer' : 'New customer from kiosk')
            setTimeout(() => {
              setKioskOpen(false)
              focusScan()
            }, 900)
          }}
          onClose={() => {
            setKioskOpen(false)
            focusScan()
          }}
        />
      )}

      {pickingCustomer && (
        <CustomerPicker
          onSendToKiosk={() => {
            setPickingCustomer(false)
            setKioskOpen(true)
          }}
          onCancel={() => {
            setPickingCustomer(false)
            focusScan()
          }}
          onPick={(c) => {
            attachCustomer(c, 'Customer')
            setPickingCustomer(false)
            focusScan()
          }}
        />
      )}

      {findQuery !== null && (
        <FindItemDialog
          initialQuery={findQuery}
          onCancel={() => {
            setFindQuery(null)
            focusScan()
          }}
          onPick={(p) => {
            setFindQuery(null)
            addToCart(p)
          }}
        />
      )}

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

/** F2: search every active item (not just Quick Picks) and add one to the sale. */
function FindItemDialog(props: { initialQuery: string; onCancel: () => void; onPick: (p: Product) => void }) {
  const [query, setQuery] = useState(props.initialQuery)
  const [results, setResults] = useState<Product[]>([])
  const [active, setActive] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    const t = setTimeout(() => {
      api
        .listProducts(query.trim())
        .then((r) => {
          setResults(r)
          setActive(0)
          setError('')
        })
        .catch((e) => setError(e.message))
    }, 150)
    return () => clearTimeout(t)
  }, [query])

  function onKeyDown(e: React.KeyboardEvent) {
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
      <div className="modal find" onKeyDown={onKeyDown}>
        <h2>Find item</h2>
        <input
          autoFocus
          placeholder="Type name, item # or barcode…  (↑ ↓ to choose, Enter to add)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {error && <div className="error-text">{error}</div>}
        <div className="grid-wrap find-results">
          <table className="grid">
            <thead>
              <tr>
                <th style={{ width: 120 }}>Item #</th>
                <th>Description</th>
                <th className="num" style={{ width: 90 }}>
                  Price
                </th>
              </tr>
            </thead>
            <tbody>
              {results.map((p, i) => (
                <tr
                  key={p.id}
                  className={i === active ? 'selected' : ''}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => props.onPick(p)}
                >
                  <td className="dim">{p.sku ?? ''}</td>
                  <td>{p.name}</td>
                  <td className="num">{money(p.priceCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {results.length === 0 && <div className="grid-empty">No items found</div>}
        </div>
        <div className="row between">
          <span className="muted small">{results.length} item(s)</span>
          <button onClick={props.onCancel}>Close</button>
        </div>
      </div>
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
              <input
                autoFocus
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
                onFocus={(e) => e.target.select()}
              />
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
