/**
 * Millimore brand palette.
 * White background, no gradients, primary blue for all interactive accents.
 */
export const colors = {
  // Brand
  primary: '#2563EB',
  primaryHover: '#1D4ED8',
  primaryActive: '#1E40AF',
  primarySoft: '#EFF4FF', // tinted blue surface for active nav / selected states

  // Surfaces
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAFC',

  // Text
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textTertiary: '#94A3B8',
  textInverse: '#FFFFFF',

  // Lines
  border: '#F1F5F9',
  borderStrong: '#E2E8F0',

  // Status
  live: '#EF4444',
  liveSoft: '#FEF2F2',
  success: '#16A34A',
  successSoft: '#F0FDF4',
  warning: '#D97706',
  warningSoft: '#FFFBEB',

  // Trade direction
  buy: '#16A34A',
  sell: '#EF4444',

  // Misc
  dark: '#0F172A',
  slate: '#64748B',
  overlayScrim: 'rgba(15, 23, 42, 0.6)'
}

export const radius = {
  sm: '6px',
  button: '8px',
  card: '12px',
  lg: '16px',
  pill: '999px'
}

export const shadow = {
  // Minimal shadows only where elevation is genuinely needed.
  sm: '0 1px 2px rgba(15, 23, 42, 0.04)',
  card: '0 1px 3px rgba(15, 23, 42, 0.06)',
  pop: '0 8px 24px rgba(15, 23, 42, 0.12)'
}

export const spacing = (n) => `${n * 4}px`
