import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { colors, radius } from '@theme/colors'
import { typography } from '@theme/typography'
import { Logo } from '@components/Logo'
import { Button, Badge, Spinner } from '@components/ui'
import { VideoIcon, MicIcon, EyeIcon, CheckIcon, CheckCircleIcon } from '@components/Icons'
import { useApp } from '../store'

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')

export function Onboarding() {
  const navigate = useNavigate()
  const { bridge, completeOnboarding } = useApp()
  const [status, setStatus] = useState({ camera: 'unknown', microphone: 'unknown', screen: 'unknown' })
  const [busy, setBusy] = useState(null)
  const [needsRestart, setNeedsRestart] = useState(false)
  const [inApps, setInApps] = useState(true)

  const refresh = async () => {
    if (!bridge?.capture?.permissions) {
      setStatus({ camera: 'granted', microphone: 'granted', screen: 'granted' })
      return
    }
    const p = await bridge.capture.permissions()
    setStatus(p)
  }

  useEffect(() => {
    refresh()
    bridge?.app?.isInApplicationsFolder?.().then((v) => setInApps(v !== false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const enableCamera = async () => {
    setBusy('camera')
    try {
      await bridge?.capture?.requestCamera?.()
      const s = await navigator.mediaDevices.getUserMedia({ video: true })
      s.getTracks().forEach((t) => t.stop())
      setStatus((st) => ({ ...st, camera: 'granted' }))
    } catch {
      setStatus((st) => ({ ...st, camera: 'denied' }))
    } finally {
      setBusy(null)
      refresh()
    }
  }

  const enableMic = async () => {
    setBusy('microphone')
    try {
      await bridge?.capture?.requestMic?.()
      const s = await navigator.mediaDevices.getUserMedia({ audio: true })
      s.getTracks().forEach((t) => t.stop())
      setStatus((st) => ({ ...st, microphone: 'granted' }))
    } catch {
      setStatus((st) => ({ ...st, microphone: 'denied' }))
    } finally {
      setBusy(null)
      refresh()
    }
  }

  const enableScreen = async () => {
    setBusy('screen')
    try {
      const s = await bridge?.capture?.triggerScreenPrompt?.()
      setStatus((st) => ({ ...st, screen: s || 'not-determined' }))
      if (s !== 'granted') {
        await bridge?.capture?.openScreenPrefs?.()
        setNeedsRestart(true)
      }
    } finally {
      setBusy(null)
    }
  }

  const finish = () => {
    completeOnboarding()
    navigate('/')
  }

  const camOk = status.camera === 'granted'
  const micOk = status.microphone === 'granted'
  const ready = camOk && micOk

  return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center', background: colors.background, padding: 24, overflowY: 'auto' }}>
      <div style={{ width: 560, maxWidth: '100%', animation: 'mmSlideUp .4s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <Logo size={26} />
        </div>
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <h1 style={{ ...typography.h1, margin: 0 }}>Let’s set up your studio</h1>
          <p style={{ ...typography.body, color: colors.textSecondary, marginTop: 8 }}>
            Millimore needs access to your camera, microphone and screen to stream. Grant each
            below — it only takes a moment.
          </p>
        </div>

        {!inApps && (
          <div
            style={{
              marginBottom: 14,
              padding: 16,
              borderRadius: radius.card,
              border: `1px solid ${colors.primary}`,
              background: colors.primarySoft,
              display: 'flex',
              alignItems: 'center',
              gap: 14
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ ...typography.h3, color: colors.textPrimary }}>
                Move Millimore to Applications first
              </div>
              <div style={{ ...typography.small, color: colors.textSecondary, marginTop: 2 }}>
                You’re running it from the disk image / Downloads. macOS won’t remember camera or
                screen permissions until the app lives in your Applications folder.
              </div>
            </div>
            <Button
              onClick={async () => {
                const r = await bridge?.app?.moveToApplications?.()
                if (r && r.ok === false) setInApps(true) // let them continue if move failed
              }}
            >
              Move &amp; relaunch
            </Button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <PermissionRow
            icon={<VideoIcon size={20} />}
            title="Camera"
            desc="For your picture-in-picture webcam on stream."
            status={status.camera}
            busy={busy === 'camera'}
            onEnable={enableCamera}
          />
          <PermissionRow
            icon={<MicIcon size={20} />}
            title="Microphone"
            desc="So your voice is part of the broadcast."
            status={status.microphone}
            busy={busy === 'microphone'}
            onEnable={enableMic}
          />
          <PermissionRow
            icon={<EyeIcon size={20} />}
            title="Screen Recording"
            desc={isMac ? 'Required to capture your trading screen. macOS needs an app restart after you enable this.' : 'Required to capture your trading screen.'}
            status={status.screen}
            busy={busy === 'screen'}
            onEnable={enableScreen}
            optional
          />
        </div>

        {needsRestart && (
          <div
            style={{
              marginTop: 16,
              padding: 14,
              borderRadius: radius.card,
              background: colors.warningSoft,
              color: colors.warning,
              ...typography.bodyStrong,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 12
            }}
          >
            <span style={{ flex: 1 }}>
              After ticking <strong>Millimore Desktop</strong> in System Settings → Screen Recording,
              restart the app for it to take effect.
            </span>
            <Button size="sm" onClick={() => bridge?.restart?.()}>
              Restart now
            </Button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 24, alignItems: 'center' }}>
          <Button size="lg" onClick={finish} disabled={!ready} style={{ flex: 1 }} icon={<CheckIcon size={18} />}>
            {ready ? 'Enter Millimore Desktop' : 'Grant camera & mic to continue'}
          </Button>
          <Button variant="ghost" onClick={finish}>
            Skip
          </Button>
        </div>
        <button
          onClick={refresh}
          style={{ ...typography.caption, color: colors.textTertiary, display: 'block', margin: '14px auto 0' }}
        >
          Re-check permissions
        </button>
      </div>
    </div>
  )
}

function PermissionRow({ icon, title, desc, status, busy, onEnable, optional }) {
  const granted = status === 'granted'
  const denied = status === 'denied' || status === 'restricted'
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: 16,
        borderRadius: radius.card,
        border: `1px solid ${granted ? colors.successSoft : colors.border}`,
        background: granted ? colors.successSoft : colors.surface
      }}
    >
      <span
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: granted ? '#fff' : colors.primarySoft,
          color: granted ? colors.success : colors.primary,
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0
        }}
      >
        {granted ? <CheckCircleIcon size={22} /> : icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...typography.h3, color: colors.textPrimary }}>{title}</span>
          {optional && !granted && <Badge tone="neutral">Recommended</Badge>}
        </div>
        <div style={{ ...typography.small, color: colors.textSecondary, marginTop: 2 }}>{desc}</div>
      </div>
      {granted ? (
        <Badge tone="green"><CheckIcon size={12} /> Allowed</Badge>
      ) : (
        <Button variant={denied ? 'secondary' : 'primary'} size="sm" onClick={onEnable} disabled={busy}>
          {busy ? <Spinner size={14} color="#fff" /> : denied ? 'Open settings' : 'Enable'}
        </Button>
      )}
    </div>
  )
}
