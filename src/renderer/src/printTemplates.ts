/**
 * Printable pages: full-page (Letter) sales receipt / invoice, full-page work order, and item price tags.
 * The 80 mm receipt is in receipt.ts.
 */
import type { Customer, Product, Sale, StoreSettings } from '../../shared/types'
import type { LabelLayout } from '../../shared/printing'
import type { WorkOrder } from '../../shared/workorders'
import { stage, unitLabel } from '../../shared/workorders'
import { code128Svg } from './code128'
import { dateTime, escapeHtml, money } from './format'

const esc = escapeHtml
const PAGE_CSS = `
  @page { size: Letter; margin: 0.5in; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 12px/1.4 'Segoe UI', Arial, sans-serif; color: #111; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #8b0d1f; padding-bottom: 10px; margin-bottom: 14px; }
  .store { display: flex; gap: 12px; align-items: center; }
  .store img { max-height: 70px; max-width: 160px; }
  .store h1 { margin: 0; font-size: 22px; color: #8b0d1f; }
  .doc { text-align: right; }
  .doc h2 { margin: 0; font-size: 20px; letter-spacing: 1px; }
  .muted { color: #666; }
  .boxes { display: flex; gap: 16px; margin-bottom: 14px; }
  .box { flex: 1; border: 1px solid #ccc; border-radius: 4px; padding: 8px 10px; }
  .box h3 { margin: 0 0 4px; font-size: 11px; text-transform: uppercase; color: #8b0d1f; letter-spacing: 0.5px; }
  table.lines { width: 100%; border-collapse: collapse; }
  table.lines th { background: #f1f1f1; text-align: left; padding: 6px; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid #999; }
  table.lines td { padding: 6px; border-bottom: 1px solid #e3e3e3; vertical-align: top; }
  table.lines th.r { text-align: right; }
  .r { text-align: right; white-space: nowrap; }
  .sn { font-family: Consolas, monospace; font-size: 11px; color: #333; }
  .ret { color: #a00; font-weight: bold; }
  .totals { margin-left: auto; width: 280px; margin-top: 10px; }
  .totals td { padding: 3px 6px; }
  .totals .grand td { font-size: 16px; font-weight: bold; border-top: 2px solid #111; }
  .sig { display: flex; gap: 40px; margin-top: 40px; }
  .sig div { flex: 1; border-top: 1px solid #111; padding-top: 4px; font-size: 11px; }
  .foot { margin-top: 24px; text-align: center; color: #555; font-size: 11px; }
  .note { border: 1px solid #ccc; border-radius: 4px; padding: 8px 10px; margin: 10px 0; white-space: pre-wrap; }
`

function header(store: StoreSettings, logoUrl: string | null, title: string, right: string) {
  return `<div class="top">
    <div class="store">${logoUrl ? `<img src="${esc(logoUrl)}">` : ''}<div><h1>${esc(store.storeName)}</h1>
      <div class="muted">${esc(store.storeAddress).replace(/\n/g, '<br>')}</div></div></div>
    <div class="doc"><h2>${esc(title)}</h2>${right}</div>
  </div>`
}

function customerBlock(c: Customer | null, fallbackName: string | null) {
  if (!c) return `<div class="box"><h3>Customer</h3>${fallbackName ? esc(fallbackName) : '<span class="muted">Walk-in customer</span>'}</div>`
  const name = c.trackAsCompany && c.company ? c.company : [c.firstName, c.lastName].filter(Boolean).join(' ')
  const lines = [
    c.company && !c.trackAsCompany ? c.company : '',
    [c.street, c.street2].filter(Boolean).join(', '),
    [c.city, c.region, c.postcode].filter(Boolean).join(' '),
    [c.phone || c.mobile, c.email].filter(Boolean).join(' · ')
  ].filter(Boolean)
  return `<div class="box"><h3>Customer</h3><b>${esc(name)}</b>${lines.map((l) => `<br>${esc(l)}`).join('')}${
    c.customerNo ? `<br><span class="muted">Customer ID ${esc(c.customerNo)}</span>` : ''
  }</div>`
}

/** Letter-size sales receipt / invoice (serial-numbered units, work order payments) */
export function fullPageSaleHtml(sale: Sale, store: StoreSettings, customer: Customer | null, logoUrl: string | null, woNumber?: string | null): string {
  const refund = sale.totalCents < 0
  const hasReturn = sale.items.some((i) => i.kind === 'return')
  const title = refund ? 'REFUND' : hasReturn ? 'EXCHANGE' : woNumber ? 'WORK ORDER INVOICE' : 'SALES RECEIPT'
  const rows = sale.items
    .map(
      (i) => `<tr>
        <td>${i.kind === 'return' ? '<span class="ret">RETURN</span> ' : ''}${esc(i.name)}${i.serial ? `<div class="sn">Serial # ${esc(i.serial)}</div>` : ''}${
          i.kind === 'return'
            ? `<div class="muted">${i.returnOfSaleId ? `From receipt #${i.returnOfSaleId}` : 'No receipt'}${i.returnReason ? ` - ${esc(i.returnReason)}` : ''}</div>`
            : ''
        }</td>
        <td class="r">${i.qty}</td><td class="r">${money(i.unitPriceCents)}</td><td class="r">${money(i.lineTotalCents)}</td></tr>`
    )
    .join('')
  const pays = sale.payments
    .map((p) => {
      const label = p.method === 'check' ? 'Check' : p.method === 'cash' ? 'Cash' : 'Card'
      const ref = p.reference ? (p.method === 'check' ? ` #${esc(p.reference)}` : ` (${esc(p.reference)})`) : ''
      return `<tr><td>${label}${p.amountCents < 0 ? ' refund' : ''}${ref}</td><td class="r">${money(p.amountCents)}</td></tr>`
    })
    .join('')
  const serials = sale.items.filter((i) => i.serial && i.kind !== 'return')
  return `<!doctype html><html><head><meta charset="utf-8"><style>${PAGE_CSS}</style></head><body>
    ${header(store, logoUrl, title, `<div><b>Receipt #${sale.id}</b></div><div>${dateTime(sale.createdAt)}</div><div class="muted">${esc(sale.tillName)}</div>${
      woNumber ? `<div><b>${esc(woNumber)}</b></div>` : ''
    }`)}
    <div class="boxes">${customerBlock(customer, sale.customerName)}${
      sale.taxExempt ? `<div class="box"><h3>Tax exempt</h3>Farm Tax ID: <b>${esc(sale.taxExemptId ?? '')}</b><br>Tax removed: ${money(sale.taxExemptCents)}</div>` : ''
    }</div>
    <table class="lines"><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <table class="totals">
      <tr class="grand"><td>${refund ? 'Refund' : 'Total'}</td><td class="r">${money(Math.abs(sale.totalCents))}</td></tr>
      ${sale.taxExempt ? '' : `<tr><td class="muted">Includes tax</td><td class="r muted">${money(sale.taxCents)}</td></tr>`}
      ${pays}
      ${sale.changeCents ? `<tr><td>Change</td><td class="r">${money(sale.changeCents)}</td></tr>` : ''}
    </table>
    ${serials.length ? `<div class="note"><b>Serial numbers recorded:</b> ${serials.map((i) => `${esc(i.name)}: ${esc(i.serial!)}`).join('; ')}</div>` : ''}
    <div class="sig"><div>Customer signature</div><div>Date</div></div>
    <div class="foot">${esc(store.receiptFooter)}</div>
  </body></html>`
}

/** Letter-size work order (estimate / repair ticket) */
export function workOrderHtml(wo: WorkOrder, store: StoreSettings, customer: Customer | null, logoUrl: string | null): string {
  const rows = wo.lines
    .map(
      (l) =>
        `<tr><td>${esc(l.description)}${l.sku ? ` <span class="muted">(${esc(l.sku)})</span>` : ''}</td><td>${l.kind === 'labor' ? 'Labor' : l.kind === 'part' ? 'Part' : l.kind === 'shop' ? 'Shop supplies' : 'Other'}</td>
         <td class="r">${l.kind === 'labor' ? `${l.qty} h` : l.qty}</td><td class="r">${money(l.unitPriceCents)}</td><td class="r">${money(Math.round(l.unitPriceCents * l.qty))}</td></tr>`
    )
    .join('')
  const t = wo.totals
  return `<!doctype html><html><head><meta charset="utf-8"><style>${PAGE_CSS}</style></head><body>
    ${header(store, logoUrl, 'WORK ORDER', `<div><b>${esc(wo.number)}</b></div><div>Checked in ${dateTime(wo.createdAt)}</div><div>Status: <b>${esc(stage(wo.status).label)}</b></div>`)}
    <div class="boxes">${customerBlock(customer, wo.customerName)}
      <div class="box"><h3>Unit</h3><b>${esc(unitLabel(wo.unit))}</b>${wo.unit.serial ? `<br>Serial # <span class="sn">${esc(wo.unit.serial)}</span>` : ''}${
        wo.hoursIn !== null && wo.hoursIn !== undefined ? `<br>Hours: ${wo.hoursIn}` : ''
      }</div></div>
    ${wo.problem ? `<div class="note"><b>Customer says:</b> ${esc(wo.problem)}</div>` : ''}
    ${wo.diagnosis ? `<div class="note"><b>Diagnosis:</b> ${esc(wo.diagnosis)}</div>` : ''}
    ${wo.workDone ? `<div class="note"><b>Work done:</b> ${esc(wo.workDone)}</div>` : ''}
    <table class="lines"><thead><tr><th>Description</th><th>Type</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead><tbody>${
      rows || '<tr><td colspan="5" class="muted">No parts or labor yet</td></tr>'
    }</tbody></table>
    <table class="totals">
      <tr class="grand"><td>Total</td><td class="r">${money(t.totalCents)}</td></tr>
      ${t.taxExempt ? `<tr><td class="muted">Tax exempt</td><td class="r muted">-${money(t.taxExemptCents)}</td></tr>` : `<tr><td class="muted">Includes tax</td><td class="r muted">${money(t.taxCents)}</td></tr>`}
      ${wo.feeStatus === 'paid' ? `<tr><td>Estimate fee paid</td><td class="r">-${money(wo.feeCents)}</td></tr><tr><td><b>Balance due</b></td><td class="r"><b>${money(wo.balanceDueCents)}</b></td></tr>` : ''}
    </table>
    <div class="sig"><div>Customer signature (authorizes the work above)</div><div>Date</div></div>
    <div class="foot">${esc(store.receiptFooter)}</div>
  </body></html>`
}

/** Price tags: one label per page, sized for the label printer */
export function tagsHtml(items: { product: Product; qty: number }[], store: StoreSettings, layout: LabelLayout): string {
  const w = layout.widthIn
  const h = layout.heightIn
  const small = h <= 1.05
  const labels: string[] = []
  for (const { product: p, qty } of items) {
    const code = p.barcode || p.sku || ''
    const one = `<div class="label">
      ${layout.showStore ? `<div class="store">${esc(store.storeName)}</div>` : ''}
      <div class="name">${esc(p.name)}</div>
      ${layout.showPrice ? `<div class="price">${money(p.priceCents)}</div>` : ''}
      ${layout.showBarcode && code ? `<div class="bc">${code128Svg(code)}</div>` : ''}
      ${layout.showSku && (p.sku || code) ? `<div class="sku">${esc(p.sku || code)}</div>` : ''}
    </div>`
    for (let k = 0; k < qty; k++) labels.push(one)
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${w}in ${h}in; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; color: #000; }
    .label { width: ${w}in; height: ${h}in; padding: 0.05in 0.08in; display: flex; flex-direction: column; align-items: center; justify-content: space-between; overflow: hidden; page-break-after: always; text-align: center; }
    .label:last-child { page-break-after: auto; }
    .store { font-size: ${small ? 6 : 7}pt; text-transform: uppercase; letter-spacing: 0.5px; }
    .name { font-size: ${small ? 7 : 8.5}pt; font-weight: bold; line-height: 1.1; max-height: 2.2em; overflow: hidden; }
    .price { font-size: ${Math.min(22, Math.max(12, h * 14))}pt; font-weight: bold; line-height: 1; }
    .bc { width: 100%; height: ${Math.max(0.22, h * 0.26)}in; }
    .sku { font-size: 6.5pt; font-family: Consolas, monospace; }
  </style></head><body>${labels.join('')}</body></html>`
}
