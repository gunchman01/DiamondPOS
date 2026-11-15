export interface ApprovalConfig {
  enabled: boolean
  url: string
  hasKey: boolean
  serviceId: string
  followUpEnabled: boolean
  afterDays: number
  lastSyncAt: string | null
  error: string | null
}
export interface EstimateInfo {
  id: string
  revision: number
  state: string
  sentAt: string | null
  dueAt: string | null
  due: boolean
  needsResend: boolean
  amountCents: number
  decisionAt: string | null
  decisionBy: string | null
  comment: string | null
}
export interface EstimateSnapshot {
  number: string
  customer: string
  unit: string
  diagnosis: string
  lines: { description: string; qty: number; unitPriceCents: number }[]
  totalCents: number
  taxCents: number
  balanceDueCents: number
  partsNotice: string
}
