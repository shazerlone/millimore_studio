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
const { ensureObs, stopObs } = require('./obsLauncher')

const PORT = Number(process.env.MILLIMORE_ENGINE_PORT || 28112)
const OBS_PORT = Number(process.env.MILLIMORE_OBS_PORT || 4455)

function start({ obsUrl, obsPassword } = {}) {
  const engine = new ObsControl({
    url: obsUrl || process.env.MILLIMORE_OBS_URL || `ws://127.0.0.1:${OBS_PORT}`,
    password: obsPassword || process.env.MILLIMORE_OBS_PASSWORD
  })
  // Self-healing hook: if OBS quits/crashes mid-session, any engine call
  // relaunches it (hidden) and reconnects instead of erroring to the app.
  engine.ensureUp = () => ensureObs({ port: OBS_PORT })
  const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT })
  const destinations = []
  // Latest overlay state (trade / scene / config) — replayed to the OBS
  // browser-source page when it (re)connects so it never starts blank.
  let lastOverlay = null

  const send = (ws, msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg))
  const broadcast = (msg) => wss.clients.forEach((c) => send(c, msg))

  wss.on('listening', () => {
    console.log(`[engine] control server on ws://127.0.0.1:${PORT}`)
  })

  // Without this handler an EADDRINUSE (stale helper holding the port) throws
  // as an unhandled 'error' event and kills the process with no explanation.
  wss.on('error', (err) => {
    console.error('[engine] control server error:', err?.code || '', err?.message || err)
    process.exit(1)
  })

  wss.on('connection', (ws) => {
    send(ws, { type: 'hello', engine: 'millimore', version: '0.1.0' })
    if (lastOverlay) send(ws, { type: 'overlay', payload: lastOverlay })

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
        // Already connected (pre-warmed at app start) → instant ready.
        if (engine.connected) {
          await engine.ensureScene()
          return send(ws, { type: 'status', state: 'ready', cached: true })
        }
        // Bring OBS up ourselves (launch + configure websocket) so the user
        // never opens or configures OBS — everything happens inside Millimore.
        send(ws, { type: 'status', state: 'starting-obs' })
        const obs = await ensureObs({ port: OBS_PORT })
        const info = await engine.connect()
        // OBS's own stream lifecycle → every connected app window, so the UI
        // always mirrors the true engine state (even if OBS stops on its own).
        engine.onStreamState((e) => {
          const st = e.outputState
          if (st === 'OBS_WEBSOCKET_OUTPUT_STARTED') broadcast({ type: 'status', state: 'live' })
          else if (st === 'OBS_WEBSOCKET_OUTPUT_STOPPED') broadcast({ type: 'status', state: 'stopped' })
          else if (st === 'OBS_WEBSOCKET_OUTPUT_RECONNECTING')
            broadcast({ type: 'status', state: 'reconnecting' })
        })
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
        // Fan the new overlay state out to every client — including the OBS
        // browser-source page, which paints it onto the broadcast.
        lastOverlay = msg.payload || {}
        broadcast({ type: 'overlay', payload: lastOverlay })
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
      case 'shutdown':
        // Graceful replace: a newer app instance asks us to exit so it can run
        // a helper matching its own version.
        send(ws, { type: 'status', state: 'shutting-down' })
        return shutdown()
      default:
        return send(ws, { type: 'error', message: 'unknown op: ' + msg.type })
    }
  }

  const shutdown = async () => {
    try {
      await engine.disconnect()
    } finally {
      // Kill the hidden OBS we spawned (never a user's own instance) — with no
      // dock icon or window, a leaked engine would be unquittable.
      stopObs()
      wss.close()
      process.exit(0)
    }
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  return { wss, engine }
}

module.exports = { start, PORT }
