import assert from 'node:assert/strict'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { mappedRowToItem, suggestedItemMapping } from '../src/shared/itemImport'
import { itemColumnIds, ITEM_COLUMNS } from '../src/renderer/src/itemColumns'
import { readSpreadsheet } from '../src/renderer/src/spreadsheet'
import { openDatabase } from '../src/main/server/db'
import { importProducts } from '../src/main/server/products'
import { deleteProducts, deleteCustomers } from '../src/main/server/deleting'

type Check = (name: string, fn: () => void) => void
export async function testItemTools(check: Check, dir: string) {
  check('explicit mapping accepts arbitrary headings and reuses a source for name and description', () => {
    const result = mappedRowToItem({ Label: 'New mower', Part: '00012', Code: '001234', Retail: '199.95', Other: 'Keep me' },
      { name: 'Label', description: 'Label', sku: 'Part', barcode: 'Code', priceCents: 'Retail' }, 7, ['Other'])
    assert.deepEqual(result.errors, [])
    assert.equal(result.item.name, 'New mower'); assert.equal(result.item.description, 'New mower')
    assert.equal(result.item.sku, '00012'); assert.equal(result.item.barcode, '001234'); assert.equal(result.item.priceCents, 19995)
    assert.equal(result.item.__row, 7); assert.deepEqual(JSON.parse(result.item.extra!), { Other: 'Keep me' })
  })
  check('unmapped fields remain absent and mapped bad numbers report destination fields', () => {
    const result = mappedRowToItem({ Label: 'Oil', Stock: 0, Price: 'bad' }, { name: 'Label', onHand: 'Stock', priceCents: 'Price' }, 2)
    assert.equal(result.item.onHand, 0); assert.equal(result.item.description, undefined); assert.equal(result.item.extra, undefined)
    assert.ok(result.errors.some((s) => s.startsWith('Reg Price:')))
    assert.equal(suggestedItemMapping(['SKU', 'description', 'Price']).sku, 'SKU')
    assert.equal(suggestedItemMapping(['SKU', 'description', 'Price']).description, 'description')
  })
  check('item column preferences retain order, remove unknown/duplicate IDs and keep the name visible', () => {
    assert.deepEqual(itemColumnIds(['costCents','sku','sku','bogus']), ['name','costCents','sku'])
    assert.deepEqual(itemColumnIds(['barcode','name']), ['barcode','name'])
    assert.ok(itemColumnIds(null).includes('onHand'))
    assert.ok(ITEM_COLUMNS.some((c) => c.id === 'description'))
    assert.ok(ITEM_COLUMNS.some((c) => c.id === 'manufacturer'))
    assert.ok(ITEM_COLUMNS.some((c) => c.id === 'price4Cents'))
  })
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([[' Part ', ' Label '],['00012','Mower']]),'Inventory')
  const bytes=XLSX.write(wb,{type:'buffer',bookType:'xlsx'})
  const sheet=await readSpreadsheet({ arrayBuffer: async () => bytes } as File)
  check('real Excel headings with padding map correctly and text identifiers retain leading zeros', () => {
    assert.deepEqual(sheet.headers,['Part','Label']);assert.equal(sheet.rows[0].values.Part,'00012')
    assert.equal(mappedRowToItem(sheet.rows[0].values,{sku:'Part',name:'Label'},2).item.name,'Mower')
  })
  const db=openDatabase(path.join(dir,'item-tools.db'))
  try {
    const initial=importProducts(db,[{__row:2,name:'Old label',sku:'CUSTOM-001',priceCents:1500,onHand:9}],{dryRun:false,updateExisting:true})
    assert.equal(initial.created,1)
    const id=(db.prepare("SELECT id FROM products WHERE sku='CUSTOM-001'").get() as any).id
    const mapped=mappedRowToItem({ ID:'CUSTOM-001',NewText:'Correct label' },{sku:'ID',name:'NewText',description:'NewText'},3).item
    check('mapped label correction previews without writing and updates without replacing stock', () => {
      assert.equal(importProducts(db,[mapped],{dryRun:true,updateExisting:true}).updated,1)
      assert.equal((db.prepare('SELECT name FROM products WHERE id=?').get(id) as any).name,'Old label')
      assert.equal(importProducts(db,[mapped],{dryRun:false,updateExisting:true}).updated,1)
      const p=db.prepare('SELECT name,description,on_hand,price_cents FROM products WHERE id=?').get(id) as any
      assert.equal(p.name,'Correct label');assert.equal(p.description,'Correct label');assert.equal(p.on_hand,9);assert.equal(p.price_cents,1500)
    })
    check('bulk cleanup erases unreferenced test records', () => {
      const customer=Number(db.prepare("INSERT INTO customers(first_name) VALUES('Test cleanup')").run().lastInsertRowid)
      assert.equal(deleteProducts(db,[id]).deleted,1);assert.equal(deleteCustomers(db,[customer]).deleted,1)
    })
    check('bulk cleanup preserves non-inventory held items and associated customers', () => {
      importProducts(db,[{name:'Held service',sku:'HELD-SERVICE',type:'service',priceCents:100}],{dryRun:false,updateExisting:true})
      const product=(db.prepare("SELECT id FROM products WHERE sku='HELD-SERVICE'").get() as any).id
      const customer=Number(db.prepare("INSERT INTO customers(first_name) VALUES('Held customer')").run().lastInsertRowid)
      db.prepare("INSERT INTO held_sales(customer_id,items_json,till_name) VALUES(?,?,'Test')").run(customer,JSON.stringify([{productId:product,qty:1}]))
      assert.equal(deleteProducts(db,[product]).deactivated,1);assert.equal(deleteCustomers(db,[customer]).deactivated,1)
      assert.equal((db.prepare('SELECT customer_id FROM held_sales WHERE customer_id=?').get(customer) as any).customer_id,customer)
    })
  } finally { db.close() }
}
