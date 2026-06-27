import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import ffmpegStatic from 'ffmpeg-static'

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
  }

  get isLive() {
    return this.live
  }

  /**
   * @param {object} config
   * @param {string} config.quality   key of QUALITY_PRESETS
   * @param {Array<{platform:string, key:string}>} config.destinations
   */
  start(config) {
    if (this.live) throw new Error('Stream already running')

    const preset = QUALITY_PRESETS[config.quality] || QUALITY_PRESETS['1080p30']
    const targets = this._buildTargets(config.destinations)
    if (targets.length === 0) throw new Error('No valid stream destinations')

    const teeOutput = targets
      .map((url) => `[f=flv:onfail=ignore]${url}`)
      .join('|')

    const args = [
      // ---- raw RGBA video coming from the renderer canvas over stdin ----
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-s', `${preset.width}x${preset.height}`,
      '-r', String(preset.fps),
      '-i', 'pipe:0',
      // ---- audio (silent placeholder until a real mic source is wired) ----
      '-f', 'lavfi',
      '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      // ---- video encode (single encode, fanned out by tee) ----
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-pix_fmt', 'yuv420p',
      '-b:v', preset.videoBitrate,
      '-maxrate', preset.videoBitrate,
      '-bufsize', preset.videoBitrate,
      '-g', String(preset.fps * 2),
      // ---- audio encode ----
      '-c:a', 'aac',
      '-b:a', preset.audioBitrate,
      '-ar', '44100',
      // ---- fan-out ----
      '-f', 'tee',
      '-map', '0:v',
      '-map', '1:a',
      teeOutput
    ]

    this.proc = spawn(ffmpegStatic, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    this.live = true
    this.startedAt = Date.now()

    this.proc.stderr.on('data', (chunk) => this._parseStats(chunk.toString()))
    this.proc.on('error', (err) => {
      this.live = false
      this.emit('status', { state: 'error', message: err.message })
    })
    this.proc.on('close', (code) => {
      this.live = false
      this.proc = null
      this.emit('status', { state: 'stopped', code })
    })

    this.emit('status', {
      state: 'live',
      destinations: targets.length,
      quality: config.quality
    })
    return { ok: true, destinations: targets.length }
  }

  pushFrame(buffer) {
    if (this.live && this.proc?.stdin.writable) {
      this.proc.stdin.write(buffer)
    }
  }

  stop() {
    if (!this.proc) return { ok: true }
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
      this.emit('stats', {
        fps: fps ? Number(fps[1]) : null,
        bitrateKbps: bitrate ? Number(bitrate[1]) : null,
        frames: frame ? Number(frame[1]) : null,
        dropped: dropped ? Number(dropped[1]) : 0,
        uptimeMs: this.startedAt ? Date.now() - this.startedAt : 0
      })
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
