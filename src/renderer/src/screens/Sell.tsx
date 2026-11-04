import { useEffect, useRef, useState } from 'react'
import type { BootInfo, PaymentMethod, Product, Sale } from '../../../shared/types'
import { api } from '../api'
import { money, parseMoney } from '../format'
import { receiptHtml } from '../receipt'

interface CartLine {
  product: Product
  qty: number
}

/** The main checkout screen. */
export default function Sell({ boot }: { boot: BootInfo }) {
  const [cart, setCart] = useState<CartLine[]>([])
  const [code, setCode] = useState('')
  const [results, setResults] = useState<Product[] | null>(null)
  const [quick, setQuick] = useState<Product[]>([])
  const [paying, setPaying] = useState<PaymentMethod | null>(null)
  const [done, setDone] = useState<Sale | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.listProducts().then((p) => setQuick(p.slice(0, 24))).catch(() => {})
  }, [])

  const total = cart.reduce((s, l) => s + l.product.priceCents * l.qty, 0)
  const focusInput = () => setTimeout(() => inputRef.current?.focus(), 0)

  function addToCart(p: Product) {
    setCart((c) => {
      const existing = c.find((l) => l.product.id === p.id)
      if (existing) return c.map((l) => (l === existing ? { ...l, qty: l.qty + 1 } : l))
      return [...c, { product: p, qty: 1 }]
    })
    setResults(null)
    setCode('')
    setError('')
    focusInput()
  }

  function changeQty(id: number, delta: number) {
    setCart((c) => c.map((l) => (l.product.id === id ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0))
  }

  // Barcode scanners "type" the code and press Enter, so this handles both scanning and typing
  async function onSubmitCode(e: React.FormEvent) {
    e.preventDefault()
    const value = code.trim()
    if (!value) return
    setError('')
    try {
      addToCart(await api.lookupProduct(value))
    } catch {
      try {
        const found = await api.listProducts(value)
        if (found.length === 1) addToCart(found[0])
        else if (found.length === 0) setError(`No product matches "${value}"`)
        else setResults(found)
      } catch (err) {
        setError((err as Error).message)
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
    setDone(sale)
    setCart([])
  }

  async function printReceipt(sale: Sale) {
    try {
      const settings = await api.getSettings()
      await window.pos.printReceipt(receiptHtml(sale, settings))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (done) {
    return (
      <div className="card done">
        <h2>Sale #{done.id} complete</h2>
        <div className="total-big">{money(done.totalCents)}</div>
        {done.changeCents > 0 && <div className="change">Change due: {money(done.changeCents)}</div>}
        {error && <div className="error-text">{error}</div>}
        <div className="row gap">
          <button onClick={() => printReceipt(done)}>Print receipt</button>
          <button
            className="primary"
            autoFocus
            onClick={() => {
              setDone(null)
              setError('')
              focusInput()
            }}
          >
            New sale
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="sell">
      <section className="sell-left">
        <form onSubmit={onSubmitCode}>
          <input
            ref={inputRef}
            autoFocus
            className="scan"
            placeholder="Scan barcode or type product name / SKU and press Enter"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </form>
        {error && <div className="error-text">{error}</div>}

        {results ? (
          <div className="list">
            <div className="row between">
              <strong>Choose a product</strong>
              <button onClick={() => setResults(null)}>Close</button>
            </div>
            {results.map((p) => (
              <button key={p.id} className="list-item" onClick={() => addToCart(p)}>
                <span>{p.name}</span>
                <span>{money(p.priceCents)}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid">
            {quick.map((p) => (
              <button key={p.id} className="tile" onClick={() => addToCart(p)}>
                <span>{p.name}</span>
                <strong>{money(p.priceCents)}</strong>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="sell-right card">
        <h2>Current sale</h2>
        <div className="cart">
          {cart.length === 0 && <p className="muted">No items yet</p>}
          {cart.map((l) => (
            <div key={l.product.id} className="cart-line">
              <div className="cart-name">{l.product.name}</div>
              <div className="qty">
                <button onClick={() => changeQty(l.product.id, -1)}>−</button>
                <span>{l.qty}</span>
                <button onClick={() => changeQty(l.product.id, 1)}>+</button>
              </div>
              <div className="r">{money(l.product.priceCents * l.qty)}</div>
            </div>
          ))}
        </div>
        <div className="totals">
          <div className="row between total-big">
            <span>Total</span>
            <span>{money(total)}</span>
          </div>
        </div>
        <div className="pay-buttons">
          <button className="primary big" disabled={!cart.length} onClick={() => setPaying('cash')}>
            Cash
          </button>
          <button className="primary big" disabled={!cart.length} onClick={() => setPaying('card')}>
            Card (terminal)
          </button>
        </div>
        <button className="link" disabled={!cart.length} onClick={() => setCart([])}>
          Clear sale
        </button>
      </section>

      {paying && (
        <PaymentDialog
          method={paying}
          totalCents={total}
          onCancel={() => {
            setPaying(null)
            focusInput()
          }}
          onConfirm={completeSale}
        />
      )}
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
      <div className="modal">
        <h2>{method === 'cash' ? 'Cash payment' : 'Card payment'}</h2>
        <div className="total-big">Due: {money(totalCents)}</div>

        {method === 'cash' ? (
          <>
            <label>
              Amount received
              <input autoFocus value={tendered} onChange={(e) => setTendered(e.target.value)} />
            </label>
            <div className="row gap">
              {[totalCents, 2000, 5000, 10000]
                .filter((v, i, a) => v >= totalCents && a.indexOf(v) === i)
                .map((v) => (
                  <button key={v} onClick={() => setTendered((v / 100).toFixed(2))}>
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
          <button onClick={props.onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="primary" disabled={!valid || busy} onClick={confirm}>
            {busy ? 'Saving…' : method === 'card' ? 'Card approved – complete sale' : 'Complete sale'}
          </button>
        </div>
      </div>
    </div>
  )
}
