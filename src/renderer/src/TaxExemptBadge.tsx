import { taxExemptState, type Customer } from '../../shared/types'
import { today } from './format'

/** "Tax exempt" badge that turns amber when the Farm Tax ID expires soon and red once expired. */
export default function TaxExemptBadge({
  customer,
  long = false
}: {
  customer: Pick<Customer, 'taxExempt' | 'taxExemptExpires' | 'taxExemptId' | 'taxExemptCardCopied'>
  long?: boolean
}) {
  const st = taxExemptState(customer, today())
  if (st.kind === 'none') return null
  const date = customer.taxExemptExpires ? new Date(customer.taxExemptExpires + 'T00:00:00').toLocaleDateString() : ''
  if (st.kind === 'expired')
    return (
      <span className="tx-badge expired" title={`Farm Tax ID ${customer.taxExemptId ?? ''} expired ${date}`}>
        ⚠ Tax ID EXPIRED{long ? ` on ${date}. Ask for their new card.` : ''}
      </span>
    )
  if (st.kind === 'expiring')
    return (
      <span className="tx-badge expiring" title={`Farm Tax ID ${customer.taxExemptId ?? ''} expires ${date}`}>
        Tax exempt · expires {st.daysLeft === 0 ? 'today' : `in ${st.daysLeft} day${st.daysLeft === 1 ? '' : 's'}`}
        {long ? `. Ask about their new card.` : ''}
      </span>
    )
  return (
    <span className="tx-badge ok" title={customer.taxExemptId ? `Farm Tax ID ${customer.taxExemptId}` : 'Tax exempt'}>
      Tax exempt{customer.taxExemptCardCopied ? '' : ' · card not copied'}
      {long && !customer.taxExemptExpires ? ' · no expiry date on file' : ''}
    </span>
  )
}
