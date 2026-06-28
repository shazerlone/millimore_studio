import { contextBridge, ipcRenderer } from 'electron'

/**
 * Secure bridge between the Electron main process and the React renderer.
 * The renderer never touches Node APIs directly — everything flows through
 * this allow-listed surface.
 */
const api = {
  // ---- Capture sources & media permissions ----
  getScreenSources: () => ipcRenderer.invoke('capture:getSources'),
  capture: {
    getSources: () => ipcRenderer.invoke('capture:getSources'),
    permissions: () => ipcRenderer.invoke('capture:permissions'),
    requestCamera: () => ipcRenderer.invoke('capture:requestCamera'),
    requestMic: () => ipcRenderer.invoke('capture:requestMic'),
    triggerScreenPrompt: () => ipcRenderer.invoke('capture:triggerScreenPrompt'),
    openScreenPrefs: () => ipcRenderer.invoke('capture:openScreenPrefs')
  },
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  restart: () => ipcRenderer.invoke('app:restart'),

  // ---- floating capture-protected monitor ----
  monitor: {
    toggle: (on) => ipcRenderer.invoke('monitor:toggle', on),
    setAuto: (v) => ipcRenderer.invoke('monitor:setAuto', v),
    // main window → monitor window
    pushState: (state) => ipcRenderer.send('monitor:state', state),
    onState: (cb) => subscribe('monitor:state:update', cb),
    pushPreview: (dataUrl) => ipcRenderer.send('monitor:preview', dataUrl),
    onPreview: (cb) => subscribe('monitor:preview:update', cb),
    onVisible: (cb) => subscribe('monitor:visible', cb),
    // monitor window → main window
    command: (cmd) => ipcRenderer.send('monitor:command', cmd),
    onCommand: (cb) => subscribe('monitor:command:relay', cb)
  },

  // ---- Multistream engine (FFmpeg) ----
  stream: {
    start: (config) => ipcRenderer.invoke('stream:start', config),
    stop: () => ipcRenderer.invoke('stream:stop'),
    pushChunk: (buffer) => ipcRenderer.send('stream:chunk', buffer),
    testSpeed: () => ipcRenderer.invoke('stream:testSpeed'),
    onStatus: (cb) => subscribe('stream:status', cb),
    onStats: (cb) => subscribe('stream:stats', cb)
  },

  // ---- MT5 connection ----
  mt5: {
    connect: (creds) => ipcRenderer.invoke('mt5:connect', creds),
    disconnect: () => ipcRenderer.invoke('mt5:disconnect'),
    getAccount: () => ipcRenderer.invoke('mt5:getAccount'),
    runSyncTest: () => ipcRenderer.invoke('mt5:syncTest'),
    onTrade: (cb) => subscribe('mt5:trade', cb),
    onStatus: (cb) => subscribe('mt5:status', cb)
  },

  // ---- Secure stream-key vault (Electron safeStorage) ----
  keys: {
    set: (platform, key) => ipcRenderer.invoke('keys:set', { platform, key }),
    get: (platform) => ipcRenderer.invoke('keys:get', platform),
    getAll: () => ipcRenderer.invoke('keys:getAll'),
    remove: (platform) => ipcRenderer.invoke('keys:remove', platform)
  },

  // ---- Persisted settings (electron-store) ----
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', { key, value }),
    all: () => ipcRenderer.invoke('settings:all')
  },

  // ---- App info ----
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
    isInApplicationsFolder: () => ipcRenderer.invoke('app:isInApplicationsFolder'),
    moveToApplications: () => ipcRenderer.invoke('app:moveToApplications')
  }
}

function subscribe(channel, cb) {
  const listener = (_event, payload) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('millimore', api)
