import { useEffect, useRef, useState } from 'react'
import { colors, radius } from '@theme/colors'
import { typography } from '@theme/typography'
import { Page, PageHeader } from '@components/Page'
import { StreamPreview } from '@components/StreamPreview'
import { Card, Field, Input, Toggle, Badge, Button, Spinner } from '@components/ui'
import { LiveIcon, LockIcon, SignalIcon, LayersIcon, CheckIcon, VideoIcon, InfoIcon } from '@components/Icons'
import { ScreenSourcePicker } from '@components/ScreenSourcePicker'
import { StreamKeyGuide, STREAM_KEY_GUIDES } from '@components/StreamKeyGuide'
import { destinations as DESTS, qualityOptions, sampleTrade } from '../data/mock'
import { formatElapsed } from '../lib/quality'
import { StreamCompositor } from '../lib/compositor'
import { useApp } from '../store'

export function GoLive() {
  const { bridge, isLive, setIsLive, overlayConfig, overlayEnabled, setOverlayEnabled, streamStats } = useApp()

  const [title, setTitle] = useState('London Open — Gold Scalping')
  const [quality, setQuality] = useState('1080p30')
  const [enabled, setEnabled] = useState({ millimore: true, youtube: true, instagram: false, facebook: false })
  const [keys, setKeys] = useState({ youtube: '', instagram: '', facebook: '' })
  const [speed, setSpeed] = useState(null)
  const [testing, setTesting] = useState(false)
  const [starting, setStarting] = useState(false)
  const [elapsed, setElapsed] = useState('00:00:00')
  const [overlayTrade, setOverlayTrade] = useState(null)

  // capture state
  const [hasCamera, setHasCamera] = useState(false)
  const [hasScreen, setHasScreen] = useState(false)
  const [screenSource, setScreenSource] = useState(null)
  const [perms, setPerms] = useState(null)
  const [captureError, setCaptureError] = useState(null)

  // modals
  const [showPicker, setShowPicker] = useState(false)
  const [guidePlatform, setGuidePlatform] = useState(null)

  const cameraRef = useRef(null)
  const screenRef = useRef(null)
  const cameraStream = useRef(null)
  const screenStream = useRef(null)
  const compositor = useRef(null)
  const timerRef = useRef(null)
  const startedAt = useRef(null)

  // Load saved stream keys (decrypted in main via safeStorage).
  useEffect(() => {
    if (!bridge) return
    bridge.keys.getAll().then((all) => setKeys((k) => ({ ...k, ...all })))
  }, [bridge])

  // Request camera/mic permission (macOS) then start the camera preview.
  useEffect(() => {
    let cancelled = false
    async function initCamera() {
      try {
        if (bridge?.capture?.permissions) {
          const p = await bridge.capture.permissions()
          if (!cancelled) setPerms(p)
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true
        })
        if (cancelled) return stream.getTracks().forEach((t) => t.stop())
        cameraStream.current = stream
        if (cameraRef.current) cameraRef.current.srcObject = stream
        setHasCamera(true)
      } catch (err) {
        if (!cancelled) setCaptureError('camera')
        console.error('Camera error:', err)
      }
    }
    initCamera()
    return () => {
      cancelled = true
      cameraStream.current?.getTracks().forEach((t) => t.stop())
    }
  }, [bridge])

  // Subscribe to live trade events to drive the overlay preview.
  useEffect(() => {
    if (!bridge) return
    return bridge.mt5.onTrade((t) => {
      if (t.overlay === 'hide') setOverlayTrade(null)
      else setOverlayTrade(t)
    })
  }, [bridge])

  useEffect(() => () => {
    clearInterval(timerRef.current)
    screenStream.current?.getTracks().forEach((t) => t.stop())
  }, [])

  // ---- screen capture ----
  const pickScreen = async (source) => {
    setShowPicker(false)
    try {
      screenStream.current?.getTracks().forEach((t) => t.stop())
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: source.id,
            maxWidth: 1920,
            maxHeight: 1080
          }
        }
      })
      screenStream.current = stream
      if (screenRef.current) screenRef.current.srcObject = stream
      setScreenSource(source)
      setHasScreen(true)
      setCaptureError(null)
    } catch (err) {
      setCaptureError('screen')
      console.error('Screen capture error:', err)
    }
  }

  const runSpeedTest = async () => {
    setTesting(true)
    const res = bridge ? await bridge.stream.testSpeed() : { mbps: 18.2, recommended: '1080p60' }
    setSpeed(res)
    if (res.recommended) setQuality(res.recommended)
    setTesting(false)
  }

  const saveKey = (platform, value) => {
    setKeys((k) => ({ ...k, [platform]: value }))
    bridge?.keys.set(platform, value)
  }

  const startTimer = () => {
    startedAt.current = Date.now()
    timerRef.current = setInterval(() => setElapsed(formatElapsed(Date.now() - startedAt.current)), 500)
  }

  const goLive = async () => {
    setStarting(true)
    const dests = DESTS.filter((d) => enabled[d.platform]).map((d) => ({
      platform: d.platform,
      key: keys[d.platform] || ''
    }))
    try {
      if (bridge) {
        await bridge.stream.start({ quality, destinations: dests, title, overlayRelayKey: keys.millimore || 'demo' })
        // Composite the chosen screen + camera and feed FFmpeg.
        let sourceId = screenSource?.id
        if (!sourceId) {
          const sources = await bridge.capture.getSources()
          sourceId = sources[0]?.id
        }
        if (sourceId) {
          compositor.current = new StreamCompositor({ quality })
          await compositor.current.start(sourceId, cameraStream.current)
        }
      }
      setIsLive(true)
      startTimer()
      if (overlayEnabled) setTimeout(() => setOverlayTrade(sampleTrade), 2500)
    } catch (err) {
      console.error('Failed to go live:', err)
      setCaptureError('stream')
    } finally {
      setStarting(false)
    }
  }

  const stopStream = async () => {
    compositor.current?.stop()
    compositor.current = null
    await bridge?.stream.stop()
    clearInterval(timerRef.current)
    setElapsed('00:00:00')
    setOverlayTrade(null)
    setIsLive(false)
  }

  const activeCount = DESTS.filter((d) => enabled[d.platform]).length
  const screenDenied = perms && perms.screen && perms.screen !== 'granted'

  return (
    <Page maxWidth={1320}>
      <PageHeader
        title="Go Live"
        subtitle="Stream to Millimore, YouTube, Instagram and Facebook — all at once."
        actions={
          isLive ? (
            <Badge tone="red">
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: colors.live, animation: 'mmPulse 1.2s infinite' }} />
              Live · {elapsed}
            </Badge>
          ) : (
            <Badge tone="neutral">Offline</Badge>
          )
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '60% 40%', gap: 20, alignItems: 'start' }}>
        {/* LEFT — preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <StreamPreview
            live={isLive}
            elapsed={elapsed}
            overlayTrade={overlayEnabled ? overlayTrade : null}
            overlayConfig={overlayConfig}
            cameraRef={cameraRef}
            screenRef={screenRef}
            hasScreen={hasScreen}
            hasCamera={hasCamera}
          />

          {/* capture controls */}
          <Card padding={14}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Button
                variant={hasScreen ? 'secondary' : 'primary'}
                size="sm"
                icon={<VideoIcon size={16} />}
                onClick={() => setShowPicker(true)}
                disabled={isLive}
              >
                {hasScreen ? 'Change screen' : 'Select screen to share'}
              </Button>
              {hasScreen && (
                <Badge tone="green">
                  <CheckIcon size={12} /> {screenSource?.name?.slice(0, 28) || 'Screen'}
                </Badge>
              )}
              <Badge tone={hasCamera ? 'green' : 'amber'}>
                <VideoIcon size={12} /> {hasCamera ? 'Camera on' : 'Camera off'}
              </Badge>
            </div>

            {(captureError || screenDenied) && (
              <div
                style={{
                  marginTop: 12,
                  ...typography.small,
                  color: colors.warning,
                  background: colors.warningSoft,
                  padding: '10px 12px',
                  borderRadius: radius.button,
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-start'
                }}
              >
                <InfoIcon size={15} />
                <div>
                  {captureError === 'camera' && 'Camera access was blocked. '}
                  {(captureError === 'screen' || screenDenied) && 'Screen Recording permission is needed. '}
                  On macOS, allow it in System Settings → Privacy & Security, then reopen the app.
                  {bridge?.capture?.openScreenPrefs && (
                    <button
                      onClick={() => bridge.capture.openScreenPrefs()}
                      style={{ marginLeft: 6, color: colors.primary, fontWeight: 600 }}
                    >
                      Open settings
                    </button>
                  )}
                </div>
              </div>
            )}
          </Card>

          <LiveStatsBar stats={streamStats} live={isLive} activeCount={activeCount} quality={quality} />
        </div>

        {/* RIGHT — controls */}
        <Card padding={20} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Field label="Stream title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What are you trading today?" />
          </Field>

          {/* destinations */}
          <div>
            <SubLabel>Destinations</SubLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {DESTS.map((d) => (
                <DestinationRow
                  key={d.platform}
                  dest={d}
                  on={enabled[d.platform]}
                  onToggle={(v) => setEnabled((e) => ({ ...e, [d.platform]: v }))}
                  keyValue={keys[d.platform] || ''}
                  onKey={(v) => saveKey(d.platform, v)}
                  onGuide={() => setGuidePlatform(d.platform)}
                  hasGuide={!!STREAM_KEY_GUIDES[d.platform]}
                  disabled={isLive}
                />
              ))}
            </div>
          </div>

          {/* quality */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <SubLabel>Stream quality</SubLabel>
              <button
                onClick={runSpeedTest}
                disabled={testing}
                style={{ ...typography.caption, color: colors.primary, display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                {testing ? <Spinner size={12} /> : <SignalIcon size={13} />}
                {speed?.mbps ? `${speed.mbps} Mbps` : 'Test speed'}
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {qualityOptions.map((q) => (
                <QualityRow
                  key={q.value}
                  opt={q}
                  selected={quality === q.value}
                  recommended={speed?.recommended === q.value}
                  onSelect={() => setQuality(q.value)}
                  disabled={isLive}
                />
              ))}
            </div>
          </div>

          {/* overlay toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: 14,
              borderRadius: radius.card,
              background: colors.surfaceMuted
            }}
          >
            <span style={{ color: colors.primary }}>
              <LayersIcon size={20} />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ ...typography.bodyStrong, color: colors.textPrimary }}>MT5 trade overlay</div>
              <div style={{ ...typography.small, color: colors.textSecondary }}>
                Show trade cards automatically when positions open or close
              </div>
            </div>
            <Toggle checked={overlayEnabled} onChange={setOverlayEnabled} />
          </div>

          {/* GO LIVE */}
          {isLive ? (
            <Button variant="danger" size="xl" full onClick={stopStream} icon={<span style={{ width: 10, height: 10, background: '#fff', borderRadius: 2 }} />}>
              STOP STREAM
            </Button>
          ) : (
            <Button variant="primary" size="xl" full onClick={goLive} disabled={starting} icon={!starting && <LiveIcon size={20} />}>
              {starting ? <Spinner size={18} color="#fff" /> : 'GO LIVE'}
            </Button>
          )}
        </Card>
      </div>

      {showPicker && <ScreenSourcePicker onPick={pickScreen} onClose={() => setShowPicker(false)} />}
      {guidePlatform && <StreamKeyGuide platform={guidePlatform} onClose={() => setGuidePlatform(null)} />}
    </Page>
  )
}

function SubLabel({ children }) {
  return <div style={{ ...typography.label, color: colors.textSecondary, marginBottom: 10 }}>{children}</div>
}

function DestinationRow({ dest, on, onToggle, keyValue, onKey, onGuide, hasGuide, disabled }) {
  return (
    <div
      style={{
        border: `1px solid ${on ? colors.borderStrong : colors.border}`,
        borderRadius: radius.card,
        padding: 12,
        transition: 'border-color .15s ease'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: dest.color }} />
        <span style={{ ...typography.bodyStrong, color: colors.textPrimary }}>{dest.label}</span>
        {dest.always ? (
          <Badge tone="blue" style={{ marginLeft: 'auto' }}>
            <LockIcon size={11} /> Always on
          </Badge>
        ) : (
          <div style={{ marginLeft: 'auto' }}>
            <Toggle checked={on} onChange={onToggle} disabled={disabled} />
          </div>
        )}
      </div>
      {!dest.always && on && (
        <>
          <Input
            style={{ marginTop: 10, fontSize: 13 }}
            type="password"
            placeholder={`Paste ${dest.label} stream key`}
            value={keyValue}
            onChange={(e) => onKey(e.target.value)}
            disabled={disabled}
          />
          {hasGuide && (
            <button
              onClick={onGuide}
              style={{
                marginTop: 8,
                ...typography.caption,
                color: colors.primary,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <InfoIcon size={13} /> Where do I find my {dest.label} stream key?
            </button>
          )}
        </>
      )}
    </div>
  )
}

function QualityRow({ opt, selected, recommended, onSelect, disabled }) {
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        textAlign: 'left',
        padding: '11px 13px',
        borderRadius: radius.button,
        border: `1px solid ${selected ? colors.primary : colors.borderStrong}`,
        background: selected ? colors.primarySoft : colors.surface,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          border: `2px solid ${selected ? colors.primary : colors.borderStrong}`,
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0
        }}
      >
        {selected && <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors.primary }} />}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ ...typography.bodyStrong, color: colors.textPrimary }}>{opt.title}</div>
        <div style={{ ...typography.small, color: colors.textSecondary }}>{opt.desc}</div>
      </div>
      {recommended && <Badge tone="green"><CheckIcon size={11} /> Best</Badge>}
    </button>
  )
}

function LiveStatsBar({ stats, live, activeCount, quality }) {
  const items = [
    { label: 'Status', value: live ? 'Streaming' : 'Idle', tone: live ? colors.live : colors.textSecondary },
    { label: 'Destinations', value: String(activeCount) },
    { label: 'Quality', value: quality.replace('p', 'p · ').replace('30', '30fps').replace('60', '60fps') },
    { label: 'Bitrate', value: stats?.bitrateKbps ? `${Math.round(stats.bitrateKbps)} kbps` : '—' },
    { label: 'FPS', value: stats?.fps ? Math.round(stats.fps) : '—' },
    { label: 'Dropped', value: stats?.dropped ?? 0 }
  ]
  return (
    <Card padding={14}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
        {items.map((it) => (
          <div key={it.label}>
            <div style={{ ...typography.caption, color: colors.textTertiary }}>{it.label}</div>
            <div style={{ ...typography.bodyStrong, color: it.tone || colors.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
              {it.value}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
