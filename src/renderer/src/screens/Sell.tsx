import AccountBalancePicker from './AccountBalancePicker'
import type { ItemCostSummary } from '../../../shared/receiving'
import { cancelSaleDraft } from '../saleCancellation'
import { confirmAction } from '../dialogs'
import { saleTimeFromLocal, localSaleTime } from '../../../shared/saleDates'
import CustomerAccountDialog from './CustomerAccount'
import { CARD_TYPES, type CardBrand } from '../../../shared/types'
import { useEffect, useRef, useState } from 'react'
import { customerDisplayName, taxExemptState, taxRateLabel, type BootInfo, type Customer, type PaymentMethod, type Product, type Sale, type SaleRequest, type StoreSettings } from '../../../shared/types'
import { api } from '../api'
import { money, parseMoney, today } from '../format'
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
import InlineReturnDialog from './InlineReturnDialog'
import ReturnDialog, { type ReturnLine } from './ReturnDialog'
import { ColumnMenu, visibleColumns, type GridRow } from '../saleColumns'
import { HeldPicker, HoldDialog } from './HeldReceipts'
import { heldNumber,type HeldReceiptInput } from '../../../shared/held'
import { quantityError } from '../quantity'
import { returnAmount } from '../../../shared/returns'

interface CartLine {
  /** product id, plus the serial number for serial-numbered items (one per line) */
  key: string
  product: Product
  qty: number
  serial?: string
  /** Price changed on this sale (clicked and typed); undefined = the item's regular price */
  priceCents?: number
}

/** Price per unit charged for a line on this sale */
const unitOf = (l: CartLine) => l.priceCents ?? l.product.priceCents

type Message = { kind: 'error' | 'info'; text: string } | null

/**
 * Register-style sale screen.
 *   - Receipt grid: the items on the current sale
 *   - Entry bar (under the receipt): line buttons + scan/item # box
 *   - Totals + tender
 *   - Function-key bar, also driven by the keyboard
 */
export default function Sell({
  boot,
  workOrder,
  onWorkOrderDone,
  onBootChange,
  active = true,
  heldToLoad,
  onHeldLoaded,
  startReturn,
  onIntentDone
}: {
  /** Only the visible Sale screen handles scanner focus and shortcuts. */
  active?: boolean
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
  const pendingKey = `diamondpos-checkout:${boot.config.serverUrl}:${boot.config.tillName}`
  const [customSaleTime, setCustomSaleTime] = useState(false)
  const [saleTime, setSaleTime] = useState(() => localSaleTime(new Date().toISOString()))
  const [pendingCheckout, setPendingCheckout] = useState<SaleRequest | null>(() => {
    const value = localStorage.getItem(pendingKey)
    return value ? JSON.parse(value) as SaleRequest : null
  })
  const holdKey=pendingKey+':hold'
  const [pendingHold,setPendingHold]=useState<{id:number|null;body:HeldReceiptInput}|null>(()=>{const value=localStorage.getItem(holdKey);return value?JSON.parse(value):null})
  const [holdError,setHoldError]=useState('')
  const holdBusy=useRef(false)
  const checkoutBusy = useRef(false)
  const [checkoutWaiting, setCheckoutWaiting] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** Item waiting for its serial number to be typed or scanned */
  const [serialFor, setSerialFor] = useState<Product | null>(null)
  const [settings, setSettings] = useState<StoreSettings | null>(null)
  const [code, setCode] = useState('')
  const [findQuery, setFindQuery] = useState<string | null>(null) // null = Find dialog closed
  const [paying, setPaying] = useState<PaymentMethod | null>(null)
  const [editingQty, setEditingQty] = useState(false)
  const [inlineReturn, setInlineReturn] = useState<{ line: CartLine; qty: number } | null>(null)
  const [lastSale, setLastSale] = useState<Sale | null>(null)
  const [message, setMessage] = useState<Message>(null)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [customerQuery,setCustomerQuery]=useState('')
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
  const [viewAccount,setViewAccount]=useState(false)
  const [accountPicker,setAccountPicker]=useState(false)
  const [accountCustomer,setAccountCustomer]=useState<Customer|null>(null)
  const [holding, setHolding] = useState(false)
  const [recalling, setRecalling] = useState(false)
  const [heldCount, setHeldCount] = useState(0)
  /** Sale waiting for "which printer?" */
  const [printingSale, setPrintingSale] = useState<Sale | null>(null)
  /** Type-ahead matches for the Item # / Barcode box */
  const [sugs, setSugs] = useState<Product[]>([])
  const [sugIdx, setSugIdx] = useState(-1)
  const scanRef = useRef<HTMLInputElement>(null)
  const draftGeneration=useRef(0)
  const [cancelling,setCancelling]=useState(false)

  const load = () => {
    api.getSettings()
      .then(setSettings)
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
    const generation=draftGeneration.current
    try {
      const h = await api.held(id)
      if(generation!==draftGeneration.current)return
      if ((cart.length || returns.length) && !(await confirmAction(`Put held receipt ${heldNumber(id)} onto the current sale? Items already on it stay.`))) return
      setCart((c) => {
        const next = [...c]
        for (const it of h.items) {
          const key = it.serial ? `${it.product.id}:${it.serial}` : String(it.product.id)
          const same = next.findIndex((l) => l.key === key)
          if (same >= 0 && !it.serial) next[same] = { ...next[same], qty: next[same].qty + it.qty }
          else if (same < 0) next.push({ key, product: it.product, qty: it.qty, serial: it.serial, ...(it.priceCents !== undefined ? { priceCents: it.priceCents } : {}) })
        }
        return next
      })
      if (h.customerId) {
        const d = await api.getCustomer(h.customerId)
        if(generation!==draftGeneration.current)return
        attachCustomer(d.customer, `Held receipt ${heldNumber(id)}`)
        if (!h.taxExempt) setExempt(false)
      }
      setCustomSaleTime(!!h.saleAt)
      setSaleTime(localSaleTime(h.saleAt ?? new Date().toISOString()))
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
    if(holdBusy.current)return
    holdBusy.current=true;setHoldError('')
    try {
    if ((customSaleTime || pendingHold?.body.saleAt) && !(await api.health()).saleDates) throw new Error('Update the Store Server to v0.3.41 before choosing a sale date.')
    const body:HeldReceiptInput = {
      requestId: crypto.randomUUID(),
      saleAt: customSaleTime ? saleTimeFromLocal(saleTime) : null,
      customerId: customer?.id ?? null,
      note,
      taxExempt: applyExempt,
      tillName: boot.config.tillName,
      items: cart.map((l) => ({ productId: l.product.id, qty: l.qty, serial: l.serial, ...(l.priceCents !== undefined ? { priceCents: l.priceCents } : {}) }))
    }
    const original=pendingHold??{id:held?.id??null,body}
    localStorage.setItem(holdKey,JSON.stringify(original));setPendingHold(original)
    const h = original.id ? await api.updateHeld(original.id, original.body) : await api.holdSale(original.body)
    localStorage.removeItem(holdKey);setPendingHold(null)
    setHolding(false)
    setCustomSaleTime(false)
    setSaleTime(localSaleTime(new Date().toISOString()))
    setCart([])
    setSelectedId(null)
    setCustomer(null)
    setCustomerQuery('')
    setExempt(false)
    setHeld(null)
    setMessage({ kind: 'info', text: `Sale put on hold as ${heldNumber(h.id)}${h.customerName ? ` for ${h.customerName}` : ''}` })
    refreshHeldCount()
    focusScan()
    }catch(e){if((e as any).definite){localStorage.removeItem(holdKey);setPendingHold(null)}setHoldError((e as Error).message);throw e}finally{holdBusy.current=false}
  }

  async function loadWorkOrder(id: number, mode: WoSaleMode) {
    const generation=draftGeneration.current
    try {
      const [order, s] = await Promise.all([api.wo(id), api.woSettings()])
      const detail = await api.getCustomer(order.customerId)
      if(generation!==draftGeneration.current)return
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
      ...cart.map((l) => ({ unitPriceCents: unitOf(l), qty: l.qty, taxable: l.product.taxable !== false })),
      ...woLines.map((l) => ({ unitPriceCents: l.unitPriceCents, qty: l.qty, taxable: l.taxable }))
    ],
    rate,
    applyExempt,
    creditAvailable
  )
  // Returned items: refunded at the price paid on the original receipt (same maths as the server)
  const returnProgress = new Map<number, { qty: number; tax: number }>()
  const retPriced = returns.map((l) => {
    const prev = l.saleItemId === null ? undefined : returnProgress.get(l.saleItemId)
    const original = l.originalTax ? { ...l.originalTax,
      qtyReturned: l.originalTax.qtyReturned + (prev?.qty ?? 0),
      taxRefundedCents: l.originalTax.taxRefundedCents + (prev?.tax ?? 0) } : undefined
    const amount = returnAmount(l.unitCents, l.qty, l.taxable, l.origExempt, l.origTaxRate ?? rate, l.origTaxMode ?? 'added', original)
    if (l.saleItemId !== null) returnProgress.set(l.saleItemId, { qty: (prev?.qty ?? 0) + l.qty, tax: (prev?.tax ?? 0) + amount.taxCents })
    return amount
  })
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
    cart.reduce((s, l) => s + unitOf(l) * l.qty, 0) + woLines.reduce((s, l) => s + l.unitPriceCents * l.qty, 0)
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
  const [itemCostData,setItemCostData]=useState<Record<number,ItemCostSummary|null>>({})
  const showCosts=cols.some(c=>['cost','lastReceivedCost','averageCost'].includes(c.id))
  const costIds=[...new Set([...cart.map(l=>l.product.id),...returns.map(l=>l.productId),...(wo?.order.lines.map(l=>l.productId)??[])].filter((id):id is number=>!!id))].sort((a,b)=>a-b).join(',')
  useEffect(()=>{
    if(!showCosts||!costIds){setItemCostData({});return}
    let live=true
    setItemCostData({})
    const ids=costIds.split(',').map(Number)
    // Bound concurrency; cost history is fetched only when an optional cost column is visible.
    const worker=async()=>{while(live&&ids.length){const id=ids.shift()!;let value:ItemCostSummary|null=null;try{value=await api.itemCosts(id)}catch{}if(live)setItemCostData(current=>({...current,[id]:value}))}}
    void Promise.all(Array.from({length:Math.min(4,ids.length)},worker))
    return()=>{live=false}
  },[showCosts,costIds])

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
      hasCostItem:true,costInfo:itemCostData[l.product.id],
      lineNo: i + 1,
      sku: l.product.sku,
      name: l.product.name,
      tags: l.serial && !cols.some((c) => c.id === 'serial') ? [<span key="sn" className="serial-tag">S/N {l.serial}</span>] : [],
      serial: l.serial ?? null,
      qty: l.qty,
      onQty: (qty: number) => setQty(l.key, qty),
      quantityRules: { serialized: !!l.serial || l.product.useSerial },
      unitCents: priced.lines[i].unitPriceCents,
      extCents: priced.lines[i].lineTotalCents,
      regCents: l.product.priceCents,
      onPrice: (cents: number) => setPrice(l.key, cents)
    })),
    ...woLines.map((l, j) => ({
      key: `wo-${j}`,
      hasCostItem:wo?.mode==='repair'&&!!wo.order.lines[j]?.productId,costInfo:wo?.mode==='repair'?itemCostData[wo.order.lines[j]?.productId??0]:undefined,
      kind: 'wo' as const,
      lineNo: '🔧',
      sku: wo!.order.number,
      name: l.description.replace(` - ${wo!.order.number}`, ''),
      tags: [],
      serial: null,
      qty: l.qty,
      unitCents: priced.lines[cart.length + j].unitPriceCents,
      extCents: priced.lines[cart.length + j].lineTotalCents,
      // Repair pick-up: the price changes on the ticket too
      onPrice: wo?.mode === 'repair' && wo.order.lines[j] ? (cents: number) => setWoPrice(j, cents) : undefined
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
      hasCostItem:!!l.productId,costInfo:itemCostData[l.productId??0],
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
      onQty: (qty: number) => setReturnQty(l.key, qty),
      quantityRules: { returning: true, serialized: !!l.serial,
        maxReturn: l.originalTax ? l.originalTax.qtySold - l.originalTax.qtyReturned - returns.filter((other) => other.key !== l.key && other.saleItemId === l.saleItemId).reduce((n, other) => n + other.qty, 0) : undefined },
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
  const dialogOpen =
    accountPicker || viewAccount ||
    cancelling ||
    paying !== null ||
    editingQty ||
    inlineReturn !== null ||
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

  const focusScan = () => { if (active) setTimeout(() => scanRef.current?.focus(), 0) }

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

  function setQty(key: string, qty: number): boolean {
    const line = cart.find((l) => l.key === key)
    if (!line) return false
    const error = quantityError(qty, { serialized: !!line.serial || line.product.useSerial })
    if (error) { setMessage({ kind: 'error', text: error }); return false }
    if (qty < 0) {
      if (wo) { setMessage({ kind: 'error', text: 'Finish the work order payment before starting a return.' }); return false }
      setInlineReturn({ line, qty })
      return true
    }
    setCart((c) => c.map((l) => (l.key === key ? { ...l, qty } : l)).filter((l) => l.qty > 0))
    setSelectedId(qty === 0 ? null : key)
    setLastSale(null)
    return true
  }

  function setReturnQty(key: string, signedQty: number): boolean {
    const line = returns.find((l) => l.key === key)
    if (!line) return false
    const other = returns.filter((r) => r.key !== key && r.saleItemId === line.saleItemId).reduce((n, r) => n + r.qty, 0)
    const error = quantityError(signedQty, { returning: true, serialized: !!line.serial,
      maxReturn: line.originalTax ? line.originalTax.qtySold - line.originalTax.qtyReturned - other : undefined })
    if (error) { setMessage({ kind: 'error', text: error }); return false }
    if (signedQty === 0) removeReturn(key)
    else { setReturns((r) => r.map((l) => l.key === key ? { ...l, qty: -signedQty } : l)); setSelectedId(key) }
    setLastSale(null)
    return true
  }

  /** Price clicked and changed on the receipt grid (back to the regular price = no change) */
  function setPrice(key: string, cents: number) {
    setCart((c) => c.map((l) => (l.key === key ? { ...l, priceCents: cents === l.product.priceCents ? undefined : cents } : l)))
    setSelectedId(key)
    setLastSale(null)
    focusScan()
  }

  /** Price of a work order line changed on the Sale screen: saved on the ticket, then the ticket is reloaded */
  async function setWoPrice(index: number, cents: number) {
    const generation=draftGeneration.current
    if (!wo) return
    const line = wo.order.lines[index]
    // Labor with part hours shows as one line (hours x rate): the typed amount is the line total
    const unit = Number.isInteger(line.qty) ? cents : Math.round(cents / line.qty)
    try {
      const order = await api.woUpdateLine(wo.order.id, line.id, { unitPriceCents: unit })
      if(generation!==draftGeneration.current)return
      setWo({ ...wo, order })
      setMessage({ kind: 'info', text: `${wo.order.number}: price changed on the ticket` })
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message })
    }
    focusScan()
  }

  function removeSelected() {
    if (selectedId === null) return
    if (selectedReturn) removeReturn(selectedReturn.key)
    else setQty(selectedId, 0)
    focusScan()
  }

  function addReturnLines(lines: ReturnLine[], receipt: import('../../../shared/returns').ReturnableSale | null) {
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
        {const generation=draftGeneration.current;api.getCustomer(receipt.customerId).then((d) => {if(generation===draftGeneration.current)attachCustomer(d.customer, `Return for receipt #${receipt.saleId}`)}).catch(() => {})}
    }
    setLastSale(null)
    setSelectedId(lines[lines.length - 1]?.key ?? null)
    setMessage({ kind: 'info', text: `${lines.length} item(s) added as a return. Scan new items for an exchange, or take the refund.` })
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
    setCustomerQuery('')
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

  async function startPayment(method: PaymentMethod) {
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
    if (cart.some((l) => l.serial || l.product.useSerial) && !customer) {
      setMessage({ kind: 'error', text: 'This sale has a serial-numbered item. Add the customer (F5) so the unit is saved to them.' })
      setPickingCustomer(true)
      return
    }
    const missingSerial = cart.find((l) => l.product.useSerial && !l.serial?.trim())
    if (missingSerial) {
      setSelectedId(missingSerial.key)
      setMessage({ kind: 'error', text: `${missingSerial.product.name}: remove and rescan this item to enter its serial number before checkout.` })
      return
    }
    // Nothing to pay (e.g. the estimate fee covers the whole repair): finish without a payment
    if (total === 0) {
      if ((await confirmAction(returns.length ? 'Even exchange: nothing to pay or refund. Complete it?' : 'Nothing to pay on this sale. Complete it?'))) completeSale(null, 0, '').catch((e) => setMessage({ kind: 'error', text: e.message }))
      return
    }
    setPaying(method)
  }

  // Barcode scanners "type" the code and press Enter.
  // Exact barcode / item # adds straight away; anything else opens Find Item.
  async function onScan(e: React.FormEvent) {
    const generation=draftGeneration.current
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
      const product=await api.lookupProduct(value)
      if(generation!==draftGeneration.current)return
      addToCart(product)
    } catch {
      if(generation!==draftGeneration.current)return
      try {
        const matches = await api.listProducts(value)
        if(generation!==draftGeneration.current)return
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

  async function completeSale(method: PaymentMethod | null, amountCents: number, reference: string, cardBrand?: CardBrand, onAccount=false) {
    if (checkoutBusy.current) return
    checkoutBusy.current = true
    setCheckoutWaiting(true)
    setCheckoutError('')
    try {
      if ((customSaleTime || pendingCheckout?.saleAt) && !(await api.health()).saleDates) throw new Error('Update the Store Server to v0.3.41 before choosing a sale date.')
      const request: SaleRequest = pendingCheckout ?? {
        requestId: crypto.randomUUID(),
        onAccount,
        saleAt: customSaleTime ? saleTimeFromLocal(saleTime) : null,
        tillName: boot.config.tillName,
        customerId: customer?.id ?? null,
        taxExempt: applyExempt,
        items: cart.map((l) => ({ productId: l.product.id, qty: l.qty, serial: l.serial, ...(l.priceCents !== undefined ? { unitPriceCents: l.priceCents } : {}) })),
        returns: returns.map((l) =>
          l.saleItemId !== null
            ? { saleItemId: l.saleItemId, qty: l.qty, reason: l.reason, restock: l.restock }
            : { productId: l.productId!, qty: l.qty, serial: l.serial ?? undefined, reason: l.reason, restock: l.restock }
        ),
        payments: method ? [{ method, amountCents, reference: method === 'check' ? reference || undefined : undefined, ...(method === 'card' ? { cardBrand: cardBrand ?? 'unknown' } : {}) }] : [],
        workOrder: wo ? { id: wo.order.id, mode: wo.mode } : undefined,
        heldId: held?.id ?? null,
        taxRateId: taxChoice?.id ?? null
      }
      // If storage fails, do not submit: we must be able to recover the exact request.
      localStorage.setItem(pendingKey, JSON.stringify(request))
      setPendingCheckout(request)
      setPaying(null)
      const sale = await api.createSale(request)
      localStorage.removeItem(pendingKey)
      setPendingCheckout(null)
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
      setCustomerQuery('')
      setExempt(false)
      setTaxRateId(null)
      setCustomSaleTime(false)
      setSaleTime(localSaleTime(new Date().toISOString()))
      setLastSale(sale)
      setMessage({ kind: 'info', text: sale.totalCents < 0 ? `Refund #${sale.id} saved` : `Sale #${sale.id} saved` })
      focusScan()
    } catch (error) {
      // A 4xx response is a definite rejection; network and 5xx failures may follow a commit.
      if ((error as { definite?: boolean }).definite) {
        localStorage.removeItem(pendingKey)
        setPendingCheckout(null)
      }
      setCheckoutError((error as Error).message)
      setMessage({ kind: 'error', text: (error as Error).message })
      throw error
    } finally {
      checkoutBusy.current = false
      setCheckoutWaiting(false)
    }
  }

  /** Opens the printer chooser (or prints straight away if this till doesn't ask) */
  function printReceipt(sale: Sale) {
    setPrintingSale(sale)
  }

  async function cancelCurrentSale(){
    if(cancelling)return
    setCancelling(true)
    try{
      await cancelSaleDraft({
        blocked:()=>checkoutBusy.current||holdBusy.current||!!localStorage.getItem(pendingKey)||!!localStorage.getItem(holdKey),
        confirm:()=>confirmAction('Cancel the entire current sale? All items, returns, customer and sale-specific settings will be cleared.'+(held?' The saved held receipt will stay in Held Receipts with its inventory reservation.':'')+(wo?' The work order and its reserved parts will stay intact.':'')),
        clear:()=>{
          draftGeneration.current++
          setCart([]);setReturns([]);setReceipts({});setSelectedId(null)
          setCustomer(null);setCustomerQuery('');setExempt(false);setTaxRateId(null);setWo(null);setHeld(null)
          setCustomSaleTime(false);setSaleTime(localSaleTime(new Date().toISOString()))
          setCode('');setSugs([]);setSugIdx(-1);setSerialFor(null);setInlineReturn(null)
          setFindQuery(null);setPaying(null);setEditingQty(false);setPickingCustomer(false)
          setKioskOpen(false);setEditingCustomer(false);setPickingWo(false);setReturning(false)
          setHolding(false);setRecalling(false);setViewAccount(false)
          setCheckoutError('');setHoldError('')
          if(wo)onWorkOrderDone?.()
          setMessage({kind:'info',text:held?'Current sale cancelled. Saved held receipt is still available in Held Receipts.':'Sale cancelled. Ready for a new sale.'})
          focusScan()
        }
      })
    }finally{setCancelling(false)}
  }

  // ----- keyboard shortcuts (F-keys) -----
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {})
  keyHandler.current = (e: KeyboardEvent) => {
    if (!active || dialogOpen) return
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
    const listener = (e: KeyboardEvent) => { if (!localStorage.getItem(pendingKey)) keyHandler.current?.(e) }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  return (
    <div className="register qb-sale" onPointerDown={e=>{for(const menu of e.currentTarget.querySelectorAll<HTMLDetailsElement>('details[open]'))if(!menu.contains(e.target as Node))menu.open=false}} onKeyDown={e=>{if(e.key==='Escape')for(const menu of e.currentTarget.querySelectorAll<HTMLDetailsElement>('details[open]'))menu.open=false}}>
      {viewAccount&&accountCustomer&&<CustomerAccountDialog key={accountCustomer.id} customer={accountCustomer} onClose={()=>{setViewAccount(false);setAccountCustomer(null);focusScan()}}/>}
      {accountPicker&&<AccountBalancePicker onCancel={()=>{setAccountPicker(false);focusScan()}} onPick={chosen=>{setAccountPicker(false);setAccountCustomer(chosen);setViewAccount(true)}}/>}
      {pendingHold&&<div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true"><h2>Confirm held inventory</h2><p>Check the original hold before starting another. Retrying does not reserve inventory twice.</p>{holdError&&<p className="error-text">{holdError}</p>}<button onClick={()=>void holdSale('').catch(()=>{})}>Check / retry original hold</button></div></div>}
      {pendingCheckout && <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true">
        <h2>{checkoutWaiting ? 'Saving checkout…' : 'Recover checkout'}</h2>
        <p>Keep this checkout open until its receipt is confirmed. Do not take payment again.</p>
        <p>Retry checks the original checkout and will not create another copy.</p>
        {checkoutError && <p className="error-text">{checkoutError}</p>}
        <button className="primary" disabled={checkoutWaiting} onClick={() => completeSale(null, 0, '').catch(() => {})}>Check / retry original checkout</button>
      </div></div>}
      <header className="reg-head sale-titlebar">
        <h2>{returns.length?(isRefund?'Refund Receipt':'Exchange Receipt'):'Sales Receipt'}{held&&<span className="held-chip">{heldNumber(held.id)}</span>}</h2>
        <span>{boot.config.tillName}{lastSale&&` · Last receipt #${lastSale.id}`}</span>
        {message&&<span role="status" className={`sale-notice ${message.kind}`}>{message.text}</span>}
      </header>
      <div className="sale-toolbar">
        <details className="sale-action-menu" onClick={e=>{if((e.target as HTMLElement).closest('button'))e.currentTarget.open=false}} onKeyDown={e=>{if(e.key==='Escape')e.currentTarget.open=false}}>
          <summary>I want to… ▾</summary><div className="sale-action-list">
        <button className="fkey" disabled={checkoutWaiting||!!pendingCheckout||!!pendingHold} onClick={()=>setAccountPicker(true)}>Take payment on account</button>
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
          </div>
        </details>
        <form className="scanbar" onSubmit={onScan}>
          <label className="sale-visually-hidden" htmlFor="scan">Item # / Barcode</label>
          <div className="scan-wrap">
            <input
              id="scan"
              ref={scanRef}
              autoFocus
              autoComplete="off"
              placeholder="Scan or enter item information"
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
              <div className="scan-sugs down">
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
        </form>        <div className={customer ? 'cust-box set' : 'cust-box'}>
          {customer?<>
            <div className="cust-text"><b>{customerDisplayName(customer)}</b><span className="dim">{[customer.customerNo,customer.phone||customer.mobile,customer.email].filter(Boolean).join(' · ')}</span><TaxExemptBadge customer={customer} long/></div>
            {wo?<span className="wo-chip">{wo.order.number}</span>:<button onClick={()=>setPickingCustomer(true)}>Change</button>}
            {customer.taxExempt&&!canExempt&&<button onClick={()=>setEditingCustomer(true)}>Update Tax ID</button>}
            <button className="danger" title={wo?'Take the work order off this sale':'Remove customer'} onClick={async()=>{if(wo){if(!await confirmAction(`Take ${wo.order.number} off this sale?`))return;setWo(null);onWorkOrderDone?.()}setCustomer(null);setCustomerQuery('');setExempt(false)}}>✕</button>
          </>:<form className="sale-customer-search" onSubmit={e=>{e.preventDefault();setPickingCustomer(true)}}><input aria-label="Customer name or phone" placeholder="Enter customer name or phone" value={customerQuery} onChange={e=>setCustomerQuery(e.target.value)}/><button type="submit" title="Find or add customer (F5)">Find ▾</button></form>}
        </div>
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
                  <th title={c.id==='cost'?'Configured order cost per unit':c.id==='lastReceivedCost'?'Latest posted receiving invoice cost per unit (before freight)':c.id==='averageCost'?'Current saved inventory average cost per unit':undefined} key={c.id} data-col={c.id} className={c.num ? 'num' : ''} style={c.width ? { width: c.width } : undefined}>
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
                    title={r.kind === 'wo' || r.kind === 'credit' ? (r.onPrice ? 'From the work order: click the price to change it' : "From the work order (can't be changed here)") : r.kind === 'return' ? 'Item coming back' : undefined}
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
              Scan a barcode or type an item # above. Press F2 to search
              for any item.
            </div>
          )}
        </div>
      </section>

      <div className="sale-settlement">
        <div className="sale-line-tools">
      {/* ---------- Selected-line actions ---------- */}
      <section className="panel entry">
        <div className="line-actions">
          <button
            disabled={!selectedLine}
            onClick={() => selectedLine && setQty(selectedLine.key, selectedLine.qty - 1)}
          >
            − 1
          </button>
          <button disabled={!selectedLine} onClick={() => selectedLine && setQty(selectedLine.key, selectedLine.qty + 1)}>
            + 1
          </button>
          <button disabled={!selectedLine} onClick={() => setEditingQty(true)}>
            Change qty
          </button>
          <button disabled={!selectedLine && !selectedReturn} className="danger" onClick={removeSelected}>
            Remove line
          </button>
        </div>
      </section>
          <details className="sale-options"><summary>Sale options · {customSaleTime?`Sale date: ${saleTime.replace('T',' ')}`:'date & time'}</summary>          <div className="sale-date-picker">
            <label className="check"><input type="checkbox" checked={customSaleTime} disabled={checkoutWaiting || !!pendingCheckout} onChange={(e) => { setCustomSaleTime(e.target.checked); if(e.target.checked) setSaleTime(localSaleTime(new Date().toISOString())) }} />Choose sale date and time</label>
            {customSaleTime ? <><input type="datetime-local" aria-label="Sale date and time" value={saleTime} disabled={checkoutWaiting || !!pendingCheckout} onChange={(e) => setSaleTime(e.target.value)} /><p className="small muted">Uses this PC's local time. Receipts, sales reports and QuickBooks use this date; actual entry time is kept. Future dates wait for that day before QuickBooks sync. Completing now still takes payment and deducts stock now.</p></> : <p className="small muted">Sale date/time: actual checkout time</p>}
          </div>
</details>
          {lastSale && cart.length === 0 && (
            <div className="last-sale">
              <div>
                {lastSale.totalCents < 0 ? (
                  <b>Refund #{lastSale.id} complete · {money(-lastSale.totalCents)} back</b>
                ) : (
                  <>
                    <b>{lastSale.onAccount?'Account sale':'Sale'} #{lastSale.id} complete</b> · {money(lastSale.totalCents)}
                  </>
                )}
              </div>
              {lastSale.totalCents < 0 && lastSale.payments[0]?.method === 'cash' && (
                <div className="change">Give back: {money(-lastSale.totalCents)}</div>
              )}
              <div className="small">Sale date/time: {new Date(lastSale.createdAt).toLocaleString()}</div>
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

        </div>
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

        </div>
      </section>
      </div>
      <section className="sale-paymentbar" aria-label="Payment methods">
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
              <span>{isRefund ? 'Refund card' : 'Credit / Debit'}</span>
              <kbd>F8</kbd>
            </button>

            {!isRefund && (
              <button className="primary" disabled={!hasLines} onClick={() => startPayment('check')} title="Pay by check (asks for the check number)">
                <span>Check</span>
              </button>
            )}
            {!isRefund&&<button disabled={!hasLines||!customer?.accountEnabled||returns.length>0||total<=0||checkoutWaiting} title="Select a customer enabled for account sales. The entire sale is charged as an unpaid invoice." onClick={async ()=>{if(customer&&(await confirmAction(`Charge ${money(total)} to ${customerDisplayName(customer)}'s account? No payment is being collected now.`)))void completeSale(null,0,'',undefined,true).catch(e=>setMessage({kind:'error',text:e.message}))}}>Charge to account</button>}
          </div>
        <div className="sale-amount-due"><span>{isRefund?'Refund Due':'Amount Due'}</span><strong>{money(Math.abs(total))}</strong></div>
      </section>
      <footer className="sale-footer">
        <span className="sale-footer-hint">{cart.length} line{cart.length===1?'':'s'} · {itemCount} item{itemCount===1?'':'s'} · F2 Find item · F5 Customer</span>
        <button disabled={checkoutWaiting||!!pendingCheckout||!!pendingHold} onClick={()=>setAccountPicker(true)}>Take payment on account</button>
        <button onClick={startHold} disabled={checkoutWaiting||!!pendingCheckout||!!pendingHold}> {cart.length?'Hold receipt':'Held receipts'}{heldCount>0&&` (${heldCount})`}</button>
<button className="danger" disabled={dialogOpen||checkoutWaiting||!!pendingCheckout||!!pendingHold||!(cart.length||returns.length||customer||wo||held||code||customSaleTime||taxRateId)} onClick={()=>void cancelCurrentSale().catch(e=>setMessage({kind:'error',text:e.message}))} title="Clear the entire current sale before checkout">Cancel sale</button>
        <button disabled={!lastSale} onClick={()=>lastSale&&printReceipt(lastSale)}>Reprint last receipt</button>
      </footer>

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
          onAdd={addReturnLines}
        />
      )}

      {pickingWo && (
        <WoPayPicker
          onCancel={() => {
            setPickingWo(false)
            focusScan()
          }}
          onPick={async (id, mode) => {
            setPickingWo(false)
            if (cart.length || wo) {
              if (!(await confirmAction('Put this work order on the current sale? Items already scanned stay on it.'))) return
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
        <CustomerPicker initialQuery={customerQuery}
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

      {inlineReturn && <InlineReturnDialog
        product={inlineReturn.line.product} serial={inlineReturn.line.serial} negativeQty={inlineReturn.qty}
        existing={returns} customerId={customer?.id ?? null}
        onCancel={() => { setInlineReturn(null); focusScan() }}
        onAdd={(line, receipt) => {
          setCart((cart) => cart.filter((l) => l.key !== inlineReturn.line.key))
          setInlineReturn(null)
          addReturnLines([line], receipt)
        }}
      />}

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
            if (qty >= 0) focusScan()
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
          onConfirm={(m, ref, brand) => completeSale(m, total, ref, brand)}
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

/** F2: search every active item and add one to the sale. */
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
  const valid = Number.isInteger(qty) && qty >= -9999 && qty <= 9999
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
        <label htmlFor="quantity-value">Quantity (negative = return; 0 removes the line)</label>
          <div className="row gap">
            <button type="button" title="Make quantity positive (sale)" aria-label="Make quantity positive (sale)"
              onClick={() => setText(String(Math.abs(Number.isInteger(qty) && qty !== 0 ? qty : 1)))}>+ Sale</button>
            <input id="quantity-value" autoFocus value={text} onChange={(e) => setText(e.target.value)} onFocus={(e) => e.target.select()} />
            <button type="button" title="Make quantity negative (return)" aria-label="Make quantity negative (return)"
              onClick={() => setText(String(-Math.abs(Number.isInteger(qty) && qty !== 0 ? qty : 1)))}>− Return</button>
          </div>
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
  onConfirm: (method: PaymentMethod, amountCents: number, reference: string, cardBrand?: CardBrand) => Promise<void>
}) {
  const { method, totalCents } = props
  const [tendered, setTendered] = useState((totalCents / 100).toFixed(2))
  const [reference, setReference] = useState('')
  const [cardBrand, setCardBrand] = useState<CardBrand>('credit')
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
      await props.onConfirm(method, tenderedCents, method === 'check' ? reference.trim() : '', cardBrand)
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
              <li>Choose Credit or Debit, then confirm.</li>
            </ol>
            <label>
              Card type
              <select autoFocus value={cardBrand} onChange={(e) => setCardBrand(e.target.value as CardBrand)}>
                {Object.entries(CARD_TYPES).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
              </select>
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
  onConfirm: (method: PaymentMethod, reference: string, cardBrand?: CardBrand) => Promise<void>
}) {
  const { method, refundCents } = props
  const [cardBrand, setCardBrand] = useState<CardBrand>('credit')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function confirm() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await props.onConfirm(method, '', cardBrand)
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
              <li>When it shows APPROVED, choose Credit or Debit and confirm.</li>
            </ol>
            <label>
              Card type
              <select autoFocus value={cardBrand} onChange={(e) => setCardBrand(e.target.value as CardBrand)}>
                {Object.entries(CARD_TYPES).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
              </select>
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
