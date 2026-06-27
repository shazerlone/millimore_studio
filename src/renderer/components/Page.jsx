import { colors } from '@theme/colors'
import { typography } from '@theme/typography'

/** Scrollable main-area container with consistent padding. */
export function Page({ children, maxWidth = 1180 }) {
  return (
    <div style={{ flex: 1, height: '100%', overflowY: 'auto', background: colors.background }}>
      <div style={{ maxWidth, margin: '0 auto', padding: '28px 36px 56px' }}>{children}</div>
    </div>
  )
}

/** Top-of-page title block with optional subtitle and right-side actions. */
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        marginBottom: 26
      }}
    >
      <div>
        <h1 style={{ ...typography.h1, margin: 0, color: colors.textPrimary }}>{title}</h1>
        {subtitle && (
          <p style={{ ...typography.body, color: colors.textSecondary, margin: '6px 0 0' }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>{actions}</div>}
    </div>
  )
}
