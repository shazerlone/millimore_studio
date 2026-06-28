import { useEffect, useRef, useState } from 'react'
import { colors, radius } from '@theme/colors'
import { typography } from '@theme/typography'
import { TradeCard } from '@components/TradeCard'
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
  const camRef = useRef(null)
  const [state, setState] = useState({ live: false, elapsed: '00:00:00', trade: null, overlayConfig: {}, stats: null })
  const [hasCam, setHasCam] = useState(false)

  // Own camera self-view (independent of the main window).
  useEffect(() => {
    let stream
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: 320, height: 240 }, audio: false })
      .then((s) => {
        stream = s
        if (camRef.current) camRef.current.srcObject = s
        setHasCam(true)
      })
      .catch(() => setHasCam(false))
    return () => stream?.getTracks().forEach((t) => t.stop())
  }, [])

  useEffect(() => {
    if (!bridge) return
    return bridge.monitor.onState((s) => setState((prev) => ({ ...prev, ...s })))
  }, [])

  const cmd = (type, payload) => bridge?.monitor.command({ type, payload })

  const { live, elapsed, trade, overlayConfig, stats } = state

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

      {/* camera self-view */}
      <div style={{ position: 'relative', aspectRatio: '4 / 3', background: '#111827', flexShrink: 0 }}>
        {hasCam ? (
          <video ref={camRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'rgba(255,255,255,0.5)' }}>
            <div style={{ textAlign: 'center' }}>
              <VideoIcon size={20} />
              <div style={{ ...typography.caption, marginTop: 4 }}>Camera in use by stream</div>
            </div>
          </div>
        )}
        {trade && (
          <div style={{ position: 'absolute', left: 8, bottom: 8, right: 8 }}>
            <TradeCard trade={trade} style="minimal" theme="dark" branded={false} scale={0.62} />
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

      {/* keep overlayConfig referenced for future use */}
      <span style={{ display: 'none' }}>{overlayConfig ? '' : ''}</span>
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
