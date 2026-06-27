import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  safeStorage,
  session,
  systemPreferences,
  shell
} from 'electron'
import Store from 'electron-store'
import { MultistreamEngine, testConnectionSpeed } from './ffmpeg.js'
import { MT5Manager } from './mt5.js'
import { OverlayManager } from './overlay.js'

const store = new Store({ name: 'millimore-settings' })
const keyStore = new Store({ name: 'millimore-keys' })

const engine = new MultistreamEngine()
const mt5 = new MT5Manager()
const overlay = new OverlayManager()

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#FFFFFF',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ---- media permissions (camera / mic / screen) -------------------------

/**
 * Without these handlers the renderer's getUserMedia / getDisplayMedia calls
 * are silently denied, so the camera and screen capture never start. We grant
 * media + display-capture for our own first-party content, and route
 * getDisplayMedia through desktopCapturer so the in-app source picker works.
 */
function setupMediaPermissions() {
  const ses = session.defaultSession

  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed = ['media', 'display-capture', 'audioCapture', 'videoCapture', 'mediaKeySystem']
    callback(allowed.includes(permission))
  })

  ses.setPermissionCheckHandler((_wc, permission) =>
    ['media', 'display-capture', 'audioCapture', 'videoCapture'].includes(permission)
  )

  // Renderer can call navigator.mediaDevices.getDisplayMedia() and we hand back
  // the screen the user picked (id passed via the request's app-level state),
  // defaulting to the primary screen.
  ses.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
      callback({ video: sources[0], audio: 'loopback' })
    })
  }, { useSystemPicker: false })
}

/** Ask macOS for camera/mic access up front (no-op on Windows). */
async function ensureMacMediaAccess() {
  if (process.platform !== 'darwin') return { camera: 'granted', microphone: 'granted', screen: 'granted' }
  const camera = await systemPreferences.askForMediaAccess('camera').catch(() => false)
  const microphone = await systemPreferences.askForMediaAccess('microphone').catch(() => false)
  return {
    camera: camera ? 'granted' : systemPreferences.getMediaAccessStatus('camera'),
    microphone: microphone ? 'granted' : systemPreferences.getMediaAccessStatus('microphone'),
    screen: systemPreferences.getMediaAccessStatus('screen')
  }
}

// ---- forward engine / mt5 / overlay events to the renderer -------------

function wireEvents() {
  const send = (channel, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload)
    }
  }

  engine.on('status', (s) => send('stream:status', s))
  engine.on('stats', (s) => send('stream:stats', s))

  mt5.on('status', (s) => send('mt5:status', s))
  mt5.on('trade', (trade) => {
    overlay.handleTrade(trade)
    send('mt5:trade', trade)
  })

  overlay.on('show', (card) => send('mt5:trade', { ...card, overlay: 'show' }))
  overlay.on('hide', (payload) => send('mt5:trade', { ...payload, overlay: 'hide' }))
}

// ---- IPC: capture ------------------------------------------------------

ipcMain.handle('capture:getSources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 }
  })
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.id.startsWith('screen') ? 'screen' : 'window',
    thumbnail: s.thumbnail.toDataURL()
  }))
})

// Current camera/mic/screen permission status, and a way to (re)request it.
ipcMain.handle('capture:permissions', () => ensureMacMediaAccess())

// Camera/mic prompts (macOS shows the system dialog on first request).
ipcMain.handle('capture:requestCamera', async () => {
  if (process.platform !== 'darwin') return 'granted'
  const ok = await systemPreferences.askForMediaAccess('camera').catch(() => false)
  return ok ? 'granted' : systemPreferences.getMediaAccessStatus('camera')
})
ipcMain.handle('capture:requestMic', async () => {
  if (process.platform !== 'darwin') return 'granted'
  const ok = await systemPreferences.askForMediaAccess('microphone').catch(() => false)
  return ok ? 'granted' : systemPreferences.getMediaAccessStatus('microphone')
})

// Screen Recording has no askForMediaAccess(); the OS prompt appears the first
// time we enumerate sources. After the user grants it, macOS requires an app
// restart before getMediaAccessStatus('screen') flips to 'granted' and before
// desktopCapturer can actually read pixels — hence the restart flow.
ipcMain.handle('capture:triggerScreenPrompt', async () => {
  try {
    await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } })
  } catch {
    /* the call itself triggers the prompt; errors are expected pre-grant */
  }
  return process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted'
})

ipcMain.handle('capture:openScreenPrefs', () => {
  if (process.platform === 'darwin') {
    shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
    )
  }
  return { ok: true }
})

ipcMain.handle('app:restart', () => {
  app.relaunch()
  app.exit(0)
})

// macOS App Translocation: when run from the DMG/Downloads, macOS executes the
// app from a randomized read-only path and permissions never stick. Detect that
// and offer to move the app into /Applications (which fixes it permanently).
ipcMain.handle('app:isInApplicationsFolder', () => {
  if (process.platform !== 'darwin' || !app.isPackaged) return true
  try {
    return app.isInApplicationsFolder()
  } catch {
    return true
  }
})
ipcMain.handle('app:moveToApplications', () => {
  if (process.platform !== 'darwin' || !app.isPackaged) return { ok: true, moved: false }
  try {
    const moved = app.moveToApplicationsFolder() // relaunches on success
    return { ok: true, moved }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// ---- IPC: stream -------------------------------------------------------

ipcMain.handle('stream:start', (_e, config) => {
  if (config?.overlayRelayKey) overlay.connectRelay(config.overlayRelayKey)
  return engine.start(config)
})
ipcMain.handle('stream:stop', () => {
  overlay.disconnectRelay()
  return engine.stop()
})
ipcMain.on('stream:chunk', (_e, buffer) => engine.pushChunk(buffer))
ipcMain.handle('stream:testSpeed', () => testConnectionSpeed())

// ---- IPC: MT5 ----------------------------------------------------------

ipcMain.handle('mt5:connect', (_e, creds) => mt5.connect(creds))
ipcMain.handle('mt5:disconnect', () => mt5.disconnect())
ipcMain.handle('mt5:getAccount', () => mt5.getAccount())
ipcMain.handle('mt5:syncTest', () => mt5.runSyncTest())

// ---- IPC: secure stream-key vault (safeStorage) ------------------------

ipcMain.handle('keys:set', (_e, { platform, key }) => {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(key).toString('base64')
    keyStore.set(platform, encrypted)
  } else {
    // Fallback for platforms without an OS keychain — still local-only.
    keyStore.set(platform, Buffer.from(key).toString('base64'))
  }
  return { ok: true }
})

ipcMain.handle('keys:get', (_e, platform) => readKey(platform))
ipcMain.handle('keys:getAll', () => {
  const out = {}
  for (const platform of Object.keys(keyStore.store)) {
    out[platform] = readKey(platform)
  }
  return out
})
ipcMain.handle('keys:remove', (_e, platform) => {
  keyStore.delete(platform)
  return { ok: true }
})

function readKey(platform) {
  const stored = keyStore.get(platform)
  if (!stored) return null
  const buf = Buffer.from(stored, 'base64')
  try {
    if (safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(buf)
  } catch {
    /* fall through to plain decode */
  }
  return buf.toString('utf8')
}

// ---- IPC: settings -----------------------------------------------------

ipcMain.handle('settings:get', (_e, key) => store.get(key))
ipcMain.handle('settings:set', (_e, { key, value }) => {
  store.set(key, value)
  return { ok: true }
})
ipcMain.handle('settings:all', () => store.store)

// ---- IPC: app ----------------------------------------------------------

ipcMain.handle('app:openExternal', (_e, url) => {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url)
  return { ok: true }
})
ipcMain.handle('app:getVersion', () => app.getVersion())
ipcMain.handle('app:checkForUpdates', async () => {
  // Wire to electron-updater in production.
  return { upToDate: true, version: app.getVersion() }
})

// ---- lifecycle ---------------------------------------------------------

app.whenReady().then(() => {
  setupMediaPermissions()
  wireEvents()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  engine.stop()
  overlay.dispose()
  if (mt5.isConnected) mt5.disconnect()
  if (process.platform !== 'darwin') app.quit()
})
