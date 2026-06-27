import { EventEmitter } from 'node:events'

/**
 * MT5 connection manager.
 *
 * Connects to a trader's MetaTrader 5 account using the **investor (read-only)
 * password** — never the master password — so the app can observe positions
 * and balance but can never place, modify or close a trade.
 *
 * In production this talks to a local MT5 bridge (e.g. a small Python/MetaApi
 * sidecar, or the MetaApi cloud SDK). Here the transport is abstracted behind
 * `_openBridge`, and a deterministic simulator drives realistic trade events so
 * the rest of the app (overlay, websocket relay, UI) is fully exercisable
 * without a live broker connection.
 */
export class MT5Manager extends EventEmitter {
  constructor() {
    super()
    this.connected = false
    this.account = null
    this.credentials = null
    this._pollTimer = null
    this._positions = new Map()
  }

  get isConnected() {
    return this.connected
  }

  /**
   * @param {object} creds
   * @param {string} creds.account   MT5 account number (login)
   * @param {string} creds.password  investor (read-only) password
   * @param {string} creds.server    broker server name
   */
  async connect({ account, password, server }) {
    if (!account || !password || !server) {
      throw new Error('Account number, investor password and server are required')
    }

    this.emit('status', { state: 'connecting' })
    const session = await this._openBridge({ account, password, server })

    this.credentials = { account, server }
    this.account = {
      login: account,
      name: session.name,
      broker: session.broker,
      server,
      type: session.type,
      currency: session.currency,
      balance: session.balance,
      equity: session.equity,
      leverage: session.leverage,
      readOnly: true,
      openPositions: 0
    }
    this.connected = true
    this.emit('status', { state: 'connected', account: this.account })
    this._startPolling()
    return this.account
  }

  disconnect() {
    if (this._pollTimer) clearInterval(this._pollTimer)
    this._pollTimer = null
    this.connected = false
    this.account = null
    this._positions.clear()
    this.emit('status', { state: 'disconnected' })
    return { ok: true }
  }

  getAccount() {
    return this.account
  }

  /**
   * Fire a single synthetic trade event so the trader can confirm — during the
   * MT5 connection wizard — that overlay sync is working end to end.
   */
  runSyncTest() {
    const trade = {
      id: `test-${Date.now()}`,
      event: 'open',
      pair: 'XAUUSD',
      direction: 'BUY',
      entry: 2345.5,
      sl: 2330,
      tp: 2370,
      lot: 0.5,
      risk: 1,
      rr: '1:2',
      test: true,
      ts: Date.now()
    }
    this.emit('trade', trade)
    return trade
  }

  // ---- transport -------------------------------------------------------

  /**
   * Opens the read-only bridge session. Replace the body with a real MetaApi /
   * local-terminal handshake; the returned shape is what the rest of the app
   * relies on.
   */
  async _openBridge({ account, server }) {
    await delay(600) // simulate broker handshake latency
    return {
      name: 'Marcus Sterling',
      broker: this._brokerFromServer(server),
      type: 'Hedge · USD',
      currency: 'USD',
      balance: 48250.75,
      equity: 48910.2,
      leverage: '1:100',
      login: account
    }
  }

  _brokerFromServer(server) {
    const head = String(server).split(/[-.]/)[0]
    return head ? head.charAt(0).toUpperCase() + head.slice(1) : 'Broker'
  }

  /**
   * Polls the bridge for position changes. Detects opens/closes by diffing the
   * position snapshot and emits a normalized trade event for each change.
   */
  _startPolling() {
    if (this._pollTimer) clearInterval(this._pollTimer)
    this._pollTimer = setInterval(async () => {
      const snapshot = await this._pollPositions()
      this._reconcile(snapshot)
      if (this.account) {
        this.account.openPositions = this._positions.size
        this.emit('status', { state: 'connected', account: this.account })
      }
    }, 4000)
  }

  _reconcile(snapshot) {
    const seen = new Set()
    for (const pos of snapshot) {
      seen.add(pos.id)
      if (!this._positions.has(pos.id)) {
        this._positions.set(pos.id, pos)
        this.emit('trade', { ...pos, event: 'open', ts: Date.now() })
      }
    }
    for (const [id, pos] of this._positions) {
      if (!seen.has(id)) {
        this._positions.delete(id)
        this.emit('trade', { ...pos, event: 'close', ts: Date.now() })
      }
    }
  }

  /**
   * Returns the current open-position snapshot from the bridge. The simulator
   * occasionally opens or closes a position so the overlay pipeline animates
   * during development.
   */
  async _pollPositions() {
    const PAIRS = ['XAUUSD', 'EURUSD', 'GBPJPY', 'BTCUSD', 'US30']
    const current = [...this._positions.values()]
    const roll = Math.random()
    if (roll > 0.7 && current.length < 3) {
      const pair = PAIRS[Math.floor(Math.random() * PAIRS.length)]
      const direction = Math.random() > 0.5 ? 'BUY' : 'SELL'
      const entry = Number((1000 + Math.random() * 1500).toFixed(2))
      current.push({
        id: `pos-${Date.now()}`,
        pair,
        direction,
        entry,
        sl: Number((entry * 0.99).toFixed(2)),
        tp: Number((entry * 1.02).toFixed(2)),
        lot: Number((Math.random() * 1.5 + 0.1).toFixed(2)),
        risk: 1,
        rr: '1:2'
      })
    } else if (roll < 0.15 && current.length > 0) {
      current.shift()
    }
    return current
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
