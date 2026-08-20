import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const AppContext = createContext(null)

/** Falls back gracefully when the preload bridge isn't present (e.g. browser). */
const bridge = typeof window !== 'undefined' ? window.millimore : null

const DEFAULT_OVERLAY = {
  position: 'bottom-left',
  style: 'detailed', // minimal | detailed | full
  theme: 'dark', // dark | light
  fields: { pair: true, direction: true, entry: true, sl: true, tp: true, lot: true },
  showCopy: true,
  // Camera picture-in-picture layout (normalized to the canvas, 0–1).
  // shape: rectangle | square | circle | oval
  camera: { shape: 'rectangle', x: 0.71, y: 0.68, w: 0.26 },
  // Editable full-screen scene copy.
  scenes: {
    starting: { title: 'Starting soon', sub: 'The live session will begin shortly' },
    brb: { title: 'Be right back', sub: 'Stay tuned — back in a moment' },
    ending: { title: 'Thanks for watching', sub: 'See you in the next session' }
  },
  // Persistent Millimore brand watermark — expands into the trade card.
  watermark: { enabled: true, opacity: 0.92 },
  // Scrolling lower-third ticker (disclaimer / links / subscribers).
  ticker: {
    enabled: true,
    position: 'bottom', // top | bottom
    theme: 'dark',
    speed: 60, // px / second
    items: [
      { id: 'disc', type: 'disclaimer', text: 'Not financial advice · Trade at your own risk' },
      { id: 'yt', type: 'link', text: 'YouTube: @marcussterling' },
      { id: 'subs', type: 'subscribers', text: '12.4K subscribers' }
    ]
  }
}

export function AppProvider({ children }) {
  const [authed, setAuthedState] = useState(null) // null = loading from disk
  const [user, setUser] = useState(null) // logged-in creator (backend /me)
  const [isLive, setIsLive] = useState(false)
  const [mt5Connected, setMt5Connected] = useState(false)
  const [overlayConfig, setOverlayConfig] = useState(DEFAULT_OVERLAY)
  const [overlayEnabled, setOverlayEnabled] = useState(true)
  const [streamStats, setStreamStats] = useState(null)
  const [onboarded, setOnboarded] = useState(null) // null = unknown (loading)
  const [toasts, setToasts] = useState([])

  // Hydrate saved session + config from disk on launch.
  useEffect(() => {
    if (!bridge) {
      setAuthedState(false)
      setOnboarded(true) // browser/dev: skip the wizard
      return
    }
    bridge.settings.get('overlayConfig').then((saved) => {
      if (saved) setOverlayConfig((c) => ({ ...c, ...saved }))
    })
    // Restore the backend session (persisted JWT → validate with /me).
    bridge.backend.session().then((s) => {
      setAuthedState(!!s?.authed)
      setUser(s?.user || null)
      if (s?.authed) setOnboarded(true) // a real account skips the demo wizard
    })
    bridge.settings.get('onboarded').then((v) => setOnboarded((cur) => (cur === null ? !!v : cur)))
    const offStream = bridge.stream.onStats(setStreamStats)
    // OBS engine health → the same stats surface the UI already renders
    // (LiveStatsBar reads bitrateKbps / fps / dropped).
    const offEngine = bridge.engine.onStats((s) => {
      const droppedPct = s.totalFrames ? (s.skippedFrames / s.totalFrames) * 100 : 0
      setStreamStats({
        live: !!s.streaming,
        congestion: s.congestion ?? 0,
        droppedPct,
        bytes: s.bytes || 0,
        bitrateKbps: s.bitrateKbps || 0,
        fps: s.fps || 0,
        dropped: s.skippedFrames || 0
      })
    })
    return () => {
      offStream?.()
      offEngine?.()
    }
  }, [])

  // Called by the login screen after a successful backend auth. The JWT is
  // already persisted in the main process; here we just flip UI state.
  const signIn = (u) => {
    setUser(u || null)
    setAuthedState(true)
    setOnboarded(true)
  }

  // Kept for compatibility (some flows call setAuthed(true/false)).
  const setAuthed = (v) => {
    setAuthedState(!!v)
    if (!v) setUser(null)
  }

  const signOut = () => {
    bridge?.backend.logout()
    setUser(null)
    setAuthedState(false)
  }

  const completeOnboarding = () => {
    setOnboarded(true)
    bridge?.settings.set('onboarded', true)
  }

  const pushToast = (message, tone = 'info', ttl = 4500) => {
    const id = `t${Date.now()}${Math.random()}`
    setToasts((list) => [...list, { id, message, tone }])
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), ttl)
    return id
  }

  const dismissToast = (id) => setToasts((list) => list.filter((t) => t.id !== id))

  const updateOverlay = (patch) => {
    setOverlayConfig((c) => {
      const next = {
        ...c,
        ...patch,
        fields: { ...c.fields, ...(patch.fields || {}) },
        watermark: { ...c.watermark, ...(patch.watermark || {}) },
        ticker: { ...c.ticker, ...(patch.ticker || {}) },
        camera: { ...c.camera, ...(patch.camera || {}) },
        scenes: { ...c.scenes, ...(patch.scenes || {}) }
      }
      bridge?.settings.set('overlayConfig', next)
      return next
    })
  }

  const value = useMemo(
    () => ({
      bridge,
      authed,
      user,
      signIn,
      setAuthed,
      signOut,
      isLive,
      setIsLive,
      mt5Connected,
      setMt5Connected,
      overlayConfig,
      updateOverlay,
      overlayEnabled,
      setOverlayEnabled,
      streamStats,
      onboarded,
      completeOnboarding,
      toasts,
      pushToast,
      dismissToast
    }),
    [authed, user, isLive, mt5Connected, overlayConfig, overlayEnabled, streamStats, onboarded, toasts]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
