import { colors, radius } from '@theme/colors'
import { typography } from '@theme/typography'
import { Page, PageHeader } from '@components/Page'
import { Card, Badge, SectionTitle } from '@components/ui'
import { ClockIcon, UsersIcon, EyeIcon, TrendUpIcon, LayersIcon } from '@components/Icons'
import { analytics } from '../data/mock'

export function Analytics() {
  const metrics = [
    { label: 'Total stream hours', value: analytics.totalHours, icon: <ClockIcon size={16} /> },
    { label: 'Peak concurrent viewers', value: analytics.peakViewers.toLocaleString(), icon: <EyeIcon size={16} /> },
    { label: 'Average viewers / stream', value: analytics.avgViewers.toLocaleString(), icon: <UsersIcon size={16} /> },
    { label: 'Followers gained', value: analytics.followersGained.toLocaleString(), icon: <TrendUpIcon size={16} /> },
    { label: 'Trades shown on stream', value: analytics.tradesShown, icon: <LayersIcon size={16} /> }
  ]

  return (
    <Page maxWidth={1180}>
      <PageHeader
        title="Stream Analytics"
        subtitle="How your streams are performing across every platform."
        actions={<Badge tone="blue">Last 30 days</Badge>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 24 }}>
        {metrics.map((m) => (
          <Card key={m.label} padding={16} hover>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: colors.primary, marginBottom: 10 }}>
              <span style={{ background: colors.primarySoft, width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center' }}>
                {m.icon}
              </span>
            </div>
            <div style={{ ...typography.display, fontSize: 24, color: colors.textPrimary }}>{m.value}</div>
            <div style={{ ...typography.caption, color: colors.textSecondary, marginTop: 4 }}>{m.label}</div>
          </Card>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20, marginBottom: 20 }}>
        <Card>
          <SectionTitle action={<Badge tone="neutral">Avg retention</Badge>}>Viewer retention</SectionTitle>
          <RetentionChart data={analytics.retention} />
        </Card>

        <Card>
          <SectionTitle>Platform breakdown</SectionTitle>
          <PlatformChart data={analytics.platforms} />
        </Card>
      </div>

      <Card>
        <SectionTitle>Most watched stream</SectionTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: colors.primarySoft, color: colors.primary, display: 'grid', placeItems: 'center' }}>
            <EyeIcon size={20} />
          </div>
          <div>
            <div style={{ ...typography.h3, color: colors.textPrimary }}>{analytics.mostWatched}</div>
            <div style={{ ...typography.small, color: colors.textSecondary }}>
              {analytics.peakViewers.toLocaleString()} peak viewers · 14 trades shown
            </div>
          </div>
        </div>
      </Card>
    </Page>
  )
}

function RetentionChart({ data }) {
  const W = 560
  const H = 220
  const pad = { l: 36, r: 12, t: 16, b: 28 }
  const innerW = W - pad.l - pad.r
  const innerH = H - pad.t - pad.b
  const max = 100
  const pts = data.map((v, i) => {
    const x = pad.l + (i / (data.length - 1)) * innerW
    const y = pad.t + (1 - v / max) * innerH
    return [x, y]
  })
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ')
  const area = `${line} L${pts[pts.length - 1][0]},${pad.t + innerH} L${pts[0][0]},${pad.t + innerH} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Viewer retention over time">
      {[0, 25, 50, 75, 100].map((g) => {
        const y = pad.t + (1 - g / max) * innerH
        return (
          <g key={g}>
            <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke={colors.border} strokeWidth="1" />
            <text x={pad.l - 8} y={y + 3} fontSize="10" fill={colors.textTertiary} textAnchor="end" fontFamily="Inter">
              {g}%
            </text>
          </g>
        )
      })}
      <path d={area} fill={colors.primarySoft} />
      <path d={line} fill="none" stroke={colors.primary} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="#fff" stroke={colors.primary} strokeWidth="2" />
      ))}
      {['0m', '15m', '30m', '45m', '60m'].map((lbl, i, a) => (
        <text
          key={lbl}
          x={pad.l + (i / (a.length - 1)) * innerW}
          y={H - 8}
          fontSize="10"
          fill={colors.textTertiary}
          textAnchor="middle"
          fontFamily="Inter"
        >
          {lbl}
        </text>
      ))}
    </svg>
  )
}

function PlatformChart({ data }) {
  const max = Math.max(...data.map((d) => d.value))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 4 }}>
      {data.map((d) => (
        <div key={d.platform}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ ...typography.bodyStrong, color: colors.textPrimary }}>{d.platform}</span>
            <span style={{ ...typography.small, color: colors.textSecondary }}>{d.value}%</span>
          </div>
          <div style={{ height: 10, borderRadius: radius.pill, background: colors.surfaceMuted, overflow: 'hidden' }}>
            <div
              style={{
                width: `${(d.value / max) * 100}%`,
                height: '100%',
                borderRadius: radius.pill,
                background: d.color,
                transition: 'width .5s ease'
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
