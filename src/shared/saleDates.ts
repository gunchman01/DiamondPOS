/** API timestamps are canonical UTC ISO strings; null/omitted keeps the actual checkout time. */
export function saleInstant(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) throw new Error('Choose a valid sale date and time')
  const date = new Date(value)
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new Error('Choose a valid sale date and time')
  return value
}
export function localSaleTime(iso: string): string {
  const d = new Date(iso), pad = (v: number) => String(v).padStart(2,'0')
  return `${String(d.getFullYear()).padStart(4,'0')}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export function saleTimeFromLocal(value: string): string {
  const d = new Date(value)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !Number.isFinite(d.getTime()) || localSaleTime(d.toISOString()) !== value) throw new Error('Choose a valid sale date and time (check daylight-saving time)')
  return saleInstant(d.toISOString())!
}
