export interface Confirmation {id:number;message:string}
export function createDialogQueue(){
 let next=0;const queue:{item:Confirmation;resolve:(value:boolean)=>void}[]=[],listeners=new Set<()=>void>()
 const notify=()=>{for(const listener of listeners)listener()}
 return {snapshot:()=>queue[0]?.item??null,subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener)}},
  ask(message:string):Promise<boolean>{const text=String(message);if(queue.length>=20||queue.some(r=>r.item.message===text))return Promise.resolve(false);return new Promise(resolve=>{queue.push({item:{id:++next,message:text},resolve});notify()})},
  answer(id:number,value:boolean){if(queue[0]?.item.id!==id)return;queue.shift()!.resolve(value);notify()},
  cancelAll(){const previous=queue.splice(0);for(const request of previous)request.resolve(false);notify()}
 }
}
