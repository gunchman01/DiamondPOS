/**
 * QUICKBOOKS BRIDGE
 *
 * Intuit's Web Connector only talks plain http:// to "localhost". When
 * QuickBooks is on a different PC from the store server, DiamondPOS runs on
 * that PC (as a till) with the bridge switched on. The bridge listens on
 * http://localhost:4581 (this PC only) and relays /qbwc calls to the store server.
 */
import http from 'http'
import { QB_BRIDGE_PORT } from '../shared/constants'

let bridge: http.Server | null = null
let target = ''

export function isBridgeRunning(): boolean {
  return bridge !== null
}

export function startQbBridge(serverUrl: string): Promise<void> {
  target = serverUrl.replace(/\/+$/, '')
  if (bridge) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', target)
      if (!url.pathname.startsWith('/qbwc')) {
        res.statusCode = 404
        return res.end('Diamond POS QuickBooks bridge')
      }
      const upstream = http.request(
        url,
        { method: req.method, headers: { ...req.headers, host: url.host } },
        (r) => {
          res.writeHead(r.statusCode || 502, r.headers)
          r.pipe(res)
        }
      )
      upstream.on('error', (e) => {
        res.statusCode = 502
        res.end(`The Diamond POS store server could not be reached: ${e.message}`)
      })
      req.pipe(upstream)
    })
    server.on('error', (e) => {
      bridge = null
      reject(e)
    })
    // 127.0.0.1 only: nothing else on the network can use the bridge
    server.listen(QB_BRIDGE_PORT, '127.0.0.1', () => {
      bridge = server
      resolve()
    })
  })
}

export function stopQbBridge(): Promise<void> {
  const b = bridge
  bridge = null
  return b ? new Promise((r) => b.close(() => r())) : Promise.resolve()
}
