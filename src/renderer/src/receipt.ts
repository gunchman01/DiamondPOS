import type { Sale, StoreSettings } from '../../shared/types'
import { dateTime, escapeHtml, money } from './format'

/** Builds receipt HTML sized for an 80mm receipt printer. */
export function receiptHtml(sale: Sale, settings: StoreSettings): string {
  const rows = sale.items
    .map(
      (i) =>
        `<tr><td>${i.qty} x ${escapeHtml(i.name)}</td><td class="r">${money(i.lineTotalCents)}</td></tr>`
    )
    .join('')
  const pays = sale.payments
    .map(
      (p) =>
        `<tr><td>${p.method === 'cash' ? 'Cash' : 'Card'}${p.reference ? ' (' + escapeHtml(p.reference) + ')' : ''}</td><td class="r">${money(p.amountCents)}</td></tr>`
    )
    .join('')

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: 80mm auto; margin: 0; }
    body { width: 72mm; margin: 4mm; font: 12px/1.35 'Courier New', monospace; color: #000; }
    h1 { font-size: 16px; text-align: center; margin: 0 0 4px; }
    .c { text-align: center; } .r { text-align: right; white-space: nowrap; }
    table { width: 100%; border-collapse: collapse; }
    hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
    .big td { font-weight: bold; font-size: 14px; }
  </style></head><body>
    <h1>${escapeHtml(settings.storeName)}</h1>
    <div class="c">Receipt #${sale.id}<br>${dateTime(sale.createdAt)}<br>${escapeHtml(sale.tillName)}${sale.customerName ? `<br>Customer: ${escapeHtml(sale.customerName)}` : ''}</div>
    <hr><table>${rows}</table><hr>
    <table>
      <tr class="big"><td>TOTAL</td><td class="r">${money(sale.totalCents)}</td></tr>
      <tr><td>Includes GST</td><td class="r">${money(sale.taxCents)}</td></tr>
      ${pays}
      ${sale.changeCents ? `<tr><td>Change</td><td class="r">${money(sale.changeCents)}</td></tr>` : ''}
    </table>
    <hr><div class="c">${escapeHtml(settings.receiptFooter)}</div>
  </body></html>`
}
