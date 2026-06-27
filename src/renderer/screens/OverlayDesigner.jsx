import { colors, radius } from '@theme/colors'
import { typography } from '@theme/typography'
import { Page, PageHeader } from '@components/Page'
import { Card, Toggle, Badge } from '@components/ui'
import { TradeCard } from '@components/TradeCard'
import { CheckIcon } from '@components/Icons'
import { sampleTrade } from '../data/mock'
import { useApp } from '../store'

const POSITIONS = [
  { id: 'top-left', label: 'Top left' },
  { id: 'top-right', label: 'Top right' },
  { id: 'bottom-left', label: 'Bottom left' },
  { id: 'bottom-right', label: 'Bottom right' }
]

const STYLES = [
  { id: 'minimal', label: 'Minimal', desc: 'Pair, direction, entry' },
  { id: 'detailed', label: 'Detailed', desc: 'Adds SL, TP & copy button' },
  { id: 'full', label: 'Full', desc: 'Trader, stats & actions' }
]

const FIELDS = [
  { key: 'pair', label: 'Pair' },
  { key: 'direction', label: 'Direction' },
  { key: 'entry', label: 'Entry price' },
  { key: 'sl', label: 'Stop loss' },
  { key: 'tp', label: 'Take profit' },
  { key: 'lot', label: 'Lot size' }
]

export function OverlayDesigner() {
  const { overlayConfig, updateOverlay } = useApp()
  const cfg = overlayConfig

  const corner = {
    'top-left': { top: 14, left: 14 },
    'top-right': { top: 14, right: 14 },
    'bottom-left': { bottom: 14, left: 14 },
    'bottom-right': { bottom: 14, right: 14 }
  }[cfg.position]

  return (
    <Page maxWidth={1320}>
      <PageHeader
        title="Trade Overlay Designer"
        subtitle="Customize how your trade cards appear on stream. Cards animate in automatically when a trade fires."
        actions={<Badge tone="green"><CheckIcon size={12} /> Auto-saved</Badge>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, alignItems: 'start' }}>
        {/* PREVIEW */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card padding={14}>
            <div
              style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '16 / 9',
                borderRadius: radius.card,
                overflow: 'hidden',
                background: '#0B1220'
              }}
            >
              <FakeStream />
              <div style={{ position: 'absolute', ...corner }}>
                <TradeCard
                  trade={sampleTrade}
                  style={cfg.style}
                  theme={cfg.theme}
                  fields={cfg.fields}
                  showCopy={cfg.showCopy}
                  scale={0.9}
                />
              </div>
            </div>
            <p style={{ ...typography.small, color: colors.textSecondary, margin: '12px 4px 0' }}>
              Pick a corner below to position the card. This is exactly how it appears to your viewers.
            </p>
          </Card>

          {/* style previews */}
          <Card>
            <div style={{ ...typography.label, color: colors.textSecondary, marginBottom: 14 }}>
              Card styles
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {['minimal', 'detailed', 'full'].map((s) => (
                <div key={s} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <TradeCard trade={sampleTrade} style={s} theme={cfg.theme} showCopy scale={0.78} />
                  <span style={{ ...typography.caption, color: colors.textTertiary, textTransform: 'capitalize' }}>
                    {s}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* CONTROLS */}
        <Card padding={20} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <Group title="Position">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {POSITIONS.map((p) => (
                <ChoiceButton
                  key={p.id}
                  active={cfg.position === p.id}
                  onClick={() => updateOverlay({ position: p.id })}
                >
                  {p.label}
                </ChoiceButton>
              ))}
            </div>
          </Group>

          <Group title="Card style">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {STYLES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => updateOverlay({ style: s.id })}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: radius.button,
                    border: `1px solid ${cfg.style === s.id ? colors.primary : colors.borderStrong}`,
                    background: cfg.style === s.id ? colors.primarySoft : colors.surface
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ ...typography.bodyStrong, color: colors.textPrimary }}>{s.label}</div>
                    <div style={{ ...typography.small, color: colors.textSecondary }}>{s.desc}</div>
                  </div>
                  {cfg.style === s.id && <span style={{ color: colors.primary }}><CheckIcon size={16} /></span>}
                </button>
              ))}
            </div>
          </Group>

          <Group title="Show on card">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {FIELDS.map((f) => (
                <Row key={f.key} label={f.label}>
                  <Toggle
                    checked={cfg.fields[f.key]}
                    onChange={(v) => updateOverlay({ fields: { [f.key]: v } })}
                  />
                </Row>
              ))}
            </div>
          </Group>

          <Group title="Card color">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <ChoiceButton active={cfg.theme === 'dark'} onClick={() => updateOverlay({ theme: 'dark' })}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: '#0F172A', border: '1px solid #334155' }} />
                Dark
              </ChoiceButton>
              <ChoiceButton active={cfg.theme === 'light'} onClick={() => updateOverlay({ theme: 'light' })}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: '#fff', border: '1px solid #CBD5E1' }} />
                Light
              </ChoiceButton>
            </div>
          </Group>

          <Row label="Always show Copy button">
            <Toggle checked={cfg.showCopy} onChange={(v) => updateOverlay({ showCopy: v })} />
          </Row>
        </Card>
      </div>
    </Page>
  )
}

function Group({ title, children }) {
  return (
    <div>
      <div style={{ ...typography.label, color: colors.textSecondary, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ ...typography.body, color: colors.textPrimary }}>{label}</span>
      {children}
    </div>
  )
}

function ChoiceButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '10px 12px',
        borderRadius: radius.button,
        border: `1px solid ${active ? colors.primary : colors.borderStrong}`,
        background: active ? colors.primarySoft : colors.surface,
        color: active ? colors.primary : colors.textPrimary,
        fontWeight: 600,
        fontSize: 13
      }}
    >
      {children}
    </button>
  )
}

function FakeStream() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
      <rect width="640" height="360" fill="#0B1220" />
      {Array.from({ length: 26 }).map((_, i) => {
        const x = 30 + i * 22
        const up = Math.sin(i * 1.1) > 0
        const h = 20 + Math.abs(Math.cos(i * 1.2)) * 55
        const y = 130 + Math.sin(i * 0.8) * 45
        return (
          <g key={i} fill={up ? '#16A34A' : '#EF4444'}>
            <rect x={x - 4} y={y} width="8" height={h} rx="1.5" />
          </g>
        )
      })}
    </svg>
  )
}
