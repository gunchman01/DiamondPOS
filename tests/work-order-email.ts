import assert from 'node:assert/strict'
import type { DB } from '../src/main/server/db'
import { partsOrderingNotice, woEmailHtml, woEmailText, type WoEmailContent } from '../src/shared/workOrderEmail'
import type { WoLine } from '../src/shared/workorders'
import { getWoSettings, saveWoSettings } from '../src/main/server/workorders'

type Check = (name: string, fn: () => void) => void
export async function testWorkOrderEmails(check: Check, db: DB, call: (url: string) => Promise<{status:number;data:any}>) {
  const line: WoLine = {id:1,kind:'part',productId:1,description:'Filter <kit> & seal',sku:'KIT-1',qty:2,unitPriceCents:100,taxable:true,stockTaken:0,onHand:1,short:true}
  check('estimate parts notice detects partial stock, combines duplicate lines and ignores untracked charges', () => {
    assert.match(partsOrderingNotice('needs_estimate',[line]), /will have to be ordered/)
    assert.match(partsOrderingNotice('needs_estimate',[line]), /could take a week to arrive/)
    assert.equal(partsOrderingNotice('needs_estimate',[{...line,onHand:2}]),'')
    assert.ok(partsOrderingNotice('needs_estimate',[{...line,qty:1},{...line,id:2,qty:1}]))
    assert.equal(partsOrderingNotice('needs_estimate',[{...line,onHand:null},{...line,kind:'labor'}]),'')
  })
  check('approved estimate notices account for allocated stock without false shortages', () => {
    assert.equal(partsOrderingNotice('approved',[{...line,onHand:0,stockTaken:2}]),'')
    assert.ok(partsOrderingNotice('approved',[{...line,onHand:-1,stockTaken:2}]))
    assert.equal(partsOrderingNotice('ready_pickup',[line]),'')
    assert.equal(partsOrderingNotice('not_fixed',[line]),'')
  })
  check('shortage notice appears once in HTML and plain text with safe part descriptions', () => {
    const content: WoEmailContent={storeName:'Diamond P',storeAddress:'Test',body:'Custom estimate wording',partsNotice:partsOrderingNotice('needs_estimate',[line]),bill:null,woNumber:'WO-1',unit:'Mower',serial:'1',statusLabel:'Needs Estimate'}
    const html=woEmailHtml(content),text=woEmailText(content)
    assert.ok(html.includes('Custom estimate wording'));assert.ok(text.includes('Custom estimate wording'))
    assert.ok(html.includes('Filter &lt;kit&gt; &amp; seal'));assert.ok(!html.includes('Filter <kit>'))
    assert.equal((html.match(/could take a week/g)??[]).length,1);assert.equal((text.match(/could take a week/g)??[]).length,1)
  })
  const customer=Number(db.prepare("INSERT INTO customers(first_name,last_name,email) VALUES ('Estimate','Customer','estimate@example.com')").run().lastInsertRowid)
  const unit=Number(db.prepare("INSERT INTO customer_units(customer_id,model) VALUES (?,'Test mower')").run(customer).lastInsertRowid)
  const wo=Number(db.prepare('INSERT INTO work_orders(customer_id,unit_id) VALUES (?,?)').run(customer,unit).lastInsertRowid)
  db.prepare("UPDATE products SET type='inventory',on_hand=1 WHERE id=1").run()
  for(let n=0;n<2;n++) db.prepare("INSERT INTO work_order_lines(work_order_id,kind,product_id,description,qty,unit_price_cents) VALUES (?,'part',1,'Filter <kit> & seal',1,100)").run(wo)
  const settings=getWoSettings(db)
  saveWoSettings(db,{templates:{...settings.templates,needs_estimate:{...settings.templates.needs_estimate,body:'My customized estimate message',includeBill:false}}})
  const preview=await call(`/api/workorders/${wo}/email-preview`)
  check('live estimate preview adds notice to existing customized templates without requiring a bill', () => {
    assert.equal(preview.status,200);assert.ok(preview.data.html.includes('My customized estimate message'))
    assert.ok(preview.data.text.includes('will have to be ordered'));assert.ok(preview.data.html.includes('could take a week to arrive'))
    assert.equal(getWoSettings(db).templates.needs_estimate.body,'My customized estimate message')
    assert.equal(db.prepare('SELECT on_hand FROM products WHERE id=1').get().on_hand,1)
  })
  db.prepare('UPDATE products SET on_hand=2 WHERE id=1').run()
  const restocked=await call(`/api/workorders/${wo}/email-preview`)
  check('estimate preview rechecks current stock and removes ordering notice when sufficient stock arrives', () => {
    assert.equal(restocked.status,200);assert.ok(!restocked.data.text.includes('will have to be ordered'));assert.ok(!restocked.data.html.includes('Parts availability'))
  })
}
