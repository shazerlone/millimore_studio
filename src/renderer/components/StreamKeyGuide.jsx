import { colors, radius, shadow } from '@theme/colors'
import { typography } from '@theme/typography'
import { Button } from './ui'
import { ChevronRightIcon } from './Icons'

/**
 * Step-by-step guides for finding a platform's RTMP stream key, shown in a
 * modal next to each destination's key field. Each guide links straight to the
 * platform's live dashboard (opened in the user's real browser).
 */
export const STREAM_KEY_GUIDES = {
  youtube: {
    label: 'YouTube',
    color: '#FF0000',
    url: 'https://www.youtube.com/live_dashboard',
    cta: 'Open YouTube Studio',
    note: 'Your channel must have live streaming enabled (verify your phone number — it can take 24h the first time).',
    steps: [
      'Go to YouTube Studio → click “Create” (top right) → “Go live”.',
      'Choose the “Stream” tab (not “Webcam”).',
      'Under “Stream settings”, find the “Stream key” box.',
      'Click “Copy” next to the stream key and paste it here.',
      'Set the same title/privacy in YouTube; Millimore handles the actual streaming.'
    ]
  },
  facebook: {
    label: 'Facebook',
    color: '#1877F2',
    url: 'https://www.facebook.com/live/producer',
    cta: 'Open Facebook Live Producer',
    note: 'Use a Page or your profile. Persistent stream keys can be enabled so you don’t have to recopy each time.',
    steps: [
      'Open Facebook Live Producer (Creator tools → Live).',
      'Select “Go live”, then choose “Streaming software”.',
      'In “Stream key”, copy the key shown (turn on “Use a persistent stream key” to reuse it).',
      'Paste the key here. Keep the Live Producer tab open until you go live.'
    ]
  },
  instagram: {
    label: 'Instagram',
    color: '#E1306C',
    url: 'https://help.instagram.com/292478487812558',
    cta: 'Instagram Live help',
    note: 'Instagram only allows RTMP stream keys for some Professional/Creator accounts via Live Producer. If you don’t see a key option, you can turn Instagram off and stream to the others.',
    steps: [
      'Switch to a Professional (Creator/Business) account in Instagram settings.',
      'Open Instagram Live Producer on desktop (Meta may require access).',
      'Start a live setup and choose “Streaming software”.',
      'Copy the stream key shown and paste it here.'
    ]
  }
}

export function StreamKeyGuide({ platform, onClose }) {
  const guide = STREAM_KEY_GUIDES[platform]
  if (!guide) return null

  const open = (url) => {
    if (window.millimore?.openExternal) window.millimore.openExternal(url)
    else window.open(url, '_blank')
  }

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
          width: 460,
          maxWidth: '100%',
          background: '#fff',
          borderRadius: radius.lg,
          boxShadow: shadow.pop,
          overflow: 'hidden',
          animation: 'mmCardIn .25s cubic-bezier(.16,1,.3,1)'
        }}
      >
        <div style={{ padding: '20px 22px', borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: guide.color }} />
            <h2 style={{ ...typography.h2, margin: 0 }}>How to get your {guide.label} stream key</h2>
          </div>
        </div>

        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {guide.steps.map((step, i) => (
              <li key={i} style={{ display: 'flex', gap: 12 }}>
                <span
                  style={{
                    flexShrink: 0,
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: colors.primarySoft,
                    color: colors.primary,
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'grid',
                    placeItems: 'center'
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ ...typography.body, color: colors.textPrimary }}>{step}</span>
              </li>
            ))}
          </ol>

          <div
            style={{
              ...typography.small,
              color: colors.textSecondary,
              background: colors.surfaceMuted,
              padding: '10px 12px',
              borderRadius: radius.button
            }}
          >
            💡 {guide.note}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <Button full icon={<ChevronRightIcon size={16} />} onClick={() => open(guide.url)}>
              {guide.cta}
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
