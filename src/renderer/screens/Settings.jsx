import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { colors, radius } from '@theme/colors'
import { typography } from '@theme/typography'
import { Page, PageHeader } from '@components/Page'
import { Card, Field, Input, Select, Toggle, Button, Badge, Spinner } from '@components/ui'
import { UserIcon, VideoIcon, MicIcon, BellIcon, InfoIcon, LiveIcon, CheckIcon } from '@components/Icons'
import { trader, qualityOptions } from '../data/mock'
import { useApp } from '../store'

const SECTIONS = [
  { id: 'profile', label: 'Profile', Icon: UserIcon },
  { id: 'stream', label: 'Stream', Icon: LiveIcon },
  { id: 'notifications', label: 'Notifications', Icon: BellIcon },
  { id: 'audio', label: 'Audio', Icon: MicIcon },
  { id: 'camera', label: 'Camera', Icon: VideoIcon },
  { id: 'about', label: 'About', Icon: InfoIcon }
]

export function Settings() {
  const { bridge, signOut } = useApp()
  const navigate = useNavigate()
  const [active, setActive] = useState('profile')
  const [devices, setDevices] = useState({ mics: [], cams: [] })
  const [version, setVersion] = useState('1.0.0')
  const [notif, setNotif] = useState({ trades: true, milestones: true, followers: false })
  const [micVol, setMicVol] = useState(80)

  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then((list) => {
      setDevices({
        mics: list.filter((d) => d.kind === 'audioinput'),
        cams: list.filter((d) => d.kind === 'videoinput')
      })
    })
    bridge?.app.getVersion().then(setVersion)
  }, [bridge])

  return (
    <Page maxWidth={1040}>
      <PageHeader title="Settings" subtitle="Manage your profile, stream defaults and devices." />

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 20, alignItems: 'start' }}>
        <Card padding={6}>
          {SECTIONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                borderRadius: radius.button,
                color: active === id ? colors.primary : colors.textSecondary,
                background: active === id ? colors.primarySoft : 'transparent',
                fontWeight: active === id ? 600 : 500,
                fontSize: 14
              }}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </Card>

        <Card padding={24}>
          {active === 'profile' && <ProfileSection />}
          {active === 'stream' && <StreamSection />}
          {active === 'notifications' && <NotifSection notif={notif} setNotif={setNotif} />}
          {active === 'audio' && <AudioSection mics={devices.mics} micVol={micVol} setMicVol={setMicVol} />}
          {active === 'camera' && <CameraSection cams={devices.cams} />}
          {active === 'about' && (
            <AboutSection
              version={version}
              bridge={bridge}
              onSignOut={() => {
                signOut()
                navigate('/login')
              }}
            />
          )}
        </Card>
      </div>
    </Page>
  )
}

function H({ children }) {
  return <h2 style={{ ...typography.h2, margin: '0 0 18px', color: colors.textPrimary }}>{children}</h2>
}

function ProfileSection() {
  return (
    <div>
      <H>Profile</H>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22 }}>
        <img src={trader.avatar} alt="" width={64} height={64} style={{ borderRadius: '50%', objectFit: 'cover' }} />
        <div>
          <Button variant="secondary" size="sm">Change avatar</Button>
          <div style={{ ...typography.small, color: colors.textTertiary, marginTop: 6 }}>JPG or PNG, up to 4MB</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
        <Field label="Display name">
          <Input defaultValue={trader.name} />
        </Field>
        <Field label="Bio">
          <textarea
            defaultValue={trader.bio}
            rows={3}
            style={{
              width: '100%',
              padding: '11px 14px',
              borderRadius: radius.button,
              border: `1px solid ${colors.borderStrong}`,
              resize: 'vertical',
              outline: 'none',
              fontFamily: 'inherit'
            }}
          />
        </Field>
        <div><Button>Save changes</Button></div>
      </div>
    </div>
  )
}

function StreamSection() {
  return (
    <div>
      <H>Stream defaults</H>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
        <Field label="Default quality">
          <Select defaultValue="1080p30">
            {qualityOptions.map((q) => (
              <option key={q.value} value={q.value}>{q.title}</option>
            ))}
          </Select>
        </Field>
        <Field label="Default destinations">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
            {['Millimore', 'YouTube', 'Instagram', 'Facebook'].map((p, i) => (
              <ToggleRow key={p} label={p} defaultOn={i < 2} locked={i === 0} />
            ))}
          </div>
        </Field>
        <div><Button>Save defaults</Button></div>
      </div>
    </div>
  )
}

function NotifSection({ notif, setNotif }) {
  const items = [
    { key: 'trades', label: 'Trade alerts', desc: 'When a trade card fires on your stream' },
    { key: 'milestones', label: 'Viewer milestones', desc: 'When you hit viewer count milestones' },
    { key: 'followers', label: 'Follower alerts', desc: 'When you gain new followers' }
  ]
  return (
    <div>
      <H>Notifications</H>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 520 }}>
        {items.map((it) => (
          <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: `1px solid ${colors.border}` }}>
            <div style={{ flex: 1 }}>
              <div style={{ ...typography.bodyStrong, color: colors.textPrimary }}>{it.label}</div>
              <div style={{ ...typography.small, color: colors.textSecondary }}>{it.desc}</div>
            </div>
            <Toggle checked={notif[it.key]} onChange={(v) => setNotif({ ...notif, [it.key]: v })} />
          </div>
        ))}
      </div>
    </div>
  )
}

function AudioSection({ mics, micVol, setMicVol }) {
  return (
    <div>
      <H>Audio</H>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
        <Field label="Microphone">
          <Select>
            {mics.length ? (
              mics.map((m) => <option key={m.deviceId} value={m.deviceId}>{m.label || 'Microphone'}</option>)
            ) : (
              <option>Default microphone</option>
            )}
          </Select>
        </Field>
        <Field label={`Microphone volume — ${micVol}%`}>
          <input
            type="range"
            min="0"
            max="100"
            value={micVol}
            onChange={(e) => setMicVol(Number(e.target.value))}
            style={{ width: '100%', accentColor: colors.primary }}
          />
        </Field>
      </div>
    </div>
  )
}

function CameraSection({ cams }) {
  return (
    <div>
      <H>Camera</H>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
        <Field label="Camera">
          <Select>
            {cams.length ? (
              cams.map((c) => <option key={c.deviceId} value={c.deviceId}>{c.label || 'Camera'}</option>)
            ) : (
              <option>Default camera</option>
            )}
          </Select>
        </Field>
        <Field label="Resolution">
          <Select defaultValue="720p">
            <option value="480p">480p</option>
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
          </Select>
        </Field>
      </div>
    </div>
  )
}

function AboutSection({ version, bridge, onSignOut }) {
  const [checking, setChecking] = useState(false)
  const [status, setStatus] = useState(null)
  const check = async () => {
    setChecking(true)
    const res = bridge ? await bridge.app.checkForUpdates() : { upToDate: true }
    setStatus(res.upToDate ? 'up-to-date' : 'update-available')
    setChecking(false)
  }
  return (
    <div>
      <H>About</H>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div style={{ width: 52, height: 52, borderRadius: 12, background: colors.dark, display: 'grid', placeItems: 'center' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 0c.6 6.1 5.9 11.4 12 12-6.1.6-11.4 5.9-12 12-.6-6.1-5.9-11.4-12-12C6.1 11.4 11.4 6.1 12 0Z" fill={colors.primary} />
          </svg>
        </div>
        <div>
          <div style={{ ...typography.h3, color: colors.textPrimary }}>Millimore Desktop</div>
          <div style={{ ...typography.small, color: colors.textSecondary }}>Version {version}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button variant="secondary" onClick={check} disabled={checking}>
          {checking ? <Spinner size={15} /> : 'Check for updates'}
        </Button>
        {status === 'up-to-date' && <Badge tone="green"><CheckIcon size={12} /> Up to date</Badge>}
        {status === 'update-available' && <Badge tone="blue">Update available</Badge>}
      </div>

      <div style={{ borderTop: `1px solid ${colors.border}`, margin: '22px 0 0', paddingTop: 20 }}>
        <div style={{ ...typography.bodyStrong, color: colors.textPrimary, marginBottom: 2 }}>Account</div>
        <div style={{ ...typography.small, color: colors.textSecondary, marginBottom: 12 }}>
          You’ll stay signed in on this device until you sign out.
        </div>
        <Button variant="secondary" onClick={onSignOut}>
          Sign out
        </Button>
      </div>
    </div>
  )
}

function ToggleRow({ label, defaultOn, locked }) {
  const [on, setOn] = useState(defaultOn)
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ ...typography.body, color: colors.textPrimary }}>{label}</span>
      <Toggle checked={locked ? true : on} onChange={setOn} disabled={locked} />
    </div>
  )
}
