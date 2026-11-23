import type { PrintJob } from '../shared/printing'
interface PrintWindow {loadURL:(url:string)=>Promise<unknown>;destroy:()=>void;isDestroyed:()=>boolean;webContents:{executeJavaScript?:(code:string)=>Promise<any>;insertCSS?:(css:string)=>Promise<string>;print:(options:Electron.WebContentsPrintOptions,cb:(ok:boolean,reason:string)=>void)=>void}}
export function createPrintManager(createWindow:()=>PrintWindow,onFinished:()=>void,log:(event:string)=>void,timeoutMs=30000){
 let stopping=false
 const active=new Set<()=>void>()
 return {stop(){stopping=true;for(const cancel of [...active])cancel()},async print(job:PrintJob):Promise<void>{
  if(stopping)throw Error('The application is closing')
  if(job.receiptWidthMm!==undefined&&![58,80].includes(job.receiptWidthMm))throw Error('Receipt width must be 58 or 80 mm')
  if(job.receiptWidthMm&&(job.label||job.letter||job.pageMm))throw Error('Receipt job has conflicting page settings')
  if(job.label&&!job.printer?.trim())throw Error('Choose a label printer before printing labels')
  const win=createWindow();log('print-started')
  try{await new Promise<void>((resolve,reject)=>{
   let done=false
   const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);active.delete(cancel);error?reject(error):resolve()}
   const cancel=()=>finish(Error('Print interrupted because the application is closing'))
   const timer=setTimeout(()=>{log('print-timeout');finish(Error('Printer did not respond within 30 seconds. Check the printer before retrying; this does not mean the sale failed.'))},timeoutMs)
   active.add(cancel)
   void win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(String(job.html))).then(async()=>{
    if(done||win.isDestroyed())return
    const options:Electron.WebContentsPrintOptions={silent:true,landscape:job.landscape===true,printBackground:true,margins:{marginType:'none'},copies:Math.max(1,Math.min(10,Math.round(job.copies??1)))}
    if(job.receiptWidthMm){
     if(!win.webContents.executeJavaScript||!win.webContents.insertCSS)throw Error('Receipt rendering is unavailable')
     // Trusted, fixed script only. Page-authored JavaScript remains disabled in the print window.
     const measured=await win.webContents.executeJavaScript(`(async()=>{await document.fonts.ready;await Promise.all(Array.from(document.images).map(i=>i.decode().catch(()=>{})));const b=document.body,r=b.getBoundingClientRect(),s=getComputedStyle(b);return {heightPx:Math.max(r.height,b.scrollHeight,b.offsetHeight)+parseFloat(s.marginTop||'0')+parseFloat(s.marginBottom||'0'),hasText:!!b.innerText.trim()}})()`)
     if(done||win.isDestroyed())return
     if(!measured?.hasText||!Number.isFinite(measured.heightPx)||measured.heightPx<=0)throw Error('Receipt rendered empty; check Receipt Layout before printing')
     const heightMm=Math.max(25,Math.ceil(measured.heightPx*25.4/96)+3)
     if(heightMm>3000)throw Error('Receipt is too long for one roll page; print it full page instead')
     await win.webContents.insertCSS(`@page { size: ${job.receiptWidthMm}mm ${heightMm}mm; margin: 0; }`)
     if(done||win.isDestroyed())return
     options.pageSize={width:job.receiptWidthMm*1000,height:heightMm*1000};options.scaleFactor=100
     log(`receipt-page-${job.receiptWidthMm}x${heightMm}mm`)
    }
    if(job.printer)options.deviceName=job.printer
    if(job.pageMm)options.pageSize={width:Math.round(job.pageMm.width*1000),height:Math.round(job.pageMm.height*1000)}
    else if(job.letter)options.pageSize='Letter'
    try{win.webContents.print(options,(ok,reason)=>finish(ok?undefined:Error(`Print failed: ${reason}`)))}catch{finish(Error('Printer could not start'))}
   }).catch((e:Error)=>finish(Error(e.message||'Print document could not load')))
  });log('print-finished')}
  finally{if(!win.isDestroyed())win.destroy();if(!stopping)onFinished()}
 }}
}
