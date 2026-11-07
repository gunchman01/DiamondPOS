import type { Sale, StoreSettings } from '../../shared/types'
import { defaultDesigns, type ReceiptBlock, type ReceiptElement, type ReceiptLayout, type ReceiptZone } from '../../shared/printDesigns'
import { code128Svg } from './code128'
import { taxName } from './printTemplates'
import { dateTime, escapeHtml, money } from './format'

const esc = escapeHtml
const PAY_LABEL = { cash: 'Cash', card: 'Card', check: 'Check' } as const

/** What a free-placed element (top / bottom of the receipt) shows, as HTML. Also used by the Receipt Layout designer. */
export function receiptElementInner(e: ReceiptElement, sale: Sale, settings: StoreSettings, logoUrl: string | null): string {
  const refund = sale.totalCents < 0
  const hasReturn = sale.items.some((i) => i.kind === 'return')
  if (e.kind === 'line') return ''
  if (e.kind === 'logo') return logoUrl && settings.hasLogo ? `<img src="${esc(logoUrl)}" style="max-width:100%;max-height:100%;object-fit:contain">` : ''
  if (e.kind === 'barcode') return sale.id ? `<div style="width:100%;height:100%">${code128Svg(String(sale.id))}</div>` : ''
  const br = (t: string) => esc(t).replace(/\n/g, '<br>')
  switch (e.field) {
    case 'storeName':
      return esc(settings.storeName)
    case 'address':
      return br(settings.storeAddress)
    case 'title':
      return refund ? '*** REFUND ***' : hasReturn ? 'EXCHANGE' : ''
    case 'saleInfo': {
      const origs = [...new Set(sale.items.map((i) => i.returnOfSaleId).filter((x): x is number => !!x))]
      return `Receipt #${sale.id}<br>${dateTime(sale.createdAt)}<br>${esc(sale.tillName)}${
        origs.length ? `<br>Original receipt: ${origs.map((o) => '#' + o).join(', ')}` : ''
      }${sale.noReceiptReturn ? '<br>Return without receipt' : ''}`
    }
    case 'receiptNo':
      return `Receipt #${sale.id}`
    case 'dateTime':
      return dateTime(sale.createdAt)
    case 'till':
      return esc(sale.tillName)
    case 'customer':
      return sale.customerName ? `Customer: ${esc(sale.customerName)}` : ''
    case 'footer':
      return br(settings.receiptFooter)
    case 'signature':
      return !e.onlyRefund || refund || hasReturn ? '<div style="width:100%;border-top:1px solid #000;padding-top:2px">Customer signature</div>' : ''
    case 'text':
      return br(e.text)
  }
}

/** Inside-the-box CSS for a receipt element */
export function receiptElementCss(e: ReceiptElement): string {
  if (e.kind === 'line') return 'width:100%;height:100%;border-top:1px dashed #000;'
  const justify = e.align === 'left' ? 'flex-start' : e.align === 'right' ? 'flex-end' : 'center'
  return `width:100%;height:100%;display:flex;align-items:center;justify-content:${justify};text-align:${e.align};font-size:${e.fontPt}pt;font-weight:${
    e.bold ? 700 : 400
  };line-height:1.2;overflow:hidden;word-break:break-word;`
}

function zoneHtml(z: ReceiptZone, sale: Sale, settings: StoreSettings, logoUrl: string | null): string {
  if (!z.heightMm || !z.elements.length) return ''
  return `<div style="position:relative;height:${z.heightMm}mm;overflow:hidden">${z.elements
    .map(
      (e) =>
        `<div style="position:absolute;left:${e.x}%;width:${e.w}%;top:${e.y}mm;height:${e.h}mm;overflow:hidden"><div style="${receiptElementCss(e)}">${receiptElementInner(e, sale, settings, logoUrl)}</div></div>`
    )
    .join('')}</div>`
}

/**
 * Receipt for a roll receipt printer (80 or 58 mm), built from the receipt layout
 * (Settings → Receipt Layout): which blocks print, their order, size and alignment.
 */
export function receiptHtml(
  sale: Sale,
  settings: StoreSettings,
  widthMm: number = 80,
  layout: ReceiptLayout = defaultDesigns().receipt,
  logoUrl: string | null = null
): string {
  const refund = sale.totalCents < 0
  const hasReturn = sale.items.some((i) => i.kind === 'return')
  const origs = [...new Set(sale.items.map((i) => i.returnOfSaleId).filter((x): x is number => !!x))]

  const style = (b: ReceiptBlock) => `text-align:${b.align};font-size:${b.fontPt}pt;font-weight:${b.bold ? 700 : 400}`
  const row = (left: string, right: string, cls = '') => `<tr${cls ? ` class="${cls}"` : ''}><td>${left}</td><td class="r">${right}</td></tr>`

  const block = (b: ReceiptBlock): string => {
    switch (b.type) {
      case 'logo':
        return logoUrl && settings.hasLogo ? `<div style="text-align:${b.align}"><img src="${esc(logoUrl)}" style="width:${b.widthPct}%"></div>` : ''
      case 'storeName':
        return `<div style="${style(b)}">${esc(settings.storeName)}</div>`
      case 'address':
        return settings.storeAddress ? `<div style="${style(b)}">${esc(settings.storeAddress).replace(/\n/g, '<br>')}</div>` : ''
      case 'title':
        return refund || hasReturn ? `<div style="${style(b)};letter-spacing:2px">${refund ? '*** REFUND ***' : 'EXCHANGE'}</div>` : ''
      case 'saleInfo':
        return `<div style="${style(b)}">Receipt #${sale.id}<br>${dateTime(sale.createdAt)}<br>${esc(sale.tillName)}${
          origs.length ? `<br>Original receipt: ${origs.map((o) => '#' + o).join(', ')}` : ''
        }${sale.noReceiptReturn ? '<br>Return without receipt' : ''}</div>`
      case 'customer':
        return sale.customerName ? `<div style="${style(b)}">Customer: ${esc(sale.customerName)}</div>` : ''
      case 'items': {
        const rows = sale.items
          .map((i) => {
            const details: string[] = []
            if (b.showSku && i.sku) details.push(`Item # ${esc(i.sku)}`)
            if (b.showUnitPrice && Math.abs(i.qty) > 1) details.push(`${Math.abs(i.qty)} @ ${money(i.unitPriceCents)}`)
            if (b.showSerial && i.serial) details.push(`S/N ${esc(i.serial)}`)
            if (i.kind === 'return')
              details.push(`${i.returnOfSaleId ? `From receipt #${i.returnOfSaleId}` : 'No receipt'}${i.returnReason ? ` - ${esc(i.returnReason)}` : ''}`)
            const name = `${i.kind === 'return' ? 'RETURN ' : ''}${Math.abs(i.qty)} x ${esc(i.name)}`
            return row(`${name}${details.map((d) => `<br>&nbsp;&nbsp;${d}`).join('')}`, money(i.lineTotalCents))
          })
          .join('')
        return `<table style="${style(b)}">${rows}</table>`
      }
      case 'totals':
        return sale.taxMode === 'added'
          ? `<table style="${style(b)}">${row('Subtotal', money(sale.totalCents - sale.taxCents))}${
              sale.taxExempt ? row('Tax exempt', money(0)) : row(esc(taxName(sale)), money(sale.taxCents))
            }${row(refund ? 'REFUND' : 'TOTAL', money(Math.abs(sale.totalCents)), 'big')}</table>`
          : `<table style="${style(b)}">${row(refund ? 'REFUND' : 'TOTAL', money(Math.abs(sale.totalCents)), 'big')}${
              sale.taxExempt ? '' : row('Includes tax', money(sale.taxCents))
            }</table>`
      case 'taxExempt':
        return sale.taxExempt
          ? `<table style="${style(b)}">${row('TAX EXEMPT', '-' + money(sale.taxExemptCents))}<tr><td colspan="2">Farm Tax ID: ${esc(sale.taxExemptId ?? '')}</td></tr></table>`
          : ''
      case 'payments':
        return `<table style="${style(b)}">${sale.payments
          .map((p) => {
            const label = PAY_LABEL[p.method] ?? p.method
            const ref = p.reference ? (p.method === 'check' ? ' #' + esc(p.reference) : ' (' + esc(p.reference) + ')') : ''
            return row(`${p.amountCents < 0 ? `${label} refund` : label}${ref}`, money(p.amountCents))
          })
          .join('')}${sale.changeCents ? row('Change', money(sale.changeCents)) : ''}</table>`
      case 'barcode':
        return sale.id ? `<div style="text-align:${b.align}"><div class="bc" style="width:${b.widthPct}%;display:inline-block">${code128Svg(String(sale.id))}</div></div>` : ''
      case 'signature':
        return b.always || hasReturn || refund ? `<div class="sig" style="${style(b)}">Customer signature</div>` : ''
      case 'footer':
        return settings.receiptFooter ? `<div style="${style(b)}">${esc(settings.receiptFooter).replace(/\n/g, '<br>')}</div>` : ''
      case 'text':
        return b.text ? `<div style="${style(b)}">${esc(b.text).replace(/\n/g, '<br>')}</div>` : ''
      case 'divider':
        return '<hr>'
    }
  }

  const font = layout.font === 'sans' ? "Arial, 'Segoe UI', sans-serif" : "'Courier New', monospace"
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${widthMm}mm auto; margin: 0; }
    body { width: ${widthMm - 8}mm; margin: 4mm; font-family: ${font}; line-height: 1.3; color: #000; }
    body > div, body > table { margin: 2px 0; }
    .r { text-align: right; white-space: nowrap; vertical-align: top; padding-left: 6px; }
    table { width: 100%; border-collapse: collapse; }
    td { vertical-align: top; }
    hr { border: 0; border-top: 1px dashed #000; margin: 5px 0; }
    .big td { font-weight: bold; font-size: 1.25em; }
    .sig { margin-top: 18px; border-top: 1px solid #000; padding-top: 2px; }
    .bc { height: 12mm; }
    img { max-width: 100%; }
  </style></head><body>
    ${layout.header ? zoneHtml(layout.header, sale, settings, logoUrl) : ''}
    ${layout.blocks
      .filter((b) => b.on)
      .map(block)
      .filter(Boolean)
      .join('\n')}
    ${layout.footer ? zoneHtml(layout.footer, sale, settings, logoUrl) : ''}
  </body></html>`
}
