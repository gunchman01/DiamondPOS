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
