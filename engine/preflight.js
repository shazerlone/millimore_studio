'use strict'

/**
 * Preflight for the Phase-0 spike. Run this first — it checks the environment and
 * prints the exact command + success criteria, so provisioning issues are obvious
 * before you try to stream.
 *
 *   cd engine && node preflight.js
 */
const { execSync } = require('node:child_process')

function ok(m) {
  console.log('  ✓ ' + m)
}
function bad(m) {
  console.log('  ✗ ' + m)
}
function head(m) {
  console.log('\n' + m)
}

console.log('Millimore Streaming Engine — Phase 0 preflight\n===============================================')

head('Environment')
ok(`platform: ${process.platform}  arch: ${process.arch}`)
ok(`node: ${process.version}  (running under ${process.versions.electron ? 'Electron ' + process.versions.electron : 'plain Node'})`)
if (!process.versions.electron) {
  bad('You are on plain Node. OSN is compiled for a specific ELECTRON ABI and will')
  console.log('    NOT load under plain node. Run the spike under Electron-as-Node (see below).')
}

head('obs-studio-node (OSN)')
let osnOk = false
try {
  const p = require.resolve('obs-studio-node')
  ok('resolved: ' + p)
  osnOk = true
} catch {
  bad('NOT found. Provision it into engine/node_modules/obs-studio-node.')
  console.log('    OSN is not on npm — it ships as a prebuilt pinned to an Electron version.')
  console.log('    Get the release from https://github.com/stream-labs/obs-studio-node/releases')
  console.log('    that matches the app Electron version (see ../package.json → electron).')
  console.log('    If none matches, tell the team and we will align the app Electron version.')
}

head('Electron binary (to run OSN as Node)')
let electronBin = ''
try {
  electronBin = execSync(process.platform === 'win32' ? 'where electron' : 'command -v electron', {
    encoding: 'utf8'
  })
    .split('\n')[0]
    .trim()
  ok('electron on PATH: ' + electronBin)
} catch {
  console.log('  (no global electron — use the app copy: ../node_modules/.bin/electron)')
}

head('Run the spike')
console.log('  Set your YouTube stream key, then run the spike UNDER ELECTRON-AS-NODE:')
console.log('')
if (process.platform === 'win32') {
  console.log('    set ELECTRON_RUN_AS_NODE=1')
  console.log('    set YT_KEY=your-youtube-key')
  console.log('    ..\\node_modules\\.bin\\electron spike.js')
} else {
  console.log('    ELECTRON_RUN_AS_NODE=1 YT_KEY=your-youtube-key \\')
  console.log('      ../node_modules/.bin/electron spike.js')
}

head('Success criteria (report these back)')
console.log('  1. YouTube Studio → Stream health = Good/Excellent (not "Poor")')
console.log('  2. Audio present on the YouTube watch page')
console.log('  3. CPU usage clearly lower than the current Electron/FFmpeg app')
console.log('')
console.log(osnOk ? 'Preflight: OSN present — you can run the spike.' : 'Preflight: provision OSN first.')
