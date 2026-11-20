/** Work order status emails (shared so Settings can preview a template exactly). */
import type { WoLine, WoTotals, WoStatus } from './workorders'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const money = (c: number) => `${c < 0 ? '-' : ''}$${(Math.abs(c) / 100).toFixed(2)}`

/** Replace {placeholders}; unknown ones are left as they are */
export function fillTemplate(text: string, values: Record<string, string>): string {
  return text.replace(/\{([a-z_]+)\}/gi, (m, k: string) => (k.toLowerCase() in values ? values[k.toLowerCase()] : m))
}

export interface WoEmailContent {
  storeName: string
  storeAddress: string
  body: string // already filled in
  approvalLink?: string
  estimatePreview?: boolean
  partsNotice?: string // live stock warning, independent of customized template text
  bill: {
    lines: Pick<WoLine, 'kind' | 'description' | 'qty' | 'unitPriceCents'>[]
    totals: WoTotals
    feeCreditCents: number
    balanceDueCents: number
  } | null
  woNumber: string
  unit: string
  serial: string
  statusLabel: string
}

/** Include stock already allocated to this ticket, and combine repeated lines for one part. */
export function partsOrderingNotice(status: WoStatus, lines: WoLine[]): string {
  if (status !== 'needs_estimate' && status !== 'waiting_customer' && status !== 'approved') return ''
  const parts = new Map<number, { name: string; qty: number; taken: number; onHand: number }>()
  for (const line of lines) {
    if (line.kind !== 'part' || line.productId === null || line.onHand === null || line.qty <= 0) continue
    const part = parts.get(line.productId)
    if (part) { part.qty += line.qty; part.taken += line.stockTaken }
    else parts.set(line.productId, {
      name: line.description + (line.sku ? ` (${line.sku})` : ''),
      qty: line.qty, taken: line.stockTaken, onHand: line.onHand
    })
  }
  const missing = [...parts.values()].filter(p => p.onHand + p.taken < p.qty).map(p => p.name)
  if (!missing.length) return ''
  return `The following required ${missing.length === 1 ? 'part is' : 'parts are'} not currently in stock in the quantity needed and will have to be ordered: ${missing.join('; ')}. ${missing.length === 1 ? 'It' : 'They'} could take a week to arrive.`
}

const kindLabel = { part: 'Part', labor: 'Labor', shop: 'Shop supplies', misc: 'Other', fee:'Estimate fee' } as const

export function woEmailHtml(c: WoEmailContent): string {
  const paras = c.body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 12px">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
  const notice = c.partsNotice
    ? `<div style="margin:0 0 14px;padding:12px;background:#fff4d6;border:1px solid #e3c677"><b>Parts availability</b><br>${esc(c.partsNotice)}</div>`
    : ''
  const approval = c.approvalLink ? `<p style="margin:18px 0"><a style="background:#15803d;color:white;padding:12px;text-decoration:none;display:inline-block" href="${esc(c.approvalLink+'&choice=approved')}">Review &amp; approve</a> <a style="background:#9b0c23;color:white;padding:12px;text-decoration:none;display:inline-block" href="${esc(c.approvalLink+'&choice=declined')}">Review &amp; decline</a></p><p style="font-size:12px">You will confirm your decision on the website. This link applies only to this estimate revision.</p>` : c.estimatePreview ? '<p><b>Approve / Decline links will be added when this estimate is sent.</b></p>' : ''
  const bill = c.bill
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;margin:6px 0 14px">
<tr style="background:#f3f4f6"><th align="left" style="padding:6px 8px">Item</th><th align="right" style="padding:6px 8px">Qty</th><th align="right" style="padding:6px 8px">Price</th><th align="right" style="padding:6px 8px">Amount</th></tr>
${c.bill.lines
  .map(
    (l) =>
      `<tr><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${esc(l.description)}<br><span style="color:#6b7280;font-size:12px">${kindLabel[l.kind]}</span></td>` +
      `<td align="right" style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${l.kind === 'labor' ? `${l.qty} hr` : l.qty}</td>` +
      `<td align="right" style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${money(l.unitPriceCents)}</td>` +
      `<td align="right" style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${money(Math.round(l.unitPriceCents * l.qty))}</td></tr>`
  )
  .join('')}
${c.bill.totals.taxExempt ? `<tr><td colspan="3" align="right" style="padding:6px 8px">Tax exempt</td><td align="right" style="padding:6px 8px">-${money(c.bill.totals.taxExemptCents)}</td></tr>` : `<tr><td colspan="3" align="right" style="padding:6px 8px;color:#6b7280">Subtotal</td><td align="right" style="padding:6px 8px;color:#6b7280">${money(c.bill.totals.subtotalCents ?? c.bill.totals.totalCents - c.bill.totals.taxCents)}</td></tr><tr><td colspan="3" align="right" style="padding:6px 8px;color:#6b7280">Sales tax</td><td align="right" style="padding:6px 8px;color:#6b7280">${money(c.bill.totals.taxCents)}</td></tr>`}
<tr><td colspan="3" align="right" style="padding:8px;font-size:16px"><b>Total</b></td><td align="right" style="padding:8px;font-size:16px"><b>${money(c.bill.totals.totalCents)}</b></td></tr>
${c.bill.feeCreditCents ? `<tr><td colspan="3" align="right" style="padding:6px 8px">Estimate fee already paid</td><td align="right" style="padding:6px 8px">-${money(c.bill.feeCreditCents)}</td></tr>
<tr><td colspan="3" align="right" style="padding:8px;font-size:16px;color:#9b0c23"><b>Balance due</b></td><td align="right" style="padding:8px;font-size:16px;color:#9b0c23"><b>${money(c.bill.balanceDueCents)}</b></td></tr>` : ''}
</table>`
    : ''
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#1c1f26">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden">
<tr><td style="background:#9b0c23;color:#ffffff;padding:14px 20px;font-size:20px;font-weight:bold">${esc(c.storeName)}</td></tr>
<tr><td style="padding:12px 20px;background:#f9fafb;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151">
Work order <b>${esc(c.woNumber)}</b> · ${esc(c.unit)}${c.serial ? ` · S/N ${esc(c.serial)}` : ''}<br>Status: <b>${esc(c.statusLabel)}</b></td></tr>
<tr><td style="padding:18px 20px 6px;font-size:15px;line-height:1.5">${paras}${notice}${approval}${bill}<p>Replies to this email are not monitored. Use the estimate link to approve or decline, or call the store with questions.</p></td></tr>
<tr><td style="padding:12px 20px 18px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb">${esc(c.storeName)}<br>${esc(c.storeAddress).replace(/\n/g, '<br>')}</td></tr>
</table></td></tr></table></body></html>`
}

export function woEmailText(c: WoEmailContent): string {
  const bill = c.bill
    ? [
        '',
        ...c.bill.lines.map(
          (l) => `${l.description} - ${l.kind === 'labor' ? `${l.qty} hr` : `x${l.qty}`} - ${money(Math.round(l.unitPriceCents * l.qty))}`
        ),
        c.bill.totals.taxExempt ? `Tax exempt: -${money(c.bill.totals.taxExemptCents)}` : `Sales tax: ${money(c.bill.totals.taxCents)}`,
        `TOTAL: ${money(c.bill.totals.totalCents)}`,
        ...(c.bill.feeCreditCents
          ? [`Estimate fee already paid: -${money(c.bill.feeCreditCents)}`, `BALANCE DUE: ${money(c.bill.balanceDueCents)}`]
          : []),
        ''
      ].join('\n')
    : ''
  return `Work order ${c.woNumber} - ${c.unit}${c.serial ? ` - S/N ${c.serial}` : ''}\nStatus: ${c.statusLabel}\n\n${c.body}\n\nReplies to this email are not monitored. Use the estimate link to approve or decline, or call the store with questions.${c.approvalLink ? '\n\nReview this estimate and approve or decline: '+c.approvalLink : c.estimatePreview ? '\n\nApproval links will be added when sent.' : ''}${c.partsNotice ? '\n\nParts availability\n' + c.partsNotice : ''}\n${bill}\n---\n${c.storeName}\n${c.storeAddress}`
}
