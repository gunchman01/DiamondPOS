export type VoidSyncState='not_needed'|'pending'|'confirmed'|'error'
export interface SaleVoid {
  saleId:number;reason:string;by:string;till:string;at:string;paymentNote:string;
  qbStatus:VoidSyncState;qbError:string|null;qbConfirmedAt:string|null
}
export interface VoidReview {totalCents:number;allowed:boolean;blockedReason:string|null;legacyStock:boolean;stock:{productId:number;name:string;qty:number}[];void:SaleVoid|null;qbAction:string}
export interface VoidRequest {reason:string;by:string;till:string;paymentNote:string;paymentConfirmed:boolean;legacyStockConfirmed:boolean}
