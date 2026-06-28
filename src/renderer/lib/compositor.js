import { QUALITY_DIMS } from './quality'
import { paintOverlay } from './overlayPainter'

const BITRATES = { '720p30': 3_500_000, '1080p30': 6_000_000, '1080p60': 9_000_000 }

// Every preferred type includes an audio codec (opus) — a video-only MIME would
// silently drop the microphone, which is exactly what broke YouTube audio.
// H.264 first so MediaRecorder uses the Mac's hardware encoder (light CPU).
const MIME_PREFS = [
  'video/webm;codecs=h264,opus',
  'video/x-matroska;codecs=avc1,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9,opus',
  'video/webm'
]

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const m of MIME_PREFS) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m
    } catch {
      /* ignore */
    }
  }
  return ''
}

/**
 * StreamCompositor draws the scene (camera-only, or screen + camera PiP) plus the
 * Millimore overlay into a canvas, captures it as a MediaStream and encodes it
 * with MediaRecorder. What's drawn matches the in-app preview exactly:
 *   - no screen shared  → the camera fills the frame
 *   - screen shared     → screen is the base layer, camera is a shaped PiP
 * The screen source can be set/changed/cleared live without restarting.
 */
export class StreamCompositor {
  constructor({ quality = '1080p30', getOverlay = null, onThumbnail = null } = {}) {
    const dims = QUALITY_DIMS[quality] || QUALITY_DIMS['1080p30']
    this.width = dims.width
    this.height = dims.height
    this.fps = dims.fps
    this.bitrate = BITRATES[quality] || 6_000_000
    this.getOverlay = getOverlay
    this.onThumbnail = onThumbnail

    this.canvas = document.createElement('canvas')
    this.canvas.width = this.width
    this.canvas.height = this.height
    this.ctx = this.canvas.getContext('2d', { alpha: false, desynchronized: true })

    // Small offscreen canvas for the monitor preview thumbnail.
    this.thumb = document.createElement('canvas')
    this.thumb.width = 320
    this.thumb.height = 180
    this.thumbCtx = this.thumb.getContext('2d')

    this.screenVideo = document.createElement('video')
    this.cameraVideo = document.createElement('video')
    this.screenVideo.muted = this.cameraVideo.muted = true

    this.screenStream = null
    this.hasScreen = false
    this._timer = null
    this._thumbTimer = null
    this._running = false
    this.recorder = null
    this._videoCopy = false
  }

  /** Set up the camera + canvas capture + recorder. Screen is optional/added later. */
  async prepare(cameraStream) {
    if (cameraStream) {
      this.cameraVideo.srcObject = cameraStream
      await this.cameraVideo.play().catch(() => {})
    }

    this._running = true
    this._loop()

    this.outStream = this.canvas.captureStream(this.fps)
    const micTrack = cameraStream?.getAudioTracks?.()[0]
    if (micTrack) this.outStream.addTrack(micTrack)

    const mime = pickMime()
    this._videoCopy = mime.includes('h264') || mime.includes('avc1')
    this.recorder = new MediaRecorder(this.outStream, {
      mimeType: mime || undefined,
      videoBitsPerSecond: this.bitrate,
      audioBitsPerSecond: 160_000
    })
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        e.data.arrayBuffer().then((buf) => window.millimore?.stream.pushChunk(buf))
      }
    }

    if (this.onThumbnail) {
      this._thumbTimer = setInterval(() => this._emitThumb(), 500)
    }

    return { videoCopy: this._videoCopy, mime }
  }

  /** Acquire / replace / clear the screen source — works live. */
  async setScreenSource(sourceId) {
    this.screenStream?.getTracks().forEach((t) => t.stop())
    this.screenStream = null
    this.screenVideo.srcObject = null
    this.hasScreen = false
    if (!sourceId) return

    this.screenStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          maxWidth: this.width,
          maxHeight: this.height,
          maxFrameRate: this.fps
        }
      }
    })
    this.screenVideo.srcObject = this.screenStream
    await this.screenVideo.play().catch(() => {})
    this.hasScreen = true
  }

  /** Swap the camera stream live (e.g. device change). */
  setCameraStream(cameraStream) {
    if (!cameraStream) return
    this.cameraVideo.srcObject = cameraStream
    this.cameraVideo.play().catch(() => {})
  }

  beginRecording(timesliceMs = 250) {
    if (this.recorder && this.recorder.state === 'inactive') this.recorder.start(timesliceMs)
  }

  _loop() {
    const frameMs = 1000 / this.fps
    this._timer = setInterval(() => {
      if (this._running) this._drawFrame()
    }, frameMs)
  }

  _drawFrame() {
    const { ctx, width, height } = this
    ctx.fillStyle = '#0B1220'
    ctx.fillRect(0, 0, width, height)

    const screenReady = this.hasScreen && this.screenVideo.readyState >= 2

    if (screenReady) {
      // screen base (contain to avoid distortion) + camera PiP
      drawContain(ctx, this.screenVideo, 0, 0, width, height)
      if (this.cameraVideo.readyState >= 2) this._drawCameraPiP()
    } else if (this.cameraVideo.readyState >= 2) {
      // camera-only: fill the frame (matches the preview)
      drawCover(ctx, this.cameraVideo, 0, 0, width, height)
    }

    if (this.getOverlay) {
      try {
        paintOverlay(ctx, width, height, this.getOverlay(), performance.now())
      } catch (err) {
        console.error('Overlay paint error:', err)
      }
    }
  }

  _drawCameraPiP() {
    const cam = this.getOverlay?.()?.config?.camera || { shape: 'rectangle', x: 0.71, y: 0.68, w: 0.26 }
    const isRound = cam.shape === 'square' || cam.shape === 'circle'
    const camW = Math.round(this.width * cam.w)
    const camH = Math.round(isRound ? camW : camW * 0.75)
    const x = Math.round(cam.x * this.width)
    const y = Math.round(cam.y * this.height)
    const ctx = this.ctx
    ctx.save()
    this._cameraClip(ctx, cam.shape, x, y, camW, camH)
    ctx.clip()
    drawCover(ctx, this.cameraVideo, x, y, camW, camH)
    ctx.restore()
    ctx.lineWidth = Math.max(2, this.width * 0.0016)
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    this._cameraClip(ctx, cam.shape, x, y, camW, camH)
    ctx.stroke()
  }

  _cameraClip(ctx, shape, x, y, w, h) {
    if (shape === 'circle' || shape === 'oval') {
      ctx.beginPath()
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
      ctx.closePath()
    } else {
      const r = Math.min(w, h) * (shape === 'square' ? 0.12 : 0.08)
      roundRect(ctx, x, y, w, h, r)
    }
  }

  _emitThumb() {
    try {
      this.thumbCtx.drawImage(this.canvas, 0, 0, this.thumb.width, this.thumb.height)
      this.onThumbnail(this.thumb.toDataURL('image/jpeg', 0.5))
    } catch {
      /* ignore */
    }
  }

  stop() {
    this._running = false
    if (this._timer) clearInterval(this._timer)
    if (this._thumbTimer) clearInterval(this._thumbTimer)
    try {
      if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop()
    } catch {
      /* already stopped */
    }
    this.screenStream?.getTracks().forEach((t) => t.stop())
    this.outStream?.getVideoTracks().forEach((t) => t.stop())
    this.screenVideo.srcObject = null
    this.cameraVideo.srcObject = null
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** object-fit: cover (center-crop). */
function drawCover(ctx, video, dx, dy, dw, dh) {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) {
    ctx.drawImage(video, dx, dy, dw, dh)
    return
  }
  const scale = Math.max(dw / vw, dh / vh)
  const sw = dw / scale
  const sh = dh / scale
  const sx = (vw - sw) / 2
  const sy = (vh - sh) / 2
  ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh)
}

/** object-fit: contain (letterbox), so a captured screen isn't distorted. */
function drawContain(ctx, video, dx, dy, dw, dh) {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) {
    ctx.drawImage(video, dx, dy, dw, dh)
    return
  }
  const scale = Math.min(dw / vw, dh / vh)
  const w = vw * scale
  const h = vh * scale
  ctx.drawImage(video, dx + (dw - w) / 2, dy + (dh - h) / 2, w, h)
}
