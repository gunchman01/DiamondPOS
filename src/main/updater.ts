/**
 * UPDATE + ROLLBACK
 *
 * Every release is built by GitHub Actions and published to GitHub Releases.
 * Each release contains the installer plus a small "latest.yml" file that
 * describes it. To install ANY version (newer = update, older = rollback) we
 * point electron-updater at that specific release's download folder and let it
 * download + run the installer. Your data and settings are not touched.
 */
import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { GITHUB_OWNER, GITHUB_REPO } from '../shared/constants'
import type { ReleaseInfo, UpdateEvent } from '../shared/types'

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = false
autoUpdater.allowDowngrade = true // this is what makes "revert" possible

export function registerUpdater(getWindow: () => BrowserWindow | null): void {
  const send = (e: UpdateEvent) => getWindow()?.webContents.send('updater:event', e)

  autoUpdater.on('download-progress', (p) => send({ type: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('error', (err) => send({ type: 'error', message: err?.message ?? String(err) }))

  ipcMain.handle('updater:listReleases', () => listReleases())

  ipcMain.handle('updater:install', async (_e, tag: string) => {
    if (!app.isPackaged) {
      throw new Error('Updates only work in the installed app (not while running "npm run dev").')
    }
    if (!/^v?\d+\.\d+\.\d+[\w.-]*$/.test(tag)) throw new Error('Invalid version tag')

    send({ type: 'checking' })
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${tag}`
    })
    const result = await autoUpdater.checkForUpdates()
    const target = result?.updateInfo.version
    if (!target || target === app.getVersion()) throw new Error(`Version ${tag} is already installed.`)

    send({ type: 'downloading', percent: 0 })
    await autoUpdater.downloadUpdate()
    send({ type: 'ready', version: target })

    // Give the UI a moment to show "restarting", then install silently and relaunch
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 1500)
  })
}

async function listReleases(): Promise<ReleaseInfo[]> {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=30`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'diamondpos-updater' }
  })
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? `Release repository ${GITHUB_OWNER}/${GITHUB_REPO} not found (is it private? see docs/GETTING_STARTED.md)`
        : `GitHub returned ${res.status}`
    )
  }
  type GhRelease = {
    tag_name: string
    name: string | null
    body: string | null
    published_at: string
    prerelease: boolean
    draft: boolean
    assets: { name: string }[]
  }
  const data = (await res.json()) as GhRelease[]
  return data
    .filter((r) => !r.draft && r.assets.some((a) => a.name === 'latest.yml'))
    .map((r) => ({
      tag: r.tag_name,
      version: r.tag_name.replace(/^v/, ''),
      name: r.name || r.tag_name,
      notes: r.body ?? '',
      publishedAt: r.published_at,
      prerelease: r.prerelease
    }))
}
