'use strict'

/**
 * Entry point for the Millimore Streaming Engine helper process.
 * Launched by the Electron app; it exposes the local control server that drives
 * OBS over obs-websocket.
 *
 * OBS connection is provided via env: MILLIMORE_OBS_URL (default
 * ws://127.0.0.1:4455) and MILLIMORE_OBS_PASSWORD (the app sets these to the
 * bundled OBS's websocket endpoint).
 */
const { start } = require('./server')
const { stopObs } = require('./obsLauncher')

// The engine must never die silently mid-stream. Log and keep running on
// stray async errors (e.g. a dropped OBS socket between retries).
process.on('uncaughtException', (err) => {
  console.error('[engine] uncaught exception:', err?.stack || err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[engine] unhandled rejection:', reason)
})

// Orphan watchdog: if the Millimore app dies without killing us (force quit,
// crash), our parent becomes pid 1 — shut down and take the hidden OBS with
// us. Otherwise both would linger forever with no UI to quit them.
setInterval(() => {
  if (process.ppid === 1) {
    console.error('[engine] parent app is gone — shutting down')
    try {
      stopObs()
    } finally {
      process.exit(0)
    }
  }
}, 5000).unref()

start({
  obsUrl: process.env.MILLIMORE_OBS_URL || undefined,
  obsPassword: process.env.MILLIMORE_OBS_PASSWORD || undefined
})
