import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { app } from 'electron'

/**
 * App-side client for the Millimore Streaming Engine helper.
 *
 * The helper launches + configures OBS (the hidden engine) and drives it over
 * obs-websocket. This client spawns the helper and talks to it over the local
 * control protocol (see engine/README.md). Everything the user does happens in
 * Millimore — OBS is never opened or configured by hand.
 */
export class EngineClient extends EventEmitter {
  constructor() {
    super()
    this.proc = null
    this.ws = null
    this.port = Number(process.env.MILLIMORE_ENGINE_PORT || 28112)
    this.obsPort = Number(process.env.MILLIMORE_OBS_PORT || 4455)
    this.ready = false
  }

  /** Resolve the engine entry and the bundled OBS binary (packaged vs dev). */
  _paths() {
    const base = app.isPackaged
      ? join(process.resourcesPath, 'engine')
      : join(__dirname, '..', '..', 'engine')
    return { entry: join(base, 'src', 'index.js'), obsBinary: this._bundledObs() }
  }

  /** Path to the OBS binary we bundle in production (empty in dev → use install). */
  _bundledObs() {
    if (!app.isPackaged) return process.env.MILLIMORE_OBS_BINARY || ''
    const res = process.resourcesPath
    const candidates =
      process.platform === 'darwin'
        ? [join(res, 'obs', 'OBS.app', 'Contents', 'MacOS', 'OBS')]
        : process.platform === 'win32'
          ? [join(res, 'obs', 'bin', '64bit', 'obs64.exe')]
          : [join(res, 'obs', 'bin', 'obs')]
    return candidates.find((p) => existsSync(p)) || ''
  }

  async launch() {
    if (this.proc) return
    const { entry, obsBinary } = this._paths()
    this.proc = spawn(process.execPath, [entry], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1', // run the helper as plain Node, not a UI
        MILLIMORE_ENGINE_PORT: String(this.port),
        MILLIMORE_OBS_PORT: String(this.obsPort),
        ...(obsBinary ? { MILLIMORE_OBS_BINARY: obsBinary } : {})
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    this.proc.stdout.on('data', (d) => this.emit('log', d.toString()))
    this.proc.stderr.on('data', (d) => this.emit('log', d.toString()))
    this.proc.on('exit', (code) => {
      this.ready = false
      this.proc = null // allow a fresh launch on the next Go Live
      try {
        this.ws?.close()
      } catch {
        /* ignore */
      }
      this.ws = null
      this.emit('status', { state: 'engine-exit', code })
    })
    await this._connectWithRetry()
  }

  async _connectWithRetry(attempts = 40) {
    const { WebSocket } = await import('ws')
    for (let i = 0; i < attempts; i++) {
      try {
        await new Promise((resolve, reject) => {
          const ws = new WebSocket(`ws://127.0.0.1:${this.port}`)
          ws.on('open', () => {
            this.ws = ws
            this.ready = true
            resolve()
          })
          ws.on('message', (raw) => {
            try {
              this.emit('message', JSON.parse(raw.toString()))
            } catch {
              /* ignore */
            }
          })
          ws.on('close', () => {
            this.ready = false
          })
          ws.on('error', reject)
        })
        return
      } catch {
        await new Promise((r) => setTimeout(r, 250))
      }
    }
    throw new Error('Could not connect to streaming engine')
  }

  /** Send a request and resolve when the engine reports the matching status/error. */
  _request(msg, resolveStates = []) {
    return new Promise((resolve, reject) => {
      if (!this.ws || !this.ready) return reject(new Error('engine not ready'))
      const onMsg = (m) => {
        if (m.type === 'error') {
          this.off('message', onMsg)
          reject(new Error(m.message || 'engine error'))
        } else if (m.type === 'status' && (!resolveStates.length || resolveStates.includes(m.state))) {
          this.off('message', onMsg)
          resolve(m)
        }
      }
      this.on('message', onMsg)
      this.ws.send(JSON.stringify(msg))
      // Don't hang forever if the engine goes silent.
      setTimeout(() => {
        this.off('message', onMsg)
        reject(new Error('engine timeout for ' + msg.type))
      }, 60000)
    })
  }

  send(msg) {
    if (this.ws && this.ready) this.ws.send(JSON.stringify(msg))
  }

  // ---- high-level control (each resolves on the engine's ack) ----
  init() {
    return this._request({ type: 'init' }, ['ready'])
  }
  setVideo(quality) {
    return this._request({ type: 'setVideo', quality }, ['video-configured'])
  }
  setScreen({ display, window } = {}) {
    return this._request({ type: 'setScreen', display, window }, ['screen-set'])
  }
  clearScreen() {
    return this._request({ type: 'clearScreen' }, ['screen-cleared'])
  }
  setCamera(deviceId) {
    return this._request({ type: 'setCamera', deviceId }, ['camera-set'])
  }
  setMicrophone(deviceId) {
    return this._request({ type: 'setMicrophone', deviceId }, ['mic-set'])
  }
  setDesktopAudio(deviceId) {
    return this._request({ type: 'setDesktopAudio', deviceId }, ['desktop-audio-set'])
  }
  setOverlay(url) {
    return this._request({ type: 'setOverlay', url }, ['overlay-set'])
  }
  overlayEvent(payload) {
    this.send({ type: 'overlayEvent', payload })
  }
  setDestinations(targets) {
    return this._request({ type: 'setDestinations', targets }, ['destinations-set'])
  }
  start() {
    return this._request({ type: 'start' }, ['live'])
  }
  stop() {
    return this._request({ type: 'stop' }, ['stopped'])
  }
  startRecording() {
    return this._request({ type: 'startRecording' }, ['recording'])
  }
  stopRecording() {
    return this._request({ type: 'stopRecording' }, ['recording-stopped'])
  }
  requestStats() {
    this.send({ type: 'stats' })
  }

  dispose() {
    try {
      this.ws?.close()
    } catch {
      /* ignore */
    }
    this.proc?.kill()
    this.proc = null
    this.ws = null
    this.ready = false
  }
}
