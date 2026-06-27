import { Star } from './Logo'

/**
 * Small, tasteful Millimore brand watermark shown on the live stream for
 * marketing. Sits at the same corner as the trade overlay so that, when a trade
 * fires, it visually "expands" into the branded trade card.
 *
 * @param {number} opacity 0–1
 * @param {number} scale   relative size
 * @param {boolean} compact pill vs. text-only
 */
export function Watermark({ opacity = 0.92, scale = 1, compact = false }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6 * scale,
        padding: compact ? `${5 * scale}px ${8 * scale}px` : `${6 * scale}px ${11 * scale}px`,
        borderRadius: 999,
        background: 'rgba(11,18,32,0.55)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        border: '1px solid rgba(255,255,255,0.10)',
        opacity,
        animation: 'mmFadeIn .4s ease'
      }}
    >
      <Star size={14 * scale} />
      {!compact && (
        <span
          style={{
            color: '#fff',
            fontWeight: 800,
            fontSize: 13 * scale,
            letterSpacing: '-0.02em',
            lineHeight: 1
          }}
        >
          millimore
        </span>
      )}
    </div>
  )
}
