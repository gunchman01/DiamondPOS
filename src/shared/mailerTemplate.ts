/**
 * The mailer email itself. Shared so the Marketing screen preview is exactly
 * what customers receive. Email clients need old-fashioned table layout and
 * inline styles, which is why this looks the way it does.
 */
export interface MailerContent {
  unsubscribeUrl?: string
  pixelUrl?: string
  clickUrls?: Record<string,string>
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

// Only explicit HTTP(S) links in the message body are made clickable/tracked.
// The unsubscribe/reply footer is never routed through engagement tracking.
const urlPattern = /https?:\/\/[^\s<>"']+/gi
function bodyUrl(raw:string):string { return raw.replace(/[.,;:!?\)\]\}]+$/, '') }
function validUrl(value:string):boolean {try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!!u.hostname&&!u.username&&!u.password&&value.length<=2048}catch{return false}}
export function messageLinks(message:string,name:string):string[]{
 return [...new Set((personalise(message,name).match(urlPattern)??[]).map(bodyUrl).filter(validUrl))]
}
function linkBody(message:string,links:Record<string,string>|undefined,html:boolean):string {
 let out='',last=0
 for(const match of message.matchAll(urlPattern)){
  const raw=match[0],url=bodyUrl(raw),start=match.index!
  out+=html?esc(message.slice(last,start)):message.slice(last,start)
  if(validUrl(url)){
   const target=links?.[url]??url
   out+=html?`<a href="${esc(target)}" style="color:#9b0c23">${esc(url)}</a>${esc(raw.slice(url.length))}`:target+raw.slice(url.length)
  }else out+=html?esc(raw):raw
  last=start+raw.length
 }
 out+=html?esc(message.slice(last)):message.slice(last)
 return out
}

export function mailerHtml(c: MailerContent): string {
  const paragraphs = personalise(c.message, c.recipientName)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 12px">${linkBody(p,c.clickUrls,true).replace(/\n/g, '<br>')}</p>`)
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
${c.unsubscribeUrl ? `<a href="${esc(c.unsubscribeUrl)}" style="color:#9b0c23">Unsubscribe from marketing emails</a>.<br>` : ''}To unsubscribe by email, reply with <b>UNSUBSCRIBE</b> or email <a href="mailto:${esc(c.replyTo)}?subject=Unsubscribe" style="color:#9b0c23">${esc(c.replyTo)}</a>.
${c.pixelUrl ? '<br>Marketing emails may record image loads, link clicks and approximate request locations.' : ''}
</td></tr>
</table></td></tr></table>${c.pixelUrl ? `<img src="${esc(c.pixelUrl)}" width="1" height="1" alt="" style="border:0;width:1px;height:1px">` : ''}</body></html>`
}

export function mailerText(c: MailerContent): string {
  return [
    c.storeName,
    '',
    linkBody(personalise(c.message, c.recipientName).trim(),c.clickUrls,false),
    c.flyerSrc ? '\n(Our flyer is included in this email as a picture.)' : '',
    '',
    '---',
    `You're receiving this email because you asked to hear from ${c.storeName}.`,
    c.storeAddress,
    c.pixelUrl ? 'Marketing emails may record image loads, link clicks and approximate request locations.' : '',
    c.unsubscribeUrl ? `Unsubscribe from marketing emails: ${c.unsubscribeUrl}` : '',
    `To unsubscribe by email, reply with UNSUBSCRIBE or email ${c.replyTo}.`
  ]
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\n')
}
