import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import path from 'node:path'
import {openDatabase} from '../src/main/server/db'
import {createSale,getSale,readSettings} from '../src/main/server'
import {receiptHtml,receiptElementInner} from '../src/renderer/src/receipt'
import {fullPageSaleHtml} from '../src/renderer/src/printTemplates'
import {receiptBlock,receiptElement,defaultDesigns,normaliseDesigns} from '../src/shared/printDesigns'
import {getCustomer} from '../src/main/server/customers'
export function testReceiptAddress(check:(n:string,f:()=>void)=>void,dir:string){
 const db=openDatabase(path.join(dir,'receipt-address.db'))
 try{
  const id=Number(db.prepare("INSERT INTO customers(first_name,last_name,street,street2,city,region,postcode) VALUES ('Address','Customer','123 Test <Street>','Suite 2','Claremore','OK','74019')").run().lastInsertRowid)
  const product=Number(db.prepare("INSERT INTO products(name,type,use_serial,price_cents,taxable,on_hand) VALUES ('Serialized mower','inventory',1,100,0,10)").run().lastInsertRowid)
  const request={requestId:crypto.randomUUID(),customerId:id,tillName:'Test',items:[{productId:product,qty:1,serial:'SN-ADDRESS-1'}],payments:[{method:'cash' as const,amountCents:100}]}
  const sale=createSale(db,request),savedAddress='123 Test <Street>\nSuite 2\nClaremore, OK 74019'
  db.prepare("UPDATE customers SET street='New Address',street2=NULL WHERE id=?").run(id)
  check('customer billing address is captured at sale and preserved through reprint and idempotent checkout retry',()=>{assert.equal(sale.customerAddress,savedAddress);assert.equal(getSale(db,sale.id)!.customerAddress,savedAddress);assert.equal(createSale(db,request).customerAddress,savedAddress)})
  const settings=readSettings(db),layout=defaultDesigns().receipt,element=receiptElement('text',{field:'customerAddress',onlySerialized:true,h:18})
  layout.header.elements=[];layout.footer.elements=[];layout.blocks=[receiptBlock('customerAddress',{onlySerialized:true})]
  const serialHtml=receiptHtml(sale,settings,80,layout,null,true)
  check('receipt designer address field and growing block print escaped address for serialized purchases',()=>{assert.ok(serialHtml.includes('123 Test &lt;Street&gt;<br>Suite 2<br>Claremore, OK 74019'));assert.ok(receiptElementInner(element,sale,settings,null).includes('&lt;Street&gt;'));assert.ok(!serialHtml.includes('New Address'))})
  const ordinary={...sale,items:sale.items.map(i=>({...i,serial:null}))},returned={...sale,items:sale.items.map(i=>({...i,qty:-1,kind:'return' as const}))}
  check('serialized-only address hides for ordinary purchases and serial-only returns; turning it off shows ordinary customer addresses',()=>{
   assert.ok(!receiptHtml(ordinary,settings,80,layout).includes('123 Test'));assert.equal(receiptElementInner(element,returned,settings,null),'')
   layout.blocks[0].onlySerialized=false;assert.ok(receiptHtml(ordinary,settings,80,layout).includes('123 Test'));assert.ok(!receiptHtml({...sale,customerAddress:''},settings,80,layout).includes('123 Test'))
  })
  layout.header.elements=[element];layout.header.heightMm=30
  const normalized=normaliseDesigns({receipt:layout}).receipt
  check('saved receipt designs preserve customer-address selection and serialized-only preference for fields and blocks',()=>{assert.equal(normalized.header.elements[0].field,'customerAddress');assert.equal(normalized.header.elements[0].onlySerialized,true);assert.equal(normalized.blocks[0].type,'customerAddress');assert.equal(normalized.blocks[0].onlySerialized,false)})
  check('full-page serialized receipts also use the captured billing address rather than a later customer edit',()=>{const html=fullPageSaleHtml(getSale(db,sale.id)!,settings,getCustomer(db,id),null);assert.ok(html.includes('123 Test &lt;Street&gt;'));assert.ok(!html.includes('New Address'))})
  check('address is on by default for all customer receipts and omitted when no address exists',()=>{const defaults=defaultDesigns().receipt;assert.ok(receiptHtml(ordinary,settings,80,defaults).includes('123 Test &lt;Street&gt;'));assert.ok(!receiptHtml({...ordinary,customerId:null,customerName:null,customerAddress:''},settings,80,defaults).includes('123 Test'))})
  check('existing layouts gain one address block while a saved designer removal or disabled block stays respected',()=>{const existing:any={receipt:{version:2,header:{heightMm:0,elements:[]},footer:{heightMm:0,elements:[]},blocks:[receiptBlock('items')]}};const upgraded=normaliseDesigns(existing);assert.equal(upgraded.receipt.blocks.filter(b=>b.type==='customerAddress').length,1);const removed={...upgraded,receipt:{...upgraded.receipt,blocks:upgraded.receipt.blocks.filter(b=>b.type!=='customerAddress')}};assert.ok(!normaliseDesigns(removed).receipt.blocks.some(b=>b.type==='customerAddress'));upgraded.receipt.blocks.find(b=>b.type==='customerAddress')!.on=false;assert.equal(normaliseDesigns(upgraded).receipt.blocks.find(b=>b.type==='customerAddress')!.on,false)})
  db.prepare('UPDATE sales SET customer_address_snapshot=NULL WHERE id=?').run(sale.id)
  check('legacy receipt without a snapshot uses the current customer address without writing invented historical data',()=>{assert.ok(getSale(db,sale.id)!.customerAddress!.startsWith('New Address'));assert.equal((db.prepare('SELECT customer_address_snapshot AS a FROM sales WHERE id=?').get(sale.id) as any).a,null)})
 }finally{db.close()}
}
