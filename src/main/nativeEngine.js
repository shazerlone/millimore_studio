import { spawn, execFile, execFileSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import ffmpegStatic from 'ffmpeg-static'
import { encoderArgs, RTMP_ENDPOINTS, QUALITY_PRESETS } from './ffmpeg.js'

const FFMPEG = (ffmpegStatic || '').replace('app.asar', 'app.asar.unpacked')

/**
 * Pick the hardware encoder by PROBING (actually encoding a few frames), not
 * by trusting `-encoders` — FFmpeg lists every compiled-in encoder even when
 * the hardware isn't present (e.g. h264_nvenc with no NVIDIA GPU), which then
 * fails at open time and kills the stream.
 */
let _probedEncoder = null
export function probeEncoder() {
  if (_probedEncoder) return _probedEncoder
  const candidates =
    process.platform === 'darwin'
      ? ['h264_videotoolbox']
      : process.platform === 'win32'
        ? ['h264_nvenc', 'h264_qsv', 'h264_amf']
        : []
  for (const enc of candidates) {
    try {
      // Probe with the SAME flags we stream with (e.g. -allow_sw for
      // VideoToolbox) and a realistic frame size — a bare/tiny probe can fail
      // on encoders that would work fine in production.
      execFileSync(
        FFMPEG,
        ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=640x360:r=30', '-frames:v', '5', ...encoderArgs(enc), '-b:v', '1500k', '-f', 'null', '-'],
        { timeout: 20000, stdio: 'ignore' }
      )
      _probedEncoder = enc
      return enc
    } catch {
      /* not usable on this machine — try the next */
    }
  }
  _probedEncoder = 'libx264'
  return _probedEncoder
}

// The overlay (trade card / ticker / watermark / scenes) is rendered by the
// app at this fixed size and composited over the video by the engine. 720p is
// plenty for text/cards and keeps the frame pipe cheap; FFmpeg scales it to
// the output resolution.
export const OVERLAY_W = 1280
export const OVERLAY_H = 720
export const OVERLAY_FPS = 12
const OVERLAY_FRAME_BYTES = OVERLAY_W * OVERLAY_H * 4

/**
 * Millimore Native Engine — our own streaming system, no OBS anywhere.
 *
 * One FFmpeg process does everything natively:
 *   screen (AVFoundation/gdigrab) + camera + mic  →  GPU/CPU composite
 *   (camera PiP + transparent overlay layer)      →  ONE hardware H.264
 *   encode (VideoToolbox/NVENC/…)                 →  tee → every RTMP
 *   destination simultaneously (+ optional local recording).
 *
 * Because it's a plain child process of Millimore: no second app, no windows,
 * no tray icons, no separate macOS permissions (TCC attributes the capture to
 * Millimore itself), ~0 extra install size, and real multistream via tee.
 *
 * The overlay is fed as raw RGBA frames on fd 3. The ENGINE owns the 12fps
 * pump timer and always repeats the latest frame, so a busy/paused renderer
 * can never stall the filter graph — the renderer just updates the snapshot
 * whenever something changes.
 */
export class NativeEngine extends EventEmitter {
  constructor() {
    super()
    this.proc = null
    this.live = false
    this.userStopped = false
    this._overlayFrame = Buffer.alloc(OVERLAY_FRAME_BYTES) // transparent
    this._pump = null
    this._progress = ''
    this._lastProgress = null
  }

  get isLive() {
    return this.live
  }

  /** List native capture devices (label + index) for this platform. */
  async listDevices() {
    if (process.platform === 'darwin') {
      const err = await new Promise((resolve) => {
        execFile(
          FFMPEG,
          ['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', ''],
          { timeout: 10000 },
          (_e, _stdout, stderr) => resolve(stderr || '') // exits non-zero by design
        )
      })
      const video = []
      const audio = []
      let section = null
      for (const line of err.split('\n')) {
        if (/video devices/i.test(line)) section = video
        else if (/audio devices/i.test(line)) section = audio
        else {
          const m = line.match(/\[(\d+)\]\s+(.+?)\s*$/)
          if (m && section) section.push({ index: Number(m[1]), label: m[2] })
        }
      }
      return { video, audio }
    }
    if (process.platform === 'win32') {
      const err = await new Promise((resolve) => {
        execFile(
          FFMPEG,
          ['-hide_banner', '-f', 'dshow', '-list_devices', 'true', '-i', 'dummy'],
          { timeout: 10000 },
          (_e, _stdout, stderr) => resolve(stderr || '')
        )
      })
      const video = []
      const audio = []
      for (const line of err.split('\n')) {
        const m = line.match(/"(.+)"\s+\((video|audio)\)/)
        if (m) (m[2] === 'video' ? video : audio).push({ index: null, label: m[1] })
      }
      return { video, audio }
    }
    return { video: [], audio: [] }
  }

  /** Fuzzy label match (browser labels carry suffixes like "(Built-in)"). */
  _match(list, label, fallback = null) {
    if (!label) return fallback
    const norm = (s) => String(s || '').toLowerCase().trim()
    const want = norm(label)
    const hit =
      list.find((d) => norm(d.label) === want) ||
      list.find((d) => want.includes(norm(d.label)) || norm(d.label).includes(want))
    return hit || fallback
  }

  /**
   * Go live.
   * @param {object} c
   * @param {string} c.quality              QUALITY_PRESETS key
   * @param {Array<{platform,key}>} c.destinations
   * @param {boolean} c.screenShared        capture the screen (camera becomes PiP)
   * @param {number} [c.screenIndex]        which display (0-based)
   * @param {string} [c.cameraLabel]        camera device name ('' → default)
   * @param {string} [c.micLabel]           microphone device name ('' → default)
   * @param {string} [c.recordPath]         optional local .mkv path
   */
  async start(c) {
    if (this.proc) throw new Error('Stream already running')
    const preset = QUALITY_PRESETS[c.quality] || QUALITY_PRESETS['720p30']
    const targets = (c.destinations || [])
      .filter((d) => RTMP_ENDPOINTS[d.platform] && (d.key || '').trim())
      .map((d) => RTMP_ENDPOINTS[d.platform] + d.key.trim())
    if (!targets.length) throw new Error('No stream destinations. Add at least one stream key.')

    const devices = await this.listDevices()
    const args = this._buildArgs(c, preset, devices, targets)

    this.userStopped = false
    this._progress = ''
    this._lastProgress = null
    this.emit('log', 'ffmpeg ' + args.join(' '))
    // fd3 = overlay RGBA in; stdout = progress; stderr = logs.
    this.proc = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe', 'pipe'] })
    this.proc.stdio[3].on('error', () => {})
    this.proc.stdout.on('data', (d) => this._onProgress(d.toString()))
    let errTail = ''
    this.proc.stderr.on('data', (d) => {
      const text = d.toString()
      errTail = (errTail + text).slice(-4000)
      this.emit('log', text.trim())
    })
    this.proc.on('error', (err) => this.emit('status', { state: 'error', message: err.message }))
    this.proc.on('close', (code) => {
      this._stopPump()
      this.proc = null
      const wasLive = this.live
      this.live = false
      if (this.userStopped) return this.emit('status', { state: 'stopped' })
      // Unexpected death — surface the tail of FFmpeg's log for diagnosis.
      this.emit('status', {
        state: wasLive ? 'stopped' : 'error',
        code,
        message: wasLive
          ? 'Stream ended unexpectedly.'
          : 'Could not start capture. ' + lastErrorLine(errTail)
      })
    })

    this._startPump()
    // Confirm data is actually flowing before declaring victory (progress
    // reports total_size growth once the muxer writes to the outputs).
    const ok = await this._waitForData(15000)
    if (!ok) {
      const tail = lastErrorLine(errTail)
      this.stop()
      // Work out WHICH capture device failed so the trader gets a fix, not a
      // riddle (probe each input separately after the main process is gone).
      await new Promise((r) => setTimeout(r, 600))
      const diag = await this._diagnose(c, devices).catch(() => '')
      throw new Error(diag || 'The stream did not start sending data. ' + tail)
    }
    this.live = true
    this.emit('status', { state: 'live', destinations: targets.length, quality: c.quality })
    return { ok: true, destinations: targets.length }
  }

  /** Build the full FFmpeg argument list for this platform + config. */
  _buildArgs(c, preset, devices, targets) {
    const { width: W, height: H, fps: FPS } = preset
    const args = ['-hide_banner', '-loglevel', 'warning', '-nostats', '-progress', 'pipe:1']
    const filters = []
    let vIn = 0 // index of the main video input
    let camIn = -1
    let audioMap = null
    let nextInput = 0

    if (process.platform === 'darwin') {
      const screens = devices.video.filter((d) => /capture screen/i.test(d.label))
      const cams = devices.video.filter((d) => !/capture screen/i.test(d.label))
      const cam = this._match(cams, c.cameraLabel, cams[0])
      const mic = this._match(devices.audio, c.micLabel, devices.audio[0])
      // avfoundation has no "default" keyword — if we can't resolve a mic,
      // stream video-only rather than passing a bogus device spec.
      const micIdx = mic ? mic.index : 'none'

      // NOTE: no -pixel_format — let avfoundation pick each device's native
      // format (forcing one errors out on devices that don't support it).
      if (c.screenShared) {
        const screen = screens[Math.min(c.screenIndex || 0, Math.max(screens.length - 1, 0))]
        if (!screen) throw new Error('NO_SCREEN')
        // Input 0: display (video) + mic (audio) in one avfoundation input.
        args.push(
          '-f', 'avfoundation',
          '-capture_cursor', '1',
          '-framerate', String(FPS),
          '-thread_queue_size', '1024',
          '-i', `${screen.index}:${micIdx}`
        )
        vIn = nextInput++
        if (mic) audioMap = `${vIn}:a`
        if (cam) {
          args.push('-f', 'avfoundation', '-thread_queue_size', '1024', '-i', `${cam.index}:none`)
          camIn = nextInput++
        }
      } else {
        if (!cam) throw new Error('No camera found')
        // Camera-only: camera (video) + mic (audio) in one input.
        args.push('-f', 'avfoundation', '-thread_queue_size', '1024', '-i', `${cam.index}:${micIdx}`)
        vIn = nextInput++
        if (mic) audioMap = `${vIn}:a`
      }
    } else if (process.platform === 'win32') {
      const cam = this._match(devices.video, c.cameraLabel, devices.video[0])
      const mic = this._match(devices.audio, c.micLabel, devices.audio[0])
      if (c.screenShared) {
        args.push('-f', 'gdigrab', '-framerate', String(FPS), '-thread_queue_size', '1024', '-i', 'desktop')
        vIn = nextInput++
        if (cam) {
          args.push('-f', 'dshow', '-thread_queue_size', '1024', '-i', `video=${cam.label}`)
          camIn = nextInput++
        }
      } else {
        if (!cam) throw new Error('No camera found')
        args.push('-f', 'dshow', '-thread_queue_size', '1024', '-i', `video=${cam.label}`)
        vIn = nextInput++
      }
      if (mic) {
        args.push('-f', 'dshow', '-thread_queue_size', '1024', '-i', `audio=${mic.label}`)
        audioMap = `${nextInput++}:a`
      }
    } else {
      // Linux (dev/testing): synthetic sources so the graph can be validated.
      args.push('-f', 'lavfi', '-i', `testsrc2=size=${W}x${H}:rate=${FPS}`)
      vIn = nextInput++
      args.push('-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100')
      audioMap = `${nextInput++}:a`
      if (c.screenShared) {
        args.push('-f', 'lavfi', '-i', `testsrc=size=640x360:rate=30`)
        camIn = nextInput++
      }
    }

    // Overlay layer: raw RGBA frames on fd 3, pumped by this process at a
    // steady OVERLAY_FPS so the graph can never starve.
    args.push(
      '-f', 'rawvideo',
      '-pixel_format', 'rgba',
      '-video_size', `${OVERLAY_W}x${OVERLAY_H}`,
      '-framerate', String(OVERLAY_FPS),
      '-thread_queue_size', '64',
      '-i', 'pipe:3'
    )
    const ovlIn = nextInput++

    // ---- composite graph ----
    // setpts=PTS-STARTPTS on EVERY branch: native capture stamps wall-clock
    // times while the overlay pipe starts at 0 — without rebasing to a common
    // zero, framesync waits forever trying to align them and the graph stalls.
    if (camIn >= 0) {
      // Screen fills the canvas; camera docks bottom-right (28% width).
      const pipW = Math.round(W * 0.28)
      const margin = Math.round(W * 0.02)
      filters.push(
        `[${vIn}:v]setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,fps=${FPS},format=yuv420p[scr]`,
        `[${camIn}:v]setpts=PTS-STARTPTS,scale=${pipW}:-2[cam]`,
        `[scr][cam]overlay=W-w-${margin}:H-h-${margin}[base]`
      )
    } else {
      filters.push(
        `[${vIn}:v]setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},format=yuv420p[base]`
      )
    }
    filters.push(`[${ovlIn}:v]setpts=PTS-STARTPTS,scale=${W}:${H}[ovl]`, `[base][ovl]overlay=0:0:format=auto[vout]`)
    if (audioMap) {
      // Rebase audio to zero too (it shares the capture wall-clock) and let
      // aresample absorb device-clock drift.
      filters.push(`[${audioMap}]asetpts=PTS-STARTPTS,aresample=async=1:first_pts=0[aout]`)
    }
    args.push('-filter_complex', filters.join(';'))

    // ---- encode once (hardware), tee everywhere ----
    const encoder = probeEncoder()
    this.emit('status', { state: 'encoder', encoder })
    let teeOutput = targets.map((url) => `[f=flv:onfail=ignore]${url}`).join('|')
    if (c.recordPath) {
      const rec = c.recordPath.replace(/\\/g, '/').replace(/:/g, '\\:')
      teeOutput += `|[f=matroska]${rec}`
    }
    args.push(
      '-map', '[vout]',
      ...(audioMap ? ['-map', '[aout]'] : []),
      ...encoderArgs(encoder),
      '-pix_fmt', 'yuv420p',
      '-r', String(FPS),
      '-vsync', 'cfr',
      '-g', String(FPS * 2),
      '-force_key_frames', 'expr:gte(t,n_forced*2)',
      '-b:v', preset.videoBitrate,
      '-maxrate', preset.videoBitrate,
      '-bufsize', preset.bufSize,
      '-c:a', 'aac',
      '-b:a', preset.audioBitrate,
      '-ar', '44100',
      '-flush_packets', '1',
      // tee slaves (matroska recording especially) need global codec headers.
      '-flags', '+global_header',
      '-f', 'tee',
      teeOutput
    )
    this._nominalKbps = (parseInt(preset.videoBitrate) || 0) + (parseInt(preset.audioBitrate) || 0)
    return args
  }

  /** Try one capture input alone for half a second; report its exact error. */
  _probeInput(inputArgs) {
    return new Promise((resolve) => {
      execFile(
        FFMPEG,
        ['-hide_banner', '-loglevel', 'error', ...inputArgs, '-t', '0.6', '-f', 'null', '-'],
        { timeout: 15000 },
        (e, _o, stderr) =>
          resolve({
            ok: !e,
            err: String(stderr || '').trim().split('\n').filter(Boolean).slice(-2).join(' ')
          })
      )
    })
  }

  /** Pinpoint which device (screen/camera/mic) macOS refused, with the fix. */
  async _diagnose(c, devices) {
    if (process.platform !== 'darwin') return ''
    const out = []
    const screens = devices.video.filter((d) => /capture screen/i.test(d.label))
    const cams = devices.video.filter((d) => !/capture screen/i.test(d.label))
    const cam = this._match(cams, c.cameraLabel, cams[0])
    const mic = this._match(devices.audio, c.micLabel, devices.audio[0])
    if (c.screenShared && screens[0]) {
      const r = await this._probeInput(['-f', 'avfoundation', '-framerate', '30', '-i', `${screens[0].index}:none`])
      if (!r.ok)
        out.push(
          `Screen capture failed — enable Screen Recording for Millimore in System Settings → Privacy & Security, then RESTART the app. (${r.err})`
        )
    }
    if (cam) {
      const r = await this._probeInput(['-f', 'avfoundation', '-i', `${cam.index}:none`])
      if (!r.ok)
        out.push(
          `Camera "${cam.label}" failed — enable Camera for Millimore in System Settings → Privacy & Security. (${r.err})`
        )
    }
    if (mic) {
      const r = await this._probeInput(['-f', 'avfoundation', '-i', `none:${mic.index}`])
      if (!r.ok)
        out.push(
          `Microphone "${mic.label}" failed — enable Microphone for Millimore in System Settings → Privacy & Security. (${r.err})`
        )
    }
    return out.join(' ')
  }

  /** Renderer pushes a new overlay snapshot (RGBA, OVERLAY_W×OVERLAY_H). */
  setOverlayFrame(buf) {
    if (buf && buf.byteLength === OVERLAY_FRAME_BYTES) {
      this._overlayFrame = Buffer.from(buf)
    }
  }

  _startPump() {
    this._stopPump()
    this._pump = setInterval(() => {
      const pipe = this.proc?.stdio?.[3]
      if (!pipe || pipe.destroyed) return
      // Drop the tick if FFmpeg is momentarily behind — never buffer unbounded.
      if (pipe.writableLength > OVERLAY_FRAME_BYTES * 2) return
      pipe.write(this._overlayFrame)
    }, 1000 / OVERLAY_FPS)
  }

  _stopPump() {
    clearInterval(this._pump)
    this._pump = null
  }

  /** Parse FFmpeg -progress key=value blocks into stats events. */
  _onProgress(text) {
    this._progress += text
    let idx
    while ((idx = this._progress.indexOf('progress=')) !== -1) {
      const end = this._progress.indexOf('\n', idx)
      if (end === -1) return
      const block = this._progress.slice(0, end)
      this._progress = this._progress.slice(end + 1)
      const get = (k) => {
        const m = block.match(new RegExp(`${k}=([^\\n]+)`))
        return m ? m[1].trim() : null
      }
      const now = Date.now()
      // NOTE: under the tee muxer total_size reports "N/A" — frames are the
      // reliable liveness signal, and bitrate falls back to the CBR target.
      const totalSize = Number(get('total_size')) || 0
      const fps = Number(get('fps')) || 0
      const speed = parseFloat(get('speed')) || 0
      const dropped = Number(get('drop_frames')) || 0
      const frames = Number(get('frame')) || 0
      let bitrateKbps = 0
      if (this._lastProgress) {
        const dt = (now - this._lastProgress.t) / 1000
        if (dt > 0.2 && totalSize > 0) {
          bitrateKbps = Math.max(0, Math.round(((totalSize - this._lastProgress.size) * 8) / 1000 / dt))
        } else if (frames > this._lastProgress.frames && speed > 0.9) {
          bitrateKbps = this._nominalKbps || 0 // CBR keeps us at target when healthy
        }
      }
      this._lastProgress = { t: now, size: totalSize, frames }
      this.emit('stats', {
        streaming: this.live,
        bitrateKbps,
        fps,
        speed, // <1.0 means the pipeline can't keep realtime — our congestion signal
        congestion: speed > 0 && speed < 0.97 ? Math.min(1, 1 - speed + 0.5) : 0,
        skippedFrames: dropped,
        totalFrames: frames,
        bytes: totalSize
      })
    }
  }

  /** Resolve once FFmpeg reports frames actually flowing through the encoder. */
  _waitForData(timeoutMs) {
    return new Promise((resolve) => {
      const t0 = Date.now()
      const check = () => {
        if (!this.proc) return resolve(false)
        const p = this._lastProgress
        if (p && (p.size > 0 || p.frames > 0)) return resolve(true)
        if (Date.now() - t0 > timeoutMs) return resolve(false)
        setTimeout(check, 250)
      }
      check()
    })
  }

  stop() {
    this.userStopped = true
    this._stopPump()
    const proc = this.proc
    this.live = false
    if (!proc) return { ok: true }
    try {
      proc.kill('SIGINT') // clean FLV/MKV finalize
    } catch {
      /* already gone */
    }
    setTimeout(() => {
      try {
        proc.kill('SIGKILL')
      } catch {
        /* already gone */
      }
    }, 3000).unref?.()
    return { ok: true }
  }
}

/** Last meaningful line of an FFmpeg stderr tail (for user-facing errors). */
function lastErrorLine(tail) {
  const lines = String(tail).split('\n').map((l) => l.trim()).filter(Boolean)
  return lines[lines.length - 1] || ''
}
