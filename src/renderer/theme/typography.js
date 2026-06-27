/**
 * Inter type scale. Inter is loaded locally via theme/fonts.css.
 */
export const fontFamily =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

export const typography = {
  fontFamily,
  display: { fontSize: '28px', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em' },
  h1: { fontSize: '24px', fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.02em' },
  h2: { fontSize: '20px', fontWeight: 600, lineHeight: 1.3, letterSpacing: '-0.01em' },
  h3: { fontSize: '16px', fontWeight: 600, lineHeight: 1.4 },
  body: { fontSize: '14px', fontWeight: 400, lineHeight: 1.55 },
  bodyStrong: { fontSize: '14px', fontWeight: 500, lineHeight: 1.55 },
  small: { fontSize: '13px', fontWeight: 400, lineHeight: 1.5 },
  caption: { fontSize: '12px', fontWeight: 500, lineHeight: 1.4, letterSpacing: '0.01em' },
  label: {
    fontSize: '11px',
    fontWeight: 600,
    lineHeight: 1.3,
    letterSpacing: '0.06em',
    textTransform: 'uppercase'
  },
  mono: {
    fontFamily: "'SF Mono', 'JetBrains Mono', 'Roboto Mono', ui-monospace, monospace",
    fontVariantNumeric: 'tabular-nums'
  }
}
