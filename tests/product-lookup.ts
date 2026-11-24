import assert from 'node:assert/strict'
import path from 'node:path'
import {openDatabase} from '../src/main/server/db'
import {createApp} from '../src/main/server'
import {lookupProduct,ProductLookupError} from '../src/main/server/productLookup'
import {api} from '../src/renderer/src/api'
export async function testProductLookup(check:(n:string,f:()=>void)=>void,dir:string){
 const file=path.join(dir,'product-lookup.db'),db=openDatabase(file)
 const item=(sku:string,barcode:string|null,alu:string|null)=>Number(db.prepare("INSERT INTO products(name,sku,barcode,alu,type,price_cents,on_hand) VALUES (?,?,?,?,'inventory',100,25)").run('Item '+sku,sku,barcode,alu).lastInsertRowid)
 const id=item('49234','0000000111119','103-4210'),second=item('25752',null,'ALU-25752')
 const missing=(code:string)=>assert.throws(()=>lookupProduct(db,code),(e:any)=>e instanceof ProductLookupError&&e.status===404)
 try{
  check('scanned leading-zero item numbers resolve both reported examples without rewriting UPC, item number or ALU',()=>{
   const p=lookupProduct(db,'049234');assert.equal(p.id,id);assert.equal(p.sku,'49234');assert.equal(p.barcode,'0000000111119');assert.equal(p.alu,'103-4210');assert.equal(lookupProduct(db,'025752').id,second);assert.equal(lookupProduct(db,'000025752').id,second)
  })
  check('exact manufacturer UPC, item number and alphanumeric ALU keep their original lookup behavior',()=>{for(const code of ['0000000111119','49234','103-4210'])assert.equal(lookupProduct(db,code).id,id)})
  const numericAlu=item('ALU item',null,'000891'),numericUpc=item('UPC item','0007654321',null)
  check('numeric-only leading-zero fallback supports saved numeric ALU and UPC in either padding direction',()=>{assert.equal(lookupProduct(db,'891').id,numericAlu);assert.equal(lookupProduct(db,'00000891').id,numericAlu);assert.equal(lookupProduct(db,'7654321').id,numericUpc)})
  check('letters, punctuation, internal zeros and all-zero fallback are never stripped or guessed',()=>{for(const code of ['0103-4210','257052','000','',"' OR 1=1 --"])missing(code)})
  const exact=item('EXACT barcode','049234',null)
  check('exact barcode match wins over a different item whose number matches only after zero removal',()=>assert.equal(lookupProduct(db,'049234').id,exact))
  db.prepare('UPDATE products SET active=0 WHERE id=?').run(exact)
  check('inactive items never win exact or leading-zero fallback',()=>assert.equal(lookupProduct(db,'049234').id,id))
  const duplicate=item('049234',null,null)
  check('multiple normalized matches are rejected instead of choosing the first item',()=>assert.throws(()=>lookupProduct(db,'00049234'),(e:any)=>e.status===409&&/Multiple items/.test(e.message)))
  check('an exact item number still wins even if another item differs only by leading zeros',()=>assert.equal(lookupProduct(db,'049234').id,duplicate))
  db.prepare('UPDATE products SET active=1 WHERE id=?').run(exact)
  check('cross-field duplicate exact identifiers are rejected rather than silently selecting the wrong item',()=>assert.throws(()=>lookupProduct(db,'049234'),(e:any)=>e.status===409))
  const app=createApp(db,{dbFile:file,apiKey:'scan-test',port:0,appVersion:'test'}),server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as any).port}`
  try{
   const call=(code:string,paired=true)=>fetch(`${base}/api/products/lookup/${encodeURIComponent(code)}`,{headers:paired?{'X-Api-Key':'scan-test'}:{}})
   const ok=await call('025752'),p=await ok.json(),ambiguous=await call('049234'),unknown=await call('987654321'),denied=await call('025752',false)
   check('paired scanner API returns matched original fields and distinct ambiguous/not-found errors without stock changes',()=>{assert.equal(ok.status,200);assert.equal(p.sku,'25752');assert.equal(p.alu,'ALU-25752');assert.equal(ambiguous.status,409);assert.equal(unknown.status,404);assert.equal(denied.status,401);assert.equal((db.prepare('SELECT on_hand FROM products WHERE id=?').get(second) as any).on_hand,25)})
  }finally{await new Promise<void>(r=>server.close(()=>r()))}
  const original=globalThis.fetch
  try{
   globalThis.fetch=async()=>new Response(JSON.stringify({error:'Multiple items match this code'}),{status:409})
   let error:any
   try{await api.lookupProduct('049234')}catch(e){error=e}
   check('renderer API preserves ambiguity status so scan handler cannot bypass it with broad search',()=>{assert.equal(error?.status,409);assert.equal(error?.definite,true);assert.match(error.message,/Multiple items/)})
  }finally{globalThis.fetch=original}
 }finally{db.close()}
}
