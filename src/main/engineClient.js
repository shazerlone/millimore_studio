import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { app } from 'electron'

/**
 * App-side client for the Millimore Streaming Engine helper (OBS-powered).
 *
 * Launches the helper process and controls it over the local WebSocket protocol
 * (see engine/README.md). This is the Phase-1 control surface that will replace
 * the FFmpeg pipeline once the OBS engine is provisioned and proven (Phase 0).
 * It is NOT wired into Go Live yet — the FFmpeg path remains the working beta.
 */
export class EngineClient extends EventEmitter {
  constructor() {
    super()
    this.proc = null
    this.ws = null
    this.port = Number(process.env.MILLIMORE_ENGINE_PORT || 28112)
    this.ready = false
  }

  /** Resolve the engine entry (dev: repo `engine/`; packaged: bundled resources). */
  _enginePaths() {
    if (app.isPackaged) {
      const base = join(process.resourcesPath, 'engine')
      return { entry: join(base, 'src', 'index.js'), osnDir: join(base, 'node_modules', 'obs-studio-node') }
    }
    const base = join(__dirname, '..', '..', 'engine')
    return { entry: join(base, 'src', 'index.js'), osnDir: join(base, 'node_modules', 'obs-studio-node') }
  }

  async launch() {
    if (this.proc) return
    const { entry, osnDir } = this._enginePaths()
    this.proc = spawn(process.execPath, [entry], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1', // run the helper as plain Node, not a UI
        MILLIMORE_ENGINE_PORT: String(this.port),
        MILLIMORE_OSN_DIR: osnDir
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    this.proc.stdout.on('data', (d) => this.emit('log', d.toString()))
    this.proc.stderr.on('data', (d) => this.emit('log', d.toString()))
    this.proc.on('exit', (code) => {
      this.ready = false
      this.emit('status', { state: 'engine-exit', code })
    })
    await this._connectWithRetry()
  }

  async _connectWithRetry(attempts = 20) {
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
          ws.on('error', reject)
        })
        return
      } catch {
        await new Promise((r) => setTimeout(r, 250))
      }
    }
    throw new Error('Could not connect to streaming engine')
  }

  send(msg) {
    if (this.ws && this.ready) this.ws.send(JSON.stringify(msg))
  }

  // ---- high-level control ----
  init() {
    this.send({ type: 'init' })
  }
  setVideo(quality) {
    this.send({ type: 'setVideo', quality })
  }
  setScreen(sourceId) {
    this.send({ type: 'setScreen', sourceId })
  }
  clearScreen() {
    this.send({ type: 'clearScreen' })
  }
  setCamera(deviceId) {
    this.send({ type: 'setCamera', deviceId })
  }
  setDestinations(targets) {
    this.send({ type: 'setDestinations', targets })
  }
  start() {
    this.send({ type: 'start' })
  }
  stop() {
    this.send({ type: 'stop' })
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
