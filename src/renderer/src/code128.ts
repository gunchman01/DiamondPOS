/**
 * Code 128 barcodes as SVG (for price tags). Uses code set B (all printable ASCII),
 * switching to code set C for long runs of digits (shorter barcodes for UPCs / item numbers).
 */
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
]
const START_B = 104
const START_C = 105
const CODE_B = 100
const CODE_C = 99
const STOP = 106

/** Symbol values for the text (with start code, without checksum / stop) */
export function code128Values(text: string): number[] {
  const s = text.replace(/[^\x20-\x7e]/g, '')
  const vals: number[] = []
  let set: 'B' | 'C' | null = null
  let i = 0
  const digitRun = (from: number) => {
    let n = 0
    while (from + n < s.length && /\d/.test(s[from + n])) n++
    return n
  }
  while (i < s.length) {
    const run = digitRun(i)
    // Use code set C (two digits per symbol) for runs of 4+ digits
    if (run >= 4) {
      const even = run - (run % 2)
      if (set !== 'C') {
        vals.push(set === null ? START_C : CODE_C)
        set = 'C'
      }
      for (let k = 0; k < even; k += 2) vals.push(Number(s.substr(i + k, 2)))
      i += even
      continue
    }
    if (set !== 'B') {
      vals.push(set === null ? START_B : CODE_B)
      set = 'B'
    }
    vals.push(s.charCodeAt(i) - 32)
    i++
  }
  if (vals.length === 0) vals.push(START_B)
  return vals
}

/** Bar/space widths (in modules) for the whole barcode, including checksum, stop and quiet zones */
export function code128Modules(text: string): number[] {
  const vals = code128Values(text)
  let sum = vals[0]
  for (let k = 1; k < vals.length; k++) sum += vals[k] * k
  const all = [...vals, sum % 103, STOP]
  const widths: number[] = []
  for (const v of all) for (const ch of PATTERNS[v]) widths.push(Number(ch))
  return widths
}

/** SVG markup of the barcode (bars only; text is printed separately) */
export function code128Svg(text: string, heightPx = 40): string {
  const widths = code128Modules(text)
  const quiet = 10
  const total = widths.reduce((a, b) => a + b, 0) + quiet * 2
  let x = quiet
  let bars = ''
  widths.forEach((w, k) => {
    if (k % 2 === 0) bars += `<rect x="${x}" y="0" width="${w}" height="${heightPx}"/>`
    x += w
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${heightPx}" preserveAspectRatio="none" shape-rendering="crispEdges" style="width:100%;height:100%">${bars}</svg>`
}
