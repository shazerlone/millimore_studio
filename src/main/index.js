import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  safeStorage,
  session,
  systemPreferences,
  powerSaveBlocker,
  Tray,
  Menu,
  nativeImage,
  shell
} from 'electron'

// Keep the renderer running at full speed even when the trader switches to
// MT5/Chrome. Without these, Chromium throttles timers, requestAnimationFrame
// and MediaRecorder when the window is unfocused/occluded — which starves the
// canvas capture and makes YouTube report "No data" the moment you switch apps.
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

let powerBlockerId = null
import Store from 'electron-store'
import { MultistreamEngine, testConnectionSpeed } from './ffmpeg.js'
import { NativeEngine } from './nativeEngine.js'
import { MT5Manager } from './mt5.js'
import { OverlayManager } from './overlay.js'

const store = new Store({ name: 'millimore-settings' })
const keyStore = new Store({ name: 'millimore-keys' })

const engine = new MultistreamEngine() // legacy renderer-fed path (fallback)
const nativeEngine = new NativeEngine() // Millimore Native Engine (primary)
const mt5 = new MT5Manager()
const overlay = new OverlayManager()

let mainWindow = null

// ---- floating, capture-protected stream monitor ------------------------

let monitorWin = null
let tray = null
let streaming = false
let monitorAuto = false // popup is summoned from the tray, not on app blur
let monitorPinned = false // click-to-pin keeps it open; hover only peeks
let leaveTimer = null

function createTray() {
  if (tray) return
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(__dirname, '../../build/icon.png')
  let img = nativeImage.createFromPath(iconPath)
  if (!img.isEmpty()) img = img.resize({ width: 18, height: 18 })
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img)
  tray.setToolTip('Millimore — hover to peek, click to pin the monitor')

  // Right-click menu (and Windows fallback).
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Pin monitor', click: () => pinMonitor(true) },
      { label: 'Hide monitor', click: () => pinMonitor(false) },
      { type: 'separator' },
      {
        label: 'Open Millimore',
        click: () => {
          if (mainWindow) {
            mainWindow.show()
            mainWindow.focus()
          }
        }
      },
      { type: 'separator' },
      { label: 'Quit Millimore', click: () => app.quit() }
    ])
  )

  // Hover to peek (macOS fires these), click to pin / unpin.
  tray.on('mouse-enter', () => {
    if (leaveTimer) clearTimeout(leaveTimer)
    if (!monitorPinned) peekMonitor()
  })
  tray.on('mouse-leave', () => {
    if (monitorPinned) return
    leaveTimer = setTimeout(() => {
      if (!monitorPinned) hideMonitor()
    }, 300)
  })
  tray.on('click', () => pinMonitor(!monitorPinned))
}

function positionMonitorUnderTray() {
  if (!tray || !monitorWin || monitorWin.isDestroyed()) return
  const tb = tray.getBounds()
  const wb = monitorWin.getBounds()
  const { workArea } = require('electron').screen.getPrimaryDisplay()
  let x = Math.round(tb.x + tb.width / 2 - wb.width / 2)
  x = Math.max(workArea.x + 8, Math.min(x, workArea.x + workArea.width - wb.width - 8))
  const y = Math.round((tb.height ? tb.y + tb.height : workArea.y) + 6)
  monitorWin.setPosition(x, y, false)
}

function peekMonitor() {
  const win = createMonitorWindow()
  const place = () => {
    positionMonitorUnderTray()
    win.showInactive()
    notifyMonitorVisible(true)
  }
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', place)
  else place()
}

function pinMonitor(pinned) {
  monitorPinned = pinned
  if (pinned) peekMonitor()
  else hideMonitor()
}

function createMonitorWindow() {
  if (monitorWin && !monitorWin.isDestroyed()) return monitorWin

  const { workArea } = require('electron').screen.getPrimaryDisplay()
  const w = 320
  const h = 460
  monitorWin = new BrowserWindow({
    width: w,
    height: h,
    x: workArea.x + workArea.width - w - 24,
    y: workArea.y + 24,
    frame: false,
    resizable: true,
    minWidth: 240,
    minHeight: 320,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    backgroundColor: '#0B1220',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  })

  // Float above everything, including fullscreen apps, on every Space.
  monitorWin.setAlwaysOnTop(true, 'screen-saver')
  monitorWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // THE key bit: exclude this window from screen capture, so the trader sees it
  // but viewers never do (even though it floats over the shared screen).
  monitorWin.setContentProtection(true)

  if (process.env.ELECTRON_RENDERER_URL) {
    monitorWin.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/monitor`)
  } else {
    monitorWin.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'monitor' })
  }

  monitorWin.on('closed', () => {
    monitorWin = null
  })
  return monitorWin
}

function showMonitor() {
  const win = createMonitorWindow()
  const show = () => {
    win.showInactive()
    notifyMonitorVisible(true)
  }
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', show)
  else show()
}

function hideMonitor() {
  if (monitorWin && !monitorWin.isDestroyed()) monitorWin.hide()
  notifyMonitorVisible(false)
}

function notifyMonitorVisible(visible) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('monitor:visible', visible)
  }
}

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
      sandbox: false,
      // Critical for streaming: don't throttle this window in the background.
      backgroundThrottling: false
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  // Auto show/hide the floating monitor when the trader switches apps mid-stream.
  mainWindow.on('blur', () => {
    if (streaming && monitorAuto) showMonitor()
  })
  mainWindow.on('focus', () => {
    if (monitorAuto) hideMonitor()
  })

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

  // Native engine → renderer (status + live stats).
  nativeEngine.on('status', (s) => {
    send('engine:status', s)
    if (s.state === 'error' || s.state === 'stopped') {
      streaming = false
      if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
        powerSaveBlocker.stop(powerBlockerId)
        powerBlockerId = null
      }
    }
  })
  nativeEngine.on('stats', (s) => send('engine:stats', s))

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
  // Resolve a local recording path (renderer just asks for record: true).
  if (config?.record) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    config.recordPath = join(app.getPath('videos'), `Millimore-${stamp}.mkv`)
  }
  const result = engine.start(config)
  result.recordPath = config?.recordPath || null
  streaming = true
  // Prevent display/app sleep while live.
  if (powerBlockerId === null || !powerSaveBlocker.isStarted(powerBlockerId)) {
    powerBlockerId = powerSaveBlocker.start('prevent-display-sleep')
  }
  return result
})
ipcMain.handle('stream:stop', () => {
  overlay.disconnectRelay()
  streaming = false
  pinMonitor(false)
  if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
    powerSaveBlocker.stop(powerBlockerId)
    powerBlockerId = null
  }
  return engine.stop()
})

// ---- IPC: floating monitor --------------------------------------------

ipcMain.handle('monitor:toggle', (_e, on) => {
  pinMonitor(!!on)
  return { ok: true }
})
ipcMain.handle('monitor:setAuto', (_e, value) => {
  monitorAuto = !!value
  return { ok: true }
})
// Main window pushes live state → forward to the monitor window.
ipcMain.on('monitor:state', (_e, state) => {
  if (monitorWin && !monitorWin.isDestroyed()) {
    monitorWin.webContents.send('monitor:state:update', state)
  }
})
// Live composite thumbnail → forward to the monitor window.
ipcMain.on('monitor:preview', (_e, dataUrl) => {
  if (monitorWin && !monitorWin.isDestroyed()) {
    monitorWin.webContents.send('monitor:preview:update', dataUrl)
  }
})
// Monitor window issues a control command → forward to the main window.
ipcMain.on('monitor:command', (_e, cmd) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('monitor:command:relay', cmd)
  }
})
ipcMain.on('stream:chunk', (_e, buffer) => engine.pushChunk(buffer))
ipcMain.on('stream:audio', (_e, buffer) => engine.pushAudio(buffer))
ipcMain.handle('stream:testSpeed', () => testConnectionSpeed())

// ---- IPC: Millimore Native Engine (primary streaming path) -------------

ipcMain.handle('engine:goLive', async (_e, config = {}) => {
  const cfg = { ...config }
  if (cfg.record) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    cfg.recordPath = join(app.getPath('videos'), `Millimore-${stamp}.mkv`)
  }
  const res = await nativeEngine.start(cfg)
  streaming = true
  if (powerBlockerId === null || !powerSaveBlocker.isStarted(powerBlockerId)) {
    powerBlockerId = powerSaveBlocker.start('prevent-display-sleep')
  }
  return { ...res, recordPath: cfg.recordPath || null }
})

// Latest overlay snapshot (RGBA frame painted by the renderer) → the engine's
// overlay layer on the broadcast.
ipcMain.on('engine:overlayFrame', (_e, data) => {
  nativeEngine.setOverlayFrame(Buffer.isBuffer(data) ? data : Buffer.from(data.buffer || data))
})

ipcMain.handle('engine:stop', () => {
  streaming = false
  pinMonitor(false)
  if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
    powerSaveBlocker.stop(powerBlockerId)
    powerBlockerId = null
  }
  return nativeEngine.stop()
})

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
  createTray()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  engine.stop()
  nativeEngine.stop()
  overlay.dispose()
  if (mt5.isConnected) mt5.disconnect()
  if (process.platform !== 'darwin') app.quit()
})
