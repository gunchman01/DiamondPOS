export type DisplayZoom = 'auto' | number
export function normaliseDisplayZoom(value:unknown):DisplayZoom {
 return value==='auto'?'auto':typeof value==='number'&&Number.isFinite(value)&&value>=0.8&&value<=1.25?Math.round(value*100)/100:'auto'
}
/** Electron content bounds are device-independent pixels before browser zoom; avoid resize/zoom feedback. */
export function displayScale(width:number,height:number,setting:unknown='auto'):number {
 const value=normaliseDisplayZoom(setting)
 if(value!=='auto')return value
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return 1
 return Math.max(.85,Math.min(1,Math.floor(Math.min(width/1366,height/850)*100)/100))
}
