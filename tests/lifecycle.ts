import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import net from 'node:net'
import { saveSmtp, sendEmail, stopMailConnections } from '../src/main/server/marketing/mailer'
import { resumeSmtpSockets } from '../src/main/lifecycle/smtpSockets'
import { readSettings } from '../src/main/server'
import { cancelSaleDraft } from '../src/renderer/src/saleCancellation'
import { createPrinterQueue } from '../src/renderer/src/printerQueue'
import { createDialogQueue } from '../src/renderer/src/dialogQueue'
import { createPrintManager } from '../src/main/printing'
import { createQuitController } from '../src/main/lifecycle/quitController'
import { backgroundRequest, pauseBackgroundIO, resumeBackgroundIO } from '../src/main/lifecycle/backgroundIO'
import { closeHttpServer } from '../src/main/lifecycle/httpClose'
import { verifySnapshot } from '../src/main/verifySnapshot'
import { openDatabase } from '../src/main/server/db'
import { createBackupManager } from '../src/main/server/backup'
type Check=(name:string,fn:()=>void)=>void
export async function testLifecycle(check:Check,dir:string){
 const queue=createDialogQueue(),one=queue.ask('Confirm first'),id=queue.snapshot()!.id,duplicate=queue.ask('Confirm first'),two=queue.ask('Confirm second')
 queue.answer(id,true);const id2=queue.snapshot()!.id;queue.answer(id,true)
 check('in-app confirmations preserve sequence, reject double-click duplicates and ignore stale answers',()=>{assert.equal(queue.snapshot()!.id,id2);assert.equal(queue.snapshot()!.message,'Confirm second')})
 queue.cancelAll();assert.equal(await one,true);assert.equal(await duplicate,false);assert.equal(await two,false)
 check('closing cancels outstanding confirmations without approving destructive actions',()=>assert.equal(queue.snapshot(),null))
 const screens=path.resolve('src/renderer/src/screens'),native=[] as string[]
 for(const file of fs.readdirSync(screens)){if(!file.endsWith('.tsx'))continue;const source=fs.readFileSync(path.join(screens,file),'utf8');if(file!=='Sell.tsx'&&/(?:\b|window\.)(?:confirm|alert|prompt)\s*\(/.test(source))native.push(file)}
 check('application confirmation call sites no longer invoke blocking browser-native popups',()=>assert.deepEqual(native,[]))
 let destroyed=0,focused=0,printed=0,late:((ok:boolean,why:string)=>void)|undefined
 const manager=createPrintManager(()=>{let closed=false;return {isDestroyed:()=>closed,destroy:()=>{closed=true;destroyed++},loadURL:async()=>{},webContents:{print:(_options:any,cb:any)=>{printed++;late=cb}}}},()=>{focused++},()=>{},25)
 await assert.rejects(manager.print({html:'<p>Fixture only</p>',printer:''}),/Printer did not respond/);late?.(true,'')
 check('unresponsive printer times out and destroys the hidden window; late callback does not print or resolve twice',()=>{assert.equal(destroyed,1);assert.equal(focused,1);assert.equal(printed,1)})
 const hanging=createPrintManager(()=>{let closed=false;return {isDestroyed:()=>closed,destroy:()=>{closed=true;destroyed++},loadURL:()=>new Promise(()=>{}),webContents:{print:()=>{throw Error('Should never print')}}}},()=>{focused++},()=>{},1000)
 const pending=hanging.print({html:'Fixture',printer:''});hanging.stop();await assert.rejects(pending,/closing/)
 await assert.rejects(hanging.print({html:'Another',printer:''}),/closing/)
 check('application close cancels a stuck print document immediately and prevents further jobs',()=>{assert.equal(destroyed,2);assert.equal(focused,1)})
 const printerQueue=createPrinterQueue(),printerList=[{name:'Zebra-label',displayName:'Label printer',isDefault:false},{name:'Office-laser',displayName:'Laser',isDefault:true}]
 const choice=printerQueue.ask('Print labels','Zebra-label'),choiceId=printerQueue.snapshot()!.id
 assert.equal(printerQueue.snapshot()!.preferred,'Zebra-label')
 printerQueue.answer(choiceId,'',printerList);assert.ok(printerQueue.snapshot())
 printerQueue.answer(choiceId,'Missing-printer',printerList);assert.ok(printerQueue.snapshot())
 await assert.rejects(printerQueue.ask('Other job','Office-laser'),/already open/)
 printerQueue.answer(choiceId,'Zebra-label',printerList)
 check('printer choice preserves the configured default and requires an installed explicit printer',()=>{assert.equal(printerQueue.snapshot(),null)})
 assert.equal(await choice,'Zebra-label')
 const cancelled=printerQueue.ask('Print labels','Zebra-label'),cancelId=printerQueue.snapshot()!.id
 printerQueue.answer(choiceId,'Office-laser',printerList);assert.equal(printerQueue.snapshot()!.id,cancelId)
 printerQueue.cancelAll();assert.equal(await cancelled,null)
 check('printer cancellation and stale answers cannot approve a new print request',()=>assert.equal(printerQueue.snapshot(),null))
 let labelOptions:any=null,labelCreated=0
 const labelManager=createPrintManager(()=>{labelCreated++;let closed=false;return{isDestroyed:()=>closed,destroy:()=>{closed=true},loadURL:async()=>{},webContents:{print:(options:any,cb:any)=>{labelOptions=options;cb(true,'')}}}},()=>{},()=>{})
 await assert.rejects(labelManager.print({html:'Label fixture',printer:'',label:true}),/Choose a label printer/)
 assert.equal(labelCreated,0)
 await labelManager.print({html:'Label fixture',label:true,printer:'Zebra-label',pageMm:{width:57.15,height:31.75}})
 check('label jobs never silently use Windows default and preserve the selected printer and label dimensions',()=>{assert.equal(labelOptions.deviceName,'Zebra-label');assert.deepEqual(labelOptions.pageSize,{width:57150,height:31750});assert.equal(labelCreated,1)})
 let cancelledDrafts=0,askedToCancel=0,blockedCancellation=true
 const cancelOptions={blocked:()=>blockedCancellation,confirm:async()=>{askedToCancel++;return true},clear:()=>{cancelledDrafts++}}
 assert.equal(await cancelSaleDraft(cancelOptions),false)
 check('cancel sale never prompts or discards a checkout or hold awaiting recovery',()=>{assert.equal(askedToCancel,0);assert.equal(cancelledDrafts,0)})
 blockedCancellation=false
 await cancelSaleDraft({...cancelOptions,confirm:async()=>false})
 check('declining Cancel sale preserves the entire current draft',()=>assert.equal(cancelledDrafts,0))
 await cancelSaleDraft({...cancelOptions,confirm:async()=>{blockedCancellation=true;return true}})
 check('a checkout that starts while cancellation is awaiting confirmation cannot be discarded',()=>assert.equal(cancelledDrafts,0))
 blockedCancellation=false
 assert.equal(await cancelSaleDraft(cancelOptions),true)
 check('confirming cancellation clears the draft exactly once when no checkout or hold is pending',()=>assert.equal(cancelledDrafts,1))
 let stopped=0,quit=0,exit=0
 const controller=createQuitController({stop:async()=>{stopped++},quit:()=>{quit++},exit:()=>{exit++},log:()=>{},deadlineMs:100})
 const first=controller.begin(),again=controller.begin();await first
 check('repeated close/quit requests share one cleanup and quit exactly once',()=>{assert.equal(first,again);assert.equal(stopped,1);assert.equal(quit,1);assert.equal(exit,0);assert.equal(controller.allowed,true)})
 let finishStop:()=>void=()=>{},forced=0,lateQuit=0
 const stuck=createQuitController({stop:()=>new Promise<void>(r=>{finishStop=r}),quit:()=>{lateQuit++},exit:()=>{forced++},log:()=>{},deadlineMs:25})
 const stuckJob=stuck.begin();await new Promise(r=>setTimeout(r,60));finishStop();await stuckJob
 check('shutdown deadline ends a stuck cleanup instead of leaving a background-only process',()=>{assert.equal(forced,1);assert.equal(lateQuit,0);assert.equal(stuck.allowed,true)})
 resumeBackgroundIO();const request=backgroundRequest(signal=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(Error('Aborted test connection')),{once:true})}),1000);pauseBackgroundIO();await assert.rejects(request,/Aborted/);await assert.rejects(backgroundRequest(async()=>true),/stopping/);resumeBackgroundIO()
 check('shutdown aborts active background HTTP and prevents a job starting its next network call',()=>assert.ok(true))
 const server=http.createServer((_req,res)=>{res.writeHead(200);res.write('pending')});server.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const client=http.get(`http://127.0.0.1:${(server.address() as any).port}`);client.on('error',()=>{});await new Promise<void>(resolve=>client.once('response',r=>{r.on('error',()=>{});resolve()}));const before=Date.now();await closeHttpServer(server,25);client.destroy()
 check('unfinished HTTP clients cannot hold store-server close open indefinitely',()=>assert.ok(Date.now()-before<1000))
 const file=path.join(dir,'worker-backup.db'),db=openDatabase(file)
 try{
  // Real loopback SMTP exchange only; no external server or real customer email.
  let message=''
  const smtp=net.createServer(socket=>{let buffer='',data=false;socket.on('error',()=>{});socket.write('220 localhost fixture\r\n');socket.on('data',chunk=>{buffer+=chunk.toString();while(buffer.includes('\r\n')){const end=buffer.indexOf('\r\n'),line=buffer.slice(0,end);buffer=buffer.slice(end+2);if(data){if(line==='.'){data=false;socket.write('250 Fixture queued\r\n')}else message+=line+'\n';continue}if(/^EHLO|^HELO/.test(line))socket.write('250 localhost fixture\r\n');else if(/^MAIL FROM|^RCPT TO/.test(line))socket.write('250 OK\r\n');else if(line==='DATA'){data=true;socket.write('354 End with dot\r\n')}else if(line==='QUIT'){socket.end('221 Bye\r\n')}}})})
  smtp.listen(0,'127.0.0.1');await new Promise<void>(r=>smtp.once('listening',r));resumeSmtpSockets()
  saveSmtp(db,{host:'127.0.0.1',port:(smtp.address() as net.AddressInfo).port,security:'none',fromEmail:'fixture@example.invalid'})
  try{await sendEmail(db,readSettings(db),{to:'test@example.invalid',subject:'Local protocol fixture',html:'<p>Fixture only</p>',text:'Fixture only'})}finally{await new Promise<void>(r=>smtp.close(()=>r()))}
  check('cancellable email sockets preserve a real local SMTP delivery exchange',()=>assert.match(message,/Fixture only/))
  let connected:()=>void=()=>{};const arrived=new Promise<void>(r=>{connected=r}),silent=net.createServer(socket=>{socket.on('error',()=>{});connected()});silent.listen(0,'127.0.0.1');await new Promise<void>(r=>silent.once('listening',r))
  saveSmtp(db,{port:(silent.address() as net.AddressInfo).port})
  const mail=sendEmail(db,readSettings(db),{to:'test@example.invalid',subject:'Silent local fixture',html:'Fixture',text:'Fixture'})
  await arrived;const shutdownStart=Date.now();stopMailConnections()
  try{await assert.rejects(mail);await new Promise<void>(r=>silent.close(()=>r()))}finally{resumeSmtpSockets()}
  check('shutdown actively closes a real SMTP socket waiting for its server greeting',()=>assert.ok(Date.now()-shutdownStart<2000))
  db.exec('CREATE TABLE verification_load(payload BLOB)');const insert=db.prepare('INSERT INTO verification_load(payload) VALUES(zeroblob(250000))');db.transaction(()=>{for(let i=0;i<40;i++)insert.run()})()
  const snapshot=path.join(dir,'worker-snapshot.db');await db.backup(snapshot)
  let ticks=0;const ticker=setInterval(()=>ticks++,1)
  try{await verifySnapshot(snapshot)}finally{clearInterval(ticker)}
  check('real SQLite snapshot integrity verification leaves the main event loop responsive',()=>assert.ok(ticks>0))
  const abort=new AbortController(),cancelled=verifySnapshot(snapshot,abort.signal);abort.abort();await assert.rejects(cancelled,/interrupted/)
  check('verification cancellation terminates its worker without altering the live store',()=>assert.equal((db.prepare('SELECT COUNT(*) n FROM verification_load').get() as any).n,40))
  const manager=createBackupManager(db,path.join(dir,'cancelled-backup'));manager.start();await manager.stop(true)
  const names=fs.readdirSync(path.join(dir,'cancelled-backup'))
  check('shutdown cancels an unpublished backup before database close and never publishes an unchecked file',()=>{assert.equal(names.filter(n=>n.endsWith('.db')).length,0);assert.equal((db.prepare('SELECT COUNT(*) n FROM verification_load').get() as any).n,40)})
 }finally{db.close()}
}
