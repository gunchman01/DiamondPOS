import type { DB } from '../db'
import type { QbConfig } from '../../../shared/quickbooks'
import type { TaxRate } from '../../../shared/types'
import { getQbLists } from './store'

export const taxMappingKey = (id: string | null, rate: number) => `${id || 'legacy'}@${rate.toFixed(8)}`
export function taxChoices(db: DB, current: TaxRate[]) {
  const choices = new Map(current.map(t => [taxMappingKey(t.id,t.rate), {key:taxMappingKey(t.id,t.rate),name:t.name,rate:t.rate}]))
  const old = db.prepare('SELECT DISTINCT tax_rate_id AS id,tax_rate AS rate,tax_rate_name AS name FROM sales WHERE tax_rate IS NOT NULL').all() as {id:string|null;rate:number;name:string|null}[]
  for(const t of old) {const key=taxMappingKey(t.id,t.rate);if(!choices.has(key))choices.set(key,{key,name:`${t.name || 'Historical tax'} (previous sales)`,rate:t.rate})}
  return [...choices.values()]
}
export function resolveSaleTax(db: DB, cfg: QbConfig, sale: {tax_rate:number|null;tax_rate_id:string|null;tax_rate_name:string|null}) {
  const rate=sale.tax_rate
  if(rate===null || !Number.isFinite(rate)) return {error:'This sale has no saved tax rate. Review its tax before syncing.'}
  const key=taxMappingKey(sale.tax_rate_id,rate)
  const raw=db.prepare("SELECT key,value FROM settings WHERE key IN ('tax_rates','tax_rate_default')").all() as {key:string;value:string}[]
  let current:TaxRate[]=[]
  try{current=JSON.parse(raw.find(r=>r.key==='tax_rates')?.value || '[]')}catch{}
  const defaultId=raw.find(r=>r.key==='tax_rate_default')?.value || current[0]?.id || 'tax1'
  const explicit=cfg.taxMappings?.[key]
  const name=explicit || ((sale.tax_rate_id===defaultId || !sale.tax_rate_id) ? cfg.salesTaxItem : '')
  const label=`${sale.tax_rate_name || 'Saved tax'} (${Number((rate*100).toFixed(5))}%)`
  if(!name) return {error:`Map ${label} to a QuickBooks sales tax item in Settings → QuickBooks.`}
  const item=getQbLists(db).salesTaxItems.find(t=>t.name===name)
  if(!item || item.rate===null || !Number.isFinite(item.rate)) return {error:`Refresh QuickBooks lists and choose a valid sales tax item for ${label}.`}
  if(Math.abs(item.rate/100-rate)>0.00000001) return {error:`Tax rate mismatch: ${label} maps to ${name} (${item.rate}%). Choose a matching QuickBooks tax item.`}
  return {name,rate}
}
