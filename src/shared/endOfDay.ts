export interface EodTender { method: string; label: string; count: number; inCents: number; outCents: number; netCents: number }
export interface EodEvent { key: string; at: string; kind: 'sale'|'account_payment'|'void'; receiptId: number|null; customer: string; till: string; method: string; brand: string|null; reference: string|null; cents: number }
export interface EndOfDayReport {
  date: string; till: string|null; generatedAt: string; sourceHash: string; timeZone: string;
  business: { receiptCount: number; refundReceiptCount: number; exchangeCount: number; grossCents: number; returnsCents: number; netCents: number; taxCents: number; totalCents: number; accountChargesCents: number; exemptCount: number; exemptNetCents: number; reductionsCents: number; reductionsReturnedCents:number; reductionsNetCents:number; returnReductionUnknownLines:number; reductionUnknownLines: number };
  receiptRows: {id:number; at:string; till:string; customer:string; totalCents:number; onAccount:boolean}[];
  tenders: EodTender[]; cards: EodTender[]; events:EodEvent[]; netPaymentsCents:number; accountPaymentsCents:number;
  voids: {receiptId:number; at:string; till:string; by:string; reason:string; paymentNote:string; totalCents:number}[];
  tills: {name:string; receiptCount:number; salesCents:number; paymentNetCents:number}[];
}
export interface DrawerInputs { openingCents:number; countedCashCents:number; leaveCents:number; extraInCents:number; extraOutCents:number; cardActualCents:number|null; checkActualCents:number|null; by:string; notes:string }
export interface DrawerResult { expectedCashCents:number; cashOverShortCents:number; depositCashCents:number; cardOverShortCents:number|null; checkOverShortCents:number|null }
export interface EndOfDayCloseRequest {requestId:string; date:string; till:string|null; sourceHash:string; inputs:DrawerInputs}
export interface EndOfDayCloseout { id:number; savedAt:string; report:EndOfDayReport; inputs:DrawerInputs; reconciliation:DrawerResult }
export function reconcileDrawer(report:EndOfDayReport, inputs:DrawerInputs):DrawerResult {
  const tender=(key:string)=>report.tenders.find(t=>t.method===key)?.netCents??0
  const expectedCashCents=inputs.openingCents+tender('cash')+inputs.extraInCents-inputs.extraOutCents
  return {expectedCashCents,cashOverShortCents:inputs.countedCashCents-expectedCashCents,depositCashCents:inputs.countedCashCents-inputs.leaveCents,
    cardOverShortCents:inputs.cardActualCents===null?null:inputs.cardActualCents-tender('card'),checkOverShortCents:inputs.checkActualCents===null?null:inputs.checkActualCents-tender('check')}
}
