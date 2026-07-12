import { paintOverlay } from './overlayPainter'

// Must match OVERLAY_W/H in src/main/nativeEngine.js — the engine reads raw
// RGBA frames of exactly this size.
const W = 1280
const H = 720

/**
 * OverlayPump renders the overlay layer (trade card / ticker / watermark /
 * scenes) on a transparent canvas and ships RGBA snapshots to the Native
 * Engine, which composites them over the broadcast. The ENGINE repeats the
 * latest snapshot at a steady rate, so this pump only has to keep the
 * snapshot fresh — if the renderer hiccups, the stream never stalls.
 */
export class OverlayPump {
  /**
   * @param {object} opts
   * @param {() => object} opts.getOverlay  returns { config, trade, scene }
   * @param {(data: Uint8ClampedArray) => void} opts.send  ships a frame
   * @param {number} [opts.fps]
   */
  constructor({ getOverlay, send, fps = 10 }) {
    this.getOverlay = getOverlay
    this.send = send
    this.fps = fps
    this.canvas = document.createElement('canvas')
    this.canvas.width = W
    this.canvas.height = H
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })
    this._timer = null
  }

  start() {
    this.stop()
    this._timer = setInterval(() => this._tick(), 1000 / this.fps)
  }

  _tick() {
    const { ctx } = this
    ctx.clearRect(0, 0, W, H)
    try {
      paintOverlay(ctx, W, H, this.getOverlay(), performance.now())
    } catch {
      /* a paint error must never take down the pump */
    }
    try {
      this.send(ctx.getImageData(0, 0, W, H).data)
    } catch {
      /* IPC hiccup — next tick retries */
    }
  }

  stop() {
    clearInterval(this._timer)
    this._timer = null
  }
}
