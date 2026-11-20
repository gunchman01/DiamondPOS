interface Dependencies {stop:()=>Promise<void>;quit:()=>void;exit:()=>void;log:(event:string)=>void;deadlineMs?:number}
/** One shutdown job covers title-bar close, Alt+F4, app.quit and updater quit. */
export function createQuitController(deps:Dependencies){
 let job:Promise<void>|null=null,allowed=false
 return {get allowed(){return allowed},get closing(){return job!==null},begin(){
  if(job)return job
  deps.log('shutdown-started')
  const timer=setTimeout(()=>{deps.log('shutdown-deadline');allowed=true;deps.exit()},deps.deadlineMs??20000)
  job=Promise.resolve().then(deps.stop).catch(()=>deps.log('shutdown-error')).then(()=>{clearTimeout(timer);if(allowed)return;allowed=true;deps.log('shutdown-finished');deps.quit()})
  return job
 }}
}
