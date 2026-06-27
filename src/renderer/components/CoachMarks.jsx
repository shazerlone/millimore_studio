import { useEffect, useState, useCallback } from 'react'
import { colors, radius, shadow } from '@theme/colors'
import { typography } from '@theme/typography'
import { Button } from './ui'
import { Star } from './Logo'

/**
 * Lightweight coach-mark / spotlight tour. Each step points at an element marked
 * with `data-coach="<key>"`, dims everything else, and shows a tooltip. Fully
 * skippable. Used for the first-run Go Live walkthrough and re-openable from the
 * help button.
 *
 * @param {Array<{key,title,body}>} steps
 * @param {() => void} onClose
 */
export function CoachMarks({ steps, onClose }) {
  const [i, setI] = useState(0)
  const [rect, setRect] = useState(null)

  const measure = useCallback(() => {
    const step = steps[i]
    if (!step) return
    const el = document.querySelector(`[data-coach="${step.key}"]`)
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      setRect(el.getBoundingClientRect())
    } else {
      setRect(null)
    }
  }, [i, steps])

  useEffect(() => {
    const t = setTimeout(measure, 60)
    window.addEventListener('resize', measure)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  const step = steps[i]
  if (!step) return null

  const pad = 8
  const hole = rect
    ? { left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
    : null

  // Tooltip placement: below the target if there's room, otherwise above.
  const ttWidth = 320
  const below = !rect || rect.bottom + 180 < window.innerHeight
  const ttTop = rect ? (below ? rect.bottom + 14 : rect.top - 14) : window.innerHeight / 2
  let ttLeft = rect ? rect.left + rect.width / 2 - ttWidth / 2 : window.innerWidth / 2 - ttWidth / 2
  ttLeft = Math.max(16, Math.min(ttLeft, window.innerWidth - ttWidth - 16))

  const last = i === steps.length - 1

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000 }}>
      {/* click catcher (advances) */}
      <div onClick={() => setI((n) => Math.min(n + 1, steps.length - 1))} style={{ position: 'absolute', inset: 0 }} />

      {/* spotlight hole */}
      {hole && (
        <div
          style={{
            position: 'absolute',
            left: hole.left,
            top: hole.top,
            width: hole.width,
            height: hole.height,
            borderRadius: 14,
            boxShadow: '0 0 0 9999px rgba(15,23,42,0.72)',
            border: `2px solid ${colors.primary}`,
            pointerEvents: 'none',
            transition: 'all .25s cubic-bezier(.16,1,.3,1)'
          }}
        />
      )}
      {!hole && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.72)', pointerEvents: 'none' }} />
      )}

      {/* tooltip */}
      <div
        style={{
          position: 'absolute',
          left: ttLeft,
          top: ttTop,
          transform: below ? 'none' : 'translateY(-100%)',
          width: ttWidth,
          background: '#fff',
          borderRadius: radius.lg,
          boxShadow: shadow.pop,
          padding: 18,
          animation: 'mmCardIn .25s cubic-bezier(.16,1,.3,1)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
          <Star size={14} />
          <span style={{ ...typography.caption, color: colors.primary }}>
            Tip {i + 1} of {steps.length}
          </span>
        </div>
        <h3 style={{ ...typography.h3, margin: '0 0 6px', color: colors.textPrimary }}>{step.title}</h3>
        <p style={{ ...typography.body, color: colors.textSecondary, margin: 0 }}>{step.body}</p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ ...typography.caption, color: colors.textTertiary, marginRight: 'auto' }}>
            Skip tour
          </button>
          {i > 0 && (
            <Button variant="secondary" size="sm" onClick={() => setI(i - 1)}>
              Back
            </Button>
          )}
          <Button size="sm" onClick={() => (last ? onClose() : setI(i + 1))}>
            {last ? 'Got it' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export const GO_LIVE_TOUR = [
  {
    key: 'camera',
    title: 'Your camera, your way',
    body: 'Tap your camera to switch shape — rectangle, square, circle or oval. Drag it anywhere, and drag the blue corner to resize. Before you share a screen, your camera fills the whole frame.'
  },
  {
    key: 'screen',
    title: 'Share your screen',
    body: 'Pick a whole screen or a single window (your charts, MT5, TradingView). Your camera then tucks into a corner as picture-in-picture.'
  },
  {
    key: 'destinations',
    title: 'Go live everywhere at once',
    body: 'Millimore is always on. Add your YouTube, Instagram and Facebook stream keys to broadcast to all of them simultaneously.'
  },
  {
    key: 'trade',
    title: 'Show your trades live',
    body: 'Enter a trade and tap “Show on stream” to drop a branded trade card onto your broadcast — entry, SL, TP and risk:reward, automatically.'
  },
  {
    key: 'golive',
    title: 'You’re ready',
    body: 'Hit GO LIVE when everything looks right. You can reopen this guide any time from the help button.'
  }
]
