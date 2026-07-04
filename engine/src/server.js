'use strict'

/**
 * Local control server for the Millimore Streaming Engine.
 * The closed-source Millimore app connects over WebSocket and drives OBS (over
 * obs-websocket) with the JSON protocol documented in engine/README.md.
 *
 * Bound to 127.0.0.1 only (never exposed off-machine).
 */
const { WebSocketServer } = require('ws')
const { ObsControl } = require('./obsControl')
const { ensureObs } = require('./obsLauncher')

const PORT = Number(process.env.MILLIMORE_ENGINE_PORT || 28112)
const OBS_PORT = Number(process.env.MILLIMORE_OBS_PORT || 4455)

function start({ obsUrl, obsPassword } = {}) {
  const engine = new ObsControl({
    url: obsUrl || process.env.MILLIMORE_OBS_URL || `ws://127.0.0.1:${OBS_PORT}`,
    password: obsPassword || process.env.MILLIMORE_OBS_PASSWORD
  })
  const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT })
  const destinations = []

  const send = (ws, msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg))
  const broadcast = (msg) => wss.clients.forEach((c) => send(c, msg))

  wss.on('listening', () => {
    console.log(`[engine] control server on ws://127.0.0.1:${PORT}`)
  })

  wss.on('connection', (ws) => {
    send(ws, { type: 'hello', engine: 'millimore', version: '0.1.0' })

    ws.on('message', async (raw) => {
      let msg
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return send(ws, { type: 'error', message: 'bad json' })
      }
      try {
        await handle(msg, ws)
      } catch (err) {
        send(ws, { type: 'error', op: msg.type, message: err.message })
      }
    })
  })

  async function handle(msg, ws) {
    switch (msg.type) {
      case 'init': {
        // Bring OBS up ourselves (launch + configure websocket) so the user
        // never opens or configures OBS — everything happens inside Millimore.
        send(ws, { type: 'status', state: 'starting-obs' })
        const obs = await ensureObs({ port: OBS_PORT })
        const info = await engine.connect()
        await engine.ensureScene()
        return send(ws, { type: 'status', state: 'ready', obs: { ...info, ...obs } })
      }
      case 'setVideo':
        await engine.configureVideo(msg.quality)
        return send(ws, { type: 'status', state: 'video-configured', quality: msg.quality })
      case 'setScreen':
        await engine.setScreen({ display: msg.display, window: msg.window })
        return send(ws, { type: 'status', state: 'screen-set' })
      case 'clearScreen':
        await engine.clearScreen()
        return send(ws, { type: 'status', state: 'screen-cleared' })
      case 'setCamera':
        await engine.setCamera(msg.deviceId)
        return send(ws, { type: 'status', state: 'camera-set' })
      case 'setMicrophone':
        await engine.setMicrophone(msg.deviceId)
        return send(ws, { type: 'status', state: 'mic-set' })
      case 'setDesktopAudio': {
        const r = await engine.setDesktopAudio(msg.deviceId)
        return send(ws, { type: 'status', state: 'desktop-audio-set', ok: r.ok })
      }
      case 'setOverlay':
        await engine.setOverlay(msg.url)
        return send(ws, { type: 'status', state: 'overlay-set' })
      case 'overlayEvent':
        await engine.sendOverlayEvent(msg.payload || {})
        return
      case 'setDestinations':
        destinations.length = 0
        destinations.push(...(msg.targets || []))
        // Single-output for now: use the first destination. Multi-output is a
        // separate work item (multiple OBS outputs or a Millimore relay).
        if (destinations[0]) await engine.setService(destinations[0].url, destinations[0].key)
        return send(ws, { type: 'status', state: 'destinations-set', count: destinations.length })
      case 'start':
        await engine.startStreaming()
        broadcast({ type: 'status', state: 'live' })
        return
      case 'stop':
        await engine.stopStreaming()
        broadcast({ type: 'status', state: 'stopped' })
        return
      case 'startRecording':
        await engine.startRecording()
        return send(ws, { type: 'status', state: 'recording' })
      case 'stopRecording': {
        const r = await engine.stopRecording()
        return send(ws, { type: 'status', state: 'recording-stopped', outputPath: r.outputPath })
      }
      case 'stats': {
        const stats = await engine.getStats()
        return send(ws, { type: 'stats', ...stats })
      }
      default:
        return send(ws, { type: 'error', message: 'unknown op: ' + msg.type })
    }
  }

  const shutdown = async () => {
    try {
      await engine.disconnect()
    } finally {
      wss.close()
      process.exit(0)
    }
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  return { wss, engine }
}

module.exports = { start, PORT }
