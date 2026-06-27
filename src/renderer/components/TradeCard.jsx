import { colors, radius } from '@theme/colors'
import { ArrowUpRightIcon, ArrowDownRightIcon, CopyIcon } from './Icons'
import { Star } from './Logo'

/**
 * The on-stream trade card. Premium, emoji-free, instantly readable: BUY trades
 * carry a green identity, SELL trades red — expressed through a solid direction
 * chip and accent rather than a stray edge line. Renders in three styles
 * (minimal / detailed / full), dark or light, with per-field visibility.
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
  const dirSoft = isBuy ? 'rgba(22,163,74,0.14)' : 'rgba(239,68,68,0.14)'
  const closed = trade.event === 'close'

  const c = dark
    ? { bg: '#0B1220', panel: 'rgba(255,255,255,0.05)', fg: '#F8FAFC', sub: '#94A3B8', line: 'rgba(255,255,255,0.08)' }
    : { bg: '#FFFFFF', panel: '#F6F8FC', fg: colors.textPrimary, sub: colors.textSecondary, line: colors.border }

  const fmt = (n) =>
    typeof n === 'number' ? n.toLocaleString('en-US', { minimumFractionDigits: 2 }) : n

  const shell = {
    fontFamily: "'Inter', sans-serif",
    background: c.bg,
    color: c.fg,
    borderRadius: 18,
    border: `1px solid ${c.line}`,
    boxShadow: dark
      ? '0 20px 48px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.3)'
      : '0 20px 48px rgba(15,23,42,0.18), 0 2px 6px rgba(15,23,42,0.06)',
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    animation: exiting
      ? 'mmCardOut .4s ease forwards'
      : 'mmCardIn .5s cubic-bezier(.16,1,.3,1)',
    overflow: 'hidden',
    width: style === 'minimal' ? 252 : 326
  }

  /** Solid direction chip — the primary buy/sell identifier. */
  const DirChip = ({ small = false }) => (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: small ? '4px 9px' : '5px 11px',
        borderRadius: radius.pill,
        background: dir,
        color: '#fff',
        fontWeight: 800,
        fontSize: small ? 11 : 12.5,
        letterSpacing: '0.03em',
        boxShadow: `0 2px 8px ${dirSoft}`
      }}
    >
      {isBuy ? <ArrowUpRightIcon size={small ? 12 : 14} /> : <ArrowDownRightIcon size={small ? 12 : 14} />}
      {trade.direction}
    </span>
  )

  /* ---------------------------------------------------------------- minimal */
  if (style === 'minimal') {
    return (
      <div style={shell}>
        {/* thin top accent in the direction color — subtle, full width */}
        <div style={{ height: 3, background: dir }} />
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {fields.pair && (
              <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', flex: 1 }}>
                {trade.pair}
              </span>
            )}
            {fields.direction && <DirChip small />}
          </div>
          {fields.entry && (
            <div style={{ fontSize: 13, color: c.sub }}>
              Entry{' '}
              <span style={{ color: c.fg, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {fmt(trade.entry)}
              </span>
            </div>
          )}
        </div>
      </div>
    )
  }

  const isFull = style === 'full'

  const Metric = ({ label, value, color }) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: c.sub }}>
        {label}
      </div>
      <div style={{ marginTop: 3, fontSize: 14, fontWeight: 700, color: color || c.fg, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  )

  /* --------------------------------------------------- detailed & full */
  return (
    <div style={shell}>
      {/* header: brand + status */}
      {branded && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '9px 16px',
            borderBottom: `1px solid ${c.line}`,
            background: dark ? 'rgba(255,255,255,0.02)' : '#FBFCFE'
          }}
        >
          <Star size={13} />
          <span style={{ fontWeight: 800, fontSize: 12.5, letterSpacing: '-0.01em' }}>millimore</span>
          <span
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: closed ? colors.sell : colors.success
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: closed ? colors.sell : colors.success,
                animation: closed ? 'none' : 'mmPulse 1.4s ease-in-out infinite'
              }}
            />
            {closed ? 'Closed' : 'Live'}
          </span>
        </div>
      )}

      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* trader (full only) */}
        {isFull && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar name={trade.trader || 'Marcus Sterling'} dark={dark} />
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{trade.trader || 'Marcus Sterling'}</span>
                {(trade.verified ?? true) && <Star size={12} />}
              </div>
              <div style={{ fontSize: 11, color: c.sub }}>Verified trader</div>
            </div>
          </div>
        )}

        {/* headline: pair + direction chip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {fields.pair && (
            <span style={{ fontWeight: 800, fontSize: 21, letterSpacing: '-0.02em', flex: 1 }}>
              {trade.pair}
            </span>
          )}
          {fields.direction && <DirChip />}
        </div>

        {/* entry hero — left accent bar in direction color (tasteful, contained) */}
        {fields.entry && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: c.panel,
              borderRadius: 12,
              padding: '12px 14px'
            }}
          >
            <span style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: dir }} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: c.sub }}>
              Entry
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
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

        {/* full extras */}
        {isFull && (
          <div style={{ display: 'flex', gap: 14, paddingTop: 12, borderTop: `1px solid ${c.line}` }}>
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

/** Monogram avatar from the trader's initials. */
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
