import type { PrintJob } from '../shared/printing'
interface PrintWindow {loadURL:(url:string)=>Promise<unknown>;destroy:()=>void;isDestroyed:()=>boolean;webContents:{print:(options:Electron.WebContentsPrintOptions,cb:(ok:boolean,reason:string)=>void)=>void}}
export function createPrintManager(createWindow:()=>PrintWindow,onFinished:()=>void,log:(event:string)=>void,timeoutMs=30000){
 let stopping=false
 const active=new Set<()=>void>()
 return {stop(){stopping=true;for(const cancel of [...active])cancel()},async print(job:PrintJob):Promise<void>{
  if(stopping)throw Error('The application is closing')
  if(job.label&&!job.printer?.trim())throw Error('Choose a label printer before printing labels')
  const win=createWindow();log('print-started')
  try{await new Promise<void>((resolve,reject)=>{
   let done=false
   const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);active.delete(cancel);error?reject(error):resolve()}
   const cancel=()=>finish(Error('Print interrupted because the application is closing'))
   const timer=setTimeout(()=>{log('print-timeout');finish(Error('Printer did not respond within 30 seconds. Check the printer before retrying; this does not mean the sale failed.'))},timeoutMs)
   active.add(cancel)
   void win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(String(job.html))).then(()=>{
    if(done||win.isDestroyed())return
    const options:Electron.WebContentsPrintOptions={silent:true,landscape:job.landscape===true,printBackground:true,margins:{marginType:'none'},copies:Math.max(1,Math.min(10,Math.round(job.copies??1)))}
    if(job.printer)options.deviceName=job.printer
    if(job.pageMm)options.pageSize={width:Math.round(job.pageMm.width*1000),height:Math.round(job.pageMm.height*1000)}
    else if(job.letter)options.pageSize='Letter'
    try{win.webContents.print(options,(ok,reason)=>finish(ok?undefined:Error(`Print failed: ${reason}`)))}catch{finish(Error('Printer could not start'))}
   }).catch(()=>finish(Error('Print document could not load')))
  });log('print-finished')}
  finally{if(!win.isDestroyed())win.destroy();if(!stopping)onFinished()}
 }}
}
