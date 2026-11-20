import fs from 'node:fs'
import path from 'node:path'
let file='',tail=Promise.resolve()
export function startDiagnostics(directory:string){file=path.join(directory,'diagnostics','application.log');let previous=Date.now();const timer=setInterval(()=>{const now=Date.now(),delay=now-previous-2000;previous=now;if(delay>1500)logDiagnostic('main-loop-delay',Math.round(delay))},2000);timer.unref();return()=>clearInterval(timer)}
export function logDiagnostic(event:string,durationMs?:number){if(!file)return;const line=JSON.stringify({at:new Date().toISOString(),event,durationMs})+'\n';tail=tail.then(async()=>{await fs.promises.mkdir(path.dirname(file),{recursive:true});const size=await fs.promises.stat(file).then(s=>s.size).catch(()=>0);if(size>1024*1024){await fs.promises.rm(file+'.previous',{force:true});await fs.promises.rename(file,file+'.previous')}await fs.promises.appendFile(file,line)}).catch(()=>{})}
export const flushDiagnostics=()=>tail
export const diagnosticsDirectory=()=>file?path.dirname(file):''
