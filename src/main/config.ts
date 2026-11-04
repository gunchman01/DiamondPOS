import { app } from 'electron'
import crypto from 'crypto'
import fs from 'fs'
import os, { type NetworkInterfaceInfo } from 'os'
import path from 'path'
import type { AppConfig } from '../shared/types'

// Per-computer settings, stored in %APPDATA%\Store POS\pos-config.json.
// These survive app updates and rollbacks.
const configFile = () => path.join(app.getPath('userData'), 'pos-config.json')

const defaults = (): AppConfig => ({
  mode: null,
  serverUrl: '',
  apiKey: '',
  tillName: os.hostname(),
  updateChannel: 'stable'
})

export function loadConfig(): AppConfig {
  try {
    return { ...defaults(), ...JSON.parse(fs.readFileSync(configFile(), 'utf8')) }
  } catch {
    return defaults()
  }
}

export function saveConfig(config: AppConfig): void {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true })
  fs.writeFileSync(configFile(), JSON.stringify(config, null, 2))
}

/** 8-character pairing code that tills enter to connect to this store server */
export function newPairingCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase()
}

/** IPv4 addresses of this PC on the local network (shown on the server so tills know where to connect) */
export function lanAddresses(): string[] {
  const all: NetworkInterfaceInfo[] = []
  for (const list of Object.values(os.networkInterfaces())) {
    if (list) all.push(...(list as NetworkInterfaceInfo[]))
  }
  return all.filter((i) => i.family === 'IPv4' && !i.internal).map((i) => i.address)
}
