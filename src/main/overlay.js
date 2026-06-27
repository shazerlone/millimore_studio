import { EventEmitter } from 'node:events'
import { io } from 'socket.io-client'

const MILLIMORE_RELAY = 'https://app.millimore.app'
const CARD_DURATION_MS = 10_000

/**
 * Trade overlay coordinator.
 *
 * Bridges MT5 trade events to two consumers:
 *   1. The on-stream overlay (the renderer draws the animated card onto the
 *      composite canvas that FFmpeg encodes), driven by the `show`/`hide` events.
 *   2. Millimore mobile viewers, via a Socket.io relay, so the same trade card
 *      appears in the mobile app in real time.
 *
 * Cards auto-dismiss after 10 seconds.
 */
export class OverlayManager extends EventEmitter {
  constructor() {
    super()
    this.socket = null
    this.enabled = true
    this.streamKey = null
    this._timers = new Map()
  }

  /** Connect the websocket relay so mobile viewers receive trade cards. */
  connectRelay(streamKey) {
    this.streamKey = streamKey
    if (this.socket) this.socket.disconnect()
    this.socket = io(MILLIMORE_RELAY, {
      path: '/overlay',
      transports: ['websocket'],
      auth: { streamKey },
      reconnection: true,
      autoConnect: true
    })
    this.socket.on('connect', () => this.emit('relay', { state: 'connected' }))
    this.socket.on('disconnect', () => this.emit('relay', { state: 'disconnected' }))
    this.socket.on('connect_error', (err) =>
      this.emit('relay', { state: 'error', message: err.message })
    )
  }

  disconnectRelay() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled
  }

  /**
   * Handle a normalized MT5 trade event. Shows the card on stream, relays it to
   * mobile, and schedules the 10s auto-fade.
   */
  handleTrade(trade) {
    if (!this.enabled) return

    const card = {
      id: trade.id,
      event: trade.event, // 'open' | 'close' | 'modify'
      pair: trade.pair,
      direction: trade.direction,
      entry: trade.entry,
      sl: trade.sl,
      tp: trade.tp,
      lot: trade.lot,
      risk: trade.risk,
      rr: trade.rr,
      ts: trade.ts || Date.now()
    }

    // 1. on-stream overlay
    this.emit('show', card)
    // 2. mobile viewers via relay
    if (this.socket?.connected) {
      this.socket.emit('trade:card', { streamKey: this.streamKey, card })
    }

    // 3. schedule auto-fade
    if (this._timers.has(card.id)) clearTimeout(this._timers.get(card.id))
    this._timers.set(
      card.id,
      setTimeout(() => {
        this.emit('hide', { id: card.id })
        this._timers.delete(card.id)
      }, CARD_DURATION_MS)
    )
  }

  dispose() {
    for (const t of this._timers.values()) clearTimeout(t)
    this._timers.clear()
    this.disconnectRelay()
  }
}
