// Marketing (email mailers): shapes shared by the server and the Marketing screen.

/**
 * One "bought something like this" rule. Every filled-in part must match the
 * SAME item (e.g. Brand = Exmark AND Department = Mowers). Rows are combined
 * with OR: a customer matches if they bought anything matching ANY row.
 */
export interface AudienceRule {
  department?: string
  manufacturer?: string
  vendor?: string
  /** Text the item name contains, e.g. "chainsaw" */
  nameContains?: string
}

export interface Audience {
  /** Everyone who opted in to email, regardless of purchases (rules are ignored) */
  allCustomers: boolean
  rules: AudienceRule[]
  /** Only purchases in the last N months (null = any time) */
  withinMonths: number | null
  /** Only these customer types (empty = all) */
  customerTypes: string[]
}

export interface AudienceRecipient {
  customerId: number
  name: string
  email: string
  purchases: number // matching sales
  lastPurchase: string // ISO
}

export interface AudienceResult {
  /** Customers who matched the rules */
  matched: number
  /** Will receive the mailer (OK to email + has an email address) */
  recipients: AudienceRecipient[]
  excludedNoConsent: number
  excludedNoEmail: number
}

export interface AudienceOptions {
  departments: string[]
  manufacturers: string[]
  vendors: string[]
  customerTypes: string[]
}

export type CampaignStatus = 'draft' | 'sending' | 'sent' | 'cancelled'

export interface Campaign {
  id: number
  name: string
  subject: string
  message: string
  /** Flyer image as a data: URL (JPEG/PNG), or null */
  flyer: string | null
  audience: Audience
  status: CampaignStatus
  createdAt: string
  sentAt: string | null
  /** Progress once sending has started */
  total: number
  sent: number
  failed: number
  /** Why sending is paused (e.g. the mail server refused the login) */
  lastError: string | null
}

export type CampaignInput = Pick<Campaign, 'name' | 'subject' | 'message' | 'flyer' | 'audience'>

export interface CampaignSend {
  customerId: number
  name: string
  email: string
  status: 'pending' | 'sent' | 'failed'
  error: string | null
  sentAt: string | null
}

export type SmtpSecurity = 'starttls' | 'ssl' | 'none'

export interface SmtpSettings {
  host: string
  port: number
  security: SmtpSecurity
  username: string
  /** Never sent back to the screen; '' on save = keep the current password */
  password: string
  fromName: string
  fromEmail: string
  /** Replies and unsubscribe requests go here (defaults to fromEmail) */
  replyTo: string
  /** Emails per minute (stay under your provider's limits) */
  perMinute: number
}

/** What the Email settings screen gets back (the password itself is never sent to the screen) */
export type SmtpSettingsView = Omit<SmtpSettings, 'password'> & { hasPassword: boolean }

export interface SmtpPreset {
  label: string
  host: string
  port: number
  security: SmtpSecurity
  note: string
}

export const SMTP_PRESETS: SmtpPreset[] = [
  {
    label: 'Gmail / Google Workspace',
    host: 'smtp.gmail.com',
    port: 587,
    security: 'starttls',
    note: 'Turn on 2-Step Verification and use an App Password (Google Account → Security → App passwords). Limit: about 500 emails a day (2,000 for Workspace).'
  },
  {
    label: 'Microsoft 365 / Exchange Online',
    host: 'smtp.office365.com',
    port: 587,
    security: 'starttls',
    note: 'Your Microsoft 365 admin must allow "Authenticated SMTP" for this mailbox. Limit: 30 emails a minute, 10,000 a day.'
  },
  {
    label: 'Outlook.com / Hotmail',
    host: 'smtp-mail.outlook.com',
    port: 587,
    security: 'starttls',
    note: 'Personal Microsoft accounts have low sending limits. Better for testing than for big mailers.'
  },
  {
    label: 'Yahoo Mail',
    host: 'smtp.mail.yahoo.com',
    port: 465,
    security: 'ssl',
    note: 'Use an app password (Yahoo Account Security → Generate app password).'
  },
  { label: 'Other / my email provider', host: '', port: 587, security: 'starttls', note: 'Ask your email or web host for the SMTP server details.' }
]
