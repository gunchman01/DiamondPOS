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
  await window.pos.print({ html: receiptHtml(sale, store, s.receiptWidthMm), printer: s.receiptPrinter, copies: s.receiptCopies })
  return 'receipt'
}

/** Print a work order ticket (estimate / repair) full page */
export async function printWorkOrder(wo: WorkOrder): Promise<void> {
  const s = await currentPrintSettings()
  const { store, logo } = await storeAndLogo()
  const customer = await api.getCustomer(wo.customerId).then((d) => d.customer).catch(() => null)
  await window.pos.print({ html: workOrderHtml(wo, store, customer, logo), printer: s.fullPagePrinter, letter: true })
}

/** Print price tags on the label printer */
export async function printTags(items: { product: Product; qty: number }[]): Promise<number> {
  const list = items.filter((i) => i.qty > 0)
  if (list.length === 0) return 0
  const s = await currentPrintSettings()
  const { store } = await storeAndLogo()
  await window.pos.print({
    html: tagsHtml(list, store, s.label),
    printer: s.labelPrinter,
    pageMm: { width: s.label.widthIn * 25.4, height: s.label.heightIn * 25.4 }
  })
  return list.reduce((n, i) => n + i.qty, 0)
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
    return window.pos.print({ html: receiptHtml(sampleSale(false), store, s.receiptWidthMm), printer: s.receiptPrinter })
  if (kind === 'fullPage')
    return window.pos.print({ html: fullPageSaleHtml(sampleSale(true), store, null, logo, null), printer: s.fullPagePrinter, letter: true })
  const sample = {
    id: 0, name: 'Sample item 16oz', priceCents: 1299, sku: 'ITEM-001', barcode: '012345678905'
  } as unknown as Product
  return window.pos.print({
    html: tagsHtml([{ product: sample, qty: 1 }], store, s.label),
    printer: s.labelPrinter,
    pageMm: { width: s.label.widthIn * 25.4, height: s.label.heightIn * 25.4 }
  })
}
