import { colors } from '@theme/colors'
import { Star } from './Logo'

/**
 * Scrolling lower-third ticker — the moving banner streamers use to show a
 * disclaimer, their social links, subscriber count, etc. Loops seamlessly.
 *
 * @param {object} config { enabled, position, speed, theme, items:[{id,type,text}] }
 */
export function Ticker({ config }) {
  if (!config?.enabled) return null
  const items = (config.items || []).filter((i) => i.text && i.text.trim())
  if (!items.length) return null

  const dark = (config.theme || 'dark') === 'dark'
  const top = config.position === 'top'

  // Estimate content width from text length to derive a smooth loop duration.
  const totalChars = items.reduce((n, i) => n + i.text.length + 4, 0)
  const estWidth = totalChars * 9 + items.length * 30
  const speed = config.speed || 60 // px per second
  const duration = Math.max(8, estWidth / speed)

  const Sequence = ({ ariaHidden }) => (
    <div
      aria-hidden={ariaHidden}
      style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}
    >
      {items.map((it) => (
        <span key={it.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
          <span
            style={{
              color: dark ? '#F8FAFC' : colors.textPrimary,
              fontSize: 14,
              fontWeight: it.type === 'disclaimer' ? 500 : 700,
              opacity: it.type === 'disclaimer' ? 0.85 : 1,
              whiteSpace: 'nowrap',
              padding: '0 18px'
            }}
          >
            {it.text}
          </span>
          <Star size={11} />
        </span>
      ))}
    </div>
  )

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        [top ? 'top' : 'bottom']: 0,
        height: 38,
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        background: dark ? 'rgba(11,18,32,0.78)' : 'rgba(255,255,255,0.88)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        borderTop: top ? 'none' : `1px solid ${dark ? 'rgba(255,255,255,0.08)' : colors.border}`,
        borderBottom: top ? `1px solid ${dark ? 'rgba(255,255,255,0.08)' : colors.border}` : 'none',
        zIndex: 5
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          width: 'max-content',
          animation: `mmTicker ${duration}s linear infinite`
        }}
      >
        <Sequence />
        <Sequence ariaHidden />
      </div>
    </div>
  )
}
