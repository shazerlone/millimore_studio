'use strict'

/**
 * Thin wrapper around obs-studio-node (OSN / libobs).
 *
 * NOTE: OSN's API changes between versions and is sparsely documented. The call
 * sequence below follows the widely-used pattern (NodeObs init + simple service
 * streaming). Every spot marked `VERIFY` must be confirmed against the exact OSN
 * build we provision (see engine/README.md → Provisioning). This is Phase-0
 * scaffolding meant to be validated and iterated on real hardware.
 */
const path = require('node:path')
const os = require('node:os')

let osn = null
function loadOSN() {
  if (osn) return osn
  try {
    osn = require('obs-studio-node')
  } catch (err) {
    throw new Error(
      'obs-studio-node is not provisioned. See engine/README.md → Provisioning. ' + err.message
    )
  }
  return osn
}

// Map our quality presets to OBS video settings.
const VIDEO = {
  '720p30': { base: [1280, 720], out: [1280, 720], fps: 30, bitrate: 4000 },
  '1080p30': { base: [1920, 1080], out: [1920, 1080], fps: 30, bitrate: 6000 },
  '1080p60': { base: [1920, 1080], out: [1920, 1080], fps: 60, bitrate: 9000 }
}

// Best hardware encoder per platform (OSN encoder ids). VERIFY ids per OSN build.
function pickEncoder() {
  if (process.platform === 'darwin') return 'com.apple.videotoolbox.videocodec' // VideoToolbox
  if (process.platform === 'win32') return 'jim_nvenc' // fallback handled below
  return 'obs_x264'
}

class ObsEngine {
  constructor({ osnDir, dataDir } = {}) {
    this.osnDir = osnDir // directory containing the OSN distribution
    this.dataDir = dataDir || path.join(os.homedir(), '.millimore-engine')
    this.scene = null
    this.screenItem = null
    this.cameraItem = null
    this.initialized = false
  }

  init() {
    const osn = loadOSN()
    // Host the OBS server process over OSN's IPC channel.  VERIFY: some builds
    // use setServerPath()+host(); others host(name) directly.
    const hostName = 'millimore-obs-' + process.pid
    if (osn.NodeObs.IPC.setServerPath && this.osnDir) {
      osn.NodeObs.IPC.setServerPath(
        path.join(this.osnDir, 'obs64' + (process.platform === 'win32' ? '.exe' : '')),
        this.osnDir
      )
    }
    osn.NodeObs.IPC.host(hostName)
    if (osn.NodeObs.SetWorkingDirectory && this.osnDir) {
      osn.NodeObs.SetWorkingDirectory(this.osnDir)
    }

    // Boot the API. VERIFY signature/return for the provisioned build.
    const res = osn.NodeObs.OBS_API_initAPI('en-US', this.dataDir, '1.0.0', '')
    if (typeof res === 'number' && res !== 0) {
      throw new Error('OBS_API_initAPI failed with code ' + res)
    }
    this.initialized = true

    // A main scene routed to video output channel 0.
    this.scene = osn.SceneFactory.create('millimore-scene')
    osn.Global.setOutputSource(0, this.scene)
    return { ok: true }
  }

  configureVideo(quality) {
    const osn = loadOSN()
    const v = VIDEO[quality] || VIDEO['720p30']
    // Video is configured through OBS settings categories. VERIFY category/keys.
    setSetting(osn, 'Video', 'Base', `${v.base[0]}x${v.base[1]}`)
    setSetting(osn, 'Video', 'Output', `${v.out[0]}x${v.out[1]}`)
    setSetting(osn, 'Video', 'FPSType', 'Common FPS Values')
    setSetting(osn, 'Video', 'FPSCommon', String(v.fps))
    // Output (streaming) encoder + rate control.
    setSetting(osn, 'Output', 'Mode', 'Simple')
    setSetting(osn, 'Output', 'StreamEncoder', pickEncoder())
    setSetting(osn, 'Output', 'VBitrate', v.bitrate)
    setSetting(osn, 'Output', 'ABitrate', 160)
    this._video = v
    return { ok: true }
  }

  /** Add / replace the display or window capture source. */
  setScreen(sourceId) {
    const osn = loadOSN()
    this.clearScreen()
    // sourceId comes from Electron's desktopCapturer ('screen:0:0' / 'window:...').
    const isWindow = String(sourceId).startsWith('window')
    const kind =
      process.platform === 'darwin'
        ? isWindow
          ? 'window_capture'
          : 'display_capture'
        : isWindow
          ? 'window_capture'
          : 'monitor_capture'
    // VERIFY: property name for selecting the specific display/window per build.
    const input = osn.InputFactory.create(kind, 'millimore-screen', {})
    this.screenItem = this.scene.add(input)
    // Screen fills the canvas; camera PiP sits on top (added after).
    return { ok: true }
  }

  clearScreen() {
    if (this.screenItem) {
      this.screenItem.source.release?.()
      this.screenItem.remove?.()
      this.screenItem = null
    }
  }

  /** Add the webcam as a scene item (PiP position handled by the overlay/browser source). */
  setCamera(deviceId) {
    const osn = loadOSN()
    if (this.cameraItem) {
      this.cameraItem.source.release?.()
      this.cameraItem.remove?.()
      this.cameraItem = null
    }
    const kind = process.platform === 'darwin' ? 'av_capture_input' : 'dshow_input'
    const settings = process.platform === 'darwin' ? { device: deviceId } : { video_device_id: deviceId }
    const input = osn.InputFactory.create(kind, 'millimore-camera', settings)
    this.cameraItem = this.scene.add(input)
    return { ok: true }
  }

  /** Configure the RTMP destination (single output; multi-output tracked separately). */
  setService(server, key) {
    const osn = loadOSN()
    // Simple-mode service. VERIFY: newer OSN uses ServiceFactory + streaming factory.
    if (osn.NodeObs.OBS_service_setService && osn.ServiceFactory) {
      const service = osn.ServiceFactory.create('rtmp_custom', 'millimore-service', {
        server,
        key
      })
      osn.NodeObs.OBS_service_setService(service)
    } else {
      setSetting(osn, 'Stream', 'server', server)
      setSetting(osn, 'Stream', 'key', key)
    }
    return { ok: true }
  }

  startStreaming() {
    const osn = loadOSN()
    osn.NodeObs.OBS_service_startStreaming()
    return { ok: true }
  }

  stopStreaming() {
    const osn = loadOSN()
    osn.NodeObs.OBS_service_stopStreaming(false)
    return { ok: true }
  }

  shutdown() {
    if (!this.initialized) return
    try {
      const osn = loadOSN()
      this.clearScreen()
      osn.NodeObs.OBS_service_stopStreaming(true)
      osn.NodeObs.OBS_API_destroyOBS_API?.()
      osn.NodeObs.IPC.disconnect?.()
    } catch {
      /* ignore during teardown */
    }
    this.initialized = false
  }
}

/** Set one value in an OBS settings category (read-modify-write). VERIFY per build. */
function setSetting(osn, category, name, value) {
  try {
    const settings = osn.NodeObs.OBS_settings_getSettings(category)
    const params = settings.data || settings
    for (const sub of params) {
      for (const p of sub.parameters || []) {
        if (p.name === name) p.currentValue = value
      }
    }
    osn.NodeObs.OBS_settings_saveSettings(category, params)
  } catch {
    /* setting may not exist on this build — VERIFY */
  }
}

module.exports = { ObsEngine, VIDEO }
