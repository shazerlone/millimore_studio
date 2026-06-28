/**
 * Paints the Millimore overlay (scrolling ticker, brand watermark, and the
 * branded trade card) directly onto the stream canvas, so everything the trader
 * configures in the Overlay Designer appears on the real broadcast — not just in
 * the preview. All drawing is wrapped by the caller in try/catch so a paint
 * error can never take down the stream.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} W canvas width
 * @param {number} H canvas height
 * @param {object} state { config, trade } current overlay config + active trade
 * @param {number} tMs   monotonic time for the ticker scroll
 */
export function paintOverlay(ctx, W, H, state, tMs) {
  const cfg = state?.config
  if (!cfg) return
  const u = H / 1080 // scale unit relative to 1080p

  // Full-screen scene (Starting Soon / BRB / Ending) covers everything.
  if (state.scene && state.scene !== 'live') {
    drawScene(ctx, W, H, u, state.scene)
    if (cfg.watermark?.enabled) {
      drawWatermark(ctx, W, H, u, { isRight: true, isBottom: true, pad: 28 * u, bottomInset: 28 * u, topInset: 28 * u }, cfg.watermark)
    }
    return
  }

  let tickerH = 0
  if (cfg.ticker?.enabled) tickerH = drawTicker(ctx, W, H, u, cfg.ticker, tMs)

  const pad = 28 * u
  const pos = cfg.position || 'bottom-left'
  const isBottom = pos.includes('bottom')
  const isRight = pos.includes('right')
  const bottomInset = isBottom && cfg.ticker?.enabled && cfg.ticker.position === 'bottom' ? tickerH + pad : pad
  const topInset = !isBottom && cfg.ticker?.enabled && cfg.ticker.position === 'top' ? tickerH + pad : pad

  if (state.trade) {
    drawTradeCard(ctx, W, H, u, { pos, isRight, isBottom, pad, bottomInset, topInset }, cfg, state.trade)
  } else if (cfg.watermark?.enabled) {
    drawWatermark(ctx, W, H, u, { isRight, isBottom, pad, bottomInset, topInset }, cfg.watermark)
  }
}

/* ------------------------------------------------------------------ scenes */

export const SCENES = {
  starting: { title: 'Starting soon', sub: 'The live session will begin shortly' },
  brb: { title: 'Be right back', sub: 'Stay tuned — back in a moment' },
  ending: { title: 'Thanks for watching', sub: 'See you in the next session' }
}

function drawScene(ctx, W, H, u, scene) {
  const s = SCENES[scene] || SCENES.starting
  // full-bleed brand background
  ctx.fillStyle = '#0B1220'
  ctx.fillRect(0, 0, W, H)
  // subtle grid
  ctx.strokeStyle = 'rgba(255,255,255,0.03)'
  ctx.lineWidth = 1
  for (let x = 0; x < W; x += 64 * u) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, H)
    ctx.stroke()
  }
  for (let y = 0; y < H; y += 64 * u) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }

  const cx = W / 2
  const cy = H / 2
  drawStar(ctx, cx, cy - 120 * u, 46 * u, BLUE)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#F8FAFC'
  ctx.font = `800 ${64 * u}px Inter, sans-serif`
  ctx.fillText(s.title, cx, cy + 10 * u)

  ctx.fillStyle = '#94A3B8'
  ctx.font = `500 ${24 * u}px Inter, sans-serif`
  ctx.fillText(s.sub, cx, cy + 64 * u)

  // wordmark bottom
  ctx.fillStyle = '#F8FAFC'
  ctx.font = `800 ${22 * u}px Inter, sans-serif`
  const label = 'millimore'
  const lw = ctx.measureText(label).width
  drawStar(ctx, cx - lw / 2 - 16 * u, H - 60 * u, 9 * u, BLUE)
  ctx.textAlign = 'left'
  ctx.fillText(label, cx - lw / 2, H - 60 * u + 1 * u)
  ctx.textAlign = 'left'
}

/* --------------------------------------------------------------- primitives */

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Four-point Millimore star (same polar shape as the app logo/icon). */
function drawStar(ctx, cx, cy, R, color) {
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  const steps = 96
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2
    const r = R * (1 - 0.84 * Math.abs(Math.sin(2 * t)))
    const x = cx + Math.cos(t) * r
    const y = cy + Math.sin(t) * r
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

const BLUE = '#2563EB'
const BUY = '#16A34A'
const SELL = '#EF4444'

/* ------------------------------------------------------------------ ticker */

function drawTicker(ctx, W, H, u, ticker, tMs) {
  const items = (ticker.items || []).filter((i) => i.text && i.text.trim())
  if (!items.length) return 0
  const dark = (ticker.theme || 'dark') === 'dark'
  const barH = 56 * u
  const y = ticker.position === 'top' ? 0 : H - barH

  ctx.save()
  ctx.fillStyle = dark ? 'rgba(11,18,32,0.80)' : 'rgba(255,255,255,0.90)'
  ctx.fillRect(0, y, W, barH)

  const fontPx = 22 * u
  ctx.font = `600 ${fontPx}px Inter, sans-serif`
  ctx.textBaseline = 'middle'
  const gap = 36 * u
  const star = 9 * u

  // Build one logical sequence and measure it.
  const measure = (txt) => ctx.measureText(txt).width
  let seqWidth = 0
  for (const it of items) seqWidth += measure(it.text) + gap + star * 3
  if (seqWidth <= 0) {
    ctx.restore()
    return barH
  }

  const speed = ticker.speed || 60
  const offset = ((tMs / 1000) * speed * u) % seqWidth
  let x = -offset

  // Draw enough copies to fill the width plus one extra for seamless wrap.
  const copies = Math.ceil(W / seqWidth) + 2
  const cy = y + barH / 2
  for (let c = 0; c < copies; c++) {
    let cx = x + c * seqWidth
    for (const it of items) {
      const disc = it.type === 'disclaimer'
      ctx.fillStyle = dark ? (disc ? 'rgba(248,250,252,0.85)' : '#F8FAFC') : '#0F172A'
      ctx.font = `${disc ? 500 : 700} ${fontPx}px Inter, sans-serif`
      ctx.textAlign = 'left'
      ctx.fillText(it.text, cx, cy)
      cx += measure(it.text) + gap
      drawStar(ctx, cx, cy, star, BLUE)
      cx += star * 3
    }
  }
  ctx.restore()
  return barH
}

/* --------------------------------------------------------------- watermark */

function drawWatermark(ctx, W, H, u, layout, wm) {
  const { isRight, isBottom, pad, bottomInset, topInset } = layout
  const h = 40 * u
  ctx.save()
  ctx.globalAlpha = wm.opacity ?? 0.92
  ctx.font = `800 ${20 * u}px Inter, sans-serif`
  const label = 'millimore'
  const star = 9 * u
  const padX = 16 * u
  const w = padX + star * 2 + 8 * u + ctx.measureText(label).width + padX

  const x = isRight ? W - pad - w : pad
  const y = isBottom ? H - bottomInset - h : topInset

  ctx.fillStyle = 'rgba(11,18,32,0.55)'
  roundRect(ctx, x, y, w, h, h / 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 1 * u
  ctx.stroke()

  drawStar(ctx, x + padX + star, y + h / 2, star, BLUE)
  ctx.fillStyle = '#FFFFFF'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x + padX + star * 2 + 8 * u, y + h / 2 + 1 * u)
  ctx.restore()
}

/* -------------------------------------------------------------- trade card */

function drawTradeCard(ctx, W, H, u, layout, cfg, trade) {
  const { isRight, isBottom, pad, bottomInset, topInset } = layout
  const dark = (cfg.theme || 'dark') === 'dark'
  const fields = cfg.fields || {}
  const minimal = cfg.style === 'minimal'
  const full = cfg.style === 'full'
  const isBuy = trade.direction === 'BUY'
  const dir = isBuy ? BUY : SELL

  const bg = dark ? '#0B1220' : '#FFFFFF'
  const fg = dark ? '#F8FAFC' : '#0F172A'
  const sub = dark ? '#94A3B8' : '#64748B'
  const line = dark ? 'rgba(255,255,255,0.08)' : '#F1F5F9'
  const panel = dark ? 'rgba(255,255,255,0.04)' : '#F8FAFC'

  const w = (minimal ? 300 : 380) * u
  const headerH = 34 * u
  const padX = 20 * u
  const fmt = (n) =>
    typeof n === 'number' ? n.toLocaleString('en-US', { minimumFractionDigits: 2 }) : String(n ?? '')

  // Compute height by section.
  let bodyH = 0
  bodyH += 40 * u // pair + chip
  if (!minimal && fields.entry !== false) bodyH += 64 * u // entry panel
  if (minimal && fields.entry !== false) bodyH += 26 * u
  if (!minimal && (fields.sl || fields.tp || fields.lot)) bodyH += 50 * u
  if (full) bodyH += 56 * u
  if (!minimal && cfg.showCopy) bodyH += 56 * u
  const h = headerH + bodyH + 24 * u

  const x = isRight ? W - pad - w : pad
  const y = isBottom ? H - bottomInset - h : topInset

  ctx.save()
  // shadow
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = 40 * u
  ctx.shadowOffsetY = 14 * u
  ctx.fillStyle = bg
  roundRect(ctx, x, y, w, h, 18 * u)
  ctx.fill()
  ctx.shadowColor = 'transparent'

  // brand header (no edge bar — clean, full width)
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.02)' : '#FBFCFE'
  ctx.fillRect(x, y, w, headerH)
  ctx.fillStyle = line
  ctx.fillRect(x, y + headerH, w, 1 * u)
  drawStar(ctx, x + padX, y + headerH / 2, 8 * u, BLUE)
  ctx.fillStyle = fg
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = `800 ${17 * u}px Inter, sans-serif`
  ctx.fillText('millimore', x + padX + 16 * u, y + headerH / 2 + 1 * u)
  // Live / Closed status dot + label
  const statusCol = trade.event === 'close' ? SELL : '#16A34A'
  const statusLabel = trade.event === 'close' ? 'CLOSED' : 'LIVE'
  ctx.font = `800 ${11 * u}px Inter, sans-serif`
  ctx.textAlign = 'right'
  ctx.fillStyle = statusCol
  ctx.fillText(statusLabel, x + w - padX, y + headerH / 2 + 1 * u)
  ctx.beginPath()
  ctx.arc(x + w - padX - ctx.measureText(statusLabel).width - 8 * u, y + headerH / 2, 3 * u, 0, Math.PI * 2)
  ctx.fill()

  let cy = y + headerH + 22 * u
  ctx.textAlign = 'left'

  // pair + direction chip
  let cx = x + padX
  if (fields.pair !== false) {
    ctx.fillStyle = fg
    ctx.font = `800 ${27 * u}px Inter, sans-serif`
    ctx.fillText(trade.pair, cx, cy)
    cx += ctx.measureText(trade.pair).width + 12 * u
  }
  if (fields.direction !== false) {
    const chipLabel = trade.direction
    ctx.font = `800 ${15 * u}px Inter, sans-serif`
    const cw = ctx.measureText(chipLabel).width + 38 * u
    const ch = 30 * u
    const cyTop = cy - ch / 2 - 4 * u
    // solid chip in the direction color — instant buy/sell read
    ctx.fillStyle = dir
    roundRect(ctx, cx, cyTop, cw, ch, ch / 2)
    ctx.fill()
    // white arrow glyph
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2.4 * u
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const ax = cx + 14 * u
    const ay = cy - 4 * u
    ctx.beginPath()
    if (isBuy) {
      ctx.moveTo(ax - 4 * u, ay + 4 * u)
      ctx.lineTo(ax + 4 * u, ay - 4 * u)
      ctx.moveTo(ax - 1 * u, ay - 4 * u)
      ctx.lineTo(ax + 4 * u, ay - 4 * u)
      ctx.lineTo(ax + 4 * u, ay + 1 * u)
    } else {
      ctx.moveTo(ax - 4 * u, ay - 4 * u)
      ctx.lineTo(ax + 4 * u, ay + 4 * u)
      ctx.moveTo(ax - 1 * u, ay + 4 * u)
      ctx.lineTo(ax + 4 * u, ay + 4 * u)
      ctx.lineTo(ax + 4 * u, ay - 1 * u)
    }
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.font = `800 ${15 * u}px Inter, sans-serif`
    ctx.fillText(chipLabel, cx + 26 * u, cy - 4 * u + 1 * u)
  }
  cy += minimal ? 24 * u : 18 * u

  if (minimal) {
    if (fields.entry !== false) {
      ctx.fillStyle = sub
      ctx.font = `500 ${15 * u}px Inter, sans-serif`
      ctx.fillText('Entry ', x + padX, cy)
      const ew = ctx.measureText('Entry ').width
      ctx.fillStyle = fg
      ctx.font = `800 ${15 * u}px Inter, sans-serif`
      ctx.fillText(fmt(trade.entry), x + padX + ew, cy)
    }
    ctx.restore()
    return
  }

  // entry hero panel
  if (fields.entry !== false) {
    const ph = 50 * u
    ctx.fillStyle = panel
    roundRect(ctx, x + padX, cy - 6 * u, w - padX * 2, ph, 12 * u)
    ctx.fill()
    ctx.fillStyle = sub
    ctx.font = `700 ${12 * u}px Inter, sans-serif`
    ctx.textAlign = 'left'
    ctx.fillText('ENTRY PRICE', x + padX + 14 * u, cy + ph / 2 - 6 * u)
    ctx.fillStyle = fg
    ctx.font = `800 ${26 * u}px Inter, sans-serif`
    ctx.textAlign = 'right'
    ctx.fillText(fmt(trade.entry), x + w - padX - 14 * u, cy + ph / 2 - 6 * u)
    ctx.textAlign = 'left'
    cy += ph + 16 * u
  }

  // SL / TP / Lot
  const metric = (label, value, color, colX) => {
    ctx.fillStyle = sub
    ctx.font = `700 ${11 * u}px Inter, sans-serif`
    ctx.fillText(label.toUpperCase(), colX, cy)
    ctx.fillStyle = color || fg
    ctx.font = `800 ${15 * u}px Inter, sans-serif`
    ctx.fillText(value, colX, cy + 20 * u)
  }
  if (fields.sl || fields.tp || fields.lot) {
    const colW = (w - padX * 2) / 3
    let i = 0
    if (fields.sl) metric('Stop loss', fmt(trade.sl), SELL, x + padX + colW * i++)
    if (fields.tp) metric('Take profit', fmt(trade.tp), BUY, x + padX + colW * i++)
    if (fields.lot) metric('Lot', String(trade.lot), fg, x + padX + colW * i++)
    cy += 50 * u
  }

  // full extras
  if (full) {
    ctx.fillStyle = line
    ctx.fillRect(x + padX, cy - 8 * u, w - padX * 2, 1 * u)
    cy += 8 * u
    const colW = (w - padX * 2) / 3
    metric('Risk', `${trade.risk ?? 1}%`, fg, x + padX)
    metric('R:R', trade.rr || '1:2', fg, x + padX + colW)
    metric('Win rate', `${trade.winRate ?? 68}%`, BLUE, x + padX + colW * 2)
    cy += 50 * u
  }

  // copy button
  if (cfg.showCopy) {
    const bh = 40 * u
    ctx.fillStyle = BLUE
    roundRect(ctx, x + padX, cy - 6 * u, w - padX * 2, bh, 10 * u)
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.font = `700 ${15 * u}px Inter, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(full ? 'Copy trade' : 'Copy on Millimore', x + w / 2, cy + bh / 2 - 6 * u)
    ctx.textAlign = 'left'
  }

  ctx.restore()
}
