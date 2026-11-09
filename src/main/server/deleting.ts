/**
 * Deleting items and customers.
 * Something with no history is erased. Something that past sales or work orders refer to can't be
 * erased (those records must stay correct), so it is made inactive instead: hidden from searches and the
 * Sale screen, but still shown on old receipts. Inactive ones can be found with "Show inactive".
 */
import type express from 'express'
import type { DB } from './db'
import { customerDisplayName } from '../../shared/types'
import type { DeleteResult } from '../../shared/deleting'

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

function ids(body: unknown): number[] {
  const list = (body as { ids?: unknown })?.ids
  if (!Array.isArray(list) || list.length === 0) throw Object.assign(new Error('Choose what to delete'), { status: 400 })
  return [...new Set(list.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 50000)
}

export function deleteProducts(db: DB, idList: number[]): DeleteResult {
  const out: DeleteResult = { deleted: 0, deactivated: 0, notFound: 0, results: [] }
  const get = db.prepare('SELECT id, name FROM products WHERE id = ?')
  const sold = db.prepare('SELECT COUNT(*) AS n FROM sale_items WHERE product_id = ?')
  const onWo = db.prepare('SELECT COUNT(*) AS n FROM work_order_lines WHERE product_id = ?')
  const del = db.prepare('DELETE FROM products WHERE id = ?')
  const off = db.prepare("UPDATE products SET active = 0, quick_pick = 0, updated_at = datetime('now') WHERE id = ?")
  db.transaction(() => {
    for (const id of idList) {
      const p = get.get(id) as { id: number; name: string } | undefined
      if (!p) {
        out.notFound++
        out.results.push({ id, name: '', action: 'not_found' })
        continue
      }
      const s = (sold.get(id) as { n: number }).n
      const w = (onWo.get(id) as { n: number }).n
      if (s || w) {
        off.run(id)
        out.deactivated++
        out.results.push({
          id,
          name: p.name,
          action: 'deactivated',
          reason: `on ${[s ? plural(s, 'sale line') : '', w ? plural(w, 'work order line') : ''].filter(Boolean).join(' and ')}`
        })
      } else {
        del.run(id)
        out.deleted++
        out.results.push({ id, name: p.name, action: 'deleted' })
      }
    }
  })()
  return out
}

export function deleteCustomers(db: DB, idList: number[]): DeleteResult {
  const out: DeleteResult = { deleted: 0, deactivated: 0, notFound: 0, results: [] }
  const get = db.prepare('SELECT * FROM customers WHERE id = ?')
  const sales = db.prepare('SELECT COUNT(*) AS n FROM sales WHERE customer_id = ?')
  const wos = db.prepare('SELECT COUNT(*) AS n FROM work_orders WHERE customer_id = ?')
  const off = db.prepare("UPDATE customers SET active = 0, updated_at = datetime('now') WHERE id = ?")
  db.transaction(() => {
    for (const id of idList) {
      const c = get.get(id) as Record<string, unknown> | undefined
      if (!c) {
        out.notFound++
        out.results.push({ id, name: '', action: 'not_found' })
        continue
      }
      const name = customerDisplayName({
        firstName: c.first_name as string | null,
        lastName: c.last_name as string | null,
        company: c.company as string | null,
        trackAsCompany: c.track_as_company === 1
      })
      const s = (sales.get(id) as { n: number }).n
      const w = (wos.get(id) as { n: number }).n
      if (s || w) {
        off.run(id)
        out.deactivated++
        out.results.push({
          id,
          name,
          action: 'deactivated',
          reason: `has ${[s ? plural(s, 'sale') : '', w ? plural(w, 'work order') : ''].filter(Boolean).join(' and ')}`
        })
      } else {
        // Nothing important refers to them: tidy up their bits and erase them
        db.prepare('DELETE FROM customer_units WHERE customer_id = ?').run(id)
        db.prepare('DELETE FROM marketing_sends WHERE customer_id = ?').run(id)
        db.prepare('UPDATE held_sales SET customer_id = NULL WHERE customer_id = ?').run(id)
        db.prepare('DELETE FROM customers WHERE id = ?').run(id)
        out.deleted++
        out.results.push({ id, name, action: 'deleted' })
      }
    }
  })()
  return out
}

export function registerDeleteRoutes(app: express.Express, db: DB) {
  const wrap = (fn: (b: unknown) => DeleteResult) => (req: express.Request, res: express.Response) => {
    try {
      res.json(fn(req.body))
    } catch (e) {
      const status = (e as { status?: number }).status
      if (status) res.status(status).json({ error: (e as Error).message })
      else throw e
    }
  }
  app.post('/api/products/delete', wrap((b) => deleteProducts(db, ids(b))))
  app.post('/api/customers/delete', wrap((b) => deleteCustomers(db, ids(b))))
}
