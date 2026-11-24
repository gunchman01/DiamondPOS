export const TRANSACTION_KINDS = {
  sale:'Sale', void:'Void', work_order:'Work-order sale', refund:'Refund', exchange:'Return / exchange',
  account_sale:'On-account sale', account_payment:'Payment on account'
} as const
export type TransactionKind = keyof typeof TRANSACTION_KINDS
export interface TransactionHistoryRow {
  source:'sale'|'account_payment';id:number;kind:TransactionKind;createdAt:string;customerName:string
  customerId:number|null;tillName:string;totalCents:number;taxCents:number|null;status:string
  methods:string;workOrderId:number|null;onAccount:boolean;reference:string|null
}
export interface TransactionHistoryPage {rows:TransactionHistoryRow[];total:number;page:number;pageSize:number}
export interface AccountPaymentDetail {
  id:number;customerId:number;customerName:string;createdAt:string;amountCents:number;method:string
  cardBrand:string|null;reference:string|null;tillName:string;by:string;status:string;error:string|null
  allocations:{saleId:number;amountCents:number;refNumber:string}[]
}
