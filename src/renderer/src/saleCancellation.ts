/** Never discard the recovery record for a checkout or stock reservation whose result is uncertain. */
export async function cancelSaleDraft(options:{blocked:()=>boolean;confirm:()=>Promise<boolean>;beforeClear?:()=>Promise<void>;clear:()=>void}):Promise<boolean>{
 if(options.blocked())return false
 if(!await options.confirm())return false
 if(options.blocked())return false
 if(options.beforeClear)await options.beforeClear()
 if(options.blocked())return false
 options.clear()
 return true
}
