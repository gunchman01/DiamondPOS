import type {WorkOrder,WoSaleLine,WoLine} from './workorders'
import {priceWithFeeCredit,woTotals} from './workorders'
export function warrantyPortionLines(wo:WorkOrder,party:'provider'|'customer'):WoLine[]{
 return wo.lines.flatMap(l=>{const full=Math.round(l.qty*l.unitPriceCents),covered=wo.warranty?.coverage[l.id]??0,amount=party==='provider'?covered:full-covered
 return amount>0?[{...l,qty:1,unitPriceCents:amount,description:`${l.description} (${party==='provider'?'warranty':'customer'} share; original quantity ${l.qty})`}]:[]})
}
export function warrantySaleLines(lines:WoSaleLine[],wo:WorkOrder,party:'provider'|'customer'):WoSaleLine[]{
 return lines.flatMap(l=>{if(l.workOrderLineId===undefined)throw Error('Reload this work order before warranty checkout')
 const amount=party==='provider'?(wo.warranty?.coverage[l.workOrderLineId]??0):Math.round(l.unitPriceCents*l.qty)-(wo.warranty?.coverage[l.workOrderLineId]??0)
 return amount>0?[{...l,qty:1,unitPriceCents:amount,description:`${l.description} (${party==='provider'?'warranty':'customer'} share; original quantity ${l.qty})`}]:[]})
}
export function warrantyPrices(wo:WorkOrder,rate:number,customerExempt=wo.warranty?.customerExempt??false){
 if(!wo.warranty)return null
 const provider=priceWithFeeCredit(warrantyPortionLines(wo,'provider'),rate,wo.warranty.providerExempt,0)
 const customer=priceWithFeeCredit(warrantyPortionLines(wo,'customer'),rate,customerExempt,wo.feeStatus==='paid'?wo.feeCents:0)
 return {provider,customer}
}
/** Customer-facing estimates show only that customer's share, with provider coverage disclosed separately. */
export function customerWarrantyView(wo:WorkOrder,rate:number):WorkOrder{
 if(!wo.warranty)return wo
 const lines=warrantyPortionLines(wo,'customer'),totals=woTotals(lines,rate,wo.warranty.customerExempt)
 return {...wo,lines,totals,balanceDueCents:Math.max(0,totals.totalCents-(wo.feeStatus==='paid'?wo.feeCents:0))}
}

export interface WarrantyReportRow {workOrderId:number;number:string;vendorId:number;vendorName:string;customerName:string;unit:string;problem:string;workDone:string;coveredLines:{description:string;amountCents:number}[];date:string;status:string;claimReference:string;providerSaleId:number|null;customerSaleId:number|null;amountCents:number;balanceCents:number|null;syncStatus:string}
