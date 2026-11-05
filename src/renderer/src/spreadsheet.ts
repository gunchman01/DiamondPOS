// Reading and writing Excel / CSV files (SheetJS). Runs in the UI, no server involved.
import * as XLSX from 'xlsx'

export interface SheetData {
  sheetName: string
  headers: string[]
  rows: { values: Record<string, unknown>; rowNumber: number }[]
}

/** Read the first sheet of an .xlsx / .xls / .csv file. Row 1 must be the column headers. */
export async function readSpreadsheet(file: File): Promise<SheetData> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error('The file has no sheets')
  const ws = wb.Sheets[sheetName]
  const headerRow = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false })[0] ?? []
  const headers = headerRow.map((h) => String(h ?? '').trim()).filter(Boolean)
  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: true, blankrows: false })
  const rows = data.map((values, i) => {
    // SheetJS records the original (0-based) row index on each object
    const idx = (values as { __rowNum__?: number }).__rowNum__
    return { values, rowNumber: typeof idx === 'number' ? idx + 1 : i + 2 }
  })
  return { sheetName, headers, rows }
}

/** Save rows as an .xlsx file (Windows shows a Save dialog). */
export function writeSpreadsheet(
  fileName: string,
  sheets: { name: string; headers: string[]; rows: Record<string, unknown>[]; widths?: number[] }[]
): void {
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows, { header: s.headers })
    ws['!cols'] = s.headers.map((h, i) => ({ wch: s.widths?.[i] ?? Math.max(12, h.length + 2) }))
    XLSX.utils.book_append_sheet(wb, ws, s.name)
  }
  XLSX.writeFile(wb, fileName)
}
