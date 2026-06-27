/**
 * Captures microphone audio and streams it to the main process as interleaved
 * 16-bit stereo PCM at 48 kHz — the format the FFmpeg engine expects on fd 3.
 *
 * Uses a ScriptProcessorNode for broad Electron/Chromium compatibility. The mic
 * is typically mono, so the single input channel is duplicated to L+R.
 */
export class AudioStreamer {
  constructor() {
    this.ctx = null
    this.source = null
    this.processor = null
    this.running = false
  }

  /** @param {MediaStream} stream a stream containing at least one audio track */
  start(stream) {
    const audioTracks = stream?.getAudioTracks?.() || []
    if (audioTracks.length === 0) return false

    this.ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 })
    this.source = this.ctx.createMediaStreamSource(stream)
    this.processor = this.ctx.createScriptProcessor(4096, 1, 1)

    this.processor.onaudioprocess = (e) => {
      if (!this.running) return
      const input = e.inputBuffer.getChannelData(0) // Float32 mono
      const pcm = new Int16Array(input.length * 2) // interleaved stereo s16
      for (let i = 0; i < input.length; i++) {
        let s = Math.max(-1, Math.min(1, input[i]))
        s = s < 0 ? s * 0x8000 : s * 0x7fff
        pcm[i * 2] = s // L
        pcm[i * 2 + 1] = s // R
      }
      window.millimore?.stream.pushAudio(pcm.buffer)
    }

    this.source.connect(this.processor)
    // Connect to a muted destination so the processor keeps firing without
    // routing the mic to the local speakers (avoids echo/feedback).
    const sink = this.ctx.createGain()
    sink.gain.value = 0
    this.processor.connect(sink)
    sink.connect(this.ctx.destination)
    this._sink = sink

    this.running = true
    return true
  }

  stop() {
    this.running = false
    try {
      this.processor?.disconnect()
      this.source?.disconnect()
      this._sink?.disconnect()
      this.ctx?.close()
    } catch {
      /* already torn down */
    }
    this.ctx = this.source = this.processor = this._sink = null
  }
}
