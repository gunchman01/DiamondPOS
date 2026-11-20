import path from 'node:path'
import { Worker } from 'node:worker_threads'
export function verifySnapshot(file:string,signal?:AbortSignal):Promise<void>{
 if(signal?.aborted)return Promise.reject(Error('Backup interrupted during shutdown'))
 return new Promise((resolve,reject)=>{
  const worker=new Worker(path.join(__dirname,'backupVerifier.js'),{workerData:{file}})
  let finished=false,cancelled=false
  const finish=(error?:Error)=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve()}
  const abort=()=>{cancelled=true;void worker.terminate().then(()=>finish(Error('Backup interrupted during shutdown')))}
  const timer=setTimeout(()=>{cancelled=true;void worker.terminate().then(()=>finish(Error('Backup verification timed out')))},120000);timer.unref()
  signal?.addEventListener('abort',abort,{once:true})
  worker.once('message',result=>{if(!cancelled)finish(result?.ok===true?undefined:Error('Snapshot integrity check failed'))})
  worker.once('error',()=>finish(Error('Backup verification worker failed')))
  worker.once('exit',code=>{if(!finished&&!cancelled)finish(Error(`Backup verification ended unexpectedly (${code})`))})
  if(signal?.aborted)abort()
 })
}
