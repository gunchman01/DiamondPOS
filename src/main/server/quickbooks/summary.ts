/**
 * Daily summary for QuickBooks: one Sales Receipt per day per payment method.
 *
 * Each receipt has, per department, a TAXABLE line (net of tax) and a
 * NON-TAXABLE line (non-taxable items + all items on tax-exempt sales).
 * QuickBooks then adds sales tax = its tax item rate × taxable lines. Because
 * our tax was worked out per sale, it can differ by a few cents; that
 * difference goes on a "POS Tax Rounding" line so the receipt total in
 * QuickBooks always equals the money actually taken.
 */
import type { DB } from '../db'
import {
  QB_ROUNDING_ITEM,
  qbItemName,
  qbRefNumber,
  type QbConfig,
  type QbDailySummary,
  type QbMethod,
  type QbSummaryLine
} from '../../../shared/quickbooks'

interface SaleRow {
  id: number
  total_cents: number
  tax_cents: number
  tax_exempt: number
  /** 'added' (tax on top, v0.3.16+) or 'inclusive' (older sales: tax inside the line amounts) */
  tax_mode: string | null
}

/** Dates (YYYY-MM-DD, store local time) that have completed sales, from `from` up to but not including `before` */
export function salesDates(db: DB, from: string, before: string): string[] {
  return (
    db
      .prepare(
        `SELECT DISTINCT date(created_at, 'localtime') AS d FROM sales
         WHERE status = 'completed' AND date(created_at, 'localtime') >= ? AND date(created_at, 'localtime') < ?
         ORDER BY d`
      )
      .all(from, before) as { d: string }[]
  ).map((r) => r.d)
}

/**
 * Split `total` across weights so the parts add up exactly.
 * Works with refunds too (negative totals / weights): each part is rounded,
 * and any cents left over go on the biggest weight.
 */
function allocate(total: number, weights: number[]): number[] {
  if (weights.length === 0 || total === 0) return weights.map(() => 0)
  const sum = weights.reduce((s, w) => s + w, 0)
  const parts = sum === 0 ? weights.map(() => 0) : weights.map((w) => Math.round((total * w) / sum))
  let biggest = 0
  weights.forEach((w, i) => {
    if (Math.abs(w) > Math.abs(weights[biggest])) biggest = i
  })
  parts[biggest] += total - parts.reduce((s, p) => s + p, 0)
  return parts
}

/**
 * Build the Sales Receipts for one day.
 * @param qbTaxRate  rate of the QuickBooks sales tax item as a fraction (e.g. 0.0725); null = use the store rate
 */
export function dailySummaries(
  db: DB,
  saleDate: string,
  cfg: QbConfig,
  storeTaxRate: number,
  qbTaxRate: number | null
): QbDailySummary[] {
  const sales = db
    .prepare(
      `SELECT id, total_cents, tax_cents, tax_exempt, tax_mode FROM sales
       WHERE status = 'completed' AND date(created_at, 'localtime') = ? ORDER BY id`
    )
    .all(saleDate) as SaleRow[]
  if (sales.length === 0) return []
  const ids = sales.map((s) => s.id)
  const marks = ids.map(() => '?').join(',')

  // The payment type of a sale = its largest payment (the till takes one payment per sale).
  // A refund's payment is negative (money given back), so compare sizes.
  const pays = db
    .prepare(`SELECT sale_id, method, amount_cents FROM payments WHERE sale_id IN (${marks})`)
    .all(...ids) as { sale_id: number; method: QbMethod; amount_cents: number }[]
  const methodOf = new Map<number, QbMethod>()
  const biggest = new Map<number, number>()
  for (const p of pays) {
    if ((biggest.get(p.sale_id) ?? -1) < Math.abs(p.amount_cents)) {
      biggest.set(p.sale_id, Math.abs(p.amount_cents))
      methodOf.set(p.sale_id, p.method)
    }
  }

  const items = db
    .prepare(
      `SELECT si.sale_id, si.line_total_cents AS amount,
              COALESCE(si.department, p.department, '') AS dept,
              COALESCE(si.taxable, p.taxable, 1) AS taxable
       FROM sale_items si LEFT JOIN products p ON p.id = si.product_id
       WHERE si.sale_id IN (${marks})`
    )
    .all(...ids) as { sale_id: number; amount: number; dept: string; taxable: number }[]
  const itemsBySale = new Map<number, typeof items>()
  for (const it of items) {
    if (!itemsBySale.has(it.sale_id)) itemsBySale.set(it.sale_id, [])
    itemsBySale.get(it.sale_id)!.push(it)
  }

  const result: QbDailySummary[] = []
  for (const method of ['cash', 'card', 'check'] as QbMethod[]) {
    const group = sales.filter((s) => (methodOf.get(s.id) ?? 'cash') === method)
    if (group.length === 0) continue

    const taxableNet = new Map<string, number>()
    const nonTaxable = new Map<string, number>()
    const add = (m: Map<string, number>, d: string, v: number) => m.set(d, (m.get(d) ?? 0) + v)
    let tax = 0
    let total = 0
    let exemptCount = 0
    for (const s of group) {
      total += s.total_cents
      tax += s.tax_cents
      if (s.tax_exempt) exemptCount++
      const its = itemsBySale.get(s.id) ?? []
      const taxed = its.filter((it) => it.taxable && !s.tax_exempt)
      for (const it of its) if (!(it.taxable && !s.tax_exempt)) add(nonTaxable, it.dept ?? '', it.amount)
      if (s.tax_mode === 'added') {
        // Line amounts are already before tax
        for (const it of taxed) add(taxableNet, it.dept ?? '', it.amount)
      } else {
        // Older tax-inclusive sale: take this sale's tax out of its taxable lines
        const share = allocate(s.tax_cents, taxed.map((it) => it.amount))
        taxed.forEach((it, i) => add(taxableNet, it.dept ?? '', it.amount - share[i]))
      }
    }
    const taxableNetTotal = [...taxableNet.values()].reduce((a, b) => a + b, 0)
    const qbTax = Math.round(taxableNetTotal * (qbTaxRate ?? storeTaxRate))

    const account = (d: string) => cfg.departmentAccounts[d] || cfg.defaultIncomeAccount
    const lines: QbSummaryLine[] = []
    const allDepts = [...new Set([...taxableNet.keys(), ...nonTaxable.keys()])].sort((a, b) => a.localeCompare(b))
    for (const d of allDepts) {
      const t = taxableNet.get(d) ?? 0
      const n = nonTaxable.get(d) ?? 0
      if (t) lines.push({ department: d, itemName: qbItemName(d), account: account(d), taxable: true, amountCents: t })
      if (n) lines.push({ department: d, itemName: qbItemName(d), account: account(d), taxable: false, amountCents: n })
    }
    const rounding = tax - qbTax
    if (rounding !== 0)
      lines.push({
        department: '',
        itemName: QB_ROUNDING_ITEM,
        account: cfg.defaultIncomeAccount,
        taxable: false,
        amountCents: rounding
      })

    result.push({
      saleDate,
      method,
      refNumber: qbRefNumber(saleDate, method),
      saleCount: group.length,
      firstSaleId: group[0].id,
      lastSaleId: group[group.length - 1].id,
      taxExemptCount: exemptCount,
      totalCents: total,
      taxCents: tax,
      roundingCents: rounding,
      lines
    })
  }
  return result
}
