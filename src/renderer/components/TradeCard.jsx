import { colors, radius } from '@theme/colors'
import { ArrowUpRightIcon, ArrowDownRightIcon, CopyIcon } from './Icons'
import { Star } from './Logo'

/** Slim Millimore brand header — the watermark, expanded into the trade card. */
function BrandHeader({ dark, line, sub }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 14px 8px 16px',
        borderBottom: `1px solid ${line}`,
        background: dark ? 'rgba(255,255,255,0.03)' : colors.surfaceMuted
      }}
    >
      <Star size={13} />
      <span style={{ fontWeight: 800, fontSize: 12, letterSpacing: '-0.01em' }}>millimore</span>
      <span
        style={{
          marginLeft: 'auto',
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: sub
        }}
      >
        Live Trade
      </span>
    </div>
  )
}

/**
 * The on-stream trade card. Renders in three styles (minimal / detailed / full),
 * dark or light, with per-field visibility — the exact knobs in the Overlay
 * Designer. Premium, emoji-free design: a direction chip with an arrow glyph,
 * tabular-numeric prices, a colored edge accent, and refined hierarchy.
 *
 * @param {object} props
 * @param {object} props.trade
 * @param {'minimal'|'detailed'|'full'} props.style
 * @param {'dark'|'light'} props.theme
 * @param {object} props.fields  { pair, direction, entry, sl, tp, lot }
 * @param {boolean} props.showCopy
 * @param {number} props.scale
 * @param {boolean} props.exiting
 */
export function TradeCard({
  trade,
  style = 'detailed',
  theme = 'dark',
  fields = { pair: true, direction: true, entry: true, sl: true, tp: true, lot: true },
  showCopy = true,
  branded = true,
  scale = 1,
  exiting = false
}) {
  const dark = theme === 'dark'
  const isBuy = trade.direction === 'BUY'
  const dir = isBuy ? colors.buy : colors.sell
  const closed = trade.event === 'close'

  // Surfaces tuned per theme for a premium, flat (gradient-free) look.
  const c = dark
    ? {
        bg: '#0B1220',
        panel: 'rgba(255,255,255,0.04)',
        fg: '#F8FAFC',
        sub: '#94A3B8',
        line: 'rgba(255,255,255,0.08)',
        chipBg: isBuy ? 'rgba(22,163,74,0.16)' : 'rgba(239,68,68,0.16)'
      }
    : {
        bg: '#FFFFFF',
        panel: '#F8FAFC',
        fg: colors.textPrimary,
        sub: colors.textSecondary,
        line: colors.border,
        chipBg: isBuy ? colors.successSoft : colors.liveSoft
      }

  const fmt = (n) =>
    typeof n === 'number' ? n.toLocaleString('en-US', { minimumFractionDigits: 2 }) : n

  const shell = {
    fontFamily: "'Inter', sans-serif",
    background: c.bg,
    color: c.fg,
    borderRadius: 16,
    border: `1px solid ${c.line}`,
    boxShadow: dark
      ? '0 18px 40px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3)'
      : '0 18px 40px rgba(15,23,42,0.16), 0 2px 8px rgba(15,23,42,0.06)',
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    animation: exiting
      ? 'mmCardOut .4s ease forwards'
      : 'mmCardIn .5s cubic-bezier(.16,1,.3,1)',
    overflow: 'hidden',
    position: 'relative',
    width: style === 'minimal' ? 248 : 320
  }

  // Left color edge keyed to trade direction.
  const Edge = () => (
    <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: dir }} />
  )

  const DirChip = ({ size = 'md' }) => {
    const small = size === 'sm'
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: small ? '3px 8px' : '4px 10px',
          borderRadius: radius.pill,
          background: c.chipBg,
          color: dir,
          fontWeight: 800,
          fontSize: small ? 11 : 12,
          letterSpacing: '0.04em'
        }}
      >
        {isBuy ? <ArrowUpRightIcon size={small ? 12 : 14} /> : <ArrowDownRightIcon size={small ? 12 : 14} />}
        {trade.direction}
      </span>
    )
  }

  /* ---------------------------------------------------------------- minimal */
  if (style === 'minimal') {
    return (
      <div style={shell}>
        <Edge />
        {branded && <BrandHeader dark={dark} line={c.line} sub={c.sub} />}
        <div style={{ padding: '14px 16px 14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {fields.pair && (
                <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em' }}>
                  {trade.pair}
                </span>
              )}
              {fields.direction && <DirChip size="sm" />}
            </div>
            {fields.entry && (
              <div style={{ marginTop: 4, fontSize: 13, color: c.sub }}>
                Entry{' '}
                <span style={{ color: c.fg, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(trade.entry)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  const isFull = style === 'full'

  const Metric = ({ label, value, color, icon }) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: c.sub,
          display: 'flex',
          alignItems: 'center',
          gap: 4
        }}
      >
        {icon}
        {label}
      </div>
      <div
        style={{
          marginTop: 3,
          fontSize: 14,
          fontWeight: 700,
          color: color || c.fg,
          fontVariantNumeric: 'tabular-nums'
        }}
      >
        {value}
      </div>
    </div>
  )

  /* --------------------------------------------------- detailed & full */
  return (
    <div style={shell}>
      <Edge />
      {branded && <BrandHeader dark={dark} line={c.line} sub={c.sub} />}
      <div style={{ padding: '16px 18px 16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* trader row (full only) */}
        {isFull && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar name={trade.trader || 'Marcus Sterling'} dark={dark} />
            <div style={{ lineHeight: 1.15 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{trade.trader || 'Marcus Sterling'}</span>
                {(trade.verified ?? true) && <Star size={13} />}
              </div>
              <div style={{ fontSize: 11, color: c.sub }}>Live on Millimore</div>
            </div>
            <StatusTag closed={closed} dark={dark} />
          </div>
        )}

        {/* headline: pair + direction */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            {fields.pair && (
              <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em' }}>
                {trade.pair}
              </span>
            )}
            {fields.direction && <DirChip />}
          </div>
          {!isFull && <StatusTag closed={closed} dark={dark} />}
        </div>

        {/* entry hero */}
        {fields.entry && (
          <div
            style={{
              background: c.panel,
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between'
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: c.sub }}>
              Entry price
            </span>
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
              {fmt(trade.entry)}
            </span>
          </div>
        )}

        {/* SL / TP / Lot */}
        {(fields.sl || fields.tp || fields.lot) && (
          <div style={{ display: 'flex', gap: 14 }}>
            {fields.sl && <Metric label="Stop loss" value={fmt(trade.sl)} color={colors.sell} />}
            {fields.tp && <Metric label="Take profit" value={fmt(trade.tp)} color={colors.buy} />}
            {fields.lot && <Metric label="Lot" value={trade.lot} />}
          </div>
        )}

        {/* full: risk / rr / win rate */}
        {isFull && (
          <div
            style={{
              display: 'flex',
              gap: 14,
              paddingTop: 12,
              borderTop: `1px solid ${c.line}`
            }}
          >
            <Metric label="Risk" value={`${trade.risk ?? 1}%`} />
            <Metric label="R:R" value={trade.rr || '1:2'} />
            <Metric label="Win rate" value={`${trade.winRate ?? 68}%`} color={colors.primary} />
          </div>
        )}

        {/* actions */}
        {showCopy && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              style={{
                flex: 1,
                background: colors.primary,
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                padding: '11px 12px',
                fontWeight: 700,
                fontSize: 13,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                cursor: 'pointer'
              }}
            >
              <CopyIcon size={15} />
              {isFull ? 'Copy trade' : 'Copy on Millimore'}
            </button>
            {isFull && (
              <button
                style={{
                  background: c.panel,
                  color: c.fg,
                  border: `1px solid ${c.line}`,
                  borderRadius: 10,
                  padding: '11px 16px',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer'
                }}
              >
                Oppose
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Small status pill: OPENED / CLOSED with a pulsing dot. */
function StatusTag({ closed, dark }) {
  const col = closed ? colors.live : colors.success
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: col,
        background: dark ? 'rgba(255,255,255,0.04)' : (closed ? colors.liveSoft : colors.successSoft),
        padding: '4px 9px',
        borderRadius: radius.pill,
        flexShrink: 0
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: col,
          animation: closed ? 'none' : 'mmPulse 1.4s ease-in-out infinite'
        }}
      />
      {closed ? 'Closed' : 'Opened'}
    </span>
  )
}

/** Monogram avatar derived from the trader's initials. */
function Avatar({ name, dark }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <span
      style={{
        width: 34,
        height: 34,
        borderRadius: '50%',
        flexShrink: 0,
        background: colors.primary,
        color: '#fff',
        display: 'grid',
        placeItems: 'center',
        fontWeight: 800,
        fontSize: 13,
        border: dark ? '1px solid rgba(255,255,255,0.12)' : 'none'
      }}
    >
      {initials}
    </span>
  )
}
