import Store from 'electron-store'
import { safeStorage } from 'electron'

/**
 * Client for the live Millimore backend (see docs/BACKEND_INTEGRATION.md and
 * tv_license_app/docs/BACKEND_CONTRACT.md). The desktop app is a *creator*
 * client: it authenticates, opens a backend broadcast (single RTMPS ingest the
 * engine streams to), and the backend simulcasts to YouTube/Meta + mobile.
 *
 * The JWT is persisted encrypted (safeStorage) so the session survives restarts.
 */
const DEFAULT_BASE = 'https://mi-41bae9db1d7c40e2846cc32d8ac9f51f.ecs.us-west-2.on.aws/v1'

export class BackendClient {
  constructor() {
    this.base = (process.env.MILLIMORE_API_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '')
    this.store = new Store({ name: 'millimore-auth' })
    this.token = this._loadToken()
  }

  get isAuthed() {
    return !!this.token
  }

  _loadToken() {
    const stored = this.store.get('token')
    if (!stored) return null
    try {
      const buf = Buffer.from(stored, 'base64')
      if (safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(buf)
      return buf.toString('utf8')
    } catch {
      return null
    }
  }

  _saveToken(token) {
    this.token = token || null
    if (!token) return this.store.delete('token')
    const enc = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(token).toString('base64')
      : Buffer.from(token).toString('base64')
    this.store.set('token', enc)
  }

  /** Low-level request. Throws Error with .status/.code on failure; clears the
   *  token on 401. Retries transient network errors (AWS/Render cold starts). */
  async _req(method, path, body) {
    const url = this.base + path
    const attempt = () =>
      fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
        },
        body: body != null ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30000)
      })

    let res
    const backoff = [0, 2000, 4000, 8000]
    let lastErr
    for (const wait of backoff) {
      if (wait) await new Promise((r) => setTimeout(r, wait))
      try {
        res = await attempt()
        break
      } catch (e) {
        lastErr = e // network/timeout — retry
      }
    }
    if (!res) {
      const err = new Error('Could not reach the Millimore server. Check your connection and try again.')
      err.code = 'offline'
      err.cause = lastErr
      throw err
    }

    const text = await res.text()
    let data = null
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = null
      }
    }
    if (res.ok) return data

    if (res.status === 401) this._saveToken(null)
    // Contract shape { error:{code,message} }, then NestJS { statusCode,message,error }.
    let code = 'error'
    let message = `Request failed (${res.status})`
    if (data?.error?.code) {
      code = String(data.error.code)
      message = String(data.error.message || message)
    } else if (data?.message != null) {
      message = Array.isArray(data.message) ? data.message.join(', ') : String(data.message)
      if (typeof data.error === 'string') code = data.error.toLowerCase().replace(/\s+/g, '_')
    }
    if (res.status === 404 && message.startsWith('Cannot ')) {
      code = 'not_available'
      message = "This feature isn't available on the server yet."
    }
    const err = new Error(message)
    err.status = res.status
    err.code = code
    throw err
  }

  // ---- auth (§4.1) ----
  async login(email, password, twofaCode) {
    const r = await this._req('POST', '/auth/login', {
      email,
      password,
      ...(twofaCode ? { twofaCode } : {})
    })
    if (r?.token) this._saveToken(r.token)
    return r?.user
  }
  otpRequest(phone) {
    return this._req('POST', '/auth/otp/request', { phone }) // { requestId, devCode? }
  }
  async otpVerify(requestId, code) {
    const r = await this._req('POST', '/auth/otp/verify', { requestId, code })
    if (r?.token) this._saveToken(r.token)
    return r?.user
  }
  async me() {
    const r = await this._req('GET', '/me')
    return r?.user
  }
  logout() {
    this._req('POST', '/auth/logout').catch(() => {})
    this._saveToken(null)
  }

  // ---- broadcasts (§4.9) ----
  createBroadcast(title) {
    return this._req('POST', '/broadcasts', { title })
  }
  startBroadcast(id) {
    return this._req('POST', `/broadcasts/${id}/start`)
  }
  endBroadcast(id) {
    return this._req('POST', `/broadcasts/${id}/end`)
  }
  getBroadcast(id) {
    return this._req('GET', `/broadcasts/${id}`)
  }
}
