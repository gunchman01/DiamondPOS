/**
 * The mailer email itself. Shared so the Marketing screen preview is exactly
 * what customers receive. Email clients need old-fashioned table layout and
 * inline styles, which is why this looks the way it does.
 */
export interface MailerContent {
  storeName: string
  storeAddress: string
  replyTo: string
  subject: string
  message: string
  /** Image source for the flyer: "cid:…" in real emails, a data: URL in the preview */
  flyerSrc: string | null
  /** Recipient's name, used for {name} in the message */
  recipientName: string
}

export const FLYER_CID = 'flyer@diamondpos'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function personalise(message: string, name: string): string {
  return message.replace(/\{name\}/gi, name || 'there')
}

export function mailerHtml(c: MailerContent): string {
  const paragraphs = personalise(c.message, c.recipientName)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 12px">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#1c1f26">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f5"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden">
<tr><td style="background:#9b0c23;color:#ffffff;padding:14px 20px;font-size:20px;font-weight:bold">${esc(c.storeName)}</td></tr>
${paragraphs ? `<tr><td style="padding:18px 20px 6px;font-size:16px;line-height:1.5">${paragraphs}</td></tr>` : ''}
${c.flyerSrc ? `<tr><td style="padding:0"><img src="${esc(c.flyerSrc)}" width="600" alt="${esc(c.subject)}" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>` : ''}
<tr><td style="padding:16px 20px 20px;font-size:12px;line-height:1.6;color:#646a75;border-top:1px solid #e5e7eb">
You're receiving this email because you asked to hear from ${esc(c.storeName)}.<br>
${esc(c.storeAddress).replace(/\n/g, '<br>')}<br>
To unsubscribe, reply with <b>UNSUBSCRIBE</b> or email <a href="mailto:${esc(c.replyTo)}?subject=Unsubscribe" style="color:#9b0c23">${esc(c.replyTo)}</a>.
</td></tr>
</table></td></tr></table></body></html>`
}

export function mailerText(c: MailerContent): string {
  return [
    c.storeName,
    '',
    personalise(c.message, c.recipientName).trim(),
    c.flyerSrc ? '\n(Our flyer is included in this email as a picture.)' : '',
    '',
    '---',
    `You're receiving this email because you asked to hear from ${c.storeName}.`,
    c.storeAddress,
    `To unsubscribe, reply with UNSUBSCRIBE or email ${c.replyTo}.`
  ]
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\n')
}
