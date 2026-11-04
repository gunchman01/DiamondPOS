/**
 * PRELOAD: the only bridge between the React UI and Electron/Node.
 * The UI can call exactly these functions (as window.pos.xxx) and nothing else,
 * which keeps the app secure.
 */
import { contextBridge, ipcRenderer } from 'electron'
import type { PosBridge, UpdateEvent } from '../shared/types'

const api: PosBridge = {
  getBootInfo: () => ipcRenderer.invoke('config:get'),
  saveConfig: (changes) => ipcRenderer.invoke('config:save', changes),
  printReceipt: (html) => ipcRenderer.invoke('receipt:print', html),
  listReleases: () => ipcRenderer.invoke('updater:listReleases'),
  installRelease: (tag) => ipcRenderer.invoke('updater:install', tag),
  onUpdateEvent: (cb) => {
    const listener = (_e: unknown, ev: UpdateEvent) => cb(ev)
    ipcRenderer.on('updater:event', listener)
    return () => ipcRenderer.removeListener('updater:event', listener)
  }
}

contextBridge.exposeInMainWorld('pos', api)
