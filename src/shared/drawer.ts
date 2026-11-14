export interface CashDrawerConfig {
  enabled: boolean
  port: string
  triggerText: string
  shortcut: 'none' | 'F1' | 'F10' | 'F11' | 'F12'
}
export const DEFAULT_DRAWER: CashDrawerConfig = { enabled: false, port: 'COM3', triggerText: 'hello', shortcut: 'none' }
export function drawerConfig(value?: Partial<CashDrawerConfig>): CashDrawerConfig {
  const next = { ...DEFAULT_DRAWER, ...value }
  next.port = String(next.port).trim().toUpperCase()
  next.triggerText = String(next.triggerText)
  if (!/^COM([1-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-6])$/.test(next.port)) throw new Error('Choose COM1 through COM256')
  if (!/^[A-Za-z0-9 ._-]{1,80}$/.test(next.triggerText)) throw new Error('Trigger text must be 1–80 letters, numbers, spaces, dots, underscores or hyphens')
  if (!['none','F1','F10','F11','F12'].includes(next.shortcut)) throw new Error('Choose a supported drawer shortcut')
  next.enabled = next.enabled === true
  return next
}
/** Fixed echo operation, not an arbitrary configurable shell command. */
export function drawerCommand(value?: Partial<CashDrawerConfig>): string {
  const c = drawerConfig(value)
  const port = Number(c.port.slice(3)) > 9 ? `\\\\.\\${c.port}` : c.port
  return `echo(${c.triggerText}>${port}`
}
