import { useEffect, useState } from 'react'
import { colors, radius, shadow } from '@theme/colors'
import { typography } from '@theme/typography'
import { Button, Spinner, Badge } from './ui'
import { VideoIcon, EyeIcon } from './Icons'

/**
 * Modal that lists every capturable screen and window (with live thumbnails
 * from desktopCapturer) and lets the trader choose what to broadcast.
 */
export function ScreenSourcePicker({ onPick, onClose }) {
  const [sources, setSources] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const bridge = window.millimore
    if (!bridge) {
      setError('Screen capture is only available in the desktop app.')
      return
    }
    bridge.capture
      .getSources()
      .then(setSources)
      .catch((e) => setError(e.message || 'Could not list screens.'))
  }, [])

  const screens = (sources || []).filter((s) => s.kind === 'screen')
  const windows = (sources || []).filter((s) => s.kind === 'window')

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: colors.overlayScrim,
        display: 'grid',
        placeItems: 'center',
        zIndex: 100,
        animation: 'mmFadeIn .15s ease',
        padding: 24
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 720,
          maxWidth: '100%',
          maxHeight: '80vh',
          background: '#fff',
          borderRadius: radius.lg,
          boxShadow: shadow.pop,
          display: 'flex',
          flexDirection: 'column',
          animation: 'mmCardIn .25s cubic-bezier(.16,1,.3,1)'
        }}
      >
        <div
          style={{
            padding: '18px 22px',
            borderBottom: `1px solid ${colors.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <h2 style={{ ...typography.h2, margin: 0 }}>Choose what to share</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div style={{ padding: 22, overflowY: 'auto' }}>
          {error && <PermissionEmptyState />}
          {!sources && !error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: colors.textSecondary }}>
              <Spinner size={18} /> Loading screens…
            </div>
          )}
          {sources && (
            <>
              <Section title="Entire screen" items={screens} onPick={onPick} />
              {windows.length > 0 && <Section title="App windows" items={windows} onPick={onPick} />}
              {windows.length === 0 && <NoWindowsHint />}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** Friendly, modern empty state when screen capture is blocked by macOS. */
function PermissionEmptyState() {
  const bridge = window.millimore
  return (
    <div style={{ textAlign: 'center', padding: '24px 12px' }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: colors.primarySoft,
          color: colors.primary,
          display: 'grid',
          placeItems: 'center',
          margin: '0 auto 16px'
        }}
      >
        <EyeIcon size={26} />
      </div>
      <h3 style={{ ...typography.h3, color: colors.textPrimary, margin: '0 0 6px' }}>
        Screen Recording isn’t enabled yet
      </h3>
      <p style={{ ...typography.body, color: colors.textSecondary, margin: '0 auto 18px', maxWidth: 380 }}>
        macOS needs permission to capture your screen. Enable <strong>Millimore Desktop</strong> under
        System Settings → Privacy &amp; Security → Screen Recording, then restart the app. Make sure
        the app lives in your <strong>Applications</strong> folder so the permission sticks.
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        {bridge?.capture?.openScreenPrefs && (
          <Button onClick={() => bridge.capture.openScreenPrefs()}>Open System Settings</Button>
        )}
        {bridge?.restart && (
          <Button variant="secondary" onClick={() => bridge.restart()}>
            Restart app
          </Button>
        )}
      </div>
    </div>
  )
}

function NoWindowsHint() {
  const bridge = window.millimore
  return (
    <div
      style={{
        padding: 14,
        borderRadius: radius.card,
        background: colors.warningSoft,
        color: colors.warning,
        ...typography.small
      }}
    >
      <strong>Not seeing your other apps (Chrome, MT5, etc.)?</strong> macOS only lists other
      windows once Screen Recording is granted <em>and</em> the app has been restarted. Capturing
      “Entire screen” above always works.
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {bridge?.restart && (
          <Button size="sm" onClick={() => bridge.restart()}>
            Restart app
          </Button>
        )}
        {bridge?.capture?.openScreenPrefs && (
          <Button variant="secondary" size="sm" onClick={() => bridge.capture.openScreenPrefs()}>
            Open settings
          </Button>
        )}
      </div>
    </div>
  )
}

function Section({ title, items, onPick }) {
  if (!items.length) return null
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ ...typography.label, color: colors.textSecondary, marginBottom: 12 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {items.map((s) => (
          <button
            key={s.id}
            onClick={() => onPick(s)}
            style={{
              textAlign: 'left',
              border: `1px solid ${colors.borderStrong}`,
              borderRadius: radius.card,
              overflow: 'hidden',
              background: colors.surface,
              padding: 0,
              transition: 'border-color .12s ease, box-shadow .12s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = colors.primary
              e.currentTarget.style.boxShadow = `0 0 0 3px ${colors.primarySoft}`
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = colors.borderStrong
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <div style={{ aspectRatio: '16/9', background: '#0B1220' }}>
              {s.thumbnail ? (
                <img src={s.thumbnail} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#64748B' }}>
                  <VideoIcon size={22} />
                </div>
              )}
            </div>
            <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
              {s.kind === 'screen' && <Badge tone="blue">Screen</Badge>}
              <span
                style={{
                  ...typography.small,
                  color: colors.textPrimary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {s.name}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
