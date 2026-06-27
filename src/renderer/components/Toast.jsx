import { colors, radius, shadow } from '@theme/colors'
import { typography } from '@theme/typography'
import { CheckCircleIcon, InfoIcon } from './Icons'
import { useApp } from '../store'

/**
 * Bottom-right toast stack for transient feedback (e.g. "You're live",
 * "Couldn't start the stream"). Driven by the global toast store.
 */
export function ToastHost() {
  const { toasts, dismissToast } = useApp()
  return (
    <div
      style={{
        position: 'fixed',
        right: 20,
        bottom: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        zIndex: 1000,
        maxWidth: 380
      }}
    >
      {toasts.map((t) => {
        const tone = TONES[t.tone] || TONES.info
        return (
          <div
            key={t.id}
            onClick={() => dismissToast(t.id)}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '12px 14px',
              background: '#fff',
              border: `1px solid ${colors.border}`,
              borderLeft: `3px solid ${tone.accent}`,
              borderRadius: radius.card,
              boxShadow: shadow.pop,
              cursor: 'pointer',
              animation: 'mmSlideUp .25s ease'
            }}
          >
            <span style={{ color: tone.accent, flexShrink: 0, marginTop: 1 }}>{tone.icon}</span>
            <span style={{ ...typography.body, color: colors.textPrimary }}>{t.message}</span>
          </div>
        )
      })}
    </div>
  )
}

const TONES = {
  success: { accent: colors.success, icon: <CheckCircleIcon size={18} /> },
  error: { accent: colors.live, icon: <InfoIcon size={18} /> },
  warning: { accent: colors.warning, icon: <InfoIcon size={18} /> },
  info: { accent: colors.primary, icon: <InfoIcon size={18} /> }
}
