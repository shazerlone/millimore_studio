import { useEffect, useState } from 'react'
import { colors, radius } from '@theme/colors'
import { typography } from '@theme/typography'
import { Star } from '@components/Logo'
import { VideoIcon, LayersIcon } from '@components/Icons'

const bridge = typeof window !== 'undefined' ? window.millimore : null

/**
 * Floating, capture-protected stream monitor. Renders in a separate always-on-top
 * window that is excluded from screen capture, so the trader can watch their
 * camera + trade overlay and control the stream while working in MT5 / YouTube
 * Studio — without any of it appearing on the broadcast.
 */
export function Monitor() {
  const [state, setState] = useState({ live: false, elapsed: '00:00:00', trade: null, overlayConfig: {}, stats: null })
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    if (!bridge) return
    const offState = bridge.monitor.onState((s) => setState((prev) => ({ ...prev, ...s })))
    const offPrev = bridge.monitor.onPreview((url) => setPreview(url))
    return () => {
      offState?.()
      offPrev?.()
    }
  }, [])

  const cmd = (type, payload) => bridge?.monitor.command({ type, payload })

  const { live, elapsed, trade, stats } = state

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: colors.dark,
        color: '#fff',
        overflow: 'hidden'
      }}
    >
      {/* draggable header */}
      <div
        style={{
          WebkitAppRegion: 'drag',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '10px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.08)'
        }}
      >
        <Star size={13} />
        <span style={{ fontWeight: 800, fontSize: 12.5, letterSpacing: '-0.01em' }}>monitor</span>
        {live ? (
          <span
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11,
              fontWeight: 700,
              color: colors.live
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors.live, animation: 'mmPulse 1.2s infinite' }} />
            {elapsed}
          </span>
        ) : (
          <span style={{ marginLeft: 'auto', ...typography.caption, color: 'rgba(255,255,255,0.5)' }}>Offline</span>
        )}
        <button
          onClick={() => bridge?.monitor.toggle(false)}
          style={{ WebkitAppRegion: 'no-drag', color: 'rgba(255,255,255,0.6)', fontSize: 16, marginLeft: 6 }}
          title="Hide monitor"
        >
          ×
        </button>
      </div>

      {/* live output (exactly what viewers see) */}
      <div style={{ position: 'relative', aspectRatio: '16 / 9', background: '#000', flexShrink: 0 }}>
        {preview ? (
          <img src={preview} alt="Live output" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'rgba(255,255,255,0.5)' }}>
            <div style={{ textAlign: 'center' }}>
              <VideoIcon size={20} />
              <div style={{ ...typography.caption, marginTop: 4 }}>{live ? 'Connecting…' : 'Not streaming'}</div>
            </div>
          </div>
        )}
      </div>

      {/* stats */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <Stat label="Bitrate" value={stats?.bitrateKbps ? `${Math.round(stats.bitrateKbps)}k` : '—'} />
        <Stat label="FPS" value={stats?.fps ? Math.round(stats.fps) : '—'} />
        <Stat label="Dropped" value={stats?.dropped ?? 0} />
      </div>

      {/* controls */}
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
        {trade ? (
          <MiniBtn onClick={() => cmd('hideTrade')} icon={<LayersIcon size={15} />}>
            Hide trade card
          </MiniBtn>
        ) : (
          <MiniBtn onClick={() => cmd('repeatTrade')} icon={<LayersIcon size={15} />} muted={!live}>
            Show last trade card
          </MiniBtn>
        )}
        {live && (
          <MiniBtn onClick={() => cmd('stop')} danger icon={<span style={{ width: 9, height: 9, background: '#fff', borderRadius: 2 }} />}>
            Stop stream
          </MiniBtn>
        )}
        <div style={{ ...typography.caption, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 2 }}>
          Hidden from your viewers
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ ...typography.caption, color: 'rgba(255,255,255,0.45)' }}>{label}</div>
      <div style={{ ...typography.bodyStrong, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

function MiniBtn({ children, onClick, icon, danger, muted }) {
  return (
    <button
      onClick={onClick}
      disabled={muted}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        padding: '10px 12px',
        borderRadius: radius.button,
        background: danger ? colors.live : 'rgba(255,255,255,0.08)',
        color: '#fff',
        fontWeight: 700,
        fontSize: 13,
        opacity: muted ? 0.4 : 1,
        cursor: muted ? 'not-allowed' : 'pointer',
        border: '1px solid rgba(255,255,255,0.1)'
      }}
    >
      {icon}
      {children}
    </button>
  )
}
