import type { PrinterInfo } from '../../shared/printing'
export interface PrinterChoice {id:number;title:string;preferred:string}
export function createPrinterQueue(){
 let next=0
 let pending:{item:PrinterChoice;resolve:(value:string|null)=>void}|null=null
 const listeners=new Set<()=>void>(),notify=()=>{for(const listener of listeners)listener()}
 return {
  snapshot:()=>pending?.item??null,
  subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener)}},
  ask(title:string,preferred:string):Promise<string|null>{
   if(pending)return Promise.reject(Error('Another printer choice is already open'))
   return new Promise(resolve=>{pending={item:{id:++next,title,preferred},resolve};notify()})
  },
  answer(id:number,value:string|null,printers:PrinterInfo[]=[]){
   if(pending?.item.id!==id)return
   if(value!==null&&!printers.some(p=>p.name===value&&value.trim()))return
   const request=pending;pending=null;request.resolve(value);notify()
  },
  cancelAll(){if(pending){const request=pending;pending=null;request.resolve(null);notify()}}
 }
}
