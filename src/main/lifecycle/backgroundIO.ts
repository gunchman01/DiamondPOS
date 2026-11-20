// Cancels HTTP background work before database shutdown, including response bodies.
let paused=false
const requests=new Set<AbortController>()
export function pauseBackgroundIO(){paused=true;for(const controller of requests)controller.abort();requests.clear()}
export function resumeBackgroundIO(){paused=false}
export async function backgroundRequest<T>(run:(signal:AbortSignal)=>Promise<T>,timeoutMs=15000):Promise<T>{
 if(paused)throw Object.assign(new Error('Background services are stopping'),{name:'AbortError'})
 const controller=new AbortController();requests.add(controller)
 try{return await run(AbortSignal.any([controller.signal,AbortSignal.timeout(timeoutMs)]))}finally{requests.delete(controller)}
}
