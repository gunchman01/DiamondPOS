import type { BackupStatus } from './operations'
export const BACKUP_INTERVALS = [15, 30, 60, 240, 1440] as const
export interface BackupSettings { intervalMinutes: number; keepCount: number }
export const DEFAULT_BACKUP_SETTINGS: BackupSettings = { intervalMinutes: 60, keepCount: 12 }
export function validateBackupSettings(value: unknown): BackupSettings {
  const v = value as BackupSettings
  if (!v || !BACKUP_INTERVALS.includes(v.intervalMinutes as typeof BACKUP_INTERVALS[number])) throw new Error('Choose a supported backup frequency')
  if (!Number.isInteger(v.keepCount) || v.keepCount < 1 || v.keepCount > 365) throw new Error('Keep between 1 and 365 recent backups')
  return { intervalMinutes: v.intervalMinutes, keepCount: v.keepCount }
}
export interface BackupOverview {
  settings: BackupSettings
  status: BackupStatus
  directory: string
  nextBackupAt: string | null
  schedulerRunning: boolean
  totalBytes: number
  fileCount: number
  managedCount: number
  protectedCount: number
  cleanupError: string | null
  lastFile: string | null
}

/** Unknown/older servers should never be presented as an invented 15-minute schedule. */
export function backupFrequency(intervalMinutes?:number):string {
 if(!intervalMinutes||!Number.isFinite(intervalMinutes)||intervalMinutes<=0)return 'Schedule not available'
 if(intervalMinutes===60)return 'Every hour'
 if(intervalMinutes%60===0)return `Every ${intervalMinutes/60} hours`
 return `Every ${intervalMinutes} minutes`
}
export function backupOverdue(status:BackupStatus|undefined,serverTime:string|undefined):boolean{
 if(!status||status.running||status.schedulerRunning===false||!serverTime)return false
 const now=Date.parse(serverTime)
 if(status.nextBackupAt)return now-Date.parse(status.nextBackupAt)>5*60000
 return !!status.lastVerifiedAt&&!!status.intervalMinutes&&now-Date.parse(status.lastVerifiedAt)>Math.max(30,status.intervalMinutes*1.5)*60000
}
