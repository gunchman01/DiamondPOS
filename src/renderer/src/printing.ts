/**
 * Where things print (Settings → Printing, saved on this computer):
 *  - receipts → receipt printer, unless the sale has a serial-numbered unit or is a work order payment
 *    (then a Letter page on the full-page / laser printer, if switched on)
 *  - work orders → full-page printer
 *  - price tags → label printer (Zebra)
 */
import type { Product, Sale } from '../../shared/types'
import { printSettings, printsFullPage, type PrintSettings } from '../../shared/printing'
import type { WorkOrder } from '../../shared/workorders'
import { api } from './api'
import { receiptHtml } from './receipt'
import { fullPageSaleHtml, tagsHtml, workOrderHtml } from './printTemplates'
import { normaliseDesigns, type LabelTemplate, type PrintDesigns } from '../../shared/printDesigns'

/** Label templates + receipt layout (shared by all tills, kept on the Store Server) */
export async function printDesigns(): Promise<PrintDesigns> {
  return api.printDesigns().catch(() => normaliseDesigns(undefined))
}

export async function currentPrintSettings(): Promise<PrintSettings> {
  const boot = await window.pos.getBootInfo()
  return printSettings(boot.config.printing)
}

async function storeAndLogo() {
  const [boot, store] = await Promise.all([window.pos.getBootInfo(), api.getSettings()])
  const logo = store.hasLogo && boot.config.serverUrl ? `${boot.config.serverUrl.replace(/\/+$/, '')}/kiosk/logo?v=${Date.now()}` : null
  return { store, logo }
}

const woNumber = (id: number | null) => (id ? `WO-${String(id).padStart(6, '0')}` : null)

/** Print a sale on the right printer. Returns where it went (for messages). */
export async function printSale(sale: Sale): Promise<'receipt' | 'fullPage'> {
  const s = await currentPrintSettings()
  const { store, logo } = await storeAndLogo()
  if (printsFullPage(sale, s)) {
    const customer = sale.customerId ? await api.getCustomer(sale.customerId).then((d) => d.customer).catch(() => null) : null
    await window.pos.print({
      html: fullPageSaleHtml(sale, store, customer, logo, woNumber(sale.workOrderId)),
      printer: s.fullPagePrinter,
      copies: s.fullPageCopies,
      letter: true
    })
    return 'fullPage'
  }
  const designs = await printDesigns()
  await window.pos.print({
    html: receiptHtml(sale, store, s.receiptWidthMm, designs.receipt, logo),
    printer: s.receiptPrinter,
    copies: s.receiptCopies
  })
  return 'receipt'
}

/** Print a work order ticket (estimate / repair) full page */
export async function printWorkOrder(wo: WorkOrder): Promise<void> {
  const s = await currentPrintSettings()
  const { store, logo } = await storeAndLogo()
  const customer = await api.getCustomer(wo.customerId).then((d) => d.customer).catch(() => null)
  await window.pos.print({ html: workOrderHtml(wo, store, customer, logo), printer: s.fullPagePrinter, letter: true })
}

/** Which label template an item uses: the "no price" one for items without a price (parts, bin labels) */
export function templateFor(p: Partial<Product>, s: PrintSettings, labels: LabelTemplate[], override?: string | null): LabelTemplate {
  const want = override || ((p.priceCents ?? 0) > 0 ? s.priceTagTemplate : s.noPriceTagTemplate)
  return labels.find((t) => t.id === want) ?? labels[0]
}

/** Print tags on the label printer. override = use this template for every item. One print job per template. */
export async function printTags(items: { product: Product; qty: number }[], override?: string | null): Promise<number> {
  const list = items.filter((i) => i.qty > 0)
  if (list.length === 0) return 0
  const [s, designs, { store }] = await Promise.all([currentPrintSettings(), printDesigns(), storeAndLogo()])
  const groups = new Map<LabelTemplate, { product: Product; qty: number }[]>()
  for (const it of list) {
    const t = templateFor(it.product, s, designs.labels, override)
    groups.set(t, [...(groups.get(t) ?? []), it])
  }
  for (const [t, group] of groups)
    await window.pos.print({ html: tagsHtml(group, store, t), printer: s.labelPrinter, pageMm: { width: t.widthIn * 25.4, height: t.heightIn * 25.4 } })
  return list.reduce((n, i) => n + i.qty, 0)
}

export const SAMPLE_ITEM: Partial<Product> = {
  name: 'Oregon 20in Chainsaw Chain 72LGX070G',
  description: '3/8" pitch, .050 gauge, 70 drive links',
  priceCents: 3499,
  sku: 'ORE-72LGX070',
  barcode: '009451404421',
  alu: '72LGX070G',
  department: 'Chainsaw Parts',
  manufacturer: 'Oregon',
  vendor: 'Oregon Tool',
  size: '20 in',
  attribute: 'Full chisel',
  unitOfMeasure: 'Each'
}

/** Sample sale used by the Test buttons */
export function sampleSale(serial: boolean): Sale {
  return {
    id: 0,
    createdAt: new Date().toISOString(),
    tillName: 'Test print',
    totalCents: serial ? 18998 : 1299,
    taxCents: serial ? 1284 : 88,
    changeCents: 0,
    customerId: null,
    customerName: serial ? 'Sample Customer' : null,
    taxExempt: false,
    taxExemptId: null,
    taxExemptCents: 0,
    workOrderId: null,
    items: [
      { productId: 1, name: 'Bar & chain oil 1 qt', qty: 1, unitPriceCents: 1299, lineTotalCents: 1299, serial: null },
      ...(serial ? [{ productId: 2, name: 'Sample blower', qty: 1, unitPriceCents: 17699, lineTotalCents: 17699, serial: 'SN-TEST-0001' }] : [])
    ],
    payments: [{ method: 'cash', amountCents: serial ? 18998 : 1299 }]
  }
}

export async function testPrint(kind: 'receipt' | 'fullPage' | 'label', s: PrintSettings): Promise<void> {
  const { store, logo } = await storeAndLogo()
  if (kind === 'receipt')
    return window.pos.print({
      html: receiptHtml(sampleSale(false), store, s.receiptWidthMm, (await printDesigns()).receipt, logo),
      printer: s.receiptPrinter
    })
  if (kind === 'fullPage')
    return window.pos.print({ html: fullPageSaleHtml(sampleSale(true), store, null, logo, null), printer: s.fullPagePrinter, letter: true })
  const designs = await printDesigns()
  const t = templateFor(SAMPLE_ITEM, s, designs.labels)
  return window.pos.print({
    html: tagsHtml([{ product: SAMPLE_ITEM, qty: 1 }], store, t),
    printer: s.labelPrinter,
    pageMm: { width: t.widthIn * 25.4, height: t.heightIn * 25.4 }
  })
}
