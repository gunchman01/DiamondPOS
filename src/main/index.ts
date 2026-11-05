/**
 * Electron MAIN process: the "back end" of the desktop app.
 *  - creates the window
 *  - loads this computer's config (Server or Till)
 *  - in Server mode, starts the store server + database
 *  - handles receipt printing and updates
 * The React UI talks to this file only through the preload bridge (window.pos).
 */
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import path from 'path'
import { lanAddresses, loadConfig, newPairingCode, saveConfig } from './config'
import { isServerRunning, startServer, stopServer } from './server'
import { registerUpdater } from './updater'
import { startQbBridge, stopQbBridge } from './qbBridge'
import { SERVER_PORT } from '../shared/constants'
import type { AppConfig, BootInfo } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let config: AppConfig

// Only one copy of the app per PC (two copies would fight over the server port)
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
  app.whenReady().then(boot)
}

async function boot(): Promise<void> {
  config = loadConfig()
  if (config.mode === 'server') await startStoreServer()
  await applyQbBridge()

  registerIpc()
  registerUpdater(() => mainWindow)
  createWindow()
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'DiamondPOS',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false
    }
  })
  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => (mainWindow = null))

  // Open external links in the normal browser, not inside the POS
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']) // dev mode with hot reload
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

async function startStoreServer(): Promise<void> {
  try {
    await startServer({
      dbFile: path.join(app.getPath('userData'), 'data', 'store.db'),
      apiKey: config.apiKey,
      port: SERVER_PORT,
      appVersion: app.getVersion()
    })
  } catch (err) {
    dialog.showErrorBox(
      'Store server could not start',
      `${(err as Error).message}\n\nIs another program using port ${SERVER_PORT}?`
    )
  }
}

/** Start or stop the QuickBooks bridge (tills on the QuickBooks PC only) */
async function applyQbBridge(): Promise<void> {
  if (config.mode === 'till' && config.qbBridge && config.serverUrl) {
    try {
      await stopQbBridge() // restart so a changed server address is picked up
      await startQbBridge(config.serverUrl)
    } catch (err) {
      dialog.showErrorBox(
        'QuickBooks bridge could not start',
        `${(err as Error).message}\n\nIs another program using port 4581 on this computer?`
      )
    }
  } else await stopQbBridge()
}

function bootInfo(): BootInfo {
  return { config, appVersion: app.getVersion(), isPackaged: app.isPackaged, lanAddresses: lanAddresses() }
}

function registerIpc(): void {
  ipcMain.handle('config:get', () => bootInfo())

  ipcMain.handle('config:save', async (_e, changes: Partial<AppConfig>) => {
    const next: AppConfig = { ...config, ...changes }

    if (next.mode === 'server') {
      if (!next.apiKey) next.apiKey = newPairingCode()
      next.serverUrl = `http://127.0.0.1:${SERVER_PORT}`
    }
    const wasServer = config.mode === 'server'
    config = next
    saveConfig(config)

    if (config.mode === 'server' && !isServerRunning()) await startStoreServer()
    if (wasServer && config.mode !== 'server') await stopServer()
    await applyQbBridge()
    return bootInfo()
  })

  // Print a receipt silently to the Windows default printer.
  // (For ESC/POS receipt printers, set them as default or see docs.)
  ipcMain.handle('receipt:print', async (_e, html: string) => {
    const win = new BrowserWindow({ show: false, webPreferences: { javascript: false } })
    try {
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
      await new Promise<void>((resolve, reject) => {
        win.webContents.print({ silent: true, printBackground: false, margins: { marginType: 'none' } }, (ok, reason) =>
          ok ? resolve() : reject(new Error(`Print failed: ${reason}`))
        )
      })
    } finally {
      win.close()
    }
  })
}

app.on('window-all-closed', async () => {
  await stopQbBridge()
  await stopServer()
  app.quit()
})
