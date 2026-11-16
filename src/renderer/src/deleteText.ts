import type { DeleteResult } from '../../shared/deleting'

/** Plain-words summary of a delete, e.g. "3 deleted. 1 made inactive because it's on past sales." */
export function deleteSummary(r: DeleteResult, what: 'item' | 'customer'): string {
  const w = (n: number) => `${n} ${what}${n === 1 ? '' : 's'}`
  const parts: string[] = []
  if (r.deleted) parts.push(`${w(r.deleted)} deleted.`)
  if (r.deactivated)
    parts.push(
      `${w(r.deactivated)} made inactive instead, because ${r.deactivated === 1 ? "it's" : "they're"} on past ${
        what === 'item' ? 'sales, work orders, receiving or held receipts' : 'sales, work orders or held receipts'
      } (kept so old receipts stay correct; hidden from searches).`
    )
  if (r.notFound) parts.push(`${w(r.notFound)} no longer found.`)
  return parts.join(' ') || 'Nothing was deleted.'
}

export const DELETE_EXPLAIN =
  'Anything with no history is erased for good. Anything linked to sales, work orders, receiving or open held receipts is made inactive instead (hidden, but old receipts stay correct).'
