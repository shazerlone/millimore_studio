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

    this._raf = null
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
    const frameMs = 1000 / this.fps
    let last = 0
    const render = (t) => {
      if (!this._running) return
      this._raf = requestAnimationFrame(render)
      if (t - last < frameMs) return
      last = t
      this._drawFrame()
    }
    this._raf = requestAnimationFrame(render)
  }

  _drawFrame() {
    const { ctx, width, height } = this
    ctx.fillStyle = '#0B1220'
    ctx.fillRect(0, 0, width, height)

    if (this.screenVideo.readyState >= 2) {
      ctx.drawImage(this.screenVideo, 0, 0, width, height)
    }

    if (this.cameraVideo.readyState >= 2) {
      const camW = Math.round(width * 0.26)
      const camH = Math.round(camW * 0.75)
      const x = width - camW - Math.round(width * 0.012)
      const y = height - camH - Math.round(height * 0.022)
      ctx.save()
      roundRect(ctx, x, y, camW, camH, 12)
      ctx.clip()
      ctx.drawImage(this.cameraVideo, x, y, camW, camH)
      ctx.restore()
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      roundRect(ctx, x, y, camW, camH, 12)
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

  stop() {
    this._running = false
    if (this._raf) cancelAnimationFrame(this._raf)
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
