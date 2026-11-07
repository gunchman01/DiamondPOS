import { useEffect, useRef, useState } from 'react'
import { customerDisplayName, taxExemptState, taxRateLabel, type BootInfo, type Customer, type PaymentMethod, type Product, type Sale, type StoreSettings } from '../../../shared/types'
import { api } from '../api'
import { money, parseMoney, today } from '../format'
import { currentPrintSettings } from '../printing'
import PrintChooser from '../PrintChooser'
import CustomerPicker from './CustomerPicker'
import KioskSignup from './KioskSignup'
import TaxExemptBadge from '../TaxExemptBadge'
import CustomerEditor from './CustomerEditor'
import {
  priceWithFeeCredit,
  workOrderSaleLines,
  type EstimateFeeSettings,
  type WoSaleMode,
  type WorkOrder
} from '../../../shared/workorders'
import WoPayPicker from './WoPayPicker'
import ReturnDialog, { type ReturnLine } from './ReturnDialog'
import { ColumnMenu, visibleColumns, type GridRow } from '../saleColumns'
import { HeldPicker, HoldDialog } from './HeldReceipts'
import { heldNumber } from '../../../shared/held'
import { returnAmount } from '../../../shared/returns'

interface CartLine {
  /** product id, plus the serial number for serial-numbered items (one per line) */
  key: string
  product: Product
  qty: number
  serial?: string
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
export default function Sell({
  boot,
  workOrder,
  onWorkOrderDone,
  onBootChange,
  heldToLoad,
  onHeldLoaded,
  startReturn,
  onIntentDone
}: {
  /** Opened from "I want to… Return items" */
  startReturn?: boolean
  onIntentDone?: () => void
  boot: BootInfo
  /** Open this held receipt on the sale (from the Held Receipts screen) */
  heldToLoad?: number | null
  onHeldLoaded?: () => void
  /** Saves this computer's settings (used for the receipt grid columns) */
  onBootChange?: (b: BootInfo) => void
  /** Opened from a work order ticket: load it onto this sale */
  workOrder?: { id: number; mode: WoSaleMode } | null
  onWorkOrderDone?: () => void
}) {
  const [cart, setCart] = useState<CartLine[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** Item waiting for its serial number to be typed or scanned */
  const [serialFor, setSerialFor] = useState<Product | null>(null)
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
  /** Apply the customer's tax exemption to this sale */
  const [exempt, setExempt] = useState(false)
  /** Tax rate picked for this sale (null = the store's default) */
  const [taxRateId, setTaxRateId] = useState<string | null>(null)
  const [editingCustomer, setEditingCustomer] = useState(false)
  /** Work order being paid on this sale (estimate fee, repair pick-up, or fee credit) */
  const [wo, setWo] = useState<{ order: WorkOrder; mode: WoSaleMode; fee: EstimateFeeSettings } | null>(null)
  const [pickingWo, setPickingWo] = useState(false)
  /** Items coming back on this sale (returns / exchanges) */
  const [returns, setReturns] = useState<ReturnLine[]>([])
  /** Original receipts on this return: most that can still be refunded on each, and how it was paid */
  const [receipts, setReceipts] = useState<Record<number, { refundableCents: number; method: PaymentMethod | null }>>({})
  const [returning, setReturning] = useState(false)
  /** Held receipt this sale came from (ringing it up closes it; holding again updates it) */
  const [held, setHeld] = useState<{ id: number; note: string } | null>(null)
  const [holding, setHolding] = useState(false)
  const [recalling, setRecalling] = useState(false)
  const [heldCount, setHeldCount] = useState(0)
  /** Sale waiting for "which printer?" */
  const [printingSale, setPrintingSale] = useState<Sale | null>(null)
  /** Type-ahead matches for the Item # / Barcode box */
  const [sugs, setSugs] = useState<Product[]>([])
  const [sugIdx, setSugIdx] = useState(-1)
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
  const refreshHeldCount = () => api.heldCount().then(setHeldCount).catch(() => {})
  useEffect(() => {
    refreshHeldCount()
  }, [])

  // Type-ahead: show matching items while typing (scanners type fast and press Enter, so this never gets in their way)
  useEffect(() => {
    const q = code.trim()
    if (q.length < 2) {
      setSugs([])
      setSugIdx(-1)
      return
    }
    let live = true
    const t = setTimeout(() => {
      api
        .listProducts(q)
        .then((r) => {
          if (!live) return
          setSugs(r.slice(0, 8))
          setSugIdx(-1)
        })
        .catch(() => {})
    }, 180)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [code])

  async function loadHeld(id: number) {
    try {
      const h = await api.held(id)
      if ((cart.length || returns.length) && !confirm(`Put held receipt ${heldNumber(id)} onto the current sale? Items already on it stay.`)) return
      setCart((c) => {
        const next = [...c]
        for (const it of h.items) {
          const key = it.serial ? `${it.product.id}:${it.serial}` : String(it.product.id)
          const same = next.findIndex((l) => l.key === key)
          if (same >= 0 && !it.serial) next[same] = { ...next[same], qty: next[same].qty + it.qty }
          else if (same < 0) next.push({ key, product: it.product, qty: it.qty, serial: it.serial })
        }
        return next
      })
      if (h.customerId) {
        const d = await api.getCustomer(h.customerId)
        attachCustomer(d.customer, `Held receipt ${heldNumber(id)}`)
        if (!h.taxExempt) setExempt(false)
      }
      setHeld({ id, note: h.note })
      setLastSale(null)
      setMessage({
        kind: h.missing ? 'error' : 'info',
        text: `Held receipt ${heldNumber(id)} loaded${h.note ? `: ${h.note}` : ''}${h.missing ? ` (${h.missing} item(s) no longer for sale were left off)` : ''}`
      })
      focusScan()
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message })
    }
  }
  useEffect(() => {
    if (startReturn) {
      setReturning(true)
      onIntentDone?.()
    }
  }, [startReturn])
  useEffect(() => {
    if (heldToLoad) {
      loadHeld(heldToLoad)
      onHeldLoaded?.()
    }
  }, [heldToLoad])

  function startHold() {
    if (wo || returns.length) {
      setMessage({ kind: 'error', text: 'Work order payments and returns can\'t be held. Finish them first.' })
      return
    }
    if (cart.length === 0) {
      setRecalling(true)
      return
    }
    setHolding(true)
  }

  async function holdSale(note: string) {
    const body = {
      customerId: customer?.id ?? null,
      note,
      taxExempt: applyExempt,
      tillName: boot.config.tillName,
      items: cart.map((l) => ({ productId: l.product.id, qty: l.qty, serial: l.serial }))
    }
    const h = held ? await api.updateHeld(held.id, body) : await api.holdSale(body)
    setHolding(false)
    setCart([])
    setSelectedId(null)
    setCustomer(null)
    setExempt(false)
    setHeld(null)
    setMessage({ kind: 'info', text: `Sale put on hold as ${heldNumber(h.id)}${h.customerName ? ` for ${h.customerName}` : ''}` })
    refreshHeldCount()
    focusScan()
  }

  async function loadWorkOrder(id: number, mode: WoSaleMode) {
    try {
      const [order, s] = await Promise.all([api.wo(id), api.woSettings()])
      const detail = await api.getCustomer(order.customerId)
      setWo({ order, mode, fee: s.estimateFee })
      attachCustomer(detail.customer, order.number)
      setMessage({
        kind: 'info',
        text:
          mode === 'fee'
            ? `${order.number}: collect the estimate fee`
            : mode === 'repair'
              ? `${order.number}: repair pick-up loaded`
              : `${order.number}: scan the new item(s); the estimate fee is credited`
      })
      focusScan()
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message })
    }
  }
  useEffect(() => {
    if (workOrder) loadWorkOrder(workOrder.id, workOrder.mode)
  }, [workOrder?.id, workOrder?.mode])

  // ----- derived values -----
  const itemCount = cart.reduce((s, l) => s + l.qty, 0)
  // Tax rate for this sale (Settings → Taxes); the store's default unless changed on the Sale screen
  const taxRates = settings?.taxRates ?? []
  const taxChoice = taxRates.find((t) => t.id === taxRateId) ?? taxRates.find((t) => t.id === settings?.defaultTaxRateId) ?? null
  const rate = taxChoice?.rate ?? settings?.taxRate ?? 0
  // Tax-exempt status of the attached customer
  const exemptState = customer ? taxExemptState(customer, today()) : ({ kind: 'none' } as const)
  const canExempt = !!customer?.taxExempt && !!customer.taxExemptId && exemptState.kind !== 'expired'
  const applyExempt = exempt && canExempt
  // Work order lines (locked) come after the scanned items, then the estimate fee credit, same order as the server
  const woLines = wo ? workOrderSaleLines(wo.order, wo.mode, wo.fee) : []
  const creditAvailable = wo && wo.mode !== 'fee' && wo.order.feeStatus === 'paid' ? wo.order.feeCents : 0
  // Same pricing function the server uses, so the total shown is exactly what's charged
  const priced = priceWithFeeCredit(
    [
      ...cart.map((l) => ({ unitPriceCents: l.product.priceCents, qty: l.qty, taxable: l.product.taxable !== false })),
      ...woLines.map((l) => ({ unitPriceCents: l.unitPriceCents, qty: l.qty, taxable: l.taxable }))
    ],
    rate,
    applyExempt,
    creditAvailable
  )
  // Returned items: refunded at the price paid on the original receipt (same maths as the server)
  const retPriced = returns.map((l) => returnAmount(l.unitCents, l.qty, l.taxable, l.origExempt, l.origTaxRate ?? rate, l.origTaxMode ?? 'added'))
  /** Returned items before tax, and the tax refunded on them */
  const refundNet = retPriced.reduce((s, r) => s + r.netCents, 0)
  const refundTax = retPriced.reduce((s, r) => s + r.taxCents, 0)
  // A receipt that had an estimate fee credit can't refund more than was paid on it
  const feeKept = Object.entries(receipts).reduce((s, [id, r]) => {
    const amount = returns.reduce((n, l, i) => (l.saleId === Number(id) ? n + retPriced[i].amountCents : n), 0)
    return s + Math.max(0, amount - r.refundableCents)
  }, 0)
  const total = priced.totalCents - refundNet - refundTax + feeKept
  const isRefund = total < 0
  const shelfTotal =
    cart.reduce((s, l) => s + l.product.priceCents * l.qty, 0) + woLines.reduce((s, l) => s + l.unitPriceCents * l.qty, 0)
  const hasLines = cart.length > 0 || woLines.length > 0 || returns.length > 0
  const gst = priced.taxCents - refundTax
  // How the original receipt(s) were paid: suggest refunding the same way
  const origMethods = [...new Set(Object.values(receipts).map((r) => r.method).filter(Boolean))] as PaymentMethod[]
  const suggestMethod = origMethods.length === 1 ? origMethods[0] : null
  const selectedLine = cart.find((l) => l.key === selectedId) ?? null
  const selectedReturn = returns.find((l) => l.key === selectedId) ?? null

  // ----- receipt grid: columns chosen by right-clicking the header (saved on this computer) -----
  const [colIds, setColIds] = useState<string[] | undefined>(boot.config.saleColumns)
  const [colMenu, setColMenu] = useState<{ x: number; y: number; target: string | null } | null>(null)
  const cols = visibleColumns(colIds)
  function openColMenu(e: React.MouseEvent, target: string | null) {
    e.preventDefault()
    setColMenu({ x: e.clientX, y: e.clientY, target })
  }
  async function saveColumns(ids: string[]) {
    setColIds(ids)
    try {
      onBootChange?.(await window.pos.saveConfig({ saleColumns: ids }))
    } catch {
      /* still shown for this session */
    }
  }
  const rows: GridRow[] = [
    ...cart.map((l, i) => ({
      key: l.key,
      kind: 'item' as const,
      product: l.product,
      lineNo: i + 1,
      sku: l.product.sku,
      name: l.product.name,
      tags: l.serial && !cols.some((c) => c.id === 'serial') ? [<span key="sn" className="serial-tag">S/N {l.serial}</span>] : [],
      serial: l.serial ?? null,
      qty: l.qty,
      unitCents: priced.lines[i].unitPriceCents,
      extCents: priced.lines[i].lineTotalCents,
      exTax: priced.lines[i].unitPriceCents !== l.product.priceCents
    })),
    ...woLines.map((l, j) => ({
      key: `wo-${j}`,
      kind: 'wo' as const,
      lineNo: '🔧',
      sku: wo!.order.number,
      name: l.description.replace(` - ${wo!.order.number}`, ''),
      tags: [],
      serial: null,
      qty: l.qty,
      unitCents: priced.lines[cart.length + j].unitPriceCents,
      extCents: priced.lines[cart.length + j].lineTotalCents
    })),
    ...(priced.creditCents > 0
      ? [
          {
            key: 'wo-credit',
            kind: 'credit' as const,
            lineNo: '🔧',
            sku: wo!.order.number,
            name: `Estimate fee credit${wo!.order.feeSaleId ? ` (paid on receipt #${wo!.order.feeSaleId})` : ''}`,
            tags: [],
            serial: null,
            qty: 1,
            unitCents: priced.creditCents,
            extCents: priced.creditCents
          }
        ]
      : []),
    ...returns.map((l, k) => ({
      key: l.key,
      kind: 'return' as const,
      lineNo: '↩',
      sku: l.sku,
      name: (
        <>
          <span className="return-tag">RETURN</span> {l.name}
        </>
      ),
      tags: [
        ...(l.serial && !cols.some((c) => c.id === 'serial') ? [<span key="sn" className="serial-tag">S/N {l.serial}</span>] : []),
        <span key="why" className="serial-tag">
          {l.saleId ? `Receipt #${l.saleId}` : "NO RECEIPT (today's price)"} · {l.reason} ·{' '}
          {l.tracksStock ? (l.restock ? 'back to stock' : 'damaged, not restocked') : 'not a stock item'}
        </span>
      ],
      serial: l.serial,
      qty: l.qty,
      unitCents: l.unitCents,
      extCents: retPriced[k].netCents
    })),
    ...(feeKept > 0
      ? [
          {
            key: 'fee-kept',
            kind: 'feekept' as const,
            lineNo: '↩',
            sku: null,
            name: 'Not refunded: estimate fee credit on the receipt is kept',
            tags: [],
            serial: null,
            qty: 1,
            unitCents: feeKept,
            extCents: feeKept
          }
        ]
      : [])
  ]
  const hasQuickPicks = quickPicks.length > 0
  const dialogOpen =
    paying !== null ||
    editingQty ||
    findQuery !== null ||
    pickingCustomer ||
    kioskOpen ||
    editingCustomer ||
    serialFor !== null ||
    pickingWo ||
    returning ||
    holding ||
    recalling ||
    printingSale !== null ||
    colMenu !== null

  const focusScan = () => setTimeout(() => scanRef.current?.focus(), 0)

  // ----- cart actions -----
  function addToCart(p: Product, qty = 1, serial?: string) {
    // Serial-numbered items ("Use Serial #" on the item): ask for the serial, one per line
    if (p.useSerial && serial === undefined) {
      setSerialFor(p)
      return
    }
    if (serial && cart.some((l) => l.product.id === p.id && l.serial?.toLowerCase() === serial.toLowerCase())) {
      setMessage({ kind: 'error', text: `Serial ${serial} is already on this sale` })
      return
    }
    const key = serial ? `${p.id}:${serial}` : String(p.id)
    setCart((c) => {
      const existing = serial ? undefined : c.find((l) => l.key === key)
      if (existing) return c.map((l) => (l === existing ? { ...l, qty: l.qty + qty } : l))
      return [...c, { key, product: p, qty: serial ? 1 : qty, serial }]
    })
    setSelectedId(key)
    setLastSale(null)
    setMessage(null)
    setCode('')
    focusScan()
  }

  function setQty(key: string, qty: number) {
    const line = cart.find((l) => l.key === key)
    if (line?.serial && qty > 1) {
      setMessage({ kind: 'error', text: 'Serial-numbered items are one per line. Add the item again for the next serial number.' })
      return
    }
    setCart((c) => c.map((l) => (l.key === key ? { ...l, qty } : l)).filter((l) => l.qty > 0))
    if (qty <= 0) setSelectedId(null)
  }

  function removeSelected() {
    if (selectedId === null) return
    if (selectedReturn) removeReturn(selectedReturn.key)
    else setQty(selectedId, 0)
    focusScan()
  }

  function removeReturn(key: string) {
    const left = returns.filter((l) => l.key !== key)
    setReturns(left)
    setReceipts((r) => Object.fromEntries(Object.entries(r).filter(([id]) => left.some((l) => l.saleId === Number(id)))))
    setSelectedId(null)
  }

  function openReturn() {
    if (wo) {
      setMessage({ kind: 'error', text: 'Finish or clear the work order payment first. Returns go on their own sale.' })
      return
    }
    setReturning(true)
  }

  /** Attach a customer to the sale and warn if their tax-exempt ID has expired */
  function attachCustomer(c: Customer, how: string) {
    setCustomer(c)
    setLastSale(null)
    const st = taxExemptState(c, today())
    // Tax exemption is switched on automatically when the customer's Farm Tax ID is on file and current
    setExempt(c.taxExempt && !!c.taxExemptId && st.kind !== 'expired')
    if (st.kind === 'expired')
      setMessage({
        kind: 'error',
        text: `${customerDisplayName(c)}: Farm Tax ID has EXPIRED, so tax will be charged. Ask for their new card.`
      })
    else if (c.taxExempt && !c.taxExemptId)
      setMessage({ kind: 'error', text: `${customerDisplayName(c)} is tax exempt but has no Farm Tax ID on file. Tax will be charged.` })
    else if (st.kind === 'expiring')
      setMessage({ kind: 'error', text: `${customerDisplayName(c)}: Farm Tax ID expires in ${st.daysLeft} day(s).` })
    else setMessage({ kind: 'info', text: `${how}: ${customerDisplayName(c)}` })
  }

  function startPayment(method: PaymentMethod) {
    if (!hasLines) return
    if (wo && returns.length) {
      setMessage({ kind: 'error', text: 'Returns go on their own sale, not on a work order payment' })
      return
    }
    if (wo?.mode === 'credit' && cart.length === 0) {
      setMessage({ kind: 'error', text: 'Scan the new item(s) the estimate fee is being credited toward' })
      return
    }
    // A serial-numbered unit is saved under the customer, so one must be attached
    if (cart.some((l) => l.serial) && !customer) {
      setMessage({ kind: 'error', text: 'This sale has a serial-numbered item. Add the customer (F5) so the unit is saved to them.' })
      setPickingCustomer(true)
      return
    }
    // Nothing to pay (e.g. the estimate fee covers the whole repair): finish without a payment
    if (total === 0) {
      if (confirm(returns.length ? 'Even exchange: nothing to pay or refund. Complete it?' : 'Nothing to pay on this sale. Complete it?')) completeSale(null, 0, '').catch((e) => setMessage({ kind: 'error', text: e.message }))
      return
    }
    setPaying(method)
  }

  // Barcode scanners "type" the code and press Enter.
  // Exact barcode / item # adds straight away; anything else opens Find Item.
  async function onScan(e: React.FormEvent) {
    e.preventDefault()
    // A suggestion picked with the arrow keys
    if (sugIdx >= 0 && sugs[sugIdx]) {
      pickSuggestion(sugs[sugIdx])
      return
    }
    const value = code.trim()
    if (!value) return
    setSugs([])
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

  function pickSuggestion(p: Product) {
    setSugs([])
    setSugIdx(-1)
    addToCart(p)
  }

  async function completeSale(method: PaymentMethod | null, amountCents: number, reference: string) {
    const sale = await api.createSale({
      tillName: boot.config.tillName,
      customerId: customer?.id ?? null,
      taxExempt: applyExempt,
      items: cart.map((l) => ({ productId: l.product.id, qty: l.qty, serial: l.serial })),
      returns: returns.map((l) =>
        l.saleItemId !== null
          ? { saleItemId: l.saleItemId, qty: l.qty, reason: l.reason, restock: l.restock }
          : { productId: l.productId!, qty: l.qty, reason: l.reason, restock: l.restock }
      ),
      payments: method ? [{ method, amountCents, reference: reference || undefined }] : [],
      workOrder: wo ? { id: wo.order.id, mode: wo.mode } : undefined,
      heldId: held?.id ?? null,
      taxRateId: taxChoice?.id ?? null
    })
    if (held) {
      setHeld(null)
      refreshHeldCount()
    }
    if (wo) {
      setWo(null)
      onWorkOrderDone?.()
    }
    setPaying(null)
    setCart([])
    setReturns([])
    setReceipts({})
    setSelectedId(null)
    setCustomer(null)
    setExempt(false)
    setTaxRateId(null)
    setLastSale(sale)
    setMessage({ kind: 'info', text: sale.totalCents < 0 ? `Refund #${sale.id} saved` : `Sale #${sale.id} saved` })
    // Print straight away if this till is set to (Settings → Printing)
    currentPrintSettings()
      .then((ps) => (ps.autoPrint ? printReceipt(sale) : undefined))
      .catch(() => {})
    focusScan()
  }

  /** Opens the printer chooser (or prints straight away if this till doesn't ask) */
  function printReceipt(sale: Sale) {
    setPrintingSale(sale)
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
      F6: startHold,
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
        <h2>
          {returns.length ? (isRefund ? 'Return in progress' : 'Exchange in progress') : cart.length ? 'Sale in progress' : 'New Sale'}
          {held && (
            <span className="held-chip" title={held.note}>
              {heldNumber(held.id)}
            </span>
          )}
        </h2>
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
              {wo ? (
                <span className="wo-chip" title="This sale is for a work order">
                  {wo.order.number}
                </span>
              ) : (
                <button onClick={() => setPickingCustomer(true)} title="Change customer (F5)">
                  Change
                </button>
              )}
              {customer.taxExempt && !canExempt && (
                <button className="primary" onClick={() => setEditingCustomer(true)} title="Enter the details from their new card">
                  Update Tax ID
                </button>
              )}
              <button
                className="danger"
                onClick={() => {
                  if (wo) {
                    if (!confirm(`Take ${wo.order.number} off this sale?`)) return
                    setWo(null)
                    onWorkOrderDone?.()
                  }
                  setCustomer(null)
                  setExempt(false)
                }}
                title={wo ? 'Take the work order off this sale' : 'Remove customer from this sale'}
              >
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
            {returns.length > 0 && ` · ${returns.reduce((n, l) => n + l.qty, 0)} returned`}
          </span>
        </div>
        <div className="grid-wrap">
          <table className="grid">
            <thead onContextMenu={(e) => openColMenu(e, (e.target as HTMLElement).closest('th')?.dataset.col ?? null)}>
              <tr title="Right-click to choose columns">
                <th className="x-col" />
                {cols.map((c) => (
                  <th key={c.id} data-col={c.id} className={c.num ? 'num' : ''} style={c.width ? { width: c.width } : undefined}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody onContextMenu={(e) => openColMenu(e, null)}>
              {rows.map((r) => {
                const selectable = r.kind === 'item' || r.kind === 'return'
                const cls = [
                  r.kind === 'wo' || r.kind === 'feekept' ? 'wo-row' : '',
                  r.kind === 'credit' ? 'wo-row credit-row' : '',
                  r.kind === 'return' ? 'return-row' : '',
                  r.key === selectedId ? 'selected' : ''
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <tr
                    key={r.key}
                    className={cls}
                    title={r.kind === 'wo' || r.kind === 'credit' ? "From the work order (can't be changed here)" : r.kind === 'return' ? 'Item coming back' : undefined}
                    onClick={selectable ? () => setSelectedId(r.key) : undefined}
                    onDoubleClick={
                      r.kind === 'item'
                        ? () => {
                            setSelectedId(r.key)
                            setEditingQty(true)
                          }
                        : undefined
                    }
                  >
                    <td className="x-col">
                      {selectable && (
                        <button
                          className="line-x"
                          title={r.kind === 'return' ? 'Take this return off the sale' : 'Remove this item'}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (r.kind === 'return') removeReturn(r.key)
                            else setQty(r.key, 0)
                            focusScan()
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </td>
                    {cols.map((c) => (
                      <td key={c.id} className={[c.num ? 'num' : '', c.dim ? 'dim' : ''].filter(Boolean).join(' ')}>
                        {c.cell(r)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!hasLines && (
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
            onClick={() => selectedLine && setQty(selectedLine.key, selectedLine.qty - 1)}
          >
            − 1
          </button>
          <button disabled={!selectedLine} onClick={() => selectedLine && addToCart(selectedLine.product)}>
            + 1
          </button>
          <button disabled={!selectedLine} onClick={() => setEditingQty(true)}>
            Change qty
          </button>
          <button disabled={!selectedLine && !selectedReturn} className="danger" onClick={removeSelected}>
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
          <div className="scan-wrap">
            <input
              id="scan"
              ref={scanRef}
              autoFocus
              autoComplete="off"
              placeholder="Scan, or type an item # or description"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onBlur={() => setTimeout(() => setSugs([]), 150)}
              onKeyDown={(e) => {
                if (!sugs.length) return
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setSugIdx((i) => Math.min(i + 1, sugs.length - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setSugIdx((i) => Math.max(i - 1, -1))
                } else if (e.key === 'Escape') {
                  setSugs([])
                  setSugIdx(-1)
                }
              }}
            />
            {sugs.length > 0 && code.trim().length >= 2 && (
              <div className="scan-sugs">
                {sugs.map((p, i) => (
                  <button
                    type="button"
                    key={p.id}
                    className={i === sugIdx ? 'active' : ''}
                    onMouseEnter={() => setSugIdx(i)}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pickSuggestion(p)
                    }}
                  >
                    <span className="dim">{p.sku ?? ''}</span>
                    <span className="sug-name">{p.name}</span>
                    {p.type === 'inventory' && <span className="dim small">{p.onHand} on hand</span>}
                    <b>{money(p.priceCents)}</b>
                  </button>
                ))}
                <div className="sug-hint">↑ ↓ to choose · Enter to add · Esc to close</div>
              </div>
            )}
          </div>
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
            <span>{money(shelfTotal)}</span>
          </div>
          {returns.length > 0 && (
            <div className="tline return-line">
              <span>Returned items</span>
              <span>−{money(refundNet)}</span>
            </div>
          )}
          {applyExempt ? (
            <div className="tline exempt-line">
              <span>Tax exempt ({customer?.taxExemptId}): {money(priced.taxExemptCents)} not charged</span>
              <span>{money(0)}</span>
            </div>
          ) : (
            <div className="tline tax-line">
              {taxRates.length > 1 ? (
                <select
                  className="tax-pick"
                  value={taxChoice?.id ?? ''}
                  title="Tax rate for this sale"
                  onChange={(e) => {
                    setTaxRateId(e.target.value)
                    focusScan()
                  }}
                >
                  {taxRates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {taxRateLabel(t)}
                    </option>
                  ))}
                </select>
              ) : (
                <span>{taxChoice ? taxRateLabel(taxChoice) : `Sales tax ${Math.round(rate * 100000) / 1000}%`}</span>
              )}
              <span>{money(gst)}</span>
            </div>
          )}
          {customer?.taxExempt && (
            <label className={canExempt ? 'exempt-toggle' : 'exempt-toggle blocked'}>
              <input
                type="checkbox"
                checked={applyExempt}
                disabled={!canExempt}
                onChange={(e) => setExempt(e.target.checked)}
              />
              <span>
                {canExempt
                  ? 'Tax exempt sale'
                  : exemptState.kind === 'expired'
                    ? 'Tax exempt: Farm Tax ID EXPIRED, charging tax'
                    : 'Tax exempt: no Farm Tax ID on file, charging tax'}
              </span>
            </label>
          )}
          {priced.creditCents > 0 && (
            <div className="tline exempt-line">
              <span>Estimate fee credit</span>
              <span>−{money(priced.creditCents)}</span>
            </div>
          )}
          {priced.creditKeptCents > 0 && wo?.mode !== 'fee' && (
            <div className="tline muted small">
              <span>Fee not used (kept)</span>
              <span>{money(priced.creditKeptCents)}</span>
            </div>
          )}
          <div className={isRefund ? 'tbox refund' : 'tbox'}>
            <span>{isRefund ? 'Refund due' : wo?.mode === 'repair' ? 'Balance due' : 'Total'}</span>
            <strong>{money(Math.abs(total))}</strong>
          </div>
          {isRefund && suggestMethod && (
            <div className="muted small">Original receipt was paid by {suggestMethod}. Refund the same way.</div>
          )}

          {lastSale && cart.length === 0 && (
            <div className="last-sale">
              <div>
                {lastSale.totalCents < 0 ? (
                  <b>Refund #{lastSale.id} complete · {money(-lastSale.totalCents)} back</b>
                ) : (
                  <>
                    <b>Sale #{lastSale.id} complete</b> · {money(lastSale.totalCents)}
                  </>
                )}
              </div>
              {lastSale.totalCents < 0 && lastSale.payments[0]?.method === 'cash' && (
                <div className="change">Give back: {money(-lastSale.totalCents)}</div>
              )}
              {lastSale.customerName && <div className="small">Customer: {lastSale.customerName}</div>}
              {lastSale.taxExempt && (
                <div className="small">
                  Tax exempt ({lastSale.taxExemptId}): saved {money(lastSale.taxExemptCents)}
                </div>
              )}
              {lastSale.changeCents > 0 && <div className="change">Change due: {money(lastSale.changeCents)}</div>}
              <button onClick={() => printReceipt(lastSale)}>Print receipt</button>
            </div>
          )}

          <div className="tender">
            <button
              className={isRefund && suggestMethod === 'card' ? '' : 'primary'}
              disabled={!hasLines}
              onClick={() => startPayment('cash')}
            >
              <span>{isRefund ? 'Refund cash' : 'Cash'}</span>
              <kbd>F7</kbd>
            </button>
            <button
              className={isRefund && suggestMethod === 'cash' ? '' : 'primary'}
              disabled={!hasLines}
              onClick={() => startPayment('card')}
            >
              <span>{isRefund ? 'Refund card' : 'Card'}</span>
              <kbd>F8</kbd>
            </button>
            {!isRefund && (
              <button className="primary" disabled={!hasLines} onClick={() => startPayment('check')} title="Pay by check (asks for the check number)">
                <span>Check</span>
              </button>
            )}
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
        <button className="fkey" disabled={!selectedLine && !selectedReturn} onClick={removeSelected}>
          <kbd>F4</kbd> Remove line
        </button>
        <button className="fkey" onClick={() => setPickingCustomer(true)}>
          <kbd>F5</kbd> Customer
        </button>
        <button className="fkey" onClick={() => setPickingWo(true)}>
          🔧 Work order
        </button>
        <button className="fkey return-key" onClick={openReturn} title="Return items from a receipt (refund or exchange)">
          ↩ Return
        </button>
        <button className="fkey" onClick={() => setKioskOpen(true)}>
          <kbd>F9</kbd> Kiosk
        </button>
        <button className="fkey" onClick={startHold} title="Put this sale on hold until the customer comes back to pay (or open a held one)">
          <kbd>F6</kbd> {cart.length ? 'Hold receipt' : 'Held receipts'}
          {heldCount > 0 && <span className="fkey-badge">{heldCount}</span>}
        </button>
        <button className="fkey spacer" disabled={!lastSale} onClick={() => lastSale && printReceipt(lastSale)}>
          Reprint last receipt
        </button>
      </div>

      {printingSale && (
        <PrintChooser
          sale={printingSale}
          onDone={(text) => {
            setPrintingSale(null)
            setMessage({ kind: 'info', text })
            focusScan()
          }}
          onCancel={() => {
            setPrintingSale(null)
            focusScan()
          }}
        />
      )}

      {holding && (
        <HoldDialog
          heldNo={held ? heldNumber(held.id) : null}
          note={held?.note ?? ''}
          customerName={customer ? customerDisplayName(customer) : null}
          itemCount={itemCount}
          onCancel={() => {
            setHolding(false)
            focusScan()
          }}
          onHold={holdSale}
          onShowHeld={() => {
            setHolding(false)
            setRecalling(true)
          }}
        />
      )}

      {recalling && (
        <HeldPicker
          onCancel={() => {
            setRecalling(false)
            refreshHeldCount()
            focusScan()
          }}
          onPick={(id) => {
            setRecalling(false)
            loadHeld(id)
          }}
        />
      )}

      {colMenu && (
        <ColumnMenu
          x={colMenu.x}
          y={colMenu.y}
          target={colMenu.target}
          shown={cols.map((c) => c.id)}
          onChange={saveColumns}
          onClose={() => {
            setColMenu(null)
            focusScan()
          }}
        />
      )}

      {returning && (
        <ReturnDialog
          customer={customer}
          existing={returns}
          onCancel={() => {
            setReturning(false)
            focusScan()
          }}
          onAdd={(lines, receipt) => {
            setReturning(false)
            setReturns((r) => [...r, ...lines])
            if (receipt) {
              setReceipts((r) => ({
                ...r,
                [receipt.saleId]: {
                  refundableCents: receipt.refundableCents,
                  method: receipt.payments.length
                    ? [...receipt.payments].sort((a, b) => Math.abs(b.amountCents) - Math.abs(a.amountCents))[0].method
                    : null
                }
              }))
              // The return goes on the original receipt's customer
              if (!customer && receipt.customerId)
                api.getCustomer(receipt.customerId).then((d) => attachCustomer(d.customer, `Return for receipt #${receipt.saleId}`)).catch(() => {})
            }
            setLastSale(null)
            setSelectedId(lines[lines.length - 1]?.key ?? null)
            setMessage({ kind: 'info', text: `${lines.length} item(s) added as a return. Scan new items for an exchange, or take the refund.` })
            focusScan()
          }}
        />
      )}

      {pickingWo && (
        <WoPayPicker
          onCancel={() => {
            setPickingWo(false)
            focusScan()
          }}
          onPick={(id, mode) => {
            setPickingWo(false)
            if (cart.length || wo) {
              if (!confirm('Put this work order on the current sale? Items already scanned stay on it.')) return
            }
            loadWorkOrder(id, mode)
          }}
        />
      )}

      {serialFor && (
        <SerialDialog
          product={serialFor}
          onCancel={() => {
            setSerialFor(null)
            focusScan()
          }}
          onSave={(serial) => {
            const p = serialFor
            setSerialFor(null)
            addToCart(p, 1, serial)
          }}
        />
      )}

      {editingCustomer && customer && (
        <CustomerEditor
          customerId={customer.id}
          single
          onSaved={(c) => attachCustomer(c, 'Customer updated')}
          onClose={() => {
            setEditingCustomer(false)
            focusScan()
          }}
        />
      )}

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
            setQty(selectedLine.key, qty)
            setEditingQty(false)
            focusScan()
          }}
        />
      )}

      {paying && isRefund && (
        <RefundDialog
          method={paying}
          refundCents={-total}
          onCancel={() => {
            setPaying(null)
            focusScan()
          }}
          onConfirm={(m, ref) => completeSale(m, total, ref)}
        />
      )}

      {paying && !isRefund && (
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
  const valid = !isNaN(tenderedCents) && tenderedCents >= totalCents && (method !== 'check' || reference.trim() !== '')

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
        <h2>{method === 'cash' ? 'Cash payment' : method === 'check' ? 'Check payment' : 'Card payment'}</h2>
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
        ) : method === 'check' ? (
          <>
            <ol className="steps">
              <li>
                Check the check is made out for <b>{money(totalCents)}</b> and signed.
              </li>
              <li>Type the check number and confirm.</li>
            </ol>
            <label>
              Check number (required)
              <input autoFocus inputMode="numeric" value={reference} maxLength={30} onChange={(e) => setReference(e.target.value)} />
            </label>
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
            {busy ? 'Saving…' : method === 'card' ? 'Card approved – complete sale' : method === 'check' ? 'Check received – complete sale' : 'Complete sale'}
          </button>
        </div>
      </form>
    </div>
  )
}

/** Ask for the serial number of a serial-numbered item (type it or scan the barcode on the unit) */
function SerialDialog(props: { product: Product; onCancel: () => void; onSave: (serial: string) => void }) {
  const [serial, setSerial] = useState('')
  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault()
          if (serial.trim()) props.onSave(serial.trim())
        }}
        onKeyDown={(e) => e.key === 'Escape' && props.onCancel()}
      >
        <h2>Serial number</h2>
        <div>
          <b>{props.product.name}</b>
          <div className="muted small">The unit will be saved under the customer, so it can be picked for repairs later.</div>
        </div>
        <label>
          Serial number (type or scan)
          <input autoFocus value={serial} onChange={(e) => setSerial(e.target.value)} />
        </label>
        <div className="row gap end">
          <button type="button" onClick={props.onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!serial.trim()}>
            Add to sale
          </button>
        </div>
      </form>
    </div>
  )
}

/** Giving money back: cash from the drawer, or a refund on the card terminal */
function RefundDialog(props: {
  method: PaymentMethod
  refundCents: number
  onCancel: () => void
  onConfirm: (method: PaymentMethod, reference: string) => Promise<void>
}) {
  const { method, refundCents } = props
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function confirm() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await props.onConfirm(method, reference.trim())
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
        <h2>{method === 'cash' ? 'Cash refund' : 'Card refund'}</h2>
        <div className="total-big refund-big">Refund: {money(refundCents)}</div>
        {method === 'cash' ? (
          <p>
            Give the customer <b>{money(refundCents)}</b> from the drawer.
          </p>
        ) : (
          <>
            <ol className="steps">
              <li>
                On the card terminal, choose <b>Refund</b> and enter <b>{money(refundCents)}</b>.
              </li>
              <li>Have the customer tap or insert the card they paid with.</li>
              <li>When it shows APPROVED, enter the terminal's reference number.</li>
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
          <button type="submit" className="primary" autoFocus={method === 'cash'} disabled={busy}>
            {busy ? 'Saving…' : method === 'cash' ? 'Cash given – complete refund' : 'Refund approved – complete'}
          </button>
        </div>
      </form>
    </div>
  )
}
