// Separate thread: integrity_check must never block Electron's main event loop.
import { parentPort, workerData } from 'node:worker_threads'
import Database from 'better-sqlite3'
try{
 const db=new Database(String(workerData.file),{fileMustExist:true})
 try{db.pragma('journal_mode = DELETE');const result=db.pragma('integrity_check',{simple:true});if(result!=='ok')throw Error('Snapshot integrity check failed')}
 finally{db.close()}
 parentPort?.postMessage({ok:true})
}catch{parentPort?.postMessage({ok:false})}
parentPort?.close()
