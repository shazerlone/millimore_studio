'use strict'

/**
 * Phase 0 feasibility spike — the go/no-go test.
 *
 * Boots the OBS engine directly (no app, no WebSocket), adds a display capture +
 * webcam, and streams ~60s to YouTube. If this shows "Good" stream health with
 * audio on an Intel Mac and low CPU, the libobs approach is proven and we proceed
 * to Phase 1. If it can't even be provisioned/run, we reassess.
 *
 * Usage:
 *   cd engine && npm install
 *   # provision obs-studio-node into node_modules/obs-studio-node (see README)
 *   YT_KEY=xxxx QUALITY=720p30 node spike.js
 */
const { ObsEngine } = require('./src/obs')

const YT_KEY = process.env.YT_KEY
const QUALITY = process.env.QUALITY || '720p30'
const SECONDS = Number(process.env.SECONDS || 60)
const YT_URL = 'rtmp://a.rtmp.youtube.com/live2'

async function main() {
  if (!YT_KEY) {
    console.error('Set YT_KEY=<your youtube stream key> and try again.')
    process.exit(1)
  }

  const engine = new ObsEngine({ osnDir: process.env.MILLIMORE_OSN_DIR })
  console.log('[spike] init OBS engine…')
  engine.init()

  console.log('[spike] configure video', QUALITY)
  engine.configureVideo(QUALITY)

  console.log('[spike] add display capture')
  engine.setScreen('screen:0:0')

  try {
    console.log('[spike] add webcam')
    engine.setCamera('') // empty → default device (VERIFY per platform)
  } catch (e) {
    console.warn('[spike] camera add failed (continuing screen-only):', e.message)
  }

  console.log('[spike] set YouTube destination')
  engine.setService(YT_URL, YT_KEY)

  console.log('[spike] START streaming — check YouTube Studio → Stream health')
  engine.startStreaming()

  await new Promise((r) => setTimeout(r, SECONDS * 1000))

  console.log('[spike] STOP streaming')
  engine.stopStreaming()
  engine.shutdown()
  console.log('[spike] done. Report: stream health, audio present?, CPU usage.')
  process.exit(0)
}

main().catch((err) => {
  console.error('[spike] FAILED:', err)
  process.exit(1)
})
