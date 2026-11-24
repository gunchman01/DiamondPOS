import type { PaymentMethod, CardBrand } from './types'
export interface AccountInvoice {
  saleId: number
  refNumber: string
  date: string
  dueDate: string
  totalCents: number
  balanceCents: number
  status: string
  error: string | null
  qbCheckedAt: string | null
  arAccount?:string|null
  receivableKind?:string
}
export interface AccountPayment {
  id: number
  date: string
  amountCents: number
  method: PaymentMethod
  reference: string | null
  cardBrand: CardBrand | null
  status: string
  error: string | null
}
export interface CustomerAccount {
  customerId: number
  enabled: boolean
  balanceCents: number
  invoices: AccountInvoice[]
  payments: AccountPayment[]
}
export interface AccountPaymentRequest {
  requestId: string
  amountCents: number
  method: PaymentMethod
  reference?: string
  cardBrand?: CardBrand
  by: string
  till: string
}

export interface AccountBalanceCustomer {
  customer: import('./types').Customer
  balanceCents: number
  invoiceCount: number
}
