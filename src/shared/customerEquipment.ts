import type { CustomerUnit, WoStatus } from './workorders'
export interface EquipmentWorkOrder { id:number; number:string; status:WoStatus; createdAt:string; updatedAt:string; problem:string }
export interface CustomerEquipment { unit:CustomerUnit; workOrders:EquipmentWorkOrder[] }
