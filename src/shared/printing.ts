/**
 * Printing setup for one computer (saved in its pos-config.json, because printers belong to the PC).
 *  - Receipt printer: normal receipts (80 mm / 58 mm roll)
 *  - Full-page (laser) printer: sales with a serial-numbered unit, and work orders
 *  - Label printer (e.g. Zebra): item / price tags
 * '' as a printer name = the Windows default printer.
 */
export interface LabelLayout {
  widthIn: number
  heightIn: number
  showStore: boolean
  showPrice: boolean
  showSku: boolean
  showBarcode: boolean
}

export interface PrintSettings {
  receiptPrinter: string
  receiptWidthMm: 80 | 58
  /** Print the receipt as soon as a sale is completed */
  autoPrint: boolean
  receiptCopies: number
  fullPagePrinter: string
  /** Which sales print full page on the laser printer instead of the receipt printer */
  fullPageFor: { serialized: boolean; workOrders: boolean }
  fullPageCopies: number
  labelPrinter: string
  label: LabelLayout
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  receiptPrinter: '',
  receiptWidthMm: 80,
  autoPrint: false,
  receiptCopies: 1,
  fullPagePrinter: '',
  fullPageFor: { serialized: true, workOrders: true },
  fullPageCopies: 1,
  labelPrinter: '',
  label: { widthIn: 2.25, heightIn: 1.25, showStore: true, showPrice: true, showSku: true, showBarcode: true }
}

/** Common Zebra label sizes (inches) */
export const LABEL_SIZES: { label: string; widthIn: number; heightIn: number }[] = [
  { label: '2.25" × 1.25"', widthIn: 2.25, heightIn: 1.25 },
  { label: '2" × 1"', widthIn: 2, heightIn: 1 },
  { label: '1.5" × 1"', widthIn: 1.5, heightIn: 1 },
  { label: '3" × 1"', widthIn: 3, heightIn: 1 },
  { label: '3" × 2"', widthIn: 3, heightIn: 2 },
  { label: '4" × 2"', widthIn: 4, heightIn: 2 }
]

/** Fill in anything missing from a saved (possibly older) setup */
export function printSettings(saved: Partial<PrintSettings> | undefined): PrintSettings {
  const d = DEFAULT_PRINT_SETTINGS
  return {
    ...d,
    ...(saved ?? {}),
    fullPageFor: { ...d.fullPageFor, ...(saved?.fullPageFor ?? {}) },
    label: { ...d.label, ...(saved?.label ?? {}) }
  }
}

/** Does this sale print full page (laser) rather than on the receipt printer? */
export function printsFullPage(
  sale: { workOrderId: number | null; items: { serial?: string | null; kind?: string }[] },
  s: PrintSettings
): boolean {
  if (s.fullPageFor.workOrders && sale.workOrderId) return true
  if (s.fullPageFor.serialized && sale.items.some((i) => !!i.serial)) return true
  return false
}

/** Options for one print job (sent to the main process) */
export interface PrintJob {
  html: string
  /** '' = Windows default printer */
  printer: string
  copies?: number
  /** Paper size in millimetres (labels); omitted = the printer's own paper (receipts) or Letter (full page) */
  pageMm?: { width: number; height: number }
  /** Letter-size page (full-page printer) */
  letter?: boolean
}

export interface PrinterInfo {
  name: string
  displayName: string
  isDefault: boolean
}
