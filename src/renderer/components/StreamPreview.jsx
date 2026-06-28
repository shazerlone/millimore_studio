import { useEffect, useRef } from 'react'
import { colors, radius } from '@theme/colors'
import { typography } from '@theme/typography'
import { TradeCard } from './TradeCard'
import { Watermark } from './Watermark'
import { Ticker } from './Ticker'
import { CameraPiP } from './CameraPiP'
import { Star } from './Logo'
import { VideoIcon } from './Icons'

/**
 * Visual preview of the composited stream.
 * - Before a screen is shared: the camera is the main, full-bleed view (clean,
 *   no fake chart background).
 * - Once a screen is shared: the screen becomes the base layer and the camera
 *   moves to a draggable / resizable / shape-switchable picture-in-picture.
 */
export function StreamPreview({
  live = false,
  elapsed = '00:00:00',
  overlayTrade = null,
  overlayConfig = {},
  cameraStream = null,
  screenRef = null,
  hasScreen = false,
  hasCamera = true,
  scene = 'live',
  onCameraChange = null,
  interactive = true
}) {
  const containerRef = useRef(null)
  const mainCamRef = useRef(null)

  const {
    position = 'bottom-left',
    style = 'detailed',
    theme = 'dark',
    fields,
    showCopy = true,
    watermark = { enabled: true, opacity: 0.92 },
    ticker = { enabled: false },
    camera = { shape: 'rectangle', x: 0.71, y: 0.68, w: 0.26 }
  } = overlayConfig

  // Attach the camera stream to the full-bleed video when no screen is shared.
  useEffect(() => {
    if (!hasScreen && mainCamRef.current && cameraStream) {
      mainCamRef.current.srcObject = cameraStream
    }
  }, [hasScreen, cameraStream])

  const corner = {
    'top-left': { top: 16, left: 16 },
    'top-right': { top: 16, right: 16 },
    'bottom-left': { bottom: 16, left: 16 },
    'bottom-right': { bottom: 16, right: 16 }
  }[position]

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        borderRadius: radius.card,
        overflow: 'hidden',
        background: '#0B1220',
        border: `1px solid ${colors.borderStrong}`
      }}
    >
      {/* base layer */}
      {hasScreen ? (
        <video
          ref={screenRef}
          autoPlay
          muted
          playsInline
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#0B1220' }}
        />
      ) : cameraStream && hasCamera ? (
        <video
          ref={mainCamRef}
          autoPlay
          muted
          playsInline
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: '#0B1220' }}
        />
      ) : (
        <EmptyState />
      )}

      {/* scrolling ticker */}
      <Ticker config={ticker} />

      {/* camera PiP (only once a screen is shared) */}
      {hasScreen && cameraStream && hasCamera && onCameraChange && (
        <CameraPiP
          layout={camera}
          stream={cameraStream}
          containerRef={containerRef}
          interactive={interactive}
          onChange={(patch) => onCameraChange({ ...camera, ...patch })}
        />
      )}

      {/* brand watermark + trade overlay share the same corner */}
      <div style={{ position: 'absolute', ...corner, zIndex: 6 }}>
        {overlayTrade ? (
          <TradeCard trade={overlayTrade} style={style} theme={theme} fields={fields} showCopy={showCopy} branded scale={0.82} />
        ) : (
          watermark.enabled && <Watermark opacity={watermark.opacity} />
        )}
      </div>

      {/* full-screen scene (covers everything on the broadcast) */}
      {scene && scene !== 'live' && <SceneOverlay scene={scene} />}

      {/* live badge + timer */}
      {live && (
        <div style={{ position: 'absolute', top: 16, left: 16, display: 'flex', alignItems: 'center', gap: 8, zIndex: 7 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: colors.live,
              color: '#fff',
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: '0.06em',
              padding: '4px 10px',
              borderRadius: radius.pill
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', animation: 'mmPulse 1.2s ease-in-out infinite' }} />
            LIVE
          </span>
          <span
            style={{
              background: 'rgba(0,0,0,0.55)',
              color: '#fff',
              fontFamily: typography.mono.fontFamily,
              fontVariantNumeric: 'tabular-nums',
              fontSize: 13,
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: radius.pill
            }}
          >
            {elapsed}
          </span>
        </div>
      )}

      {!live && (
        <div style={{ position: 'absolute', bottom: 14, right: 14, zIndex: 7 }}>
          <span
            style={{
              ...typography.caption,
              color: 'rgba(255,255,255,0.85)',
              background: 'rgba(0,0,0,0.45)',
              padding: '5px 11px',
              borderRadius: radius.pill
            }}
          >
            Preview · not streaming
          </span>
        </div>
      )}
    </div>
  )
}

const SCENE_TEXT = {
  starting: { title: 'Starting soon', sub: 'The live session will begin shortly' },
  brb: { title: 'Be right back', sub: 'Stay tuned — back in a moment' },
  ending: { title: 'Thanks for watching', sub: 'See you in the next session' }
}

/** Full-screen branded scene overlay (preview of Starting Soon / BRB / Ending). */
function SceneOverlay({ scene }) {
  const s = SCENE_TEXT[scene] || SCENE_TEXT.starting
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 8,
        background: colors.dark,
        display: 'grid',
        placeItems: 'center',
        textAlign: 'center'
      }}
    >
      <div>
        <div style={{ marginBottom: 18 }}>
          <Star size={44} />
        </div>
        <div style={{ ...typography.display, fontSize: 34, color: '#fff' }}>{s.title}</div>
        <div style={{ ...typography.body, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>{s.sub}</div>
      </div>
      <div style={{ position: 'absolute', bottom: 20, display: 'flex', alignItems: 'center', gap: 7 }}>
        <Star size={13} />
        <span style={{ fontWeight: 800, color: '#fff', fontSize: 14 }}>millimore</span>
      </div>
    </div>
  )
}

/** Clean empty state shown before camera/screen are available. */
function EmptyState() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: colors.dark,
        color: 'rgba(255,255,255,0.7)'
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ opacity: 0.9, marginBottom: 12 }}>
          <Star size={34} />
        </div>
        <div style={{ ...typography.h3, color: '#fff' }}>Your stream preview</div>
        <div style={{ ...typography.small, color: 'rgba(255,255,255,0.6)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
          <VideoIcon size={14} /> Allow your camera, then select a screen to share
        </div>
      </div>
    </div>
  )
}
