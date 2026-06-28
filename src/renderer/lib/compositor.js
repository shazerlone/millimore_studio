import { QUALITY_DIMS } from './quality'
import { paintOverlay } from './overlayPainter'

const BITRATES = { '720p30': 3_500_000, '1080p30': 6_000_000, '1080p60': 9_000_000 }

// H.264 codec strings (constrained baseline — low-latency, widely accepted).
const AVC_CODEC = {
  '720p30': 'avc1.42E01F', // level 3.1
  '1080p30': 'avc1.42E028', // level 4.0
  '1080p60': 'avc1.42E02A' // level 4.2
}

// MediaRecorder fallback (only if WebCodecs is unavailable). Always audio-inclusive.
const MIME_PREFS = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm']

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
 * StreamCompositor composites the scene (camera-only, or screen + camera PiP) and
 * the overlay onto a canvas, then encodes it ONCE.
 *
 * Primary path (OBS-style): WebCodecs VideoEncoder hardware-encodes the canvas to
 * H.264 with a fixed keyframe interval and constant bitrate; the microphone is
 * captured as raw PCM. FFmpeg only *copies* the video and encodes audio to AAC —
 * no video re-encode, so it's fast and the bitrate stays healthy.
 *
 * Fallback path: MediaRecorder → WebM → FFmpeg transcode (older runtimes).
 */
export class StreamCompositor {
  constructor({ quality = '1080p30', getOverlay = null, onThumbnail = null } = {}) {
    const dims = QUALITY_DIMS[quality] || QUALITY_DIMS['1080p30']
    this.quality = quality
    this.width = dims.width
    this.height = dims.height
    this.fps = dims.fps
    this.bitrate = BITRATES[quality] || 6_000_000
    this.getOverlay = getOverlay
    this.onThumbnail = onThumbnail
    this.useWebCodecs = typeof window !== 'undefined' && typeof window.VideoEncoder !== 'undefined'

    this.canvas = document.createElement('canvas')
    this.canvas.width = this.width
    this.canvas.height = this.height
    this.ctx = this.canvas.getContext('2d', { alpha: false, desynchronized: true })

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
    this._thumbEnabled = false
    this._running = false
    this._encoding = false
    this._frameIndex = 0

    // encoders
    this.videoEncoder = null
    this.recorder = null
    this.audioCtx = null
    this.audioNode = null
  }

  setThumbnailEnabled(on) {
    this._thumbEnabled = !!on
  }

  /** Set up camera + canvas loop + the encoder. Returns the chosen mode. */
  async prepare(cameraStream) {
    this.cameraStream = cameraStream || null
    if (cameraStream) {
      this.cameraVideo.srcObject = cameraStream
      await this.cameraVideo.play().catch(() => {})
    }
    this._running = true
    this._loop()

    if (this.onThumbnail) {
      this._thumbTimer = setInterval(() => {
        if (this._thumbEnabled) this._emitThumb()
      }, 500)
    }

    const hasAudio = !!cameraStream?.getAudioTracks?.().length
    if (this.useWebCodecs) {
      try {
        this._setupVideoEncoder()
        return { mode: 'webcodecs', audio: hasAudio }
      } catch (err) {
        console.error('WebCodecs unavailable, falling back to MediaRecorder:', err)
        this.useWebCodecs = false
      }
    }
    this._setupRecorder(cameraStream)
    return { mode: 'mediarecorder', audio: hasAudio }
  }

  _setupVideoEncoder() {
    const codec = AVC_CODEC[this.quality] || AVC_CODEC['1080p30']
    this.videoEncoder = new VideoEncoder({
      output: (chunk) => {
        const buf = new ArrayBuffer(chunk.byteLength)
        chunk.copyTo(buf)
        window.millimore?.stream.pushChunk(buf)
      },
      error: (e) => console.error('VideoEncoder error:', e)
    })
    this.videoEncoder.configure({
      codec,
      width: this.width,
      height: this.height,
      framerate: this.fps,
      bitrate: this.bitrate,
      bitrateMode: 'constant',
      latencyMode: 'realtime',
      avc: { format: 'annexb' }
    })
  }

  _setupRecorder(cameraStream) {
    this.outStream = this.canvas.captureStream(this.fps)
    const micTrack = cameraStream?.getAudioTracks?.()[0]
    if (micTrack) this.outStream.addTrack(micTrack)
    const mime = pickMime()
    this.recorder = new MediaRecorder(this.outStream, {
      mimeType: mime || undefined,
      videoBitsPerSecond: this.bitrate,
      audioBitsPerSecond: 160_000
    })
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) e.data.arrayBuffer().then((b) => window.millimore?.stream.pushChunk(b))
    }
  }

  /** Begin emitting encoded data (call once FFmpeg is ready). */
  beginRecording(timesliceMs = 200) {
    if (this.useWebCodecs) {
      this._encoding = true
      this._startAudioPCM()
    } else if (this.recorder && this.recorder.state === 'inactive') {
      this.recorder.start(timesliceMs)
    }
  }

  /** Capture the microphone as 48kHz stereo s16le PCM for FFmpeg (fd 3). */
  _startAudioPCM() {
    const track = this.cameraStream?.getAudioTracks?.()[0]
    if (!track) return
    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 })
      const src = this.audioCtx.createMediaStreamSource(new MediaStream([track]))
      const node = this.audioCtx.createScriptProcessor(2048, 1, 1)
      node.onaudioprocess = (e) => {
        if (!this._encoding) return
        const input = e.inputBuffer.getChannelData(0)
        const pcm = new Int16Array(input.length * 2)
        for (let i = 0; i < input.length; i++) {
          let s = Math.max(-1, Math.min(1, input[i]))
          s = s < 0 ? s * 0x8000 : s * 0x7fff
          pcm[i * 2] = s
          pcm[i * 2 + 1] = s
        }
        window.millimore?.stream.pushAudio(pcm.buffer)
      }
      const sink = this.audioCtx.createGain()
      sink.gain.value = 0
      src.connect(node)
      node.connect(sink)
      sink.connect(this.audioCtx.destination)
      this.audioNode = node
    } catch (err) {
      console.error('Audio capture error:', err)
    }
  }

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

  setCameraStream(cameraStream) {
    if (!cameraStream) return
    this.cameraStream = cameraStream
    this.cameraVideo.srcObject = cameraStream
    this.cameraVideo.play().catch(() => {})
  }

  _loop() {
    const frameMs = 1000 / this.fps
    this._timer = setInterval(() => {
      if (!this._running) return
      this._drawFrame()
      if (this._encoding && this.videoEncoder) this._encodeFrame()
    }, frameMs)
  }

  _encodeFrame() {
    // Drop frames if the encoder is backed up (keeps latency/memory in check).
    if (this.videoEncoder.encodeQueueSize > 2) return
    let frame
    try {
      const ts = Math.round((this._frameIndex * 1e6) / this.fps)
      frame = new VideoFrame(this.canvas, { timestamp: ts })
      const keyFrame = this._frameIndex % (this.fps * 2) === 0 // 2s GOP
      this.videoEncoder.encode(frame, { keyFrame })
      this._frameIndex++
    } catch (err) {
      console.error('encodeFrame error:', err)
    } finally {
      if (frame) frame.close()
    }
  }

  _drawFrame() {
    const { ctx, width, height } = this
    ctx.fillStyle = '#0B1220'
    ctx.fillRect(0, 0, width, height)

    const screenReady = this.hasScreen && this.screenVideo.readyState >= 2
    if (screenReady) {
      drawContain(ctx, this.screenVideo, 0, 0, width, height)
      if (this.cameraVideo.readyState >= 2) this._drawCameraPiP()
    } else if (this.cameraVideo.readyState >= 2) {
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

  async stop() {
    this._running = false
    this._encoding = false
    if (this._timer) clearInterval(this._timer)
    if (this._thumbTimer) clearInterval(this._thumbTimer)
    try {
      if (this.videoEncoder && this.videoEncoder.state !== 'closed') {
        await this.videoEncoder.flush().catch(() => {})
        this.videoEncoder.close()
      }
    } catch {
      /* ignore */
    }
    try {
      if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop()
    } catch {
      /* ignore */
    }
    try {
      this.audioNode?.disconnect()
      await this.audioCtx?.close()
    } catch {
      /* ignore */
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
  ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, dx, dy, dw, dh)
}

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
