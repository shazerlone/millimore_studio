'use strict'

/**
 * electron-builder afterPack hook.
 *
 * When we build WITHOUT an Apple Developer certificate (local/unsigned), give
 * the app a clean ad-hoc code signature. A validly ad-hoc-signed app gets the
 * normal "unverified developer → Open Anyway" treatment on macOS instead of the
 * scarier "damaged / contains malware" state an unsigned/broken app trips on
 * Sequoia. When a real certificate IS configured, electron-builder's own
 * signing runs after this and supersedes the ad-hoc signature — so this is a
 * no-op for release builds.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  if (process.env.CSC_LINK || process.env.CSC_IDENTITY_AUTO_DISCOVERY === 'true') return // real signing will run

  const { execFileSync } = require('node:child_process')
  const path = require('node:path')
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  try {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
    console.log('afterPack: ad-hoc signed', app)
  } catch (err) {
    console.warn('afterPack: ad-hoc sign skipped:', err.message)
  }
}
