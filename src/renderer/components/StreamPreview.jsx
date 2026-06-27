import { colors, radius } from '@theme/colors'
import { typography } from '@theme/typography'
import { TradeCard } from './TradeCard'
import { VideoIcon } from './Icons'

/**
 * Visual preview of the composited stream: screen capture as the base layer,
 * camera feed picture-in-picture, an optional trade-card overlay, and the live
 * timer. Until real capture is wired in it renders a representative mock
 * "trading desktop" so the layout reads correctly.
 *
 * @param {object} props
 * @param {boolean} props.live
 * @param {string}  props.elapsed       formatted timer e.g. "00:14:22"
 * @param {object}  props.overlayTrade  trade to show as a card, or null
 * @param {object}  props.overlayConfig { style, theme, fields, showCopy, position }
 * @param {string}  props.cameraStream  optional <video> srcObject (live camera)
 */
export function StreamPreview({
  live = false,
  elapsed = '00:00:00',
  overlayTrade = null,
  overlayConfig = {},
  cameraRef = null
}) {
  const {
    position = 'bottom-left',
    style = 'detailed',
    theme = 'dark',
    fields,
    showCopy = true
  } = overlayConfig

  const corner = {
    'top-left': { top: 16, left: 16 },
    'top-right': { top: 16, right: 16 },
    'bottom-left': { bottom: 16, left: 16 },
    'bottom-right': { bottom: 16, right: 16 }
  }[position]

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        borderRadius: radius.card,
        overflow: 'hidden',
        background: '#0B1220',
        border: `1px solid ${colors.borderStrong}`
      }}
    >
      <MockDesktop />

      {/* trade overlay */}
      {overlayTrade && (
        <div style={{ position: 'absolute', ...corner, zIndex: 3 }}>
          <TradeCard
            trade={overlayTrade}
            style={style}
            theme={theme}
            fields={fields}
            showCopy={showCopy}
            scale={0.82}
          />
        </div>
      )}

      {/* camera PiP — bottom right */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          width: '26%',
          aspectRatio: '4 / 3',
          borderRadius: 10,
          overflow: 'hidden',
          border: '2px solid rgba(255,255,255,0.85)',
          background: '#111827',
          zIndex: 2,
          boxShadow: '0 6px 20px rgba(0,0,0,0.35)'
        }}
      >
        {cameraRef ? (
          <video
            ref={cameraRef}
            autoPlay
            muted
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'grid',
              placeItems: 'center',
              color: 'rgba(255,255,255,0.55)'
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <VideoIcon size={22} />
              <div style={{ ...typography.caption, marginTop: 4 }}>Camera</div>
            </div>
          </div>
        )}
      </div>

      {/* live badge + timer */}
      {live && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            zIndex: 4
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: colors.live,
              color: '#fff',
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: '0.06em',
              padding: '4px 10px',
              borderRadius: radius.pill
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: '#fff',
                animation: 'mmPulse 1.2s ease-in-out infinite'
              }}
            />
            LIVE
          </span>
          <span
            style={{
              background: 'rgba(0,0,0,0.55)',
              color: '#fff',
              fontFamily: typography.mono.fontFamily,
              fontVariantNumeric: 'tabular-nums',
              fontSize: 13,
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: radius.pill
            }}
          >
            {elapsed}
          </span>
        </div>
      )}

      {!live && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            zIndex: 4,
            background: 'rgba(11,18,32,0.35)'
          }}
        >
          <span
            style={{
              ...typography.caption,
              color: 'rgba(255,255,255,0.85)',
              background: 'rgba(0,0,0,0.45)',
              padding: '6px 12px',
              borderRadius: radius.pill
            }}
          >
            Preview · not streaming
          </span>
        </div>
      )}
    </div>
  )
}

/** A stylized trading desktop so the preview reads as a real screen capture. */
function MockDesktop() {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <svg width="100%" height="100%" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice">
        <rect width="640" height="360" fill="#0B1220" />
        {/* grid */}
        {Array.from({ length: 12 }).map((_, i) => (
          <line key={`v${i}`} x1={i * 55} y1="0" x2={i * 55} y2="360" stroke="#16213a" strokeWidth="1" />
        ))}
        {Array.from({ length: 7 }).map((_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 52} x2="640" y2={i * 52} stroke="#16213a" strokeWidth="1" />
        ))}
        {/* candles */}
        {Array.from({ length: 26 }).map((_, i) => {
          const x = 30 + i * 22
          const up = Math.sin(i * 0.9) > 0
          const h = 18 + Math.abs(Math.sin(i * 1.3)) * 60
          const y = 120 + Math.cos(i * 0.7) * 50
          return (
            <g key={i} stroke={up ? '#16A34A' : '#EF4444'} fill={up ? '#16A34A' : '#EF4444'}>
              <line x1={x} y1={y - 12} x2={x} y2={y + h + 12} strokeWidth="1.5" />
              <rect x={x - 5} y={y} width="10" height={h} rx="1.5" />
            </g>
          )
        })}
        {/* moving average */}
        <polyline
          points={Array.from({ length: 27 })
            .map((_, i) => `${30 + i * 22},${140 + Math.sin(i * 0.6) * 30}`)
            .join(' ')}
          fill="none"
          stroke="#2563EB"
          strokeWidth="2"
          opacity="0.85"
        />
        {/* top toolbar */}
        <rect x="0" y="0" width="640" height="22" fill="#0F172A" />
        <text x="12" y="15" fill="#94A3B8" fontSize="10" fontFamily="Inter">
          XAUUSD · M5 · MetaTrader 5
        </text>
        <text x="560" y="15" fill="#16A34A" fontSize="10" fontFamily="Inter">
          2,345.50
        </text>
      </svg>
    </div>
  )
}
