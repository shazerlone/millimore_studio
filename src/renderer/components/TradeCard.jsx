import { colors, radius, shadow } from '@theme/colors'
import { CopyIcon } from './Icons'
import { VerifiedBadge } from './ui'

/**
 * The on-stream trade card. Renders in three styles (minimal / detailed / full),
 * dark or light, with per-field visibility — the exact knobs exposed in the
 * Overlay Designer. Used live on the stream composite, in previews, and in the
 * MT5 sync test.
 *
 * @param {object} props
 * @param {object} props.trade        normalized trade event
 * @param {'minimal'|'detailed'|'full'} props.style
 * @param {'dark'|'light'} props.theme
 * @param {object} props.fields       { pair, direction, entry, sl, tp, lot }
 * @param {boolean} props.showCopy
 * @param {number} props.scale
 * @param {boolean} props.exiting     play the fade-out animation
 */
export function TradeCard({
  trade,
  style = 'detailed',
  theme = 'dark',
  fields = { pair: true, direction: true, entry: true, sl: true, tp: true, lot: true },
  showCopy = true,
  scale = 1,
  exiting = false
}) {
  const dark = theme === 'dark'
  const bg = dark ? '#0F172A' : '#FFFFFF'
  const fg = dark ? '#FFFFFF' : colors.textPrimary
  const sub = dark ? '#94A3B8' : colors.textSecondary
  const line = dark ? 'rgba(255,255,255,0.08)' : colors.border
  const isBuy = trade.direction === 'BUY'
  const dirColor = isBuy ? colors.buy : colors.sell
  const dot = isBuy ? '🟢' : '🔴'

  const shell = {
    fontFamily: "'Inter', sans-serif",
    background: bg,
    color: fg,
    borderRadius: radius.card,
    border: `1px solid ${line}`,
    boxShadow: shadow.pop,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    animation: `${exiting ? 'mmCardOut .4s ease forwards' : 'mmCardIn .45s cubic-bezier(.16,1,.3,1)'}`,
    overflow: 'hidden',
    width: style === 'minimal' ? 220 : 300
  }

  const price = (n) =>
    typeof n === 'number' ? n.toLocaleString('en-US', { minimumFractionDigits: 2 }) : n

  if (style === 'minimal') {
    return (
      <div style={shell}>
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15 }}>
            <span>{dot}</span>
            {fields.pair && <span>{trade.pair}</span>}
            {fields.direction && <span style={{ color: dirColor }}>{trade.direction}</span>}
          </div>
          {fields.entry && (
            <div style={{ fontSize: 13, color: sub, fontVariantNumeric: 'tabular-nums' }}>
              Entry {price(trade.entry)}
            </div>
          )}
        </div>
      </div>
    )
  }

  const Row = ({ children }) => (
    <div style={{ display: 'flex', gap: 16, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
      {children}
    </div>
  )
  const Stat = ({ k, v, color }) => (
    <span style={{ color: sub }}>
      {k}:{' '}
      <span style={{ color: color || fg, fontWeight: 600 }}>{v}</span>
    </span>
  )

  const isFull = style === 'full'

  return (
    <div style={shell}>
      {/* accent bar */}
      <div style={{ height: 3, background: dirColor }} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {isFull && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
            {trade.trader || 'Marcus Sterling'}
            {(trade.verified ?? true) && <VerifiedBadge size={15} />}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>{dot}</span>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em' }}>
            {fields.pair && trade.pair}
            {fields.direction && (
              <span style={{ color: dirColor }}> {trade.direction}</span>
            )}
          </span>
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.06em',
              color: trade.event === 'close' ? colors.live : colors.success,
              background: dark ? 'rgba(255,255,255,0.06)' : colors.surfaceMuted,
              padding: '3px 8px',
              borderRadius: radius.pill,
              textTransform: 'uppercase'
            }}
          >
            {trade.event === 'close' ? 'Closed' : 'Opened'}
          </span>
        </div>

        {fields.entry && (
          <div style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ color: sub }}>Entry: </span>
            <span style={{ fontWeight: 700 }}>{price(trade.entry)}</span>
          </div>
        )}

        {(fields.sl || fields.tp) && (
          <Row>
            {fields.sl && <Stat k="SL" v={price(trade.sl)} color={colors.sell} />}
            {fields.tp && <Stat k="TP" v={price(trade.tp)} color={colors.buy} />}
            {fields.lot && <Stat k="Lot" v={trade.lot} />}
          </Row>
        )}

        {isFull && (
          <Row>
            <Stat k="Risk" v={`${trade.risk ?? 1}%`} />
            <Stat k="RR" v={trade.rr || '1:2'} />
            <Stat k="Win Rate" v={`${trade.winRate ?? 68}%`} />
          </Row>
        )}

        {showCopy && (
          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
            <button
              style={{
                flex: 1,
                background: colors.primary,
                color: '#fff',
                border: 'none',
                borderRadius: radius.button,
                padding: '9px 12px',
                fontWeight: 600,
                fontSize: 13,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              <CopyIcon size={15} />
              {isFull ? 'Copy Trade' : 'Copy on Millimore'}
            </button>
            {isFull && (
              <button
                style={{
                  background: dark ? 'rgba(255,255,255,0.08)' : colors.surfaceMuted,
                  color: fg,
                  border: `1px solid ${line}`,
                  borderRadius: radius.button,
                  padding: '9px 14px',
                  fontWeight: 600,
                  fontSize: 13
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
