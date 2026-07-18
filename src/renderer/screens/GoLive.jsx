import { useEffect, useRef, useState } from 'react'
import { colors, radius } from '@theme/colors'
import { typography } from '@theme/typography'
import { Page, PageHeader } from '@components/Page'
import { StreamPreview } from '@components/StreamPreview'
import { Card, Field, Input, Select, Toggle, Badge, Button, Spinner } from '@components/ui'
import {
  LiveIcon,
  LockIcon,
  SignalIcon,
  LayersIcon,
  CheckIcon,
  VideoIcon,
  MicIcon,
  InfoIcon
} from '@components/Icons'
import { ScreenSourcePicker } from '@components/ScreenSourcePicker'
import { StreamKeyGuide, STREAM_KEY_GUIDES } from '@components/StreamKeyGuide'
import { TradePlacement } from '@components/TradePlacement'
import { CoachMarks, GO_LIVE_TOUR } from '@components/CoachMarks'
import { destinations as DESTS, qualityOptions } from '../data/mock'
import { formatElapsed } from '../lib/quality'
import { OverlayPump } from '../lib/overlayPump'
import { useApp } from '../store'

export function GoLive() {
  const { bridge, isLive, setIsLive, overlayConfig, updateOverlay, overlayEnabled, setOverlayEnabled, streamStats, pushToast } = useApp()

  const [title, setTitle] = useState('London Open — Gold Scalping')
  const [quality, setQuality] = useState('720p30')
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
  const [captureError, setCaptureError] = useState(null)

  // devices
  const [devices, setDevices] = useState({ cams: [], mics: [] })
  const [camId, setCamId] = useState('')
  const [micId, setMicId] = useState('')

  // connection health
  const [health, setHealth] = useState(null) // { state, ... }

  // preview streams (state so the preview re-renders + attaches on mount)
  const [camStream, setCamStream] = useState(null)
  const [screenStreamState, setScreenStreamState] = useState(null)

  // scene: live | starting | brb | ending
  const [scene, setScene] = useState('live')
  const [recordEnabled, setRecordEnabled] = useState(false)

  // modals / guide
  const [showPicker, setShowPicker] = useState(false)
  const [guidePlatform, setGuidePlatform] = useState(null)
  const [showGuide, setShowGuide] = useState(false)

  const cameraStream = useRef(null)
  const screenStream = useRef(null)
  const compositor = useRef(null)
  const overlayPump = useRef(null)
  const timerRef = useRef(null)
  const startedAt = useRef(null)
  const tradeHideTimer = useRef(null)

  // Live refs so the compositor's per-frame painter sees current values
  // (config edits + the active trade) without restarting the stream.
  const overlayConfigRef = useRef(overlayConfig)
  const overlayTradeRef = useRef(null)
  const sceneRef = useRef('live')
  overlayConfigRef.current = overlayConfig
  overlayTradeRef.current = overlayEnabled ? overlayTrade : null
  sceneRef.current = scene

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
        await acquireCamera()
        // Enumerate devices (labels appear only after permission is granted).
        const list = await navigator.mediaDevices.enumerateDevices()
        if (!cancelled) {
          setDevices({
            cams: list.filter((d) => d.kind === 'videoinput'),
            mics: list.filter((d) => d.kind === 'audioinput')
          })
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge])

  // (Re)acquire the camera + mic using the currently selected devices.
  const acquireCamera = async () => {
    cameraStream.current?.getTracks().forEach((t) => t.stop())
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: camId ? { exact: camId } : undefined,
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: micId ? { deviceId: { exact: micId } } : true
    })
    cameraStream.current = stream
    setCamStream(stream)
    setHasCamera(true)
    return stream
  }

  // Apply a device change: re-acquire locally for the preview. The engine's
  // capture devices are fixed per session, so mid-stream changes take effect
  // on the next Go Live (be upfront about it).
  const changeDevice = async (kind, id) => {
    if (kind === 'cam') setCamId(id)
    else setMicId(id)
    // Defer so state is set before re-acquire reads it.
    setTimeout(async () => {
      try {
        const stream = await acquireCamera()
        if (isLive) {
          compositor.current?.setCameraStream(stream)
          pushToast('Device change will apply the next time you go live.', 'info', 5000)
        }
      } catch (err) {
        console.error('Device switch failed:', err)
      }
    }, 0)
  }

  // Watch stream health (reconnects / unstable upload) and auto-downgrade once.
  useEffect(() => {
    if (!bridge) return
    return bridge.stream.onStatus((s) => {
      if (s.state === 'encoder') {
        const hw = s.encoder !== 'libx264'
        pushToast(
          hw ? `Hardware encoding active (${s.encoder})` : 'Using software encoding (libx264)',
          hw ? 'success' : 'info',
          4000
        )
        return
      }
      setHealth(s)
      if (s.state === 'unstable' && s.recommend) setQuality(s.recommend)
      if (s.state === 'failed') {
        pushToast(s.message || 'Stream dropped and could not reconnect.', 'error', 8000)
        actionsRef.current.stopStream?.() // clean up the UI/compositor
      }
      if (s.state === 'error') pushToast(s.message || 'Streaming error.', 'error', 8000)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge])

  // OBS engine status + live health (congestion / dropped frames).
  const isLiveRef = useRef(false)
  useEffect(() => {
    isLiveRef.current = isLive
  }, [isLive])
  useEffect(() => {
    if (!bridge) return
    const offStatus = bridge.engine.onStatus((s) => {
      if (s.state === 'encoder') {
        const hw = s.encoder && s.encoder !== 'libx264'
        pushToast(hw ? `Hardware encoding active (${s.encoder})` : 'Using software encoding', hw ? 'success' : 'info', 4000)
      } else if (s.state === 'stopped' && isLiveRef.current) {
        // The engine reported the stream ended — keep the UI in lockstep.
        actionsRef.current.cleanupAfterStop?.()
        pushToast(s.message || 'Stream ended.', 'info', 5000)
      } else if (s.state === 'error') {
        pushToast(s.message || 'Streaming engine error.', 'error', 8000)
        if (isLiveRef.current) actionsRef.current.cleanupAfterStop?.()
      }
    })
    const offStats = bridge.engine.onStats((s) => {
      const droppedPct = s.totalFrames ? (s.skippedFrames / s.totalFrames) * 100 : 0
      // Surface sustained trouble the way the FFmpeg path did (stats bar itself
      // is fed from the store).
      if ((s.congestion ?? 0) >= 0.8 || droppedPct > 5) {
        setHealth({ state: 'unstable', message: 'Upload is congested — try a lower quality.' })
      } else {
        setHealth(null)
      }
    })
    return () => {
      offStatus?.()
      offStats?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge])

  useEffect(() => () => {
    clearInterval(timerRef.current)
    clearTimeout(tradeHideTimer.current)
    screenStream.current?.getTracks().forEach((t) => t.stop())
  }, [])

  // Show the walkthrough on first visit.
  useEffect(() => {
    if (!bridge) return
    bridge.settings.get('goLiveGuideSeen').then((seen) => {
      if (!seen) setTimeout(() => setShowGuide(true), 700)
    })
  }, [bridge])

  const closeGuide = () => {
    setShowGuide(false)
    bridge?.settings.set('goLiveGuideSeen', true)
  }

  // ---- floating monitor sync ----
  const lastTradeRef = useRef(null)
  const actionsRef = useRef({})

  // Push live state to the monitor window whenever it changes.
  useEffect(() => {
    bridge?.monitor.pushState({
      live: isLive,
      elapsed,
      trade: overlayEnabled ? overlayTrade : null,
      overlayConfig,
      stats: streamStats
    })
  }, [bridge, isLive, elapsed, overlayTrade, overlayEnabled, overlayConfig, streamStats])

  // Only render the monitor preview thumbnail while the monitor is open.
  useEffect(() => {
    if (!bridge) return
    return bridge.monitor.onVisible((v) => compositor.current?.setThumbnailEnabled(v))
  }, [bridge])

  // Handle control commands coming back from the monitor window.
  useEffect(() => {
    if (!bridge) return
    return bridge.monitor.onCommand((cmd) => {
      const a = actionsRef.current
      if (cmd.type === 'stop') a.stopStream?.()
      else if (cmd.type === 'hideTrade') a.hideTradeCard?.()
      else if (cmd.type === 'repeatTrade' && lastTradeRef.current) a.placeTrade?.(lastTradeRef.current)
    })
  }, [bridge])

  // ---- manual trade placement (drives the on-stream overlay card) ----
  const placeTrade = (trade) => {
    lastTradeRef.current = trade
    clearTimeout(tradeHideTimer.current)
    setOverlayTrade({ ...trade, event: 'open', ts: Date.now() })
    // Auto-hide after the card's lifetime unless the trader hides it sooner.
    tradeHideTimer.current = setTimeout(() => setOverlayTrade(null), 14000)
  }

  const closeTradeCard = () => {
    clearTimeout(tradeHideTimer.current)
    setOverlayTrade((t) => (t ? { ...t, event: 'close' } : null))
    tradeHideTimer.current = setTimeout(() => setOverlayTrade(null), 6000)
  }

  const hideTradeCard = () => {
    clearTimeout(tradeHideTimer.current)
    setOverlayTrade(null)
  }

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
      setScreenStreamState(stream)
      setScreenSource(source)
      setHasScreen(true)
      setCaptureError(null)
      // If we're already live, switch the broadcast's screen source on the fly.
      if (isLive) await compositor.current?.setScreenSource(source.id)
    } catch (err) {
      setCaptureError('screen')
      console.error('Screen capture error:', err)
    }
  }

  const stopSharing = () => {
    screenStream.current?.getTracks().forEach((t) => t.stop())
    screenStream.current = null
    setScreenStreamState(null)
    setScreenSource(null)
    setHasScreen(false)
    // Live: drop back to camera-only on the broadcast too.
    if (isLive) compositor.current?.setScreenSource(null)
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
    // Validate keys for enabled non-Millimore destinations.
    const missing = DESTS.filter(
      (d) => !d.always && enabled[d.platform] && !(keys[d.platform] || '').trim()
    )
    if (missing.length) {
      pushToast(
        `Add a stream key for ${missing.map((m) => m.label).join(', ')}, or turn it off.`,
        'warning'
      )
      return
    }

    setStarting(true)
    const dests = DESTS.filter((d) => enabled[d.platform]).map((d) => ({
      platform: d.platform,
      key: keys[d.platform] || ''
    }))
    try {
      if (bridge) {
        // The Native Engine captures + composites + encodes + streams in one
        // FFmpeg process. The canvas compositor stays only to feed the in-app
        // preview and the floating monitor thumbnail.
        const getOverlay = () => ({
          config: overlayConfigRef.current,
          trade: overlayTradeRef.current,
          scene: sceneRef.current
        })

        // CRITICAL: the Native Engine captures the camera/mic/screen DIRECTLY.
        // The preview is currently holding those devices open (that's why you
        // see yourself), and macOS won't let FFmpeg open a camera/mic that's
        // already in use — it fails with "Input/output error". So release the
        // renderer's grip on every capture device before the engine starts.
        cameraStream.current?.getTracks().forEach((t) => t.stop())
        cameraStream.current = null
        setCamStream(null)
        setHasCamera(false)
        screenStream.current?.getTracks().forEach((t) => t.stop())
        screenStream.current = null
        // Give macOS a beat to fully hand the devices back before FFmpeg opens them.
        await new Promise((r) => setTimeout(r, 300))

        // Overlay layer for the BROADCAST (independent of the camera device).
        overlayPump.current = new OverlayPump({
          getOverlay,
          send: (data) => bridge.engine.overlayFrame(data)
        })
        overlayPump.current.start()

        // Devices are matched by label (the only identifier the browser and
        // the native capture APIs share). Screen index from the picked source.
        const screenIdx = Number((screenSource?.name || '').match(/\b(\d+)\b/)?.[1] || 1) - 1
        const startRes = await bridge.engine.goLive({
          quality,
          destinations: dests,
          title,
          screenShared: !!screenSource?.id,
          screenIndex: Math.max(0, screenIdx),
          cameraLabel: devices.cams.find((d) => d.deviceId === camId)?.label || '',
          micLabel: devices.mics.find((d) => d.deviceId === micId)?.label || '',
          record: recordEnabled
        })
        if (startRes?.recordPath) pushToast(`Recording to ${startRes.recordPath}`, 'info', 6000)
      }
      setIsLive(true)
      startTimer()
      setCaptureError(null)
      pushToast(
        `You're live${dests.length ? ` to ${dests.length} destination${dests.length > 1 ? 's' : ''}` : ''}!`,
        'success'
      )
    } catch (err) {
      console.error('Failed to go live:', err)
      // Roll back any partial start.
      compositor.current?.stop()
      compositor.current = null
      overlayPump.current?.stop()
      overlayPump.current = null
      await bridge?.engine.stop().catch(() => {})
      // We released the camera/mic to hand them to the engine; the start
      // failed, so bring the preview devices back.
      acquireCamera().catch(() => {})

      const raw = err?.message || ''
      let msg
      if (/screen recording|NO_SCREEN/i.test(raw)) {
        setCaptureError('screen')
        msg =
          'Couldn’t capture your screen. Enable Screen Recording for Millimore in System Settings → Privacy & Security, then restart the app.'
      } else if (/camera .* failed|enable camera/i.test(raw)) {
        setCaptureError('camera')
        msg = raw
      } else if (/microphone .* failed|enable microphone/i.test(raw)) {
        msg = raw
      } else if (/destination/i.test(raw)) {
        msg = 'No stream destinations. Add at least one stream key.'
      } else {
        msg = raw || 'Couldn’t go live. Please try again.'
      }
      pushToast(msg, 'error', 9000)
    } finally {
      setStarting(false)
    }
  }

  /** Reset the UI to idle (shared by manual stop and engine-reported stops). */
  const cleanupAfterStop = () => {
    compositor.current?.stop()
    compositor.current = null
    overlayPump.current?.stop()
    overlayPump.current = null
    clearInterval(timerRef.current)
    clearTimeout(tradeHideTimer.current)
    setElapsed('00:00:00')
    setOverlayTrade(null)
    setHealth(null)
    setIsLive(false)
    // The engine released the camera/mic on stop — bring the preview back.
    acquireCamera().catch(() => {})
  }

  const stopStream = () => {
    // Flip the UI instantly; the engine tears the output down in the
    // background (its own 'stopped' event confirms). Give FFmpeg a moment to
    // release the devices before the preview re-grabs them.
    compositor.current?.stop()
    compositor.current = null
    overlayPump.current?.stop()
    overlayPump.current = null
    clearInterval(timerRef.current)
    clearTimeout(tradeHideTimer.current)
    setElapsed('00:00:00')
    setOverlayTrade(null)
    setHealth(null)
    setIsLive(false)
    bridge?.engine.stop().catch(() => {})
    setTimeout(() => acquireCamera().catch(() => {}), 600)
  }

  const activeCount = DESTS.filter((d) => enabled[d.platform]).length

  // Keep the monitor command handler pointed at the latest action closures.
  actionsRef.current = { stopStream, hideTradeCard, placeTrade, cleanupAfterStop }

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
          {health && ['reconnecting', 'unstable', 'failed', 'reconnected'].includes(health.state) && (
            <HealthBanner health={health} />
          )}
          <div data-coach="camera">
            <StreamPreview
              live={isLive}
              elapsed={elapsed}
              overlayTrade={overlayEnabled ? overlayTrade : null}
              overlayConfig={overlayConfig}
              cameraStream={camStream}
              screenStream={screenStreamState}
              hasScreen={hasScreen}
              hasCamera={hasCamera}
              scene={scene}
              onCameraChange={(cam) => updateOverlay({ camera: cam })}
            />
          </div>

          {/* trade placement — the primary control while streaming */}
          <div data-coach="trade">
            <TradePlacement
              live={isLive}
              active={!!overlayTrade}
              onPlace={placeTrade}
              onClose={closeTradeCard}
              onHide={hideTradeCard}
            />
          </div>

          {/* capture controls */}
          <Card padding={14}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Button
                variant={hasScreen ? 'secondary' : 'primary'}
                size="sm"
                icon={<VideoIcon size={16} />}
                onClick={() => setShowPicker(true)}
                data-coach="screen"
              >
                {hasScreen ? 'Change screen' : 'Select screen to share'}
              </Button>
              {hasScreen && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={stopSharing}
                    style={{ color: colors.live }}
                  >
                    Stop sharing
                  </Button>
                  <Badge tone="green">
                    <CheckIcon size={12} /> {screenSource?.name?.slice(0, 24) || 'Screen'}
                  </Badge>
                </>
              )}
              <Badge tone={hasCamera ? 'green' : 'amber'}>
                <VideoIcon size={12} /> {hasCamera ? 'Camera on' : 'Camera off'}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => bridge?.monitor.toggle(true)}
                style={{ marginLeft: 'auto', color: colors.primary }}
                title="Floating monitor — visible only to you, hidden from viewers"
              >
                ⤢ Pop-out monitor
              </Button>
            </div>

            {/* device selection — applies live */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ ...typography.caption, color: colors.textSecondary, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <VideoIcon size={13} /> Camera
                </span>
                <Select value={camId} onChange={(e) => changeDevice('cam', e.target.value)} style={{ fontSize: 13, padding: '8px 10px' }}>
                  <option value="">Default camera</option>
                  {devices.cams.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>
                  ))}
                </Select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ ...typography.caption, color: colors.textSecondary, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <MicIcon size={13} /> Microphone
                </span>
                <Select value={micId} onChange={(e) => changeDevice('mic', e.target.value)} style={{ fontSize: 13, padding: '8px 10px' }}>
                  <option value="">Default microphone</option>
                  {devices.mics.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>
                  ))}
                </Select>
              </label>
            </div>

            {captureError && (
              <div
                style={{
                  marginTop: 12,
                  ...typography.small,
                  color: colors.warning,
                  background: colors.warningSoft,
                  padding: '12px',
                  borderRadius: radius.button,
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-start'
                }}
              >
                <InfoIcon size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ flex: 1 }}>
                  {captureError === 'camera' ? (
                    <>
                      <div>
                        <strong>Couldn’t start your camera.</strong> Enable <strong>Camera</strong> for
                        Millimore in System Settings → Privacy &amp; Security, then click Go Live again.
                        If Millimore is running from the disk image or Downloads, drag it to your
                        Applications folder first — macOS won’t keep the permission otherwise.
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        {bridge?.capture?.openPrivacy && (
                          <Button size="sm" onClick={() => bridge.capture.openPrivacy('camera')}>
                            Open Camera settings
                          </Button>
                        )}
                        {bridge?.capture?.openPrivacy && (
                          <Button variant="secondary" size="sm" onClick={() => bridge.capture.openPrivacy('microphone')}>
                            Microphone settings
                          </Button>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <strong>Couldn’t capture your screen.</strong> On macOS this almost always
                        means one of two things:
                      </div>
                      <ol style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                        <li>
                          <strong>Millimore must be in your Applications folder</strong> — if you’re
                          running it from the disk image or Downloads, macOS won’t keep the
                          permission. Drag the app to Applications and open it from there.
                        </li>
                        <li>
                          Enable <strong>Screen Recording</strong> for Millimore in System Settings,
                          then <strong>restart the app</strong> (macOS only applies it after a
                          relaunch).
                        </li>
                      </ol>
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        {bridge?.restart && (
                          <Button size="sm" onClick={() => bridge.restart()}>
                            Restart Millimore
                          </Button>
                        )}
                        {bridge?.capture?.openScreenPrefs && (
                          <Button variant="secondary" size="sm" onClick={() => bridge.capture.openScreenPrefs()}>
                            Open settings
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </Card>

          <LiveStatsBar stats={streamStats} live={isLive} activeCount={activeCount} quality={quality} />
        </div>

        {/* RIGHT — controls (full setup when idle, compact when live) */}
        <Card padding={20} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Field label="Stream title">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What are you trading today?"
              disabled={isLive}
            />
          </Field>

          {!isLive ? (
            <>
              {/* destinations */}
              <div data-coach="destinations">
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

              {/* local recording */}
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
                  <VideoIcon size={20} />
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ ...typography.bodyStrong, color: colors.textPrimary }}>Record to my computer</div>
                  <div style={{ ...typography.small, color: colors.textSecondary }}>
                    Save a local copy (.mkv) to your Movies folder while you stream
                  </div>
                </div>
                <Toggle checked={recordEnabled} onChange={setRecordEnabled} />
              </div>
            </>
          ) : (
            <LiveSummary elapsed={elapsed} dests={DESTS.filter((d) => enabled[d.platform])} quality={quality} />
          )}

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
              <div style={{ ...typography.bodyStrong, color: colors.textPrimary }}>Trade card overlay</div>
              <div style={{ ...typography.small, color: colors.textSecondary }}>
                Show the trade card on stream when you place an order
              </div>
            </div>
            <Toggle checked={overlayEnabled} onChange={setOverlayEnabled} />
          </div>

          {/* scene switcher */}
          <div>
            <SubLabel>Scene</SubLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { id: 'live', label: 'Live' },
                { id: 'starting', label: 'Starting soon' },
                { id: 'brb', label: 'Be right back' },
                { id: 'ending', label: 'Ending' }
              ].map((s) => (
                <button
                  key={s.id}
                  onClick={() => setScene(s.id)}
                  style={{
                    padding: '9px 10px',
                    borderRadius: radius.button,
                    border: `1px solid ${scene === s.id ? colors.primary : colors.borderStrong}`,
                    background: scene === s.id ? colors.primarySoft : colors.surface,
                    color: scene === s.id ? colors.primary : colors.textPrimary,
                    fontWeight: 600,
                    fontSize: 13
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {scene !== 'live' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                <Input
                  value={overlayConfig.scenes?.[scene]?.title || ''}
                  placeholder="Scene title"
                  onChange={(e) =>
                    updateOverlay({ scenes: { [scene]: { ...overlayConfig.scenes[scene], title: e.target.value } } })
                  }
                  style={{ fontSize: 13 }}
                />
                <Input
                  value={overlayConfig.scenes?.[scene]?.sub || ''}
                  placeholder="Scene subtitle"
                  onChange={(e) =>
                    updateOverlay({ scenes: { [scene]: { ...overlayConfig.scenes[scene], sub: e.target.value } } })
                  }
                  style={{ fontSize: 13 }}
                />
              </div>
            )}
          </div>

          {/* GO LIVE */}
          {isLive ? (
            <Button variant="danger" size="xl" full onClick={stopStream} icon={<span style={{ width: 10, height: 10, background: '#fff', borderRadius: 2 }} />}>
              STOP STREAM
            </Button>
          ) : (
            <Button variant="primary" size="xl" full onClick={goLive} disabled={starting} icon={!starting && <LiveIcon size={20} />} data-coach="golive">
              {starting ? <Spinner size={18} color="#fff" /> : 'GO LIVE'}
            </Button>
          )}
        </Card>
      </div>

      {showPicker && <ScreenSourcePicker onPick={pickScreen} onClose={() => setShowPicker(false)} />}
      {guidePlatform && <StreamKeyGuide platform={guidePlatform} onClose={() => setGuidePlatform(null)} />}
      {showGuide && <CoachMarks steps={GO_LIVE_TOUR} onClose={closeGuide} />}

      {/* floating help button — reopens the walkthrough */}
      <button
        onClick={() => setShowGuide(true)}
        title="Show tips & guide"
        style={{
          position: 'fixed',
          left: 256,
          bottom: 22,
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: colors.primary,
          color: '#fff',
          boxShadow: '0 8px 24px rgba(37,99,235,0.4)',
          display: 'grid',
          placeItems: 'center',
          zIndex: 50,
          fontSize: 20,
          fontWeight: 700
        }}
      >
        ?
      </button>
    </Page>
  )
}

function SubLabel({ children }) {
  return <div style={{ ...typography.label, color: colors.textSecondary, marginBottom: 10 }}>{children}</div>
}

/** Compact read-only summary shown in place of the setup form while live. */
function LiveSummary({ elapsed, dests, quality }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 14px',
          borderRadius: radius.card,
          background: colors.liveSoft
        }}
      >
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: colors.live, animation: 'mmPulse 1.2s infinite' }} />
        <span style={{ ...typography.bodyStrong, color: colors.live }}>Live</span>
        <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', ...typography.bodyStrong, color: colors.textPrimary }}>
          {elapsed}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ ...typography.caption, color: colors.textSecondary }}>Streaming to</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {dests.map((d) => (
            <span
              key={d.platform}
              title={d.label}
              style={{ width: 10, height: 10, borderRadius: '50%', background: d.color }}
            />
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ ...typography.caption, color: colors.textSecondary }}>Quality</span>
        <Badge tone="neutral">{quality.replace('p', 'p · ') + 'fps'}</Badge>
      </div>
    </div>
  )
}

function HealthBanner({ health }) {
  const map = {
    reconnecting: {
      tone: colors.warning,
      bg: colors.warningSoft,
      text: `Connection dropped — reconnecting (attempt ${health.attempt})…`
    },
    reconnected: { tone: colors.success, bg: colors.successSoft, text: 'Reconnected — you’re live again.' },
    unstable: {
      tone: colors.warning,
      bg: colors.warningSoft,
      text: health.recommend
        ? `Upload is unstable (${health.measuredKbps} kbps). Lowering quality to ${health.recommend}.`
        : 'Upload is unstable — your stream may buffer.'
    },
    failed: { tone: colors.live, bg: colors.liveSoft, text: health.message || 'Stream failed to reconnect.' }
  }
  const m = map[health.state]
  if (!m) return null
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        borderRadius: radius.button,
        background: m.bg,
        color: m.tone,
        ...typography.bodyStrong,
        fontSize: 13
      }}
    >
      <InfoIcon size={16} />
      {m.text}
    </div>
  )
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
