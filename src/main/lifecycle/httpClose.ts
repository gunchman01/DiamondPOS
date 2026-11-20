import type { Server } from 'node:http'
/** Stop accepting connections immediately; bound idle/unfinished clients without interrupting synchronous commits. */
export function closeHttpServer(server:Server,graceMs=1000):Promise<void>{
 return new Promise((resolve,reject)=>{
  let finished=false;const done=(error?:Error)=>{if(finished)return;finished=true;clearTimeout(timer);error?reject(error):resolve()}
  const timer=setTimeout(()=>server.closeAllConnections(),graceMs);timer.unref()
  server.close(error=>done(error?.message.includes('not running')?undefined:error));server.closeIdleConnections()
 })
}
