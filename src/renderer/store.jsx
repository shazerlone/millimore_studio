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
  const [authed, setAuthed] = useState(false)
  const [isLive, setIsLive] = useState(false)
  const [mt5Connected, setMt5Connected] = useState(false)
  const [overlayConfig, setOverlayConfig] = useState(DEFAULT_OVERLAY)
  const [overlayEnabled, setOverlayEnabled] = useState(true)
  const [streamStats, setStreamStats] = useState(null)
  const [onboarded, setOnboarded] = useState(null) // null = unknown (loading)
  const [toasts, setToasts] = useState([])

  // Hydrate saved config + onboarding flag from disk on launch.
  useEffect(() => {
    if (!bridge) {
      setOnboarded(true) // browser/dev: skip the wizard
      return
    }
    bridge.settings.get('overlayConfig').then((saved) => {
      if (saved) setOverlayConfig((c) => ({ ...c, ...saved }))
    })
    bridge.settings.get('onboarded').then((v) => setOnboarded(!!v))
    const off = bridge.stream.onStats(setStreamStats)
    return off
  }, [])

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
        ticker: { ...c.ticker, ...(patch.ticker || {}) }
      }
      bridge?.settings.set('overlayConfig', next)
      return next
    })
  }

  const value = useMemo(
    () => ({
      bridge,
      authed,
      setAuthed,
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
    [authed, isLive, mt5Connected, overlayConfig, overlayEnabled, streamStats, onboarded, toasts]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
