'use strict'

/**
 * Runs spike.js under Electron-as-Node (required: OSN's native addon is built for
 * the Electron ABI, not plain Node). Uses the app's local Electron binary.
 *
 *   cd engine && YT_KEY=xxxx npm run spike
 */
const { spawn } = require('node:child_process')
const path = require('node:path')

let electronPath
try {
  // The `electron` module exports the absolute path to its binary.
  electronPath = require(path.join(__dirname, '..', 'node_modules', 'electron'))
} catch {
  console.error(
    'Could not find the app Electron binary at ../node_modules/electron.\n' +
      'Run `npm install` in the repo root first (it provides Electron), then retry.'
  )
  process.exit(1)
}

const child = spawn(electronPath, [path.join(__dirname, 'spike.js')], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})
child.on('exit', (code) => process.exit(code ?? 0))
