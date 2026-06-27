import { useNavigate } from 'react-router-dom'
import { colors } from '@theme/colors'
import { typography } from '@theme/typography'
import { Page, PageHeader } from '@components/Page'
import { StatsCard } from '@components/StatsCard'
import { StreamPreview } from '@components/StreamPreview'
import { Card, Button, Badge, SectionTitle } from '@components/ui'
import { UsersIcon, ClockIcon, TrendUpIcon, LayersIcon, LiveIcon, ChevronRightIcon, EyeIcon } from '@components/Icons'
import { trader, stats, recentStreams } from '../data/mock'
import { useApp } from '../store'

const STAT_ICONS = {
  viewers: <UsersIcon size={16} />,
  hours: <ClockIcon size={16} />,
  followers: <TrendUpIcon size={16} />,
  trades: <LayersIcon size={16} />
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function Dashboard() {
  const navigate = useNavigate()
  const { isLive } = useApp()
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  })

  return (
    <Page>
      <PageHeader
        title={`${greeting()}, ${trader.name.split(' ')[0]}`}
        subtitle={today}
        actions={
          <Button icon={<LiveIcon size={18} />} onClick={() => navigate('/go-live')}>
            Go Live
          </Button>
        }
      />

      {/* stats row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
          marginBottom: 28
        }}
      >
        {stats.map((s) => (
          <StatsCard key={s.key} {...s} icon={STAT_ICONS[s.key]} />
        ))}
      </div>

      {/* preview + recent */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20 }}>
        <div>
          <SectionTitle
            action={
              <Badge tone={isLive ? 'red' : 'neutral'}>
                {isLive ? 'Live now' : 'Offline'}
              </Badge>
            }
          >
            Live preview
          </SectionTitle>
          <Card padding={14}>
            <StreamPreview live={isLive} elapsed="00:00:00" />
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 14
              }}
            >
              <div>
                <div style={{ ...typography.h3, color: colors.textPrimary }}>
                  London Open — Gold Scalping
                </div>
                <div style={{ ...typography.small, color: colors.textSecondary }}>
                  Camera + screen · 1080p ready
                </div>
              </div>
              <Button variant="primary" icon={<LiveIcon size={17} />} onClick={() => navigate('/go-live')}>
                {isLive ? 'Open stream' : 'Go live'}
              </Button>
            </div>
          </Card>
        </div>

        <div>
          <SectionTitle
            action={
              <button
                onClick={() => navigate('/analytics')}
                style={{
                  ...typography.caption,
                  color: colors.primary,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 2
                }}
              >
                View all <ChevronRightIcon size={14} />
              </button>
            }
          >
            Recent streams
          </SectionTitle>
          <Card padding={6}>
            {recentStreams.map((s, i) => (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 12px',
                  borderTop: i === 0 ? 'none' : `1px solid ${colors.border}`
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: colors.primarySoft,
                    color: colors.primary,
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0
                  }}
                >
                  <LiveIcon size={18} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      ...typography.bodyStrong,
                      color: colors.textPrimary,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {s.title}
                  </div>
                  <div style={{ ...typography.small, color: colors.textSecondary }}>
                    {s.date} · {s.duration} · {s.trades} trades
                  </div>
                </div>
                <div
                  style={{
                    ...typography.caption,
                    color: colors.textSecondary,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    flexShrink: 0
                  }}
                >
                  <EyeIcon size={14} />
                  {s.viewers.toLocaleString()}
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </Page>
  )
}
