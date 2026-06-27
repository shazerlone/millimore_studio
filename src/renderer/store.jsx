import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const AppContext = createContext(null)

/** Falls back gracefully when the preload bridge isn't present (e.g. browser). */
const bridge = typeof window !== 'undefined' ? window.millimore : null

const DEFAULT_OVERLAY = {
  position: 'bottom-left',
  style: 'detailed', // minimal | detailed | full
  theme: 'dark', // dark | light
  fields: { pair: true, direction: true, entry: true, sl: true, tp: true, lot: true },
  showCopy: true
}

export function AppProvider({ children }) {
  const [authed, setAuthed] = useState(false)
  const [isLive, setIsLive] = useState(false)
  const [mt5Connected, setMt5Connected] = useState(false)
  const [overlayConfig, setOverlayConfig] = useState(DEFAULT_OVERLAY)
  const [overlayEnabled, setOverlayEnabled] = useState(true)
  const [streamStats, setStreamStats] = useState(null)

  // Hydrate the saved overlay config from disk on launch.
  useEffect(() => {
    if (!bridge) return
    bridge.settings.get('overlayConfig').then((saved) => {
      if (saved) setOverlayConfig((c) => ({ ...c, ...saved }))
    })
    const off = bridge.stream.onStats(setStreamStats)
    return off
  }, [])

  const updateOverlay = (patch) => {
    setOverlayConfig((c) => {
      const next = { ...c, ...patch, fields: { ...c.fields, ...(patch.fields || {}) } }
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
      streamStats
    }),
    [authed, isLive, mt5Connected, overlayConfig, overlayEnabled, streamStats]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
