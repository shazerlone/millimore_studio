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
    this.screenActive = false
    this._lastStats = null
  }

  /**
   * obs.call with automatic retry. Right after launch, OBS's socket accepts
   * connections BEFORE the core is ready, so calls fail with "OBS is not ready
   * to perform the request" — and canvas changes fail with "output is active"
   * for a beat after a stream stops. Both are transient; retry instead of
   * surfacing them to the user.
   */
  async _call(request, data, { tries = 30, delay = 500 } = {}) {
    for (let i = 0; ; i++) {
      try {
        return await this.obs.call(request, data)
      } catch (err) {
        const msg = String(err?.message || '')
        const transient = /not ready|output is active/i.test(msg)
        if (!transient || i >= tries - 1) throw err
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }

  /** Connect and cache the input kinds this OBS build actually supports. */
  async connect() {
    if (this.connected) {
      return { obsWebSocketVersion: this._wsVersion, cached: true, inputKinds: this.inputKinds }
    }
    const { obsWebSocketVersion, negotiatedRpcVersion } = await this.obs.connect(
      this.url,
      this.password || undefined,
      { rpcVersion: 1 }
    )
    this.connected = true
    this._wsVersion = obsWebSocketVersion
    this.obs.on('ConnectionClosed', () => {
      this.connected = false
    })
    // Real stream lifecycle from OBS itself, so the app never drifts out of
    // sync with what the engine is actually doing.
    this.obs.on('StreamStateChanged', (e) => this._streamStateCb?.(e))
    const { inputKinds } = await this._call('GetInputKindList')
    this.inputKinds = inputKinds || []
    return { obsWebSocketVersion, negotiatedRpcVersion, inputKinds: this.inputKinds }
  }

  /** Register a callback for OBS StreamStateChanged events. */
  onStreamState(cb) {
    this._streamStateCb = cb
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
    const { scenes } = await this._call('GetSceneList')
    if (!scenes.some((s) => s.sceneName === SCENE)) {
      await this._call('CreateScene', { sceneName: SCENE })
    }
    await this._call('SetCurrentProgramScene', { sceneName: SCENE })
    return { ok: true }
  }

  /** Configure canvas size, output size, FPS, encoder and bitrate from a preset. */
  async configureVideo(quality) {
    const v = VIDEO[quality] || VIDEO['720p30']
    this._video = v
    await this._call('SetVideoSettings', {
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
    // The canvas size changed — re-lay-out any sources that already exist, or a
    // 720p camera ends up parked in the corner of a 1080p canvas.
    await this._relayout()
    return { ok: true }
  }

  /** Does this input currently have a scene item in our scene? */
  async _hasItem(inputName) {
    try {
      await this._call('GetSceneItemId', { sceneName: SCENE, sourceName: inputName })
      return true
    } catch {
      return false
    }
  }

  /**
   * Re-apply the layout to whatever sources exist for the current canvas:
   * screen fills the canvas, overlay fills the canvas, camera is fullscreen
   * when solo and a bottom-right PiP when a screen is shared.
   */
  async _relayout() {
    if (await this._hasItem(SCREEN_INPUT)) await this._fitToCanvas(SCREEN_INPUT)
    if (await this._hasItem(OVERLAY_INPUT)) {
      await this._call('SetInputSettings', {
        inputName: OVERLAY_INPUT,
        inputSettings: { width: this._video.base[0], height: this._video.base[1] },
        overlay: true
      }).catch(() => {})
      await this._fitToCanvas(OVERLAY_INPUT)
    }
    await this._layoutCamera()
  }

  /** Position the camera: fullscreen when solo, bottom-right PiP over a screen. */
  async _layoutCamera() {
    if (!(await this._hasItem(CAMERA_INPUT))) return
    const [bw, bh] = this._video.base
    if (!this.screenActive) {
      await this._fitToCanvas(CAMERA_INPUT)
      return
    }
    const w = Math.round(bw * 0.28)
    const h = Math.round((w * 9) / 16)
    const margin = Math.round(bw * 0.02)
    await this._setTransform(CAMERA_INPUT, {
      boundsType: 'OBS_BOUNDS_SCALE_INNER',
      boundsWidth: w,
      boundsHeight: h,
      positionX: bw - w - margin,
      positionY: bh - h - margin
    })
  }

  /** Apply a transform to an input's scene item (best-effort). */
  async _setTransform(inputName, sceneItemTransform) {
    try {
      const { sceneItemId } = await this._call('GetSceneItemId', {
        sceneName: SCENE,
        sourceName: inputName
      })
      await this._call('SetSceneItemTransform', { sceneName: SCENE, sceneItemId, sceneItemTransform })
    } catch {
      /* best-effort */
    }
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
      await this._call('RemoveInput', { inputName })
    } catch {
      /* not present — fine */
    }
  }

  /**
   * Idempotently ensure an input exists in our scene with the given settings.
   * If it already exists we UPDATE it (no RemoveInput → no "source already
   * exists" race, which OBS hits because RemoveInput returns before the source
   * is actually gone). If it's missing we create it. Also self-heals an input
   * that lost its scene item (e.g. the user deleted things in OBS).
   */
  async _recreateInput(inputName, inputKind, inputSettings) {
    const { inputs } = await this._call('GetInputList')
    const exists = inputs.some((i) => i.inputName === inputName)

    if (!exists) {
      await this._call('CreateInput', {
        sceneName: SCENE,
        inputName,
        inputKind,
        inputSettings,
        sceneItemEnabled: true
      })
      return
    }

    // Already present — update its settings in place…
    await this._call('SetInputSettings', { inputName, inputSettings, overlay: true })
    // …and make sure it still has a scene item in our scene.
    try {
      await this._call('GetSceneItemId', { sceneName: SCENE, sourceName: inputName })
    } catch {
      await this._call('CreateSceneItem', {
        sceneName: SCENE,
        sourceName: inputName,
        sceneItemEnabled: true
      })
    }
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
    this.screenActive = true
    await this._fitToCanvas(SCREEN_INPUT)
    await this._layoutCamera() // camera becomes a PiP over the screen
    return { ok: true, kind }
  }

  async clearScreen() {
    await this._removeInput(SCREEN_INPUT)
    this.screenActive = false
    await this._layoutCamera() // camera returns to fullscreen
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
    await this._layoutCamera() // fullscreen solo, PiP when a screen is shared
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
    // Belt and braces: a muted or zeroed mic is indistinguishable from "audio
    // is broken" to the streamer, so force it audible.
    await this._call('SetInputMute', { inputName: MIC_INPUT, inputMuted: false }).catch(() => {})
    await this._call('SetInputVolume', { inputName: MIC_INPUT, inputVolumeMul: 1 }).catch(() => {})
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
    await this._call('BroadcastCustomEvent', {
      eventData: { realm: 'millimore-overlay', ...payload }
    })
    return { ok: true }
  }

  /** Stretch a scene item to fill the whole canvas. */
  async _fitToCanvas(inputName) {
    try {
      const { sceneItemId } = await this._call('GetSceneItemId', {
        sceneName: SCENE,
        sourceName: inputName
      })
      await this._call('SetSceneItemTransform', {
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
    await this._call('SetStreamServiceSettings', {
      streamServiceType: 'rtmp_custom',
      streamServiceSettings: { server, key, use_auth: false, bwtest: false }
    })
    return { ok: true }
  }

  /** Poll GetStreamStatus until pred(status) is true, or time out (→ null). */
  async _waitStream(pred, timeoutMs, interval = 250) {
    const t0 = Date.now()
    while (Date.now() - t0 < timeoutMs) {
      try {
        const s = await this._call('GetStreamStatus')
        if (pred(s)) return s
      } catch {
        /* transient */
      }
      await new Promise((r) => setTimeout(r, interval))
    }
    return null
  }

  _stopped(s) {
    return !s.outputActive && !s.outputReconnecting
  }

  /**
   * Start streaming and VERIFY data is flowing. OBS can enter a dead start
   * right after boot (output active, encoder up, but 0 kbps sent — YouTube
   * shows "no data"). Detect it and auto-reset once instead of leaving the
   * trader staring at a fake "live".
   */
  async startStreaming() {
    // If a previous stream is still tearing down (stop → immediate re-start),
    // wait it out instead of erroring.
    const cur = await this._call('GetStreamStatus').catch(() => null)
    if (cur?.outputActive) {
      await this._call('StopStream').catch(() => {})
      await this._waitStream((s) => this._stopped(s), 8000)
    }
    this._lastStats = null

    for (let attempt = 0; attempt < 2; attempt++) {
      await this._call('StartStream')
      const active = await this._waitStream((s) => s.outputActive, 10000)
      const sending = active && (await this._waitStream((s) => s.outputBytes > 0, 8000, 500))
      if (sending) return { ok: true, retried: attempt > 0 }
      // Dead start — reset the output and try once more.
      await this._call('StopStream').catch(() => {})
      await this._waitStream((s) => this._stopped(s), 8000)
    }
    throw new Error('Stream connected but no data was sent. Check your stream key, then try again.')
  }

  async stopStreaming() {
    try {
      await this._call('StopStream')
    } catch {
      /* may already be stopped */
    }
    await this._waitStream((s) => this._stopped(s), 8000)
    this._lastStats = null
    return { ok: true }
  }

  async startRecording() {
    await this._call('StartRecord')
    return { ok: true }
  }

  async stopRecording() {
    try {
      const { outputPath } = await this._call('StopRecord')
      return { ok: true, outputPath }
    } catch {
      return { ok: true }
    }
  }

  /** Live streaming stats (for the app's health indicator + stats bar). */
  async getStats() {
    const s = await this._call('GetStreamStatus')
    // Derive live bitrate + fps from the deltas between polls, so the app can
    // show real numbers instead of placeholders.
    const now = Date.now()
    let bitrateKbps = 0
    let fps = 0
    if (this._lastStats && s.outputActive) {
      const dt = (now - this._lastStats.t) / 1000
      if (dt > 0.2) {
        bitrateKbps = Math.max(0, Math.round(((s.outputBytes - this._lastStats.bytes) * 8) / 1000 / dt))
        fps = Math.max(0, Math.round((s.outputTotalFrames - this._lastStats.frames) / dt))
      }
    }
    this._lastStats = { t: now, bytes: s.outputBytes || 0, frames: s.outputTotalFrames || 0 }
    return {
      streaming: s.outputActive,
      congestion: s.outputCongestion, // 0..1 — our "health" signal
      skippedFrames: s.outputSkippedFrames,
      totalFrames: s.outputTotalFrames,
      bytes: s.outputBytes,
      durationMs: s.outputDuration,
      bitrateKbps,
      fps
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
