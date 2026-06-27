import { useEffect, useRef } from 'react'

const SHAPES = ['rectangle', 'square', 'circle', 'oval']

/** CSS for each camera shape. */
function shapeStyle(shape) {
  switch (shape) {
    case 'square':
      return { aspectRatio: '1 / 1', borderRadius: 14 }
    case 'circle':
      return { aspectRatio: '1 / 1', borderRadius: '50%' }
    case 'oval':
      return { aspectRatio: '4 / 3', borderRadius: '50%' }
    case 'rectangle':
    default:
      return { aspectRatio: '4 / 3', borderRadius: 12 }
  }
}

/**
 * Draggable, resizable, shape-switchable camera picture-in-picture.
 * - drag the body to move it anywhere
 * - drag the corner handle to resize
 * - tap/click the body (without dragging) to cycle the shape
 *
 * Layout is normalized (0–1) against the preview container so it maps 1:1 onto
 * the broadcast canvas.
 */
export function CameraPiP({ layout, onChange, stream, containerRef, interactive = true }) {
  const videoRef = useRef(null)
  const elRef = useRef(null)
  const drag = useRef(null)

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream
  }, [stream])

  const bounds = () => containerRef?.current?.getBoundingClientRect()

  const onBodyPointerDown = (e) => {
    if (!interactive) return
    e.preventDefault()
    const b = bounds()
    if (!b) return
    drag.current = { mode: 'move', startX: e.clientX, startY: e.clientY, origX: layout.x, origY: layout.y, moved: 0 }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const onHandlePointerDown = (e) => {
    if (!interactive) return
    e.preventDefault()
    e.stopPropagation()
    drag.current = { mode: 'resize', startX: e.clientX, origW: layout.w, moved: 99 }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const onMove = (e) => {
    const d = drag.current
    const b = bounds()
    if (!d || !b) return
    if (d.mode === 'move') {
      const dx = (e.clientX - d.startX) / b.width
      const dy = (e.clientY - d.startY) / b.height
      d.moved += Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY)
      const w = layout.w
      const h = elHeightFraction()
      const x = clamp(d.origX + dx, 0, 1 - w)
      const y = clamp(d.origY + dy, 0, 1 - h)
      onChange({ x, y })
    } else if (d.mode === 'resize') {
      const dw = (e.clientX - d.startX) / b.width
      const w = clamp(d.origW + dw, 0.12, 0.5)
      onChange({ w })
    }
  }

  const onUp = () => {
    const d = drag.current
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    // A tap (negligible movement) cycles the shape.
    if (d && d.mode === 'move' && d.moved < 6) {
      const next = SHAPES[(SHAPES.indexOf(layout.shape) + 1) % SHAPES.length]
      onChange({ shape: next })
    }
    drag.current = null
  }

  // Approximate height as a fraction of the container, from the shape's aspect
  // and the container's own aspect (16:9), to keep the PiP inside the frame.
  const elHeightFraction = () => {
    const ratio = layout.shape === 'square' || layout.shape === 'circle' ? 1 : 0.75
    return layout.w * (16 / 9) * ratio
  }

  const sh = shapeStyle(layout.shape)

  return (
    <div
      ref={elRef}
      onPointerDown={onBodyPointerDown}
      style={{
        position: 'absolute',
        left: `${layout.x * 100}%`,
        top: `${layout.y * 100}%`,
        width: `${layout.w * 100}%`,
        ...sh,
        overflow: 'hidden',
        background: '#111827',
        border: '2px solid rgba(255,255,255,0.9)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        cursor: interactive ? 'grab' : 'default',
        zIndex: 4,
        touchAction: 'none',
        userSelect: 'none'
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
      />
      {interactive && (
        <span
          onPointerDown={onHandlePointerDown}
          style={{
            position: 'absolute',
            right: 3,
            bottom: 3,
            width: 16,
            height: 16,
            borderRadius: 5,
            background: 'rgba(37,99,235,0.95)',
            border: '2px solid #fff',
            cursor: 'nwse-resize'
          }}
          title="Drag to resize"
        />
      )}
    </div>
  )
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}
