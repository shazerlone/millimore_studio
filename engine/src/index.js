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

start({
  obsUrl: process.env.MILLIMORE_OBS_URL || undefined,
  obsPassword: process.env.MILLIMORE_OBS_PASSWORD || undefined
})
