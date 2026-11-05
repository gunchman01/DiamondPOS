import { useState } from 'react'
import type { BootInfo } from '../../../shared/types'
import { SERVER_PORT } from '../../../shared/constants'
import { api } from '../api'

/** First-run screen: is this PC the Store Server, or a Till? */
export default function Setup({ boot, onDone }: { boot: BootInfo; onDone: (b: BootInfo) => void }) {
  const [choice, setChoice] = useState<'server' | 'till' | null>(null)
  const [tillName, setTillName] = useState(boot.config.tillName)
  const [serverIp, setServerIp] = useState('')
  const [pairingCode, setPairingCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const serverUrl = () => {
    const ip = serverIp.trim()
    if (ip.startsWith('http')) return ip
    return `http://${ip}${ip.includes(':') ? '' : ':' + SERVER_PORT}`
  }

  async function finishServer() {
    setBusy(true)
    onDone(await window.pos.saveConfig({ mode: 'server', tillName }))
  }

  async function finishTill() {
    setError('')
    setBusy(true)
    try {
      await api.testConnection(serverUrl(), pairingCode.trim().toUpperCase())
      onDone(
        await window.pos.saveConfig({
          mode: 'till',
          tillName,
          serverUrl: serverUrl(),
          apiKey: pairingCode.trim().toUpperCase()
        })
      )
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="setup">
      <h1>Welcome to DiamondPOS</h1>
      <p className="muted">Set up this computer. You only need to do this once.</p>

      <div className="choice-row">
        <button className={choice === 'server' ? 'choice selected' : 'choice'} onClick={() => setChoice('server')}>
          <strong>This is the Store Server</strong>
          <span>Pick ONE computer per store (e.g. the back-office PC). It stores all products and sales. It can also be used as a till.</span>
        </button>
        <button className={choice === 'till' ? 'choice selected' : 'choice'} onClick={() => setChoice('till')}>
          <strong>This is a Till</strong>
          <span>Connects to the Store Server over the store network.</span>
        </button>
      </div>

      {choice && (
        <div className="card form">
          <label>
            Name for this computer (shown on receipts)
            <input value={tillName} onChange={(e) => setTillName(e.target.value)} />
          </label>

          {choice === 'till' && (
            <>
              <label>
                Store Server IP address (shown on the server's Settings screen)
                <input placeholder="e.g. 192.168.1.20" value={serverIp} onChange={(e) => setServerIp(e.target.value)} />
              </label>
              <label>
                Pairing code (shown on the server's Settings screen)
                <input placeholder="e.g. 3FA9C21B" value={pairingCode} onChange={(e) => setPairingCode(e.target.value)} />
              </label>
            </>
          )}

          {error && <div className="error-text">{error}</div>}

          <button
            className="primary big"
            disabled={busy || !tillName.trim() || (choice === 'till' && (!serverIp.trim() || !pairingCode.trim()))}
            onClick={choice === 'server' ? finishServer : finishTill}
          >
            {busy ? 'Please wait…' : choice === 'server' ? 'Set up as Store Server' : 'Connect to Store Server'}
          </button>
          {choice === 'server' && (
            <p className="muted small">
              Windows may ask to allow network access. Choose <b>Private networks</b> and click Allow, so tills can connect.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
