import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { colors, radius } from '@theme/colors'
import { typography } from '@theme/typography'
import { Logo } from '@components/Logo'
import { Button, Field, Input, Spinner } from '@components/ui'
import { useApp } from '../store'

/**
 * Sign in to the live Millimore backend — email/password OR phone OTP
 * (docs/BACKEND_INTEGRATION.md, contract §4.1). On success the main process has
 * persisted the JWT; we flip UI state via signIn(user).
 */
export function Login() {
  const navigate = useNavigate()
  const { bridge, signIn, pushToast } = useApp()

  const [mode, setMode] = useState('email') // 'email' | 'phone'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // email
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [twofa, setTwofa] = useState('')
  const [needTwofa, setNeedTwofa] = useState(false)

  // phone OTP
  const [phone, setPhone] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [requestId, setRequestId] = useState(null)
  const [code, setCode] = useState('')

  const done = (user) => {
    signIn(user)
    navigate('/')
  }

  const fail = (res) => {
    const msg = res?.error?.message || 'Something went wrong. Please try again.'
    setError(msg)
    if (res?.error?.code === 'twofa_required') setNeedTwofa(true)
  }

  const submitEmail = async (e) => {
    e.preventDefault()
    if (!bridge) return
    setLoading(true)
    setError(null)
    const res = await bridge.backend.login(email.trim(), password, needTwofa ? twofa.trim() : undefined)
    setLoading(false)
    if (res?.ok) done(res.data)
    else fail(res)
  }

  const requestOtp = async (e) => {
    e.preventDefault()
    if (!bridge) return
    setLoading(true)
    setError(null)
    const res = await bridge.backend.otpRequest(phone.trim())
    setLoading(false)
    if (res?.ok) {
      setRequestId(res.data?.requestId)
      setOtpSent(true)
      if (res.data?.devCode) {
        setCode(String(res.data.devCode))
        pushToast(`Dev code: ${res.data.devCode}`, 'info', 8000)
      }
    } else fail(res)
  }

  const verifyOtp = async (e) => {
    e.preventDefault()
    if (!bridge) return
    setLoading(true)
    setError(null)
    const res = await bridge.backend.otpVerify(requestId, code.trim())
    setLoading(false)
    if (res?.ok) done(res.data)
    else fail(res)
  }

  return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center', background: colors.background, padding: 24 }}>
      <div style={{ width: 380, animation: 'mmSlideUp .4s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
          <Logo size={28} />
        </div>

        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <h1 style={{ ...typography.h1, margin: 0, color: colors.textPrimary }}>Welcome back</h1>
          <p style={{ ...typography.body, color: colors.textSecondary, marginTop: 6 }}>
            Sign in to go live and stream your trades.
          </p>
        </div>

        {/* mode switch */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: 4,
            background: colors.surfaceMuted,
            borderRadius: radius.button,
            marginBottom: 18
          }}
        >
          {[
            ['email', 'Email'],
            ['phone', 'Phone']
          ].map(([m, label]) => (
            <button
              key={m}
              onClick={() => {
                setMode(m)
                setError(null)
              }}
              style={{
                flex: 1,
                padding: '9px 0',
                border: 'none',
                borderRadius: radius.button - 2,
                cursor: 'pointer',
                ...typography.bodyStrong,
                background: mode === m ? colors.surface : 'transparent',
                color: mode === m ? colors.textPrimary : colors.textSecondary,
                boxShadow: mode === m ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div
            style={{
              ...typography.small,
              color: colors.live,
              background: colors.liveSoft,
              padding: '10px 12px',
              borderRadius: radius.button,
              marginBottom: 14
            }}
          >
            {error}
          </div>
        )}

        {mode === 'email' ? (
          <form onSubmit={submitEmail} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input id="password" type="password" required placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {needTwofa && (
              <Field label="Two-factor code" htmlFor="twofa">
                <Input id="twofa" inputMode="numeric" placeholder="123456" value={twofa} onChange={(e) => setTwofa(e.target.value)} />
              </Field>
            )}
            <Button type="submit" size="lg" full disabled={loading} style={{ marginTop: 4 }}>
              {loading ? <Spinner size={16} color="#fff" /> : 'Sign in'}
            </Button>
          </form>
        ) : !otpSent ? (
          <form onSubmit={requestOtp} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Phone number" htmlFor="phone">
              <Input id="phone" type="tel" required placeholder="+91 90000 00000" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Button type="submit" size="lg" full disabled={loading} style={{ marginTop: 4 }}>
              {loading ? <Spinner size={16} color="#fff" /> : 'Send code'}
            </Button>
          </form>
        ) : (
          <form onSubmit={verifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label={`Code sent to ${phone}`} htmlFor="code">
              <Input id="code" inputMode="numeric" required placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
            <Button type="submit" size="lg" full disabled={loading} style={{ marginTop: 4 }}>
              {loading ? <Spinner size={16} color="#fff" /> : 'Verify & sign in'}
            </Button>
            <button
              type="button"
              onClick={() => {
                setOtpSent(false)
                setCode('')
                setError(null)
              }}
              style={{ background: 'none', border: 'none', color: colors.textSecondary, cursor: 'pointer', ...typography.small }}
            >
              Use a different number
            </button>
          </form>
        )}

        <p style={{ textAlign: 'center', marginTop: 22, ...typography.body, color: colors.textSecondary }}>
          Don&apos;t have an account?{' '}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              bridge?.openExternal?.('https://millimore.app/signup')
            }}
            style={{ fontWeight: 600, color: colors.primary }}
          >
            Sign up
          </a>
        </p>
      </div>
    </div>
  )
}
