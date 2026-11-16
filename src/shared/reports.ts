/** Report fields are an allowlist shared by the builder and server. Amounts use integer cents. */
export type ReportSource = 'sales' | 'inventory' | 'receiving'
export interface ReportField { key: string; label: string; type: 'text' | 'number' | 'money' | 'boolean' | 'date'; sum?: boolean }
const f = (key:string,label:string,type:ReportField['type']='text',sum=false):ReportField => ({key,label,type,sum})
export const REPORT_FIELDS: Record<ReportSource,ReportField[]> = {
  sales: [f('id','Receipt #','number'),f('day','Sale date','date'),f('till','Till'),f('customerId','Customer #','number'),f('customer','Customer'),f('onAccount','Charged to account','boolean'),f('status','Status'),f('voidReason','Void reason'),f('voidBy','Voided by'),f('voidAt','Voided at (UTC)'),f('voidSync','QuickBooks void status'),f('hasReturn','Has return','boolean'),f('taxExempt','Tax exempt','boolean'),f('net','Net sales before tax','money',true),f('tax','Sales tax','money',true),f('total','Total after refunds','money',true),f('cash','Cash kept','money',true),f('card','Card','money',true),f('check','Check','money',true)],
  inventory: [f('id','Item #','number'),f('sku','Item No.'),f('barcode','UPC'),f('name','Item name'),f('department','Department'),f('vendor','Vendor'),f('type','Item type'),f('active','Active','boolean'),f('serialized','Serialized','boolean'),f('onHand','On hand','number',true),f('reorderPoint','Reorder point','number'),f('lowStock','At/below reorder point','boolean'),f('cost','Average unit cost','money'),f('price','Regular price','money'),f('value','Stock value at average cost','money',true),f('retail','Stock at retail price','money',true),f('unknownCost','Missing average cost','boolean')],
  receiving: [f('id','Voucher #','number'),f('day','Voucher date','date'),f('vendor','Vendor (as recorded)'),f('invoice','Invoice #'),f('po','PO #'),f('invoiceDate','Invoice date','date'),f('status','Status'),f('receivedBy','Received by'),f('till','Till'),f('qty','Quantity','number',true),f('items','Items cost','money',true),f('freight','Freight','money',true),f('total','Total received cost','money',true)]
}
export type ReportOperator = 'eq'|'ne'|'contains'|'gt'|'gte'|'lt'|'lte'|'empty'|'notEmpty'
export const REPORT_OPERATORS:Record<ReportOperator,string> = {eq:'Equals',ne:'Does not equal',contains:'Contains',gt:'Greater than',gte:'At least',lt:'Less than',lte:'At most',empty:'Is empty',notEmpty:'Is not empty'}
export interface ReportFilter { field:string; op:ReportOperator; value:string }
export type ReportPeriod = 'today'|'month'|'last30'|'all'|'custom'
export interface ReportDefinition {
  source:ReportSource; columns:string[]; filters:ReportFilter[]; groupBy:string[];
  period:ReportPeriod; start:string; end:string; sort:string; descending:boolean
}
export interface SavedReport {id:string;name:string;definition:ReportDefinition;updatedAt:string}
export interface ReportResult {
  columns:ReportField[]; rows:Record<string,string|number|null>[]; totals:Record<string,number>;
  recordCount:number;rowCount:number;truncated:boolean;generatedAt:string;periodLabel:string;definition:ReportDefinition
}
export function blankReport(source:ReportSource):ReportDefinition {
  return {source,columns:source==='sales'?['id','day','till','customer','net','tax','total']:source==='inventory'?['sku','name','department','vendor','onHand','cost','value']:['id','day','vendor','invoice','status','items','freight','total'],filters:source==='sales'?[{field:'status',op:'eq',value:'completed'}]:source==='inventory'?[{field:'active',op:'eq',value:'1'},{field:'type',op:'eq',value:'inventory'}]:[{field:'status',op:'eq',value:'posted'}],groupBy:[],period:source==='inventory'?'all':'month',start:'',end:'',sort:source==='inventory'?'name':'day',descending:source!=='inventory'}
}
export interface ReportPreset {id:string;name:string;description:string;definition:ReportDefinition}
const preset=(id:string,name:string,description:string,source:ReportSource,patch:Partial<ReportDefinition>={}):ReportPreset=>({id,name,description,definition:{...blankReport(source),...patch}})
export const REPORT_PRESETS:ReportPreset[] = [
  preset('sales-voids','Voided sales audit','Original receipt values retained for audit, excluded from normal sales totals. Filtered by ORIGINAL sale date.','sales',{period:'all',columns:['id','day','customer','status','voidReason','voidBy','voidAt','voidSync'],filters:[{field:'status',op:'eq',value:'void'}]}),
  preset('sales-day','Sales by day','Net sales, tax and takings after refunds.','sales',{columns:['day','net','tax','total','cash','card','check'],groupBy:['day']}),
  preset('sales-register','Sales transaction register','One row per completed receipt, including refunds and exchanges.','sales'),
  preset('sales-customer','Sales by customer','Completed receipts grouped by customer ID and name.','sales',{columns:['customerId','customer','net','tax','total'],groupBy:['customerId','customer'],sort:'total'}),
  preset('sales-till','Sales by till','Compare totals and payment amounts across tills.','sales',{columns:['till','net','tax','total','cash','card','check'],groupBy:['till'],sort:'total'}),
  preset('sales-returns','Refunds and exchanges','Completed receipts containing a return. Totals include the whole exchange.','sales',{filters:[{field:'status',op:'eq',value:'completed'},{field:'hasReturn',op:'eq',value:'1'}]}),
  preset('inventory-value','Inventory valuation','Current active stock at average cost. Missing costs are flagged.','inventory',{columns:['sku','name','department','vendor','onHand','cost','value','unknownCost']}),
  preset('inventory-low','Low stock / reorder','Active stock at or below a configured reorder point.','inventory',{columns:['sku','name','vendor','onHand','reorderPoint'],filters:[...blankReport('inventory').filters,{field:'lowStock',op:'eq',value:'1'}]}),
  preset('inventory-department','Stock by department','Current stock quantities and value grouped by department.','inventory',{columns:['department','onHand','value','retail'],groupBy:['department'],sort:'department'}),
  preset('inventory-vendor','Stock by vendor','Current quantities and value grouped by supplier name.','inventory',{columns:['vendor','onHand','value'],groupBy:['vendor'],sort:'vendor'}),
  preset('receiving-register','Receiving register','Posted vouchers, invoice numbers, items cost and freight.','receiving'),
  preset('receiving-vendor','Receiving by vendor','Posted voucher quantities and costs by recorded vendor name.','receiving',{columns:['vendor','qty','items','freight','total'],groupBy:['vendor'],sort:'total'}),
  preset('receiving-drafts','Open receiving drafts','Draft vouchers waiting to be received.','receiving',{period:'all',filters:[{field:'status',op:'eq',value:'draft'}]})
]
/** Text cells stay text in CSV even if a name resembles an Excel formula. Numbers keep their sign. */
export function reportCsv(result:ReportResult):string {
  const cell=(v:unknown)=>'"'+String(typeof v==='string'&&/^[\s]*[=+\-@\t\r]/.test(v)?"'"+v:v??'').replace(/"/g,'""')+'"'
  return '\uFEFF'+[result.columns.map(c=>c.label),...result.rows.map(r=>result.columns.map(c=>c.type==='money'&&r[c.key]!==null?Number(r[c.key])/100:r[c.key]))].map(row=>row.map(cell).join(',')).join('\r\n')
}
