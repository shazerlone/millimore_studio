import { useState } from 'react'
import { colors, radius } from '@theme/colors'
import { typography } from '@theme/typography'
import { Card, Input, Button, Badge } from './ui'
import { ArrowUpRightIcon, ArrowDownRightIcon, LayersIcon, CheckIcon } from './Icons'
import { trader } from '../data/mock'

/**
 * Manual trade-placement panel. The trader enters the pair, direction, entry,
 * SL, TP and lot, then "Show on stream" pushes a branded trade card onto the
 * live overlay (and the preview). This replaces the old automatic MT5 card so
 * nothing appears on stream unless the trader places it.
 */
export function TradePlacement({ live, active, onPlace, onClose, onHide }) {
  const [pair, setPair] = useState('XAUUSD')
  const [direction, setDirection] = useState('BUY')
  const [entry, setEntry] = useState('2345.50')
  const [sl, setSl] = useState('2330.00')
  const [tp, setTp] = useState('2370.00')
  const [lot, setLot] = useState('0.50')

  const num = (v) => {
    const n = parseFloat(String(v).replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }

  const computeRR = () => {
    const e = num(entry)
    const s = num(sl)
    const t = num(tp)
    if (e == null || s == null || t == null) return null
    const risk = Math.abs(e - s)
    const reward = Math.abs(t - e)
    if (!risk) return null
    return `1:${(reward / risk).toFixed(1).replace(/\.0$/, '')}`
  }

  const place = () => {
    const e = num(entry)
    if (!pair.trim() || e == null) return
    onPlace({
      id: `manual-${Date.now()}`,
      trader: trader.name,
      verified: trader.verified,
      pair: pair.trim().toUpperCase(),
      direction,
      entry: e,
      sl: num(sl),
      tp: num(tp),
      lot: num(lot),
      risk: 1,
      rr: computeRR() || '1:2',
      winRate: 68
    })
  }

  return (
    <Card padding={16}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ color: colors.primary }}>
          <LayersIcon size={18} />
        </span>
        <span style={{ ...typography.h3, color: colors.textPrimary }}>Place a trade</span>
        {active ? (
          <Badge tone="green" style={{ marginLeft: 'auto' }}>
            <CheckIcon size={12} /> On stream
          </Badge>
        ) : (
          <Badge tone="neutral" style={{ marginLeft: 'auto' }}>
            {live ? 'Shows live instantly' : 'Preview'}
          </Badge>
        )}
      </div>

      {/* direction */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <DirButton
          active={direction === 'BUY'}
          color={colors.buy}
          icon={<ArrowUpRightIcon size={16} />}
          label="Buy / Long"
          onClick={() => setDirection('BUY')}
        />
        <DirButton
          active={direction === 'SELL'}
          color={colors.sell}
          icon={<ArrowDownRightIcon size={16} />}
          label="Sell / Short"
          onClick={() => setDirection('SELL')}
        />
      </div>

      {/* fields */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <FieldMini label="Pair">
          <Input value={pair} onChange={(e) => setPair(e.target.value)} style={fieldStyle} />
        </FieldMini>
        <FieldMini label="Lot size">
          <Input value={lot} onChange={(e) => setLot(e.target.value)} inputMode="decimal" style={fieldStyle} />
        </FieldMini>
        <FieldMini label="Entry price">
          <Input value={entry} onChange={(e) => setEntry(e.target.value)} inputMode="decimal" style={fieldStyle} />
        </FieldMini>
        <FieldMini label="Risk : Reward (auto)">
          <Input value={computeRR() || '—'} disabled style={{ ...fieldStyle, color: colors.textSecondary }} />
        </FieldMini>
        <FieldMini label="Stop loss">
          <Input value={sl} onChange={(e) => setSl(e.target.value)} inputMode="decimal" style={fieldStyle} />
        </FieldMini>
        <FieldMini label="Take profit">
          <Input value={tp} onChange={(e) => setTp(e.target.value)} inputMode="decimal" style={fieldStyle} />
        </FieldMini>
      </div>

      {/* actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <Button full onClick={place} icon={<LayersIcon size={16} />}>
          {active ? 'Update card' : 'Show on stream'}
        </Button>
        {active && (
          <>
            <Button variant="secondary" onClick={onClose}>
              Closed
            </Button>
            <Button variant="ghost" onClick={onHide}>
              Hide
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}

const fieldStyle = { fontSize: 13, padding: '8px 10px' }

function FieldMini({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ ...typography.caption, color: colors.textSecondary }}>{label}</span>
      {children}
    </label>
  )
}

function DirButton({ active, color, icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        padding: '10px 12px',
        borderRadius: radius.button,
        border: `1px solid ${active ? color : colors.borderStrong}`,
        background: active ? color : colors.surface,
        color: active ? '#fff' : colors.textSecondary,
        fontWeight: 700,
        fontSize: 13,
        transition: 'all .12s ease'
      }}
    >
      {icon}
      {label}
    </button>
  )
}
