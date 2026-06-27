import { colors } from '@theme/colors'
import { typography } from '@theme/typography'
import { Card, Badge } from './ui'
import { TrendUpIcon } from './Icons'

export function StatsCard({ label, value, delta, positive = true, icon }) {
  return (
    <Card hover padding={18} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ ...typography.caption, color: colors.textSecondary }}>{label}</span>
        {icon && (
          <span
            style={{
              color: colors.primary,
              background: colors.primarySoft,
              width: 30,
              height: 30,
              borderRadius: 8,
              display: 'grid',
              placeItems: 'center'
            }}
          >
            {icon}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ ...typography.display, fontSize: 26, color: colors.textPrimary }}>
          {value}
        </span>
        {delta && (
          <Badge tone={positive ? 'green' : 'red'}>
            <TrendUpIcon size={12} />
            {delta}
          </Badge>
        )}
      </div>
    </Card>
  )
}
