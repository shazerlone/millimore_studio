'use strict'

/**
 * Millimore Streaming Engine — control layer.
 *
 * Instead of linking libobs into our process (obs-studio-node — no modern
 * prebuilt exists, dead-end), we drive a **real OBS Studio** process over its
 * native WebSocket (obs-websocket v5, shipped inside OBS since 28). In
 * production OBS is bundled *inside* Millimore and launched hidden/portable, so
 * the end-user installs nothing extra; during development you point this at any
 * OBS you already have running with obs-websocket enabled.
 *
 * This keeps the GPL OBS code in a separate process (license separation) and
 * gives us OBS-class capture / GPU compositing / hardware encode / RTMP for
 * free — we only orchestrate it.
 *
 * The obs-websocket v5 protocol is stable and well documented, so — unlike the
 * old OSN wrapper — the request names/fields below are real, not `VERIFY`
 * guesses.
 */
const { OBSWebSocket } = require('obs-websocket-js')

// Our quality presets → OBS canvas/output/fps.
const VIDEO = {
  '720p30': { base: [1280, 720], out: [1280, 720], fps: 30, bitrate: 4000 },
  '1080p30': { base: [1920, 1080], out: [1920, 1080], fps: 30, bitrate: 6000 },
  '1080p60': { base: [1920, 1080], out: [1920, 1080], fps: 60, bitrate: 9000 }
}

const SCENE = 'Millimore'
const SCREEN_INPUT = 'millimore-screen'
const CAMERA_INPUT = 'millimore-camera'
const OVERLAY_INPUT = 'millimore-overlay'
const MIC_INPUT = 'millimore-mic'
const DESKTOP_AUDIO_INPUT = 'millimore-desktop-audio'

class ObsControl {
  /**
   * @param {object} opts
   * @param {string} [opts.url]      obs-websocket URL (default ws://127.0.0.1:4455)
   * @param {string} [opts.password] obs-websocket password (if auth is enabled)
   */
  constructor({ url = 'ws://127.0.0.1:4455', password = '' } = {}) {
    this.url = url
    this.password = password
    this.obs = new OBSWebSocket()
    this.connected = false
    this.inputKinds = [] // discovered per platform/OBS build
    this._video = VIDEO['720p30']
  }

  /** Connect and cache the input kinds this OBS build actually supports. */
  async connect() {
    const { obsWebSocketVersion, negotiatedRpcVersion } = await this.obs.connect(
      this.url,
      this.password || undefined,
      { rpcVersion: 1 }
    )
    this.connected = true
    const { inputKinds } = await this.obs.call('GetInputKindList')
    this.inputKinds = inputKinds || []
    return { obsWebSocketVersion, negotiatedRpcVersion, inputKinds: this.inputKinds }
  }

  /** First input kind whose id contains any of the given substrings. */
  _pickKind(...candidates) {
    for (const c of candidates) {
      const hit = this.inputKinds.find((k) => k.includes(c))
      if (hit) return hit
    }
    return null
  }

  /** Ensure our scene exists and is the current program scene. */
  async ensureScene() {
    const { scenes } = await this.obs.call('GetSceneList')
    if (!scenes.some((s) => s.sceneName === SCENE)) {
      await this.obs.call('CreateScene', { sceneName: SCENE })
    }
    await this.obs.call('SetCurrentProgramScene', { sceneName: SCENE })
    return { ok: true }
  }

  /** Configure canvas size, output size, FPS, encoder and bitrate from a preset. */
  async configureVideo(quality) {
    const v = VIDEO[quality] || VIDEO['720p30']
    this._video = v
    await this.obs.call('SetVideoSettings', {
      baseWidth: v.base[0],
      baseHeight: v.base[1],
      outputWidth: v.out[0],
      outputHeight: v.out[1],
      fpsNumerator: v.fps,
      fpsDenominator: 1
    })
    // Control the encoder + bitrate ourselves so quality/perf never depend on
    // whatever the user's OBS happens to be set to (a reset OBS defaults to the
    // software x264 encoder, which pegs the CPU on Intel Macs → congestion).
    await this._setOutputParams(v)
    return { ok: true }
  }

  /**
   * Force a hardware encoder + CBR bitrate + 2s keyframes into the OBS profile,
   * so StartStream uses them. Best-effort per platform; falls back silently if a
   * key doesn't exist on this OBS build.
   */
  async _setOutputParams(v) {
    const hwEncoder =
      process.platform === 'darwin'
        ? 'apple_h264' // Apple VideoToolbox (hardware) — low CPU on Intel + ARM
        : process.platform === 'win32'
          ? 'nvenc' // best-effort; OBS falls back if no NVIDIA GPU
          : 'x264'
    const set = (parameterCategory, parameterName, parameterValue) =>
      this.obs
        .call('SetProfileParameter', {
          parameterCategory,
          parameterName,
          parameterValue: String(parameterValue)
        })
        .catch(() => {})
    // Simple output mode is the most predictable to drive over the socket.
    await set('SimpleOutput', 'Mode', 'Simple')
    await set('Output', 'Mode', 'Simple')
    await set('SimpleOutput', 'UseAdvanced', 'false')
    await set('SimpleOutput', 'StreamEncoder', hwEncoder)
    await set('SimpleOutput', 'VBitrate', v.bitrate)
    await set('SimpleOutput', 'ABitrate', 160)
    // 2s keyframe interval — YouTube penalises long GOPs ("Poor").
    await set('SimpleOutput', 'StreamEncoderKeyframeInterval', 2)
  }

  /** Remove an input (and its scene items) if present — safe if it doesn't exist. */
  async _removeInput(inputName) {
    try {
      await this.obs.call('RemoveInput', { inputName })
    } catch {
      /* not present — fine */
    }
  }

  /**
   * Create an input, replacing any existing one of the same name. Checks the
   * authoritative input list first so a re-run never hits "source already exists"
   * (RemoveInput can return before the removal has fully propagated).
   */
  async _recreateInput(inputName, inputKind, inputSettings) {
    const { inputs } = await this.obs.call('GetInputList')
    if (inputs.some((i) => i.inputName === inputName)) {
      await this.obs.call('RemoveInput', { inputName })
    }
    await this.obs.call('CreateInput', {
      sceneName: SCENE,
      inputName,
      inputKind,
      inputSettings,
      sceneItemEnabled: true
    })
  }

  /**
   * Add / replace the screen (display or window) capture source.
   * @param {object} opts { display?: number, window?: string|number }
   */
  async setScreen({ display, window } = {}) {
    const isWindow = window != null
    let kind
    let settings = {}
    if (process.platform === 'darwin') {
      // Modern OBS on mac uses ScreenCaptureKit for both display and window.
      kind = this._pickKind('screen_capture', 'display_capture', 'window_capture', 'monitor_capture')
    } else if (process.platform === 'win32') {
      kind = isWindow
        ? this._pickKind('window_capture')
        : this._pickKind('monitor_capture', 'display_capture')
    } else {
      kind = this._pickKind('xshm', 'pipewire', 'screen_capture', 'monitor_capture')
    }
    if (!kind) throw new Error('No screen-capture input kind available in this OBS build')
    if (display != null) settings.monitor = display
    if (window != null) settings.window = window

    await this._recreateInput(SCREEN_INPUT, kind, settings)
    await this._fitToCanvas(SCREEN_INPUT)
    return { ok: true, kind }
  }

  async clearScreen() {
    await this._removeInput(SCREEN_INPUT)
    return { ok: true }
  }

  /** Add / replace the webcam source. */
  async setCamera(deviceId) {
    let kind
    let settings = {}
    if (process.platform === 'darwin') {
      kind = this._pickKind('av_capture_input_v2', 'av_capture_input')
      if (deviceId) settings.device = deviceId
    } else if (process.platform === 'win32') {
      kind = this._pickKind('dshow_input')
      if (deviceId) settings.video_device_id = deviceId
    } else {
      kind = this._pickKind('v4l2_input', 'dshow_input')
      if (deviceId) settings.device_id = deviceId
    }
    if (!kind) throw new Error('No camera input kind available in this OBS build')

    await this._recreateInput(CAMERA_INPUT, kind, settings)
    return { ok: true, kind }
  }

  /**
   * Add / replace the microphone (the streamer's voice). Video-only camera
   * inputs carry no audio, so without this the broadcast is silent.
   * @param {string} [deviceId] OBS device_id; empty → system default input
   */
  async setMicrophone(deviceId) {
    let kind
    if (process.platform === 'darwin') kind = this._pickKind('coreaudio_input_capture')
    else if (process.platform === 'win32') kind = this._pickKind('wasapi_input_capture')
    else kind = this._pickKind('pulse_input_capture', 'alsa_input_capture')
    if (!kind) throw new Error('No microphone input kind available in this OBS build')
    await this._recreateInput(MIC_INPUT, kind, { device_id: deviceId || 'default' })
    return { ok: true, kind }
  }

  /**
   * Add / replace desktop (system) audio capture — platform sounds, alerts,
   * a video the trader plays. Optional; mic is the essential one.
   * @param {string} [deviceId] empty → default output
   */
  async setDesktopAudio(deviceId) {
    let kind
    if (process.platform === 'darwin') kind = this._pickKind('sck_audio_capture', 'coreaudio_output_capture')
    else if (process.platform === 'win32') kind = this._pickKind('wasapi_output_capture')
    else kind = this._pickKind('pulse_output_capture')
    if (!kind) return { ok: false, reason: 'no desktop-audio input kind' }
    await this._recreateInput(DESKTOP_AUDIO_INPUT, kind, deviceId ? { device_id: deviceId } : {})
    return { ok: true, kind }
  }

  /**
   * Add / replace the transparent overlay page (trade cards / ticker / scenes)
   * as an OBS Browser Source that fills the canvas on top of everything.
   */
  async setOverlay(url) {
    const kind = this._pickKind('browser_source', 'browser')
    if (!kind) throw new Error('No browser-source input kind available in this OBS build')
    await this._recreateInput(OVERLAY_INPUT, kind, {
      url,
      width: this._video.base[0],
      height: this._video.base[1],
      reroute_audio: false
    })
    await this._fitToCanvas(OVERLAY_INPUT)
    return { ok: true, kind }
  }

  /** Push new overlay state to the browser source (via a custom event it listens for). */
  async sendOverlayEvent(payload) {
    // The overlay page subscribes to obs-websocket CustomEvent broadcasts.
    await this.obs.call('BroadcastCustomEvent', {
      eventData: { realm: 'millimore-overlay', ...payload }
    })
    return { ok: true }
  }

  /** Stretch a scene item to fill the whole canvas. */
  async _fitToCanvas(inputName) {
    try {
      const { sceneItemId } = await this.obs.call('GetSceneItemId', {
        sceneName: SCENE,
        sourceName: inputName
      })
      await this.obs.call('SetSceneItemTransform', {
        sceneName: SCENE,
        sceneItemId,
        sceneItemTransform: {
          boundsType: 'OBS_BOUNDS_SCALE_INNER',
          boundsWidth: this._video.base[0],
          boundsHeight: this._video.base[1],
          positionX: 0,
          positionY: 0
        }
      })
    } catch {
      /* transform best-effort */
    }
  }

  /** Configure the RTMP destination (single output — see server.js for multi). */
  async setService(server, key) {
    await this.obs.call('SetStreamServiceSettings', {
      streamServiceType: 'rtmp_custom',
      streamServiceSettings: { server, key, use_auth: false, bwtest: false }
    })
    return { ok: true }
  }

  async startStreaming() {
    await this.obs.call('StartStream')
    return { ok: true }
  }

  async stopStreaming() {
    try {
      await this.obs.call('StopStream')
    } catch {
      /* may already be stopped */
    }
    return { ok: true }
  }

  async startRecording() {
    await this.obs.call('StartRecord')
    return { ok: true }
  }

  async stopRecording() {
    try {
      const { outputPath } = await this.obs.call('StopRecord')
      return { ok: true, outputPath }
    } catch {
      return { ok: true }
    }
  }

  /** Live streaming stats (for the app's health indicator). */
  async getStats() {
    const s = await this.obs.call('GetStreamStatus')
    return {
      streaming: s.outputActive,
      congestion: s.outputCongestion, // 0..1 — our "health" signal
      skippedFrames: s.outputSkippedFrames,
      totalFrames: s.outputTotalFrames,
      bytes: s.outputBytes,
      durationMs: s.outputDuration
    }
  }

  async disconnect() {
    if (!this.connected) return
    try {
      await this.obs.disconnect()
    } catch {
      /* ignore */
    }
    this.connected = false
  }
}

module.exports = { ObsControl, VIDEO }
