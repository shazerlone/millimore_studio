import { QUALITY_DIMS } from './quality'

/**
 * StreamCompositor draws the screen capture and camera into a single canvas
 * (picture-in-picture), plus any active trade-card overlay, then ships raw RGBA
 * frames to the main process where FFmpeg encodes and fans them out to every
 * RTMP destination.
 *
 * The trade overlay is rendered by React in the preview; for the encoded output
 * we draw an offscreen DOM node onto the canvas via an Image snapshot. To keep
 * this dependency-free, overlay drawing is delegated through `drawOverlay`,
 * which the caller can supply.
 */
export class StreamCompositor {
  constructor({ quality = '1080p30', drawOverlay = null } = {}) {
    const dims = QUALITY_DIMS[quality] || QUALITY_DIMS['1080p30']
    this.width = dims.width
    this.height = dims.height
    this.fps = dims.fps
    this.drawOverlay = drawOverlay

    this.canvas = document.createElement('canvas')
    this.canvas.width = this.width
    this.canvas.height = this.height
    this.ctx = this.canvas.getContext('2d', { alpha: false, desynchronized: true })

    this.screenVideo = document.createElement('video')
    this.cameraVideo = document.createElement('video')
    this.screenVideo.muted = this.cameraVideo.muted = true

    this._raf = null
    this._interval = null
    this._running = false
  }

  /**
   * @param {string} screenSourceId  Electron desktopCapturer source id
   * @param {MediaStream} cameraStream  optional getUserMedia camera stream
   */
  async start(screenSourceId, cameraStream) {
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
      await this.cameraVideo.play()
    }

    this._running = true
    this._loop()
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
      this._emitFrame()
    }
    this._raf = requestAnimationFrame(render)
  }

  _drawFrame() {
    const { ctx, width, height } = this
    ctx.fillStyle = '#0B1220'
    ctx.fillRect(0, 0, width, height)

    // base layer: full-bleed screen capture
    if (this.screenVideo.readyState >= 2) {
      ctx.drawImage(this.screenVideo, 0, 0, width, height)
    }

    // PiP: camera bottom-right
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

    // trade overlay (caller-supplied painter)
    if (this.drawOverlay) this.drawOverlay(ctx, width, height)
  }

  _emitFrame() {
    const img = this.ctx.getImageData(0, 0, this.width, this.height)
    // Transfer the underlying buffer to the main process for FFmpeg's stdin.
    window.millimore?.stream.pushFrame(img.data.buffer)
  }

  stop() {
    this._running = false
    if (this._raf) cancelAnimationFrame(this._raf)
    this.screenStream?.getTracks().forEach((t) => t.stop())
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
