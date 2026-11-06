import type { Sale, StoreSettings } from '../../shared/types'
import { dateTime, escapeHtml, money } from './format'

/** Builds receipt HTML sized for an 80mm receipt printer. */
export function receiptHtml(sale: Sale, settings: StoreSettings, widthMm: number = 80): string {
  const refund = sale.totalCents < 0
  const hasReturn = sale.items.some((i) => i.kind === 'return')
  const rows = sale.items
    .map((i) => {
      if (i.kind === 'return')
        return `<tr><td>RETURN ${Math.abs(i.qty)} x ${escapeHtml(i.name)}${i.serial ? `<br>&nbsp;&nbsp;S/N ${escapeHtml(i.serial)}` : ''}<br>&nbsp;&nbsp;${
          i.returnOfSaleId ? `From receipt #${i.returnOfSaleId}` : 'No receipt'
        }${i.returnReason ? ` - ${escapeHtml(i.returnReason)}` : ''}</td><td class="r">${money(i.lineTotalCents)}</td></tr>`
      return `<tr><td>${i.qty} x ${escapeHtml(i.name)}${i.serial ? `<br>&nbsp;&nbsp;S/N ${escapeHtml(i.serial)}` : ''}</td><td class="r">${money(i.lineTotalCents)}</td></tr>`
    })
    .join('')
  const pays = sale.payments
    .map((p) => {
      const label = p.method === 'check' ? 'Check' : p.method === 'cash' ? 'Cash' : 'Card'
      return `<tr><td>${p.amountCents < 0 ? `${label} refund` : label}${p.reference ? (p.method === 'check' ? ' #' + escapeHtml(p.reference) : ' (' + escapeHtml(p.reference) + ')') : ''}</td><td class="r">${money(p.amountCents)}</td></tr>`
    })
    .join('')
  const origs = [...new Set(sale.items.map((i) => i.returnOfSaleId).filter((x): x is number => !!x))]

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${widthMm}mm auto; margin: 0; }
    body { width: ${widthMm - 8}mm; margin: 4mm; font: ${widthMm < 70 ? 10 : 12}px/1.35 'Courier New', monospace; color: #000; }
    h1 { font-size: 16px; text-align: center; margin: 0 0 4px; }
    h2 { font-size: 15px; text-align: center; margin: 4px 0; letter-spacing: 2px; }
    .c { text-align: center; } .r { text-align: right; white-space: nowrap; vertical-align: top; }
    table { width: 100%; border-collapse: collapse; }
    hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
    .big td { font-weight: bold; font-size: 14px; }
    .sig { margin-top: 18px; border-top: 1px solid #000; padding-top: 2px; }
  </style></head><body>
    <h1>${escapeHtml(settings.storeName)}</h1>
    ${refund ? '<h2>*** REFUND ***</h2>' : hasReturn ? '<h2>EXCHANGE</h2>' : ''}
    <div class="c">Receipt #${sale.id}<br>${dateTime(sale.createdAt)}<br>${escapeHtml(sale.tillName)}${sale.customerName ? `<br>Customer: ${escapeHtml(sale.customerName)}` : ''}${
      origs.length ? `<br>Original receipt: ${origs.map((o) => '#' + o).join(', ')}` : ''
    }${sale.noReceiptReturn ? '<br>Return without receipt' : ''}</div>
    <hr><table>${rows}</table><hr>
    <table>
      <tr class="big"><td>${refund ? 'REFUND' : 'TOTAL'}</td><td class="r">${money(refund ? -sale.totalCents : sale.totalCents)}</td></tr>
      ${
        sale.taxExempt
          ? `<tr><td>TAX EXEMPT</td><td class="r">-${money(sale.taxExemptCents)}</td></tr>
             <tr><td colspan="2">Farm Tax ID: ${escapeHtml(sale.taxExemptId ?? '')}</td></tr>`
          : `<tr><td>Includes GST</td><td class="r">${money(sale.taxCents)}</td></tr>`
      }
      ${pays}
      ${sale.changeCents ? `<tr><td>Change</td><td class="r">${money(sale.changeCents)}</td></tr>` : ''}
    </table>
    ${hasReturn ? '<div class="sig">Customer signature</div>' : ''}
    <hr><div class="c">${escapeHtml(settings.receiptFooter)}</div>
  </body></html>`
}
