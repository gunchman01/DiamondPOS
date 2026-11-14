export interface BackupStatus {
  lastVerifiedAt: string | null
  lastAttemptAt: string | null
  lastFailureAt: string | null
  error: string | null
  running: boolean
}
export interface QuickBooksOperations {
  enabled: boolean
  companyName: string
  lastConnectionAt: string | null
  lastSyncAt: string | null
  lastFailureAt: string | null
  error: string | null
  pending: number
  problems: number
  manual: number
}
export interface OperationsStatus {
  serverTime: string
  backup: BackupStatus
  quickbooks: QuickBooksOperations
}
