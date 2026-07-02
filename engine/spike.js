'use strict'

/**
 * Phase 0 feasibility spike — the go/no-go test for the OBS-WebSocket approach.
 *
 * Connects to a running OBS (obs-websocket enabled), builds our scene with a
 * display capture + webcam, points OBS at a YouTube RTMP key, and streams ~60s.
 * If this shows "Good" stream health with audio on an Intel Mac and low CPU,
 * the bundled-OBS approach is proven and we proceed to bundling + wiring the UI.
 *
 * This validates the *control layer*. In production the same control layer
 * drives an OBS that Millimore bundles and launches hidden — the end-user
 * installs nothing. For the spike you just need OBS installed once on the dev
 * machine with obs-websocket enabled (Tools → WebSocket Server Settings).
 *
 * Usage:
 *   cd engine && npm install
 *   # In OBS: Tools → WebSocket Server Settings → Enable, note port/password
 *   YT_KEY=xxxx OBS_WS_PASSWORD=yyyy QUALITY=720p30 npm run spike
 */
const { ObsControl } = require('./src/obsControl')

const YT_KEY = process.env.YT_KEY
const QUALITY = process.env.QUALITY || '720p30'
const SECONDS = Number(process.env.SECONDS || 180)
const YT_URL = 'rtmp://a.rtmp.youtube.com/live2'
const OBS_URL = process.env.OBS_WS_URL || 'ws://127.0.0.1:4455'
const OBS_PASSWORD = process.env.OBS_WS_PASSWORD || ''

async function main() {
  if (!YT_KEY) {
    console.error('Set YT_KEY=<your youtube stream key> and try again.')
    process.exit(1)
  }

  const engine = new ObsControl({ url: OBS_URL, password: OBS_PASSWORD })

  console.log('[spike] connecting to OBS at', OBS_URL)
  const info = await engine.connect()
  console.log('[spike] connected — obs-websocket', info.obsWebSocketVersion)
  console.log('[spike] input kinds:', info.inputKinds.join(', '))

  console.log('[spike] ensure scene')
  await engine.ensureScene()

  console.log('[spike] configure video', QUALITY)
  await engine.configureVideo(QUALITY)

  console.log('[spike] add display capture')
  await engine.setScreen({}) // default display

  try {
    console.log('[spike] add webcam (default device)')
    await engine.setCamera('')
  } catch (e) {
    console.warn('[spike] camera add failed (continuing screen-only):', e.message)
  }

  try {
    console.log('[spike] add microphone (default device)')
    await engine.setMicrophone('')
  } catch (e) {
    console.warn('[spike] mic add failed (stream will be silent):', e.message)
  }

  try {
    console.log('[spike] add desktop audio (default device)')
    await engine.setDesktopAudio('')
  } catch (e) {
    console.warn('[spike] desktop-audio add skipped:', e.message)
  }

  console.log('[spike] set YouTube destination')
  await engine.setService(YT_URL, YT_KEY)

  console.log('[spike] START streaming — check YouTube Studio → Stream health')
  await engine.startStreaming()

  const t0 = Date.now()
  const timer = setInterval(async () => {
    try {
      const s = await engine.getStats()
      const dropPct = s.totalFrames ? ((s.skippedFrames / s.totalFrames) * 100).toFixed(1) : '0.0'
      console.log(
        `[spike] ${Math.round((Date.now() - t0) / 1000)}s  congestion=${(s.congestion ?? 0).toFixed(2)}  dropped=${dropPct}%  (${s.skippedFrames}/${s.totalFrames})`
      )
    } catch {
      /* ignore */
    }
  }, 5000)

  await new Promise((r) => setTimeout(r, SECONDS * 1000))
  clearInterval(timer)

  console.log('[spike] STOP streaming')
  await engine.stopStreaming()
  await engine.disconnect()
  console.log('[spike] done. Report: stream health, audio present?, CPU usage.')
  process.exit(0)
}

main().catch((err) => {
  console.error('[spike] FAILED:', err)
  process.exit(1)
})
