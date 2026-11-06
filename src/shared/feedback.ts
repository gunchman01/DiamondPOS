/** Feedback from staff: ideas / enhancement requests, problems and questions, emailed to the developer */
export type FeedbackKind = 'idea' | 'problem' | 'question'

export const FEEDBACK_KINDS: { kind: FeedbackKind; label: string }[] = [
  { kind: 'idea', label: 'Idea / enhancement request' },
  { kind: 'problem', label: 'Something isn\'t working' },
  { kind: 'question', label: 'Question' }
]

/** Where feedback is emailed unless changed in Settings */
export const DEFAULT_FEEDBACK_EMAIL = 'gbarnes27@gmail.com'

export interface FeedbackInput {
  kind: FeedbackKind
  subject: string
  message: string
  /** Who sent it (optional) */
  name?: string
  /** Email to reply to (optional) */
  replyEmail?: string
  tillName?: string
  appVersion?: string
  /** Screen they were on */
  screen?: string
}

export interface Feedback extends Required<FeedbackInput> {
  id: number
  status: 'pending' | 'sent' | 'failed'
  error: string | null
  sentTo: string | null
  sentAt: string | null
  createdAt: string
}
