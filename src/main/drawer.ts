import { execFile } from 'child_process'
import path from 'path'
import { drawerConfig, drawerCommand, type CashDrawerConfig } from '../shared/drawer'
let running = false
let lastAttempt = 0
export async function openCashDrawer(value?: Partial<CashDrawerConfig>, dependencies?: {
  platform: string; run: (command: string) => Promise<void>
}): Promise<void> {
  const config = drawerConfig(value)
  if (!config.enabled) throw new Error('Enable and save Cash drawer under Settings → Printing first')
  if ((dependencies?.platform ?? process.platform) !== 'win32') throw new Error('This COM-port drawer is supported on Windows only')
  if (running || Date.now() - lastAttempt < 1000) throw new Error('Please wait before sending another drawer signal')
  running = true; lastAttempt = Date.now()
  try {
    const command = drawerCommand(config)
    if (dependencies) await dependencies.run(command)
    else await new Promise<void>((resolve, reject) => {
      const cmd = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe')
      execFile(cmd, ['/d', '/c', command], { timeout: 3000, windowsHide: true }, (error) =>
        error ? reject(new Error(`Could not send drawer signal on ${config.port}: ${error.message}`)) : resolve())
    })
  } finally { running = false }
}
