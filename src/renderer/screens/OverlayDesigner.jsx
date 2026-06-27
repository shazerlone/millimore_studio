import { colors, radius } from '@theme/colors'
import { typography } from '@theme/typography'
import { Page, PageHeader } from '@components/Page'
import { Card, Toggle, Badge, Input, Button } from '@components/ui'
import { TradeCard } from '@components/TradeCard'
import { Ticker } from '@components/Ticker'
import { Watermark } from '@components/Watermark'
import { CheckIcon, PlusIcon } from '@components/Icons'
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
              <Ticker config={cfg.ticker} />
              <div style={{ position: 'absolute', ...corner, zIndex: 6 }}>
                <TradeCard
                  trade={sampleTrade}
                  style={cfg.style}
                  theme={cfg.theme}
                  fields={cfg.fields}
                  showCopy={cfg.showCopy}
                  branded
                  scale={0.9}
                />
              </div>
              {/* show the standalone watermark in the opposite corner so its
                  size/opacity is visible while the card occupies its corner */}
              {cfg.watermark?.enabled && (
                <div
                  style={{
                    position: 'absolute',
                    [cfg.position.includes('top') ? 'bottom' : 'top']: 14,
                    [cfg.position.includes('left') ? 'right' : 'left']: 14,
                    zIndex: 6
                  }}
                >
                  <Watermark opacity={cfg.watermark.opacity} />
                </div>
              )}
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

          {/* ---- Millimore watermark ---- */}
          <Group title="Millimore watermark">
            <Row label="Show watermark on stream">
              <Toggle
                checked={cfg.watermark.enabled}
                onChange={(v) => updateOverlay({ watermark: { enabled: v } })}
              />
            </Row>
            {cfg.watermark.enabled && (
              <div style={{ marginTop: 12 }}>
                <div style={{ ...typography.caption, color: colors.textSecondary, marginBottom: 6 }}>
                  Opacity — {Math.round(cfg.watermark.opacity * 100)}%
                </div>
                <input
                  type="range"
                  min="0.3"
                  max="1"
                  step="0.02"
                  value={cfg.watermark.opacity}
                  onChange={(e) => updateOverlay({ watermark: { opacity: Number(e.target.value) } })}
                  style={{ width: '100%', accentColor: colors.primary }}
                />
                <div style={{ ...typography.small, color: colors.textTertiary, marginTop: 4 }}>
                  Sits at the same corner as your trade card and expands into it when a trade fires.
                </div>
              </div>
            )}
          </Group>

          {/* ---- Scrolling ticker ---- */}
          <Group title="Scrolling ticker">
            <Row label="Show ticker banner">
              <Toggle
                checked={cfg.ticker.enabled}
                onChange={(v) => updateOverlay({ ticker: { enabled: v } })}
              />
            </Row>

            {cfg.ticker.enabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
                <div>
                  <div style={{ ...typography.caption, color: colors.textSecondary, marginBottom: 8 }}>Position</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <ChoiceButton active={cfg.ticker.position === 'top'} onClick={() => updateOverlay({ ticker: { position: 'top' } })}>
                      Top
                    </ChoiceButton>
                    <ChoiceButton active={cfg.ticker.position === 'bottom'} onClick={() => updateOverlay({ ticker: { position: 'bottom' } })}>
                      Bottom
                    </ChoiceButton>
                  </div>
                </div>

                <div>
                  <div style={{ ...typography.caption, color: colors.textSecondary, marginBottom: 8 }}>Style</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <ChoiceButton active={cfg.ticker.theme === 'dark'} onClick={() => updateOverlay({ ticker: { theme: 'dark' } })}>
                      Dark
                    </ChoiceButton>
                    <ChoiceButton active={cfg.ticker.theme === 'light'} onClick={() => updateOverlay({ ticker: { theme: 'light' } })}>
                      Light
                    </ChoiceButton>
                  </div>
                </div>

                <div>
                  <div style={{ ...typography.caption, color: colors.textSecondary, marginBottom: 6 }}>
                    Scroll speed — {cfg.ticker.speed} px/s
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="140"
                    step="5"
                    value={cfg.ticker.speed}
                    onChange={(e) => updateOverlay({ ticker: { speed: Number(e.target.value) } })}
                    style={{ width: '100%', accentColor: colors.primary }}
                  />
                </div>

                <TickerItemsEditor
                  items={cfg.ticker.items}
                  onChange={(items) => updateOverlay({ ticker: { items } })}
                />
              </div>
            )}
          </Group>
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

function TickerItemsEditor({ items, onChange }) {
  const TYPES = [
    { value: 'disclaimer', label: 'Disclaimer' },
    { value: 'link', label: 'Link' },
    { value: 'subscribers', label: 'Subscribers' },
    { value: 'custom', label: 'Custom' }
  ]
  const update = (id, patch) => onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  const remove = (id) => onChange(items.filter((it) => it.id !== id))
  const add = () =>
    onChange([...items, { id: `i${Date.now()}`, type: 'custom', text: '' }])

  return (
    <div>
      <div style={{ ...typography.caption, color: colors.textSecondary, marginBottom: 8 }}>
        Ticker messages
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((it) => (
          <div key={it.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select
              value={it.type}
              onChange={(e) => update(it.id, { type: e.target.value })}
              style={{
                fontSize: 12,
                padding: '8px 6px',
                borderRadius: radius.button,
                border: `1px solid ${colors.borderStrong}`,
                background: '#fff',
                flexShrink: 0
              }}
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <Input
              value={it.text}
              placeholder="Message text…"
              onChange={(e) => update(it.id, { text: e.target.value })}
              style={{ fontSize: 13, padding: '8px 10px' }}
            />
            <button
              onClick={() => remove(it.id)}
              aria-label="Remove"
              style={{
                flexShrink: 0,
                width: 32,
                height: 32,
                borderRadius: radius.button,
                border: `1px solid ${colors.borderStrong}`,
                color: colors.textSecondary,
                fontSize: 16,
                lineHeight: 1
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        <Button variant="secondary" size="sm" icon={<PlusIcon size={15} />} onClick={add}>
          Add message
        </Button>
      </div>
    </div>
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
