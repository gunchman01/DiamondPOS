/**
 * The "I want to…" menu (top bar) and the buttons down the left of the Home screen.
 * Each computer chooses which entries it shows and their order (Settings → Menus),
 * saved in its pos-config.json (AppConfig.menus).
 */
import type { IconName } from './icons'

/** Screens the app can show */
export type Screen =
  | 'home'
  | 'sell'
  | 'products'
  | 'customers'
  | 'reports'
  | 'settings'
  | 'updates'
  | 'quickbooks'
  | 'marketing'
  | 'workorders'
  | 'help'
  | 'feedback'
  | 'held'
  | 'receiving'

/** Something extra to do when the screen opens */
export type Intent = 'return' | 'checkin' | 'tags' | 'receive' | null

export interface MenuEntry {
  id: string
  label: string
  icon: IconName
  screen: Screen
  intent?: Intent
}

/** Everything that can go in a menu */
export const MENU_ENTRIES: MenuEntry[] = [
  { id: 'home', label: 'Go to the Home screen', icon: 'home', screen: 'home' },
  { id: 'sell', label: 'Make a sale', icon: 'makeSale', screen: 'sell' },
  { id: 'return', label: 'Return items', icon: 'salesHistory', screen: 'sell', intent: 'return' },
  { id: 'held', label: 'Open held receipts', icon: 'heldReceipts', screen: 'held' },
  { id: 'checkin', label: 'Check in a repair', icon: 'workOrders', screen: 'workorders', intent: 'checkin' },
  { id: 'workorders', label: 'See work orders', icon: 'workOrders', screen: 'workorders' },
  { id: 'customers', label: 'Find a customer', icon: 'customers', screen: 'customers' },
  { id: 'products', label: 'Look up an item', icon: 'itemList', screen: 'products' },
  { id: 'receive', label: 'Receive items', icon: 'receivingHistory', screen: 'receiving', intent: 'receive' },
  { id: 'receivings', label: 'See receivings', icon: 'receivingHistory', screen: 'receiving' },
  { id: 'tags', label: 'Print price tags', icon: 'printer', screen: 'products', intent: 'tags' },
  { id: 'reports', label: "See today's sales", icon: 'reports', screen: 'reports' },
  { id: 'marketing', label: 'Send a mailer', icon: 'marketing', screen: 'marketing' },
  { id: 'quickbooks', label: 'Sync with QuickBooks', icon: 'sync', screen: 'quickbooks' },
  { id: 'settings', label: 'Change settings', icon: 'settings', screen: 'settings' },
  { id: 'updates', label: 'Update Diamond POS', icon: 'updates', screen: 'updates' },
  { id: 'help', label: 'Get help', icon: 'help', screen: 'help' },
  { id: 'feedback', label: 'Send feedback or a request', icon: 'feedback', screen: 'feedback' }
]

export interface MenuConfig {
  /** "I want to…" dropdown in the top bar */
  top: string[]
  /** Buttons down the left of the Home screen */
  home: string[]
}

export const DEFAULT_MENUS: MenuConfig = {
  top: ['home', 'sell', 'return', 'held', 'checkin', 'workorders', 'customers', 'products', 'receive', 'tags', 'reports', 'settings', 'help'],
  home: ['sell', 'workorders', 'products', 'customers', 'reports', 'held', 'receivings', 'marketing', 'quickbooks', 'help', 'feedback']
}

/** Saved ids -> entries (unknown ids dropped; nothing saved = defaults) */
export function menuEntries(ids: string[] | undefined, which: keyof MenuConfig): MenuEntry[] {
  const list = ids && ids.length ? ids : DEFAULT_MENUS[which]
  return list.map((id) => MENU_ENTRIES.find((e) => e.id === id)).filter((e): e is MenuEntry => !!e)
}
