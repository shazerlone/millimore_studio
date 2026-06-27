import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import ffmpegStatic from 'ffmpeg-static'

// When packaged, ffmpeg-static's binary lives in app.asar.unpacked (see the
// `asarUnpack` rule in package.json) — the path it reports still points inside
// app.asar, so remap it to the unpacked, executable location.
const FFMPEG_PATH = (ffmpegStatic || '').replace('app.asar', 'app.asar.unpacked')

/**
 * RTMP ingest endpoints for every supported destination.
 * The trader's per-platform stream key is appended at runtime.
 */
export const RTMP_ENDPOINTS = {
  millimore: 'rtmp://stream.millimore.app/live/',
  youtube: 'rtmp://a.rtmp.youtube.com/live2/',
  instagram: 'rtmp://live-upload.instagram.com:80/live/',
  facebook: 'rtmps://live-api-s.facebook.com:443/rtmp/'
}

export const QUALITY_PRESETS = {
  '720p30': { width: 1280, height: 720, fps: 30, videoBitrate: '2500k', audioBitrate: '128k' },
  '1080p30': { width: 1920, height: 1080, fps: 30, videoBitrate: '4500k', audioBitrate: '160k' },
  '1080p60': { width: 1920, height: 1080, fps: 60, videoBitrate: '6000k', audioBitrate: '160k' }
}

/**
 * MultistreamEngine pipes a single encoded video/audio source out to several
 * RTMP destinations simultaneously using one FFmpeg process with a `tee` muxer,
 * which is far cheaper than encoding once per destination.
 *
 * The renderer composites screen + camera (PiP) on a canvas and feeds raw
 * frames in through `pushFrame`; FFmpeg encodes once and fans them out.
 */
export class MultistreamEngine extends EventEmitter {
  constructor() {
    super()
    this.proc = null
    this.live = false
    this.startedAt = null
    this.config = null
    this.userStopped = false
    this.reconnects = 0
    this.maxReconnects = 6
    this._stability = { lowSince: null }
  }

  get isLive() {
    return this.live
  }

  /**
   * The renderer compresses the composite (screen + camera + overlay + mic) with
   * MediaRecorder and streams WebM chunks over IPC. FFmpeg only has to remux (or
   * lightly transcode) those into RTMP and fan them out — far cheaper and lower
   * latency than shipping raw frames.
   *
   * @param {object} config
   * @param {string} config.quality      key of QUALITY_PRESETS
   * @param {Array<{platform:string, key:string}>} config.destinations
   * @param {boolean} [config.videoCopy] true if the WebM video is already H.264
   *                                     (so we can stream-copy instead of re-encoding)
   */
  start(config) {
    if (this.live) throw new Error('Stream already running')
    const targets = this._buildTargets(config.destinations)
    if (targets.length === 0) throw new Error('No valid stream destinations')

    this.config = config
    this.userStopped = false
    this._stability = { lowSince: null }

    this._spawn()

    this.live = true
    this.startedAt = Date.now()
    this.emit('status', {
      state: 'live',
      destinations: targets.length,
      quality: config.quality
    })
    return { ok: true, destinations: targets.length }
  }

  /** Build the FFmpeg arg list for the current config and spawn the process. */
  _spawn() {
    const config = this.config
    const preset = QUALITY_PRESETS[config.quality] || QUALITY_PRESETS['1080p30']
    const targets = this._buildTargets(config.destinations)
    const teeOutput = targets.map((url) => `[f=flv:onfail=ignore]${url}`).join('|')

    // Video: copy if the browser already encoded H.264, otherwise transcode.
    const videoArgs = config.videoCopy
      ? ['-c:v', 'copy']
      : [
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-tune', 'zerolatency',
          '-pix_fmt', 'yuv420p',
          '-b:v', preset.videoBitrate,
          '-maxrate', preset.videoBitrate,
          '-bufsize', preset.videoBitrate,
          '-g', String(preset.fps * 2)
        ]

    const args = [
      '-fflags', '+genpts',
      '-i', 'pipe:0', // fragmented WebM from MediaRecorder
      ...videoArgs,
      // RTMP requires AAC audio; MediaRecorder gives us Opus, so always encode.
      '-c:a', 'aac',
      '-b:a', preset.audioBitrate,
      '-ar', '48000',
      '-f', 'tee',
      '-map', '0:v:0',
      '-map', '0:a:0?',
      teeOutput
    ]

    this.proc = spawn(FFMPEG_PATH, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    // Swallow EPIPE: when FFmpeg exits, in-flight chunk writes would otherwise
    // throw an uncaught exception and crash the main process.
    this.proc.stdin.on('error', () => {})
    this.proc.stderr.on('data', (chunk) => this._parseStats(chunk.toString()))
    this.proc.on('error', (err) => this.emit('status', { state: 'error', message: err.message }))
    this.proc.on('close', (code) => this._onClose(code))
  }

  _onClose(code) {
    this.proc = null
    this.live = false
    if (this.userStopped) {
      this.emit('status', { state: 'stopped', code })
    } else {
      this.emit('status', {
        state: 'failed',
        code,
        message: 'The stream stopped unexpectedly. Check your connection and stream keys, then go live again.'
      })
    }
  }

  /** Write a WebM chunk from the renderer's MediaRecorder to FFmpeg's stdin. */
  pushChunk(buffer) {
    const stdin = this.proc?.stdin
    if (this.live && stdin && stdin.writable) {
      try {
        stdin.write(Buffer.from(buffer))
      } catch {
        /* EPIPE on shutdown — ignore */
      }
    }
  }

  stop() {
    this.userStopped = true
    if (!this.proc) {
      this.live = false
      return { ok: true }
    }
    try {
      this.proc.stdin.end()
    } catch {
      /* stdin may already be closed */
    }
    this.proc.kill('SIGINT')
    this.live = false
    this.startedAt = null
    return { ok: true }
  }

  _buildTargets(destinations = []) {
    return destinations
      .filter((d) => d.platform === 'millimore' || (d.key && d.key.trim()))
      .map((d) => {
        const base = RTMP_ENDPOINTS[d.platform]
        if (!base) return null
        return `${base}${(d.key || '').trim()}`
      })
      .filter(Boolean)
  }

  /** Parse FFmpeg's stderr progress lines into structured live stats. */
  _parseStats(line) {
    const fps = line.match(/fps=\s*([\d.]+)/)
    const bitrate = line.match(/bitrate=\s*([\d.]+)\s*kbits/)
    const frame = line.match(/frame=\s*(\d+)/)
    const dropped = line.match(/drop=\s*(\d+)/)
    if (fps || bitrate) {
      const bitrateKbps = bitrate ? Number(bitrate[1]) : null
      this.emit('stats', {
        fps: fps ? Number(fps[1]) : null,
        bitrateKbps,
        frames: frame ? Number(frame[1]) : null,
        dropped: dropped ? Number(dropped[1]) : 0,
        uptimeMs: this.startedAt ? Date.now() - this.startedAt : 0
      })
      this._checkStability(bitrateKbps)
    }
  }

  /**
   * Watch the live bitrate against the target. If it stays well below target
   * for a sustained window the upload is struggling — recommend the next lower
   * quality preset so the renderer/UI can offer (or auto-apply) a downgrade.
   */
  _checkStability(bitrateKbps) {
    if (!bitrateKbps || !this.config) return
    const preset = QUALITY_PRESETS[this.config.quality] || QUALITY_PRESETS['1080p30']
    const targetKbps = parseInt(preset.videoBitrate, 10)
    const struggling = bitrateKbps < targetKbps * 0.6

    if (struggling) {
      if (!this._stability.lowSince) this._stability.lowSince = Date.now()
      // Sustained for 8s → recommend a downgrade.
      if (Date.now() - this._stability.lowSince > 8000) {
        const order = ['1080p60', '1080p30', '720p30']
        const idx = order.indexOf(this.config.quality)
        const downgrade = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null
        this.emit('status', {
          state: 'unstable',
          measuredKbps: Math.round(bitrateKbps),
          targetKbps,
          recommend: downgrade
        })
        this._stability.lowSince = Date.now() // throttle repeat warnings
      }
    } else {
      this._stability.lowSince = null
    }
  }
}

/**
 * Lightweight bandwidth probe used to recommend a quality preset before going
 * live. Downloads a small payload and measures throughput. Returns the
 * recommended preset key plus the measured Mbps.
 */
export async function testConnectionSpeed() {
  const SAMPLE_BYTES = 2_000_000 // ~2 MB
  const url = 'https://speed.cloudflare.com/__down?bytes=' + SAMPLE_BYTES
  const start = Date.now()
  try {
    const res = await fetch(url)
    await res.arrayBuffer()
    const seconds = (Date.now() - start) / 1000
    const mbps = (SAMPLE_BYTES * 8) / 1_000_000 / seconds
    let recommended = '720p30'
    if (mbps > 12) recommended = '1080p60'
    else if (mbps > 7) recommended = '1080p30'
    return { mbps: Number(mbps.toFixed(1)), recommended }
  } catch {
    // Conservative fallback when the probe is unreachable.
    return { mbps: null, recommended: '720p30' }
  }
}
