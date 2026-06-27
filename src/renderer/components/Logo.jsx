import { colors } from '@theme/colors'

/**
 * Millimore wordmark: lowercase bold "millimore" + a blue 4-point star.
 */
export function Logo({ size = 20, showStar = true, color = colors.dark }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.35 }}>
      <span
        style={{
          fontSize: size,
          fontWeight: 800,
          letterSpacing: '-0.03em',
          color,
          lineHeight: 1
        }}
      >
        millimore
      </span>
      {showStar && <Star size={size * 0.9} />}
    </div>
  )
}

/** Four-point sparkle star in primary blue. */
export function Star({ size = 18, color = colors.primary }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 0c.6 6.1 5.9 11.4 12 12-6.1.6-11.4 5.9-12 12-.6-6.1-5.9-11.4-12-12C6.1 11.4 11.4 6.1 12 0Z"
        fill={color}
      />
    </svg>
  )
}
