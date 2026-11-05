import { useEffect, useRef, useState } from 'react'
import { customerDisplayName, type Customer, type CustomerInput, type KioskSession } from '../../../shared/types'
import { api } from '../api'

/**
 * "Send to kiosk": pushes the sign-up form to this till's iPad and waits for the
 * customer to submit. On success the new (or matched) customer is handed back.
 */
export default function KioskSignup(props: {
  tillName: string
  onDone: (c: Customer, matchedExisting: boolean) => void
  onClose: () => void
}) {
  const [session, setSession] = useState<KioskSession | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const sessionRef = useRef<KioskSession | null>(null)

  // Start (or restart) a request to the kiosk
  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    setError('')
    setSession(null)
    api
      .startKioskSession(props.tillName)
      .then((s) => {
        if (stopped) return api.cancelKioskSession(s.id)
        sessionRef.current = s
        setSession(s)
        // Poll for the customer's answer
        const poll = () => {
          timer = setTimeout(async () => {
            try {
              const next = await api.getKioskSession(s.id)
              if (stopped) return
              sessionRef.current = next
              setSession(next)
              if (next.status === 'submitted' && next.customer) {
                // Tax-exempt customers: make sure staff copy the card before carrying on
                if (!(next.customer.taxExempt && !next.customer.taxExemptCardCopied))
                  props.onDone(next.customer, next.matchedExisting)
              }
              else if (next.status === 'waiting') poll()
            } catch (e) {
              if (!stopped) setError((e as Error).message)
            }
          }, 1000)
        }
        poll()
      })
      .catch((e) => !stopped && setError((e as Error).message))
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [attempt])

  function close() {
    const s = sessionRef.current
    if (s && s.status === 'waiting') api.cancelKioskSession(s.id).catch(() => {})
    props.onClose()
  }

  const [saving, setSaving] = useState(false)
  async function cardStep(copied: boolean) {
    const s = sessionRef.current
    if (!s?.customer) return
    let c = s.customer
    if (copied) {
      setSaving(true)
      try {
        // The server merges partial updates, so only the flag is sent
        c = await api.updateCustomer(c.id, { taxExemptCardCopied: true } as unknown as CustomerInput)
      } catch (e) {
        setError((e as Error).message)
        setSaving(false)
        return
      }
    }
    props.onDone(c, s.matchedExisting)
  }

  const status = session?.status
  const needsCard = status === 'submitted' && !!session?.customer?.taxExempt && !session.customer.taxExemptCardCopied
  return (
    <div className="modal-backdrop">
      <div className="modal kiosk-wait" onKeyDown={(e) => e.key === 'Escape' && close()}>
        <h2>Customer kiosk</h2>
        {error ? (
          <>
            <div className="kiosk-state bad">
              <div className="ks-icon">!</div>
              <div>{error}</div>
            </div>
            <div className="row gap end">
              <button onClick={close}>Close</button>
              <button className="primary" autoFocus onClick={() => setAttempt((a) => a + 1)}>
                Try again
              </button>
            </div>
          </>
        ) : !session || status === 'waiting' ? (
          <>
            <div className="kiosk-state">
              <div className="spinner" />
              <div>
                {session ? (
                  <>
                    Waiting for the customer to fill in their details on <b>{session.kioskName}</b>…
                  </>
                ) : (
                  'Sending to the kiosk…'
                )}
              </div>
            </div>
            <p className="muted small">
              The form closes by itself after 5 minutes. The customer can also tap Cancel on the iPad.
            </p>
            <div className="row gap end">
              <button autoFocus onClick={close}>
                Cancel
              </button>
            </div>
          </>
        ) : needsCard && session?.customer ? (
          <>
            <div className="kiosk-state good">
              <div className="ks-icon">✓</div>
              <div>
                Added <b>{customerDisplayName(session.customer)}</b>
              </div>
            </div>
            <div className="card-step">
              <div className="card-step-title">🪪 Tax-exempt customer: copy their card</div>
              <div className="card-step-grid">
                <span>Farm Tax ID</span>
                <b>{session.customer.taxExemptId}</b>
                <span>Expires</span>
                <b>
                  {session.customer.taxExemptExpires
                    ? new Date(session.customer.taxExemptExpires + 'T00:00:00').toLocaleDateString()
                    : '—'}
                </b>
              </div>
              <p className="small">Ask for the card, check the ID and date match, and make a copy for your records.</p>
            </div>
            <div className="row gap end">
              <button disabled={saving} onClick={() => cardStep(false)}>
                Do it later
              </button>
              <button className="primary" autoFocus disabled={saving} onClick={() => cardStep(true)}>
                {saving ? 'Saving…' : 'Card copied ✓'}
              </button>
            </div>
          </>
        ) : status === 'submitted' && session?.customer ? (
          <div className="kiosk-state good">
            <div className="ks-icon">✓</div>
            <div>
              Added <b>{customerDisplayName(session.customer)}</b>
            </div>
          </div>
        ) : (
          <>
            <div className="kiosk-state bad">
              <div className="ks-icon">✕</div>
              <div>
                {status === 'cancelled' ? 'The sign-up was cancelled.' : 'The kiosk timed out with no answer.'}
              </div>
            </div>
            <div className="row gap end">
              <button onClick={close}>Close</button>
              <button className="primary" autoFocus onClick={() => setAttempt((a) => a + 1)}>
                Send again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
