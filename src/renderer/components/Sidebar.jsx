import { NavLink } from 'react-router-dom'
import { colors, radius } from '@theme/colors'
import { typography } from '@theme/typography'
import { Logo } from './Logo'
import { VerifiedBadge } from './ui'
import {
  HomeIcon,
  LiveIcon,
  LayersIcon,
  PlugIcon,
  ChartIcon,
  SettingsIcon
} from './Icons'
import { trader } from '../data/mock'

const NAV = [
  { to: '/', label: 'Home', Icon: HomeIcon, end: true },
  { to: '/go-live', label: 'Go Live', Icon: LiveIcon },
  { to: '/overlay', label: 'Trade Overlay', Icon: LayersIcon },
  { to: '/mt5', label: 'MT5 Connection', Icon: PlugIcon },
  { to: '/analytics', label: 'Analytics', Icon: ChartIcon },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon }
]

export function Sidebar({ isLive = false }) {
  return (
    <aside
      style={{
        width: 240,
        flexShrink: 0,
        height: '100%',
        background: colors.surface,
        borderRight: `1px solid ${colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 14px'
      }}
    >
      <div style={{ padding: '6px 8px 22px' }}>
        <Logo size={20} />
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        {NAV.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} style={{ textDecoration: 'none' }}>
            {({ isActive }) => (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  padding: '9px 10px',
                  borderRadius: radius.button,
                  color: isActive ? colors.primary : colors.textSecondary,
                  background: isActive ? colors.primarySoft : 'transparent',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: 14,
                  transition: 'background .12s ease, color .12s ease'
                }}
                onMouseOver={(e) => {
                  if (!isActive) e.currentTarget.style.background = colors.surfaceMuted
                }}
                onMouseOut={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent'
                }}
              >
                <Icon size={19} />
                <span>{label}</span>
                {to === '/go-live' && isLive && (
                  <span
                    style={{
                      marginLeft: 'auto',
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: colors.live,
                      animation: 'mmPulse 1.4s ease-in-out infinite'
                    }}
                  />
                )}
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      <ProfileChip />
    </aside>
  )
}

function ProfileChip() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px',
        borderRadius: radius.card,
        border: `1px solid ${colors.border}`,
        marginTop: 12
      }}
    >
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <img
          src={trader.avatar}
          alt={trader.name}
          width={34}
          height={34}
          style={{ borderRadius: '50%', objectFit: 'cover', display: 'block' }}
        />
        <span
          style={{
            position: 'absolute',
            right: -1,
            bottom: -1,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: colors.success,
            border: '2px solid #fff'
          }}
        />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            ...typography.bodyStrong,
            fontSize: 13,
            color: colors.textPrimary
          }}
        >
          <span
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {trader.name}
          </span>
          {trader.verified && <VerifiedBadge size={14} />}
        </div>
        <div style={{ ...typography.caption, color: colors.success }}>Online</div>
      </div>
    </div>
  )
}
