'use strict'

/**
 * Preflight for the Phase-0 spike. Run this first — it checks the environment
 * and tries to reach OBS over obs-websocket, then prints the exact command +
 * success criteria so setup issues are obvious before you try to stream.
 *
 *   cd engine && node preflight.js
 */
const OBS_URL = process.env.OBS_WS_URL || 'ws://127.0.0.1:4455'
const OBS_PASSWORD = process.env.OBS_WS_PASSWORD || ''

function ok(m) {
  console.log('  ✓ ' + m)
}
function bad(m) {
  console.log('  ✗ ' + m)
}
function head(m) {
  console.log('\n' + m)
}

async function main() {
  console.log('Millimore Streaming Engine — Phase 0 preflight\n===============================================')

  head('Environment')
  ok(`platform: ${process.platform}  arch: ${process.arch}`)
  ok(`node: ${process.version}`)

  head('obs-websocket-js dependency')
  let ObsControl
  try {
    ObsControl = require('./src/obsControl').ObsControl
    require.resolve('obs-websocket-js')
    ok('obs-websocket-js resolved')
  } catch (e) {
    bad('obs-websocket-js NOT found — run `npm install` in engine/. ' + e.message)
    process.exit(1)
  }

  head('OBS reachable over WebSocket')
  console.log(`  trying ${OBS_URL} …`)
  const engine = new ObsControl({ url: OBS_URL, password: OBS_PASSWORD })
  let reachable = false
  try {
    const info = await engine.connect()
    ok('connected — obs-websocket ' + info.obsWebSocketVersion)
    ok('input kinds: ' + info.inputKinds.join(', '))
    const hasScreen = info.inputKinds.some((k) =>
      /screen_capture|display_capture|monitor_capture|window_capture|xshm|pipewire/.test(k)
    )
    const hasCam = info.inputKinds.some((k) => /av_capture|dshow|v4l2/.test(k))
    const hasBrowser = info.inputKinds.some((k) => /browser/.test(k))
    ;(hasScreen ? ok : bad)('screen-capture input kind present')
    ;(hasCam ? ok : bad)('camera input kind present')
    ;(hasBrowser ? ok : bad)('browser-source input kind present (for overlays)')
    await engine.disconnect()
    reachable = true
  } catch (e) {
    bad('could not connect: ' + e.message)
    console.log('    In OBS: Tools → WebSocket Server Settings → Enable WebSocket Server.')
    console.log('    Note the Server Port (default 4455) and Password, then set:')
    console.log('      OBS_WS_URL=ws://127.0.0.1:4455  OBS_WS_PASSWORD=<password>')
    console.log('    (Production bundles OBS and enables this automatically — this is dev-only.)')
  }

  head('Run the spike')
  console.log('  Set your YouTube stream key + OBS password, then:')
  console.log('')
  console.log('    YT_KEY=<youtube-key> OBS_WS_PASSWORD=<obs-password> npm run spike')

  head('Success criteria (report these back)')
  console.log('  1. YouTube Studio → Stream health = Good/Excellent (not "Poor")')
  console.log('  2. Audio present on the YouTube watch page')
  console.log('  3. CPU usage clearly lower than the current Electron/FFmpeg app')
  console.log('')
  console.log(reachable ? 'Preflight: OBS reachable — you can run the spike.' : 'Preflight: enable obs-websocket in OBS first.')
  process.exit(0)
}

main().catch((e) => {
  console.error('preflight error:', e)
  process.exit(1)
})
