import { displayScale,normaliseDisplayZoom } from '../shared/display'
import { createPrintManager } from './printing'
import { createQuitController } from './lifecycle/quitController'
import { startDiagnostics, logDiagnostic, flushDiagnostics, diagnosticsDirectory } from './lifecycle/diagnostics'
import { openCashDrawer } from './drawer'
import { drawerConfig } from '../shared/drawer'
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
import type { PrintJob, PrinterInfo } from '../shared/printing'
import { lanAddresses, loadConfig, newPairingCode, saveConfig } from './config'
import { isServerRunning, startServer, stopServer } from './server'
import { registerUpdater } from './updater'
import { startQbBridge, stopQbBridge } from './qbBridge'
import { SERVER_PORT } from '../shared/constants'
import type { AppConfig, BootInfo } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let config: AppConfig
let stopDiagnostics:(()=>void)|null=null
const prints=createPrintManager(()=>new BrowserWindow({show:false,focusable:false,skipTaskbar:true,webPreferences:{javascript:false,backgroundThrottling:false}}),()=>{if(!shutdown.closing&&mainWindow&&!mainWindow.isDestroyed()){mainWindow.focus();mainWindow.webContents.focus()}},logDiagnostic)
const shutdown=createQuitController({
 stop:async()=>{prints.stop();await Promise.allSettled([stopQbBridge(),stopServer()]);stopDiagnostics?.();await flushDiagnostics()},
 quit:()=>completeExit(()=>app.quit()),exit:()=>completeExit(()=>app.exit(0)),log:logDiagnostic
})
function completeExit(exit:()=>void){let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);exit()};const timer=setTimeout(finish,250);void flushDiagnostics().finally(finish)}
function beginShutdown(){if(!shutdown.closing){mainWindow?.setTitle('Diamond POS — Closing…');mainWindow?.webContents.send('app:closing')}void shutdown.begin()}
app.on('before-quit',event=>{if(shutdown.allowed)return;event.preventDefault();beginShutdown()})

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
  app.whenReady().then(boot).catch(()=>{logDiagnostic('startup-failed');beginShutdown()})
}

async function boot(): Promise<void> {
  stopDiagnostics=startDiagnostics(app.getPath('userData'));logDiagnostic('application-started')
  config = loadConfig()
  if (config.mode === 'server') await startStoreServer()
  await applyQbBridge()

  registerIpc()
  registerUpdater(() => mainWindow)
  createWindow()
}

let displayResizeTimer:ReturnType<typeof setTimeout>|undefined
function applyDisplayScale():void {
 if(!mainWindow||mainWindow.isDestroyed()||shutdown.closing)return
 const [width,height]=mainWindow.getContentSize()
 const factor=displayScale(width,height,config.displayZoom)
 if(Math.abs(mainWindow.webContents.getZoomFactor()-factor)>.005)mainWindow.webContents.setZoomFactor(factor)
}
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'Diamond POS',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false
    }
  })
  mainWindow.on('close',event=>{if(!shutdown.allowed){event.preventDefault();beginShutdown()}})
  mainWindow.on('unresponsive',()=>logDiagnostic('renderer-unresponsive'))
  mainWindow.on('responsive',()=>logDiagnostic('renderer-responsive'))
  mainWindow.webContents.on('render-process-gone',(_event,details)=>logDiagnostic('renderer-gone-'+details.reason))
  mainWindow.on('ready-to-show', () => {applyDisplayScale();mainWindow?.show()})
  mainWindow.webContents.on('did-finish-load',applyDisplayScale)
  mainWindow.on('resize',()=>{clearTimeout(displayResizeTimer);displayResizeTimer=setTimeout(applyDisplayScale,120)})
  mainWindow.on('closed', () => {clearTimeout(displayResizeTimer);mainWindow=null})

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
  ipcMain.handle('app:restore-focus',()=>{if(!shutdown.closing&&mainWindow&&!mainWindow.isDestroyed()){mainWindow.blur();mainWindow.focus();mainWindow.webContents.focus();logDiagnostic('focus-restored')}})
  ipcMain.handle('app:open-diagnostics',async()=>{const directory=diagnosticsDirectory();if(directory){await flushDiagnostics();await shell.openPath(directory)}})
  ipcMain.handle('config:get', () => bootInfo())
  ipcMain.handle('drawer:open', () => openCashDrawer(config.cashDrawer))

  ipcMain.handle('config:save', async (_e, changes: Partial<AppConfig>) => {
    const next: AppConfig = { ...config, ...changes }
    if(changes.displayZoom!==undefined)next.displayZoom=normaliseDisplayZoom(changes.displayZoom)
    if (changes.cashDrawer !== undefined) next.cashDrawer = drawerConfig(changes.cashDrawer)

    if (next.mode === 'server') {
      if (!next.apiKey) next.apiKey = newPairingCode()
      next.serverUrl = `http://127.0.0.1:${SERVER_PORT}`
    }
    const wasServer = config.mode === 'server'
    config = next
    saveConfig(config)
    if(changes.displayZoom!==undefined)applyDisplayScale()

    if (config.mode === 'server' && !isServerRunning()) await startStoreServer()
    if (wasServer && config.mode !== 'server') await stopServer()
    await applyQbBridge()
    return bootInfo()
  })

  // Print a receipt silently to the Windows default printer (older screens; new code uses print:job).
  ipcMain.handle('receipt:print', (_e, html: string) => printJob({ html, printer: '' }))

  // Printers installed on this PC (for Settings → Printing)
  ipcMain.handle('print:printers', async (): Promise<PrinterInfo[]> => {
    const list = await (mainWindow ?? BrowserWindow.getAllWindows()[0]).webContents.getPrintersAsync()
    return list.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!(p as { isDefault?: boolean }).isDefault }))
  })

  // Print silently to a chosen printer: receipt printer, laser (Letter) or label printer (Zebra)
  ipcMain.handle('print:job', (_e, job: PrintJob) => printJob(job))
}

/** Print windows are non-focusable, always destroyed, and cannot keep quit alive. */
async function printJob(job:PrintJob):Promise<void>{return prints.print(job)}

app.on('window-all-closed',()=>{if(!shutdown.allowed)beginShutdown();else app.quit()})
