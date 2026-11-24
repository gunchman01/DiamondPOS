import type {DB} from './db'
import {toProduct,type ProductRow} from './products'
export class ProductLookupError extends Error{constructor(public status:number,message:string){super(message)}}
/** Preserve exact identifiers first; numeric zero-padding is only a unique-match fallback. Never rewrite saved codes. */
export function lookupProduct(db:DB,raw:string){
 const code=raw.trim()
 if(!code)throw new ProductLookupError(404,'Item not found')
 const exact=db.prepare('SELECT * FROM products WHERE active=1 AND (barcode=? OR sku=? OR alu=?) LIMIT 2').all(code,code,code) as ProductRow[]
 if(exact.length>1)throw new ProductLookupError(409,'Multiple items match this code. Use Find item to choose the correct item.')
 if(exact.length===1)return toProduct(exact[0])
 if(/^\d{1,64}$/.test(code) && !/^0+$/.test(code)){
  const normalized=code.replace(/^0+/,'')
  const numeric=(field:string)=>`(${field}<>'' AND ${field} NOT GLOB '*[^0-9]*' AND ltrim(${field},'0')=?)`
  const matches=db.prepare(`SELECT * FROM products WHERE active=1 AND (${['barcode','sku','alu'].map(numeric).join(' OR ')}) LIMIT 2`).all(normalized,normalized,normalized) as ProductRow[]
  if(matches.length>1)throw new ProductLookupError(409,'Multiple items match this code after ignoring leading zeros. Use Find item to choose the correct item.')
  if(matches.length===1)return toProduct(matches[0])
 }
 throw new ProductLookupError(404,'Item not found')
}
