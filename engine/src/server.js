'use strict'

/**
 * Local control server for the Millimore Streaming Engine.
 * The closed-source Millimore app connects over WebSocket and drives the OBS
 * engine with the JSON protocol documented in engine/README.md.
 *
 * Bound to 127.0.0.1 only (never exposed off-machine).
 */
const { WebSocketServer } = require('ws')
const { ObsEngine } = require('./obs')

const PORT = Number(process.env.MILLIMORE_ENGINE_PORT || 28112)

function start({ osnDir } = {}) {
  const engine = new ObsEngine({ osnDir })
  const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT })
  const destinations = []

  const send = (ws, msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg))
  const broadcast = (msg) => wss.clients.forEach((c) => send(c, msg))

  wss.on('listening', () => {
    console.log(`[engine] control server on ws://127.0.0.1:${PORT}`)
  })

  wss.on('connection', (ws) => {
    send(ws, { type: 'hello', engine: 'millimore', version: '0.1.0' })

    ws.on('message', (raw) => {
      let msg
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return send(ws, { type: 'error', message: 'bad json' })
      }
      try {
        handle(msg, ws)
      } catch (err) {
        send(ws, { type: 'error', op: msg.type, message: err.message })
      }
    })
  })

  function handle(msg, ws) {
    switch (msg.type) {
      case 'init':
        engine.init()
        return send(ws, { type: 'status', state: 'ready' })
      case 'setVideo':
        engine.configureVideo(msg.quality)
        return send(ws, { type: 'status', state: 'video-configured', quality: msg.quality })
      case 'setScreen':
        engine.setScreen(msg.sourceId)
        return send(ws, { type: 'status', state: 'screen-set' })
      case 'clearScreen':
        engine.clearScreen()
        return send(ws, { type: 'status', state: 'screen-cleared' })
      case 'setCamera':
        engine.setCamera(msg.deviceId)
        return send(ws, { type: 'status', state: 'camera-set' })
      case 'setDestinations':
        destinations.length = 0
        destinations.push(...(msg.targets || []))
        // Single-output for now: use the first destination. Multi-output is a
        // separate work item (multiple OSN outputs or a Millimore relay).
        if (destinations[0]) engine.setService(destinations[0].url, destinations[0].key)
        return send(ws, { type: 'status', state: 'destinations-set', count: destinations.length })
      case 'start':
        engine.startStreaming()
        broadcast({ type: 'status', state: 'live' })
        return
      case 'stop':
        engine.stopStreaming()
        broadcast({ type: 'status', state: 'stopped' })
        return
      default:
        return send(ws, { type: 'error', message: 'unknown op: ' + msg.type })
    }
  }

  const shutdown = () => {
    try {
      engine.shutdown()
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
