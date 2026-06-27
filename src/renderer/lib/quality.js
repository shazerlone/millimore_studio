/** Renderer-side mirror of the encoder presets (kept in sync with main/ffmpeg.js). */
export const QUALITY_DIMS = {
  '720p30': { width: 1280, height: 720, fps: 30 },
  '1080p30': { width: 1920, height: 1080, fps: 30 },
  '1080p60': { width: 1920, height: 1080, fps: 60 }
}

export function formatElapsed(ms) {
  const total = Math.floor(ms / 1000)
  const h = String(Math.floor(total / 3600)).padStart(2, '0')
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const s = String(total % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}
