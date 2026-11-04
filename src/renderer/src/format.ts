/** 1234 -> "$12.34" */
export function money(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`
}

/** "12.34" -> 1234 (returns NaN if not a valid amount) */
export function parseMoney(text: string): number {
  const cleaned = text.replace(/[$,\s]/g, '')
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return NaN
  return Math.round(parseFloat(cleaned) * 100)
}

/** Today's date as YYYY-MM-DD in local time */
export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString()
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
