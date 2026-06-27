import { colors, radius, shadow } from '@theme/colors'
import { typography } from '@theme/typography'

/* ------------------------------------------------------------------ Button */

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  full = false,
  disabled = false,
  icon = null,
  style = {},
  ...rest
}) {
  const sizes = {
    sm: { padding: '7px 12px', fontSize: 13 },
    md: { padding: '10px 16px', fontSize: 14 },
    lg: { padding: '14px 20px', fontSize: 15 },
    xl: { padding: '18px 24px', fontSize: 16 }
  }
  const variants = {
    primary: { background: colors.primary, color: '#fff' },
    danger: { background: colors.live, color: '#fff' },
    success: { background: colors.success, color: '#fff' },
    secondary: {
      background: colors.surface,
      color: colors.textPrimary,
      border: `1px solid ${colors.borderStrong}`
    },
    ghost: { background: 'transparent', color: colors.textSecondary },
    subtle: { background: colors.surfaceMuted, color: colors.textPrimary }
  }
  const v = variants[variant] || variants.primary
  const s = sizes[size]
  return (
    <button
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        fontWeight: 600,
        borderRadius: radius.button,
        transition: 'filter .15s ease, background .15s ease, opacity .15s ease',
        width: full ? '100%' : 'auto',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...s,
        ...v,
        ...style
      }}
      onMouseOver={(e) => !disabled && (e.currentTarget.style.filter = 'brightness(0.96)')}
      onMouseOut={(e) => (e.currentTarget.style.filter = 'none')}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------- Input */

export function Field({ label, hint, children, htmlFor }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      {label && (
        <label
          htmlFor={htmlFor}
          style={{ ...typography.bodyStrong, color: colors.textPrimary, fontSize: 13 }}
        >
          {label}
        </label>
      )}
      {children}
      {hint && <span style={{ ...typography.small, color: colors.textTertiary }}>{hint}</span>}
    </div>
  )
}

export function Input({ style = {}, ...rest }) {
  return (
    <input
      style={{
        width: '100%',
        padding: '11px 14px',
        borderRadius: radius.button,
        border: `1px solid ${colors.borderStrong}`,
        background: colors.surface,
        outline: 'none',
        transition: 'border-color .15s ease, box-shadow .15s ease',
        ...style
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = colors.primary
        e.currentTarget.style.boxShadow = `0 0 0 3px ${colors.primarySoft}`
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = colors.borderStrong
        e.currentTarget.style.boxShadow = 'none'
      }}
      {...rest}
    />
  )
}

export function Select({ children, style = {}, ...rest }) {
  return (
    <select
      style={{
        width: '100%',
        padding: '11px 14px',
        borderRadius: radius.button,
        border: `1px solid ${colors.borderStrong}`,
        background: colors.surface,
        outline: 'none',
        cursor: 'pointer',
        ...style
      }}
      {...rest}
    >
      {children}
    </select>
  )
}

/* -------------------------------------------------------------------- Card */

export function Card({ children, style = {}, padding = 20, hover = false, ...rest }) {
  return (
    <div
      style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.card,
        padding,
        boxShadow: shadow.sm,
        transition: 'box-shadow .15s ease, transform .15s ease, border-color .15s ease',
        ...style
      }}
      onMouseOver={(e) => {
        if (!hover) return
        e.currentTarget.style.boxShadow = shadow.card
        e.currentTarget.style.borderColor = colors.borderStrong
      }}
      onMouseOut={(e) => {
        if (!hover) return
        e.currentTarget.style.boxShadow = shadow.sm
        e.currentTarget.style.borderColor = colors.border
      }}
      {...rest}
    >
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ Toggle */

export function Toggle({ checked, onChange, disabled = false }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 42,
        height: 24,
        borderRadius: radius.pill,
        background: checked ? colors.primary : colors.borderStrong,
        position: 'relative',
        transition: 'background .18s ease',
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer'
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 20 : 2,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: shadow.sm,
          transition: 'left .18s ease'
        }}
      />
    </button>
  )
}

/* ------------------------------------------------------------------- Badge */

export function Badge({ children, tone = 'neutral', style = {} }) {
  const tones = {
    neutral: { background: colors.surfaceMuted, color: colors.textSecondary },
    blue: { background: colors.primarySoft, color: colors.primary },
    green: { background: colors.successSoft, color: colors.success },
    red: { background: colors.liveSoft, color: colors.live },
    amber: { background: colors.warningSoft, color: colors.warning }
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 9px',
        borderRadius: radius.pill,
        fontSize: 12,
        fontWeight: 600,
        ...tones[tone],
        ...style
      }}
    >
      {children}
    </span>
  )
}

/** Small verified check used next to trader names. */
export function VerifiedBadge({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="Verified">
      <path
        d="M12 2l2.4 1.8 3-.2 1 2.8 2.6 1.6-1 2.9 1 2.9-2.6 1.6-1 2.8-3-.2L12 22l-2.4-1.8-3 .2-1-2.8L3 16.2l1-2.9-1-2.9 2.6-1.6 1-2.8 3 .2L12 2z"
        fill={colors.primary}
      />
      <path d="M8.5 12l2.3 2.3 4.7-4.8" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

/* ----------------------------------------------------------------- Spinner */

export function Spinner({ size = 18, color = colors.primary }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        border: `2px solid ${colors.border}`,
        borderTopColor: color,
        borderRadius: '50%',
        display: 'inline-block',
        animation: 'mmSpin .7s linear infinite'
      }}
    />
  )
}

/* ------------------------------------------------------- Section / PageHead */

export function SectionTitle({ children, action }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14
      }}
    >
      <h2 style={{ ...typography.h2, margin: 0, color: colors.textPrimary }}>{children}</h2>
      {action}
    </div>
  )
}
