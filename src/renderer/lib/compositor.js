import { QUALITY_DIMS } from './quality'
import { paintOverlay } from './overlayPainter'

const BITRATES = { '720p30': 3_500_000, '1080p30': 6_000_000, '1080p60': 9_000_000 }

// Preferred MediaRecorder formats. H.264 lets FFmpeg stream-copy (lowest CPU /
// latency); VP9/VP8 fall back to a light transcode.
const MIME_PREFS = [
  'video/webm;codecs=h264,opus',
  'video/webm;codecs=h264',
  'video/x-matroska;codecs=avc1,opus',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
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
 * StreamCompositor draws the screen capture, camera (picture-in-picture) and the
 * Millimore overlay into a single canvas, captures that canvas as a MediaStream,
 * and uses MediaRecorder to hardware-encode it to a compressed WebM stream. The
 * compressed chunks are shipped to the main process for FFmpeg to remux to RTMP.
 *
 * This compresses in the renderer instead of shipping raw frames over IPC, which
 * is the difference between a smooth low-latency stream and a stuttering one.
 */
export class StreamCompositor {
  constructor({ quality = '1080p30', getOverlay = null } = {}) {
    const dims = QUALITY_DIMS[quality] || QUALITY_DIMS['1080p30']
    this.width = dims.width
    this.height = dims.height
    this.fps = dims.fps
    this.bitrate = BITRATES[quality] || 4_500_000
    this.getOverlay = getOverlay

    this.canvas = document.createElement('canvas')
    this.canvas.width = this.width
    this.canvas.height = this.height
    this.ctx = this.canvas.getContext('2d', { alpha: false, desynchronized: true })

    this.screenVideo = document.createElement('video')
    this.cameraVideo = document.createElement('video')
    this.screenVideo.muted = this.cameraVideo.muted = true

    this._timer = null
    this._running = false
    this.recorder = null
    this._videoCopy = false
  }

  /**
   * Acquire the screen, wire up the canvas capture + recorder, and report whether
   * the chosen codec lets FFmpeg stream-copy. Call beginRecording() once the
   * FFmpeg engine is ready to receive chunks.
   *
   * @param {string} screenSourceId Electron desktopCapturer source id
   * @param {MediaStream} cameraStream camera + mic stream (audio is muxed in)
   */
  async prepare(screenSourceId, cameraStream) {
    this.screenStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: screenSourceId,
          maxWidth: this.width,
          maxHeight: this.height,
          maxFrameRate: this.fps
        }
      }
    })
    this.screenVideo.srcObject = this.screenStream
    await this.screenVideo.play()

    if (cameraStream) {
      this.cameraVideo.srcObject = cameraStream
      await this.cameraVideo.play().catch(() => {})
    }

    this._running = true
    this._loop()

    // Build the output stream: composited canvas video + the mic audio track.
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
    return { videoCopy: this._videoCopy, mime }
  }

  /** Start emitting chunks (call after the engine is listening). */
  beginRecording(timesliceMs = 250) {
    if (this.recorder && this.recorder.state === 'inactive') {
      this.recorder.start(timesliceMs)
    }
  }

  _loop() {
    // A timer (not requestAnimationFrame) keeps painting at full rate even when
    // the window is in the background — rAF pauses when the page is occluded,
    // which would freeze the broadcast the moment the trader switches apps.
    const frameMs = 1000 / this.fps
    this._timer = setInterval(() => {
      if (this._running) this._drawFrame()
    }, frameMs)
  }

  _drawFrame() {
    const { ctx, width, height } = this
    ctx.fillStyle = '#0B1220'
    ctx.fillRect(0, 0, width, height)

    if (this.screenVideo.readyState >= 2) {
      ctx.drawImage(this.screenVideo, 0, 0, width, height)
    }

    if (this.cameraVideo.readyState >= 2) {
      const cam = this.getOverlay?.()?.config?.camera || { shape: 'rectangle', x: 0.71, y: 0.68, w: 0.26 }
      const isRound = cam.shape === 'square' || cam.shape === 'circle'
      const camW = Math.round(width * cam.w)
      const camH = Math.round(isRound ? camW : camW * 0.75)
      const x = Math.round(cam.x * width)
      const y = Math.round(cam.y * height)

      ctx.save()
      this._cameraClip(ctx, cam.shape, x, y, camW, camH)
      ctx.clip()
      // cover-fit the camera into the shape box
      drawCover(ctx, this.cameraVideo, x, y, camW, camH)
      ctx.restore()
      ctx.lineWidth = Math.max(2, width * 0.0016)
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      this._cameraClip(ctx, cam.shape, x, y, camW, camH)
      ctx.stroke()
    }

    if (this.getOverlay) {
      try {
        paintOverlay(ctx, width, height, this.getOverlay(), performance.now())
      } catch (err) {
        console.error('Overlay paint error:', err)
      }
    }
  }

  /** Build the clip path for the camera box based on its shape. */
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

  stop() {
    this._running = false
    if (this._timer) clearInterval(this._timer)
    try {
      if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop()
    } catch {
      /* already stopped */
    }
    // Stop the screen capture and the composited video track, but leave the mic
    // track alone — it's owned by the caller's camera stream.
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

/** Draw a video into a box with object-fit: cover (center-crop). */
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
