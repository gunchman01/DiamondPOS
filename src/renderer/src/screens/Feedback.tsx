import { useEffect, useState } from 'react'
import type { BootInfo } from '../../../shared/types'
import { FEEDBACK_KINDS, type Feedback as FeedbackItem, type FeedbackKind } from '../../../shared/feedback'
import { api } from '../api'
import { dateTime } from '../format'

/** Send an idea / enhancement request, a problem or a question to the developer (emailed). */
export default function Feedback({ boot, fromScreen }: { boot: BootInfo; fromScreen?: string | null }) {
  const [kind, setKind] = useState<FeedbackKind>('idea')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [replyEmail, setReplyEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [list, setList] = useState<FeedbackItem[]>([])

  const load = () => api.feedbackList().then(setList).catch(() => {})
  useEffect(() => {
    load()
  }, [])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setResult(null)
    try {
      const f = await api.sendFeedback({
        kind,
        subject,
        message,
        name,
        replyEmail,
        tillName: boot.config.tillName,
        appVersion: boot.appVersion,
        screen: fromScreen ?? ''
      })
      if (f.status === 'sent') {
        setResult({ ok: true, text: 'Thank you! Your feedback was sent.' })
        setSubject('')
        setMessage('')
      } else {
        setResult({
          ok: false,
          text: `Saved, but it couldn't be emailed yet: ${f.error}. It will be sent automatically once email works, or use "Send again" below.`
        })
        setSubject('')
        setMessage('')
      }
      load()
    } catch (err) {
      setResult({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function resend(id: number) {
    try {
      const f = await api.resendFeedback(id)
      setResult(f.status === 'sent' ? { ok: true, text: 'Sent.' } : { ok: false, text: `Still couldn't send: ${f.error}` })
      load()
    } catch (err) {
      setResult({ ok: false, text: (err as Error).message })
    }
  }

  const label = (k: FeedbackKind) => FEEDBACK_KINDS.find((x) => x.kind === k)?.label ?? k

  return (
    <div className="page feedback-page">
      <h2>Feedback & requests</h2>
      <p className="muted">
        Have an idea that would make DiamondPOS better, something that isn't working right, or a question? Tell us here. It's
        emailed straight to the developer.
      </p>

      <form className="card form" onSubmit={send}>
        <div className="kind-row">
          {FEEDBACK_KINDS.map((k) => (
            <label key={k.kind} className={kind === k.kind ? 'kind-chip active' : 'kind-chip'}>
              <input type="radio" name="kind" checked={kind === k.kind} onChange={() => setKind(k.kind)} />
              {k.label}
            </label>
          ))}
        </div>
        <label>
          Short title
          <input
            autoFocus
            maxLength={150}
            value={subject}
            placeholder={kind === 'problem' ? 'e.g. Receipt cuts off the last line' : kind === 'question' ? 'e.g. How do I void a sale?' : 'e.g. Hold a sale and serve the next customer'}
            onChange={(e) => setSubject(e.target.value)}
          />
        </label>
        <label>
          {kind === 'problem' ? 'What happened? What did you expect? (steps help a lot)' : 'Details'}
          <textarea className="comments" rows={7} maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
        <div className="row gap">
          <label className="grow">
            Your name (optional)
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="grow">
            Your email, if you'd like a reply (optional)
            <input type="email" value={replyEmail} onChange={(e) => setReplyEmail(e.target.value)} />
          </label>
        </div>
        <div className="muted small">
          Also sent: till <b>{boot.config.tillName}</b>, version <b>v{boot.appVersion}</b>
          {fromScreen ? (
            <>
              , screen <b>{fromScreen}</b>
            </>
          ) : null}
          .
        </div>
        {result && <div className={result.ok ? 'ok-text' : 'error-text'}>{result.text}</div>}
        <div>
          <button type="submit" className="primary" disabled={busy || !subject.trim() || !message.trim()}>
            {busy ? 'Sending…' : 'Send feedback'}
          </button>
        </div>
      </form>

      {list.length > 0 && (
        <>
          <h3>Sent from this store</h3>
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Title</th>
                <th>From</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((f) => (
                <tr key={f.id} title={f.message}>
                  <td className="muted">{dateTime(f.createdAt)}</td>
                  <td>{label(f.kind)}</td>
                  <td>{f.subject}</td>
                  <td>{f.name || f.tillName}</td>
                  <td>
                    {f.status === 'sent' ? (
                      <span className="pill ok">Sent</span>
                    ) : (
                      <span className="pill" title={f.error ?? ''}>
                        Not sent yet
                      </span>
                    )}
                  </td>
                  <td className="r">{f.status !== 'sent' && <button onClick={() => resend(f.id)}>Send again</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
