/**
 * qbXML messages for QuickBooks Desktop (US editions, qbXML 13.0, which Enterprise
 * 13 and later support). Element ORDER matters in qbXML, so the builders follow
 * the SDK's order exactly.
 */
import { child, childrenNamed, esc, find, parseXml, text, type XmlNode } from './xml'
import type { QbConfig, QbDailySummary, QbLists } from '../../../shared/quickbooks'

export const QBXML_VERSION = '13.0'

export function envelope(request: string): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?><?qbxml version="${QBXML_VERSION}"?>` +
    `<QBXML><QBXMLMsgsRq onError="stopOnError">${request}</QBXMLMsgsRq></QBXML>`
  )
}

const money = (cents: number) => (cents / 100).toFixed(2)
const ref = (tag: string, fullName: string) => `<${tag}><FullName>${esc(fullName)}</FullName></${tag}>`
const active = '<ActiveStatus>ActiveOnly</ActiveStatus>'

export const rq = {
  company: () => `<CompanyQueryRq requestID="1"></CompanyQueryRq>`,
  accounts: () => `<AccountQueryRq requestID="1">${active}</AccountQueryRq>`,
  salesTaxItems: () => `<ItemSalesTaxQueryRq requestID="1">${active}</ItemSalesTaxQueryRq>`,
  salesTaxCodes: () => `<SalesTaxCodeQueryRq requestID="1">${active}</SalesTaxCodeQueryRq>`,
  paymentMethods: () => `<PaymentMethodQueryRq requestID="1">${active}</PaymentMethodQueryRq>`,
  otherChargeItems: () => `<ItemOtherChargeQueryRq requestID="1">${active}</ItemOtherChargeQueryRq>`,
  customer: (name: string) => `<CustomerQueryRq requestID="1"><FullName>${esc(name)}</FullName></CustomerQueryRq>`,
  addCustomer: (name: string) =>
    `<CustomerAddRq requestID="1"><CustomerAdd><Name>${esc(name.slice(0, 41))}</Name></CustomerAdd></CustomerAddRq>`,
  addOtherChargeItem: (name: string, account: string) =>
    `<ItemOtherChargeAddRq requestID="1"><ItemOtherChargeAdd><Name>${esc(name)}</Name>` +
    `<SalesOrPurchase><Desc>${esc('DiamondPOS sales')}</Desc>${ref('AccountRef', account)}</SalesOrPurchase>` +
    `</ItemOtherChargeAdd></ItemOtherChargeAddRq>`,
  findSalesReceipt: (refNumber: string) =>
    `<SalesReceiptQueryRq requestID="1"><RefNumber>${esc(refNumber)}</RefNumber></SalesReceiptQueryRq>`,
  addSalesReceipt: (s: QbDailySummary, cfg: QbConfig) => {
    const m = cfg.methods[s.method]
    const memo =
      `DiamondPOS receipt #${s.saleId}; ${s.method} ${s.saleDate}: ${s.customerName ?? cfg.customerName}, ${s.saleCount} receipt(s) ` +
      `#${s.firstSaleId}-#${s.lastSaleId}` +
      (s.taxExemptCount ? `, ${s.taxExemptCount} tax exempt` : '')
    const lines = s.lines
      .map(
        (l) =>
          `<SalesReceiptLineAdd>${ref('ItemRef', l.itemName)}` +
          `<Desc>${esc(l.description ?? (l.itemName === 'POS Tax Rounding' ? 'Sales tax rounding' : `${l.department || 'General'} - ${l.taxable ? 'taxable' : 'non-taxable'} sales`))}</Desc>` +
          `<Amount>${money(l.amountCents)}</Amount>` +
          ref('SalesTaxCodeRef', l.taxable ? cfg.taxableCode : cfg.nonTaxableCode) +
          `</SalesReceiptLineAdd>`
      )
      .join('')
    return (
      `<SalesReceiptAddRq requestID="1"><SalesReceiptAdd>` +
      ref('CustomerRef', s.customerName ?? cfg.customerName) +
      `<TxnDate>${s.saleDate}</TxnDate>` +
      `<RefNumber>${esc(s.refNumber)}</RefNumber>` +
      (m.paymentMethod ? ref('PaymentMethodRef', m.paymentMethod) : '') +
      ref('ItemSalesTaxRef', cfg.salesTaxItem) +
      `<Memo>${esc(memo.slice(0, 4095))}</Memo>` +
      ref('DepositToAccountRef', m.depositAccount) +
      lines +
      `</SalesReceiptAdd></SalesReceiptAddRq>`
    )
  }
}

export interface QbResult {
  name: string // e.g. AccountQueryRs
  ok: boolean // statusCode 0, or 1 (= nothing found) for queries
  statusCode: string
  message: string
  node: XmlNode
}

/** Read the (single) response inside a qbXML response document */
export function parseResponse(qbxml: string): QbResult {
  const doc = parseXml(qbxml)
  const msgs = find(doc, 'QBXMLMsgsRs')
  const rs = msgs?.children[0]
  if (!rs) throw new Error('QuickBooks sent an empty response')
  const statusCode = rs.attrs.statusCode ?? '0'
  return {
    name: rs.name,
    ok: statusCode === '0' || (statusCode === '1' && rs.name.includes('Query')) ||
      (statusCode === '500' && (rs.name === 'CustomerQueryRs' || rs.name === 'SalesReceiptQueryRs') && rs.children.length === 0),
    statusCode,
    message: rs.attrs.statusMessage ?? '',
    node: rs
  }
}

/** Turn list query responses into the cached lists */
export const readList = {
  company: (r: QbResult): Partial<QbLists> => ({ companyName: text(child(r.node, 'CompanyRet'), 'CompanyName') }),
  accounts: (r: QbResult): Partial<QbLists> => ({
    accounts: childrenNamed(r.node, 'AccountRet')
      .map((a) => ({ name: text(a, 'FullName'), type: text(a, 'AccountType') }))
      .filter((a) => a.name)
  }),
  salesTaxItems: (r: QbResult): Partial<QbLists> => ({
    salesTaxItems: childrenNamed(r.node, 'ItemSalesTaxRet').map((t) => {
      const rate = parseFloat(text(t, 'TaxRate'))
      return { name: text(t, 'Name'), rate: Number.isFinite(rate) ? rate : null }
    })
  }),
  salesTaxCodes: (r: QbResult): Partial<QbLists> => ({
    salesTaxCodes: childrenNamed(r.node, 'SalesTaxCodeRet').map((c) => ({
      name: text(c, 'Name'),
      taxable: text(c, 'IsTaxable') === 'true'
    }))
  }),
  paymentMethods: (r: QbResult): Partial<QbLists> => ({
    paymentMethods: childrenNamed(r.node, 'PaymentMethodRet').map((p) => text(p, 'Name'))
  }),
  otherChargeItems: (r: QbResult): Partial<QbLists> => ({
    otherChargeItems: childrenNamed(r.node, 'ItemOtherChargeRet').map((p) => text(p, 'FullName'))
  })
}

/** TxnID of a Sales Receipt in a query or add response (empty if none) */
export function salesReceiptTxnId(r: QbResult): string {
  return text(child(r.node, 'SalesReceiptRet'), 'TxnID')
}
