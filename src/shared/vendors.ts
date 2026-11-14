export interface VendorInput {
  companyName: string; title: string; firstName: string; lastName: string; email: string; website: string
  street: string; street2: string; city: string; region: string; postcode: string; phone: string; mobile: string
  netDays: number; discountPercent: number; discountDays: number
  accountNumber: string; altPhone: string; altContact: string; active: boolean; notes: string
}
export interface Vendor extends VendorInput { id: number }
export interface VendorDetail {
  vendor: Vendor
  history: { id: number; number: string; date: string; status: 'draft' | 'posted'; invoiceNo: string; totalCents: number }[]
  postedCount: number; postedTotalCents: number
}
export const EMPTY_VENDOR: VendorInput = { companyName: '', title: '', firstName: '', lastName: '', email: '', website: '', street: '', street2: '', city: '', region: '', postcode: '', phone: '', mobile: '', netDays: 0, discountPercent: 0, discountDays: 0, accountNumber: '', altPhone: '', altContact: '', active: true, notes: '' }
