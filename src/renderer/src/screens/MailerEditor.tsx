import { useEffect, useMemo, useRef, useState } from 'react'
import type { Audience, AudienceOptions, AudienceResult, AudienceRule, Campaign, CampaignSend } from '../../../shared/marketing'
import type { StoreSettings } from '../../../shared/types'
import { mailerHtml } from '../../../shared/mailerTemplate'
import { api } from '../api'
import { dateTime } from '../format'

const EMPTY_AUDIENCE: Audience = { allCustomers: false, rules: [{}], withinMonths: 12, customerTypes: [] }
const WINDOWS: { label: string; value: number | null }[] = [
  { label: 'any time', value: null },
  { label: 'the last 3 months', value: 3 },
  { label: 'the last 6 months', value: 6 },
  { label: 'the last 12 months', value: 12 },
  { label: 'the last 2 years', value: 24 },
  { label: 'the last 3 years', value: 36 }
]

/** Canva flyers are often several MB: shrink to 1200px wide JPEG so the email stays small */
async function prepareFlyer(file: File): Promise<string> {
  if (!/^image\/(png|jpeg)$/.test(file.type)) throw new Error('Please choose a PNG or JPG picture (in Canva: Share → Download → PNG or JPG)')
  const src = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('Could not read that file'))
    r.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error('That picture could not be opened'))
    i.src = src
  })
  const scale = Math.min(1, 1200 / img.naturalWidth)
  const c = document.createElement('canvas')
  c.width = Math.round(img.naturalWidth * scale)
  c.height = Math.round(img.naturalHeight * scale)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.85)
}

/** Create / edit / send one mailer. */
export default function MailerEditor(props: {
  campaignId: number | null
  options: AudienceOptions
  store: StoreSettings
  replyTo: string
  onClose: () => void
  onChanged: () => void
}) {
  const [id, setId] = useState<number | null>(props.campaignId)
  const [c, setC] = useState<Campaign | null>(null)
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [flyer, setFlyer] = useState<string | null>(null)
  const [audience, setAudience] = useState<Audience>(EMPTY_AUDIENCE)
  const [result, setResult] = useState<AudienceResult | null>(null)
  const [showList, setShowList] = useState(false)
  const [sends, setSends] = useState<CampaignSend[] | null>(null)
  const [testTo, setTestTo] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const editable = !c || c.status === 'draft'

  // Load an existing mailer
  useEffect(() => {
    if (props.campaignId === null) return
    api.mkCampaign(props.campaignId).then((x) => {
      setC(x)
      setName(x.name)
      setSubject(x.subject)
      setMessage(x.message)
      setFlyer(x.flyer)
      setAudience({ ...x.audience, rules: x.audience.rules.length ? x.audience.rules : [{}] })
    })
  }, [props.campaignId])

  // Live audience count
  useEffect(() => {
    const t = setTimeout(() => {
      api.mkAudience(audience).then(setResult).catch((e) => setError(e.message))
    }, 300)
    return () => clearTimeout(t)
  }, [audience])

  // While sending, refresh progress
  useEffect(() => {
    if (!id || !c || c.status === 'draft') return
    const load = () => {
      api.mkCampaign(id).then(setC).catch(() => {})
      api.mkSends(id).then(setSends).catch(() => {})
    }
    load()
    if (c.status !== 'sending') return
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [id, c?.status])

  const input = () => ({ name, subject, message, flyer, audience })

  async function save(): Promise<number> {
    const saved = id ? await api.mkUpdate(id, input()) : await api.mkCreate(input())
    setId(saved.id)
    setC(saved)
    props.onChanged()
    return saved.id
  }

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true)
    setError('')
    setMsg('')
    try {
      await fn()
      setMsg(ok)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const setRule = (i: number, r: AudienceRule) =>
    setAudience({ ...audience, rules: audience.rules.map((x, k) => (k === i ? r : x)) })
  const n = result?.recipients.length ?? 0

  const previewHtml = useMemo(() => {
    const html = mailerHtml({
      storeName: props.store.storeName,
      storeAddress: props.store.storeAddress || '(add the store address in Settings)',
      replyTo: props.replyTo || 'your-store@example.com',
      subject: subject || '(subject)',
      message,
      flyerSrc: flyer,
      recipientName: result?.recipients[0]?.name.split(' ')[0] ?? 'Sam'
    })
    return html.slice(html.indexOf('<body'), html.lastIndexOf('</body>')).replace(/^<body[^>]*>/, '')
  }, [subject, message, flyer, props.store, props.replyTo, result])

  const Pick = (p: { value?: string; options: string[]; placeholder: string; onChange: (v: string) => void }) => (
    <select disabled={!editable} value={p.value ?? ''} onChange={(e) => p.onChange(e.target.value)}>
      <option value="">{p.placeholder}</option>
      {p.options.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  )

  return (
    <div className="page wide mailer">
      <div className="row between">
        <button className="link" onClick={props.onClose}>
          ← All mailers
        </button>
        {c && c.status !== 'draft' && (
          <span className={`badge ${c.status === 'sent' ? 'new' : c.status === 'sending' ? 'upd' : 'err'}`}>{c.status}</span>
        )}
      </div>
      {msg && <div className="ok-text">{msg}</div>}
      {error && <div className="error-text">{error}</div>}

      <div className="mailer-grid">
        {/* ---------------- Left: content + audience ---------------- */}
        <div className="form">
          <div className="card form">
            <h3>1. The mailer</h3>
            <label>
              Mailer name (only you see this)
              <input disabled={!editable} value={name} placeholder="e.g. Spring chainsaw service" onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Email subject
              <input disabled={!editable} value={subject} placeholder="e.g. 20% off chainsaw tune-ups this month" onChange={(e) => setSubject(e.target.value)} />
            </label>
            <label>
              Message above the flyer (optional, {'{name}'} = customer's first name)
              <textarea disabled={!editable} rows={4} className="comments" value={message} onChange={(e) => setMessage(e.target.value)} />
            </label>
            <div className="flyer-box">
              {flyer ? <img src={flyer} alt="Flyer" /> : <span className="muted">No flyer yet. Upload the PNG or JPG you downloaded from Canva.</span>}
            </div>
            {editable && (
              <div className="row gap">
                <button onClick={() => fileRef.current?.click()}>{flyer ? 'Replace flyer…' : 'Upload flyer…'}</button>
                {flyer && (
                  <button className="danger" onClick={() => setFlyer(null)}>
                    Remove flyer
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) run(async () => setFlyer(await prepareFlyer(f)), 'Flyer added')
                  }}
                />
              </div>
            )}
          </div>

          <div className="card form">
            <h3>2. Who gets it</h3>
            <div className="row gap">
              <label className="check">
                <input type="radio" disabled={!editable} checked={!audience.allCustomers} onChange={() => setAudience({ ...audience, allCustomers: false })} />
                Customers who bought…
              </label>
              <label className="check">
                <input type="radio" disabled={!editable} checked={audience.allCustomers} onChange={() => setAudience({ ...audience, allCustomers: true })} />
                Everyone on the email list
              </label>
            </div>

            {!audience.allCustomers && (
              <>
                {audience.rules.map((r, i) => (
                  <div key={i} className="rule-row">
                    <span className="rule-or">{i === 0 ? 'an item' : 'OR an item'}</span>
                    <Pick value={r.department} placeholder="any department" options={props.options.departments} onChange={(v) => setRule(i, { ...r, department: v || undefined })} />
                    <Pick value={r.manufacturer} placeholder="any brand" options={props.options.manufacturers} onChange={(v) => setRule(i, { ...r, manufacturer: v || undefined })} />
                    <Pick value={r.vendor} placeholder="any vendor" options={props.options.vendors} onChange={(v) => setRule(i, { ...r, vendor: v || undefined })} />
                    <input
                      disabled={!editable}
                      placeholder="name contains…"
                      value={r.nameContains ?? ''}
                      onChange={(e) => setRule(i, { ...r, nameContains: e.target.value || undefined })}
                    />
                    {editable && audience.rules.length > 1 && (
                      <button className="link" title="Remove" onClick={() => setAudience({ ...audience, rules: audience.rules.filter((_, k) => k !== i) })}>
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                {editable && (
                  <button className="link add-rule" onClick={() => setAudience({ ...audience, rules: [...audience.rules, {}] })}>
                    + OR bought something else
                  </button>
                )}
                <p className="muted small">
                  Within a row, everything must match the same item (e.g. <i>Mowers</i> + <i>Exmark</i> = an Exmark mower). Rows are
                  "or".
                </p>
                <label className="inline">
                  Bought in
                  <select
                    disabled={!editable}
                    value={audience.withinMonths ?? ''}
                    onChange={(e) => setAudience({ ...audience, withinMonths: e.target.value ? Number(e.target.value) : null })}
                  >
                    {WINDOWS.map((w) => (
                      <option key={w.label} value={w.value ?? ''}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {props.options.customerTypes.length > 0 && (
              <div className="row gap small">
                <span className="muted">Customer types:</span>
                {props.options.customerTypes.map((t) => (
                  <label key={t} className="check">
                    <input
                      type="checkbox"
                      disabled={!editable}
                      checked={audience.customerTypes.includes(t)}
                      onChange={(e) =>
                        setAudience({
                          ...audience,
                          customerTypes: e.target.checked ? [...audience.customerTypes, t] : audience.customerTypes.filter((x) => x !== t)
                        })
                      }
                    />
                    {t}
                  </label>
                ))}
                <span className="muted">(none ticked = all)</span>
              </div>
            )}

            {result && (
              <div className="audience-result">
                <div className="big-count">
                  <b>{n}</b> customer{n === 1 ? '' : 's'} will get this email
                </div>
                <div className="small muted">
                  {result.matched} matched · {result.excludedNoConsent} not on the email list (didn't tick "OK to email") ·{' '}
                  {result.excludedNoEmail} without an email address
                </div>
                {n > 0 && (
                  <button className="link" onClick={() => setShowList(!showList)}>
                    {showList ? 'Hide' : 'Show'} who
                  </button>
                )}
                {showList && (
                  <div className="who-list">
                    {result.recipients.map((x) => (
                      <div key={x.customerId}>
                        <b>{x.name}</b> <span className="muted">{x.email}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ---------------- Right: preview + send ---------------- */}
        <div className="form">
          <div className="card form">
            <h3>3. Preview</h3>
            <div className="email-preview">
              <div className="email-subject">
                <span className="muted">Subject:</span> <b>{subject || '(subject)'}</b>
              </div>
              <div className="email-body" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          </div>

          <div className="card form">
            <h3>4. Send</h3>
            {editable ? (
              <>
                <div className="row gap">
                  <button className="primary" disabled={busy} onClick={() => run(save, 'Saved')}>
                    Save draft
                  </button>
                </div>
                <div className="row gap">
                  <input
                    style={{ flex: 1, width: 'auto' }}
                    placeholder="Send a test to (your email)"
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                  />
                  <button
                    disabled={busy || !testTo}
                    onClick={() =>
                      run(async () => {
                        const cid = await save()
                        await api.mkTest(cid, testTo)
                      }, `Test sent to ${testTo}. Check your inbox (and spam folder).`)
                    }
                  >
                    Send test
                  </button>
                </div>
                <button
                  className="primary big"
                  disabled={busy || n === 0}
                  onClick={() =>
                    confirm(`Send "${subject}" to ${n} customer${n === 1 ? '' : 's'}? This can't be undone.`) &&
                    run(async () => {
                      const cid = await save()
                      setC(await api.mkSend(cid))
                      props.onChanged()
                    }, 'Sending has started. You can leave this screen; it keeps going in the background.')
                  }
                >
                  Send to {n} customer{n === 1 ? '' : 's'}
                </button>
                <p className="muted small">
                  Emails go out a few at a time so your email provider doesn't block you. Only customers who ticked "OK to
                  email" are included, and every email has your address and how to unsubscribe.
                </p>
              </>
            ) : (
              c && (
                <>
                  <div className="progress-row">
                    <progress max={Math.max(1, c.total)} value={c.sent + c.failed} />
                    <span>
                      {c.sent} sent · {c.failed} failed · {c.total} total
                    </span>
                  </div>
                  {c.lastError && <div className="error-text">{c.lastError}</div>}
                  {c.sentAt && <div className="ok-text">Finished {dateTime(c.sentAt)}</div>}
                  <div className="row gap">
                    {c.status === 'sending' && (
                      <button className="danger" onClick={() => run(async () => setC(await api.mkCancel(c.id)), 'Sending stopped')}>
                        Stop sending
                      </button>
                    )}
                    <button
                      onClick={() =>
                        run(async () => {
                          const copy = await api.mkCopy(c.id)
                          props.onChanged()
                          setId(copy.id)
                          setC(copy)
                          setName(copy.name)
                          setSends(null)
                        }, 'Copied. Edit and send the copy.')
                      }
                    >
                      Make a copy
                    </button>
                  </div>
                  {sends && (
                    <div className="who-list">
                      {sends.map((s) => (
                        <div key={s.customerId}>
                          <span className={`badge ${s.status === 'sent' ? 'new' : s.status === 'failed' ? 'err' : 'upd'}`}>{s.status}</span>{' '}
                          <b>{s.name}</b> <span className="muted">{s.email}</span>
                          {s.error && <span className="err-text small"> · {s.error}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
