import { useEffect, useMemo, useState } from 'react'
import type { BootInfo, Health, ReleaseInfo, UpdateEvent } from '../../../shared/types'
import { compareVersions } from '../../../shared/version'

/**
 * Update / rollback screen.
 *  - "Update to latest" installs the newest release on this computer's channel.
 *  - "Revert to previous" installs the release just before the current one.
 *  - Any listed version can be installed directly.
 */
export default function Updates(props: { boot: BootInfo; health: Health | null; onChange: (b: BootInfo) => void }) {
  const { boot, health } = props
  const current = boot.appVersion
  const channel = boot.config.updateChannel
  const [releases, setReleases] = useState<ReleaseInfo[] | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<UpdateEvent | null>(null)

  useEffect(() => window.pos.onUpdateEvent(setStatus), [])

  const load = () => {
    setError('')
    setReleases(null)
    window.pos
      .listReleases()
      .then(setReleases)
      .catch((e) => {
        setError(e.message)
        setReleases([])
      })
  }
  useEffect(load, [])

  // Stable channel hides pre-releases (e.g. v1.3.0-beta.1)
  const visible = useMemo(
    () =>
      (releases ?? [])
        .filter((r) => channel === 'beta' || !r.prerelease)
        .sort((a, b) => compareVersions(b.version, a.version)),
    [releases, channel]
  )
  const latest = visible[0]
  const previous = visible.find((r) => compareVersions(r.version, current) < 0)
  const busy = status !== null && status.type !== 'error'

  async function install(r: ReleaseInfo) {
    const verb = compareVersions(r.version, current) > 0 ? 'Update' : 'Revert'
    if (!confirm(`${verb} this computer to v${r.version}? The app will restart.`)) return
    setStatus({ type: 'checking' })
    try {
      await window.pos.installRelease(r.tag)
    } catch (e) {
      setStatus({ type: 'error', message: (e as Error).message })
    }
  }

  return (
    <div className="page">
      <h2>Updates</h2>

      <div className="card">
        <div className="row between">
          <div>
            Installed version: <b>v{current}</b>
            {boot.config.mode === 'till' && health && (
              <span className="muted"> · Store server: v{health.serverVersion}</span>
            )}
          </div>
          <label className="inline">
            Channel
            <select
              value={channel}
              onChange={async (e) =>
                props.onChange(await window.pos.saveConfig({ updateChannel: e.target.value as 'stable' | 'beta' }))
              }
            >
              <option value="stable">Stable</option>
              <option value="beta">Beta (testing)</option>
            </select>
          </label>
        </div>

        <div className="row gap" style={{ marginTop: 12 }}>
          <button
            className="primary big"
            disabled={busy || !latest || compareVersions(latest.version, current) <= 0}
            onClick={() => latest && install(latest)}
          >
            {latest && compareVersions(latest.version, current) > 0 ? `Update to v${latest.version}` : 'Up to date'}
          </button>
          <button className="big" disabled={busy || !previous} onClick={() => previous && install(previous)}>
            {previous ? `Revert to v${previous.version}` : 'No earlier version'}
          </button>
          <button onClick={load} disabled={busy}>
            Refresh
          </button>
        </div>

        {status && <StatusLine e={status} />}
        {!boot.isPackaged && (
          <p className="muted small">Running in development mode — installing is disabled, but the list still loads.</p>
        )}
        <p className="muted small">
          Update the <b>Store Server</b> PC first, then the tills. When reverting, revert the tills first, then the server.
        </p>
      </div>

      {error && <div className="error-text">{error}</div>}
      {releases === null && <p className="muted">Loading releases…</p>}

      {visible.map((r) => {
        const cmp = compareVersions(r.version, current)
        return (
          <div key={r.tag} className="card release">
            <div className="row between">
              <div>
                <b>v{r.version}</b> {r.prerelease && <span className="pill">beta</span>}{' '}
                {cmp === 0 && <span className="pill ok">installed</span>}
                <span className="muted small"> · {new Date(r.publishedAt).toLocaleDateString()}</span>
              </div>
              {cmp !== 0 && (
                <button disabled={busy} onClick={() => install(r)}>
                  {cmp > 0 ? 'Install' : 'Revert to this'}
                </button>
              )}
            </div>
            {r.notes && <pre className="notes">{r.notes}</pre>}
          </div>
        )
      })}
    </div>
  )
}

function StatusLine({ e }: { e: UpdateEvent }) {
  switch (e.type) {
    case 'checking':
      return <p>Checking release…</p>
    case 'downloading':
      return (
        <div>
          <p>Downloading… {e.percent}%</p>
          <progress max={100} value={e.percent} />
        </div>
      )
    case 'ready':
      return <p className="ok-text">v{e.version} downloaded. Restarting to install…</p>
    case 'error':
      return <p className="error-text">{e.message}</p>
  }
}
