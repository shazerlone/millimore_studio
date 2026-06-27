import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { colors } from '@theme/colors'
import { typography } from '@theme/typography'
import { Logo } from '@components/Logo'
import { Button, Field, Input, Spinner } from '@components/ui'
import { useApp } from '../store'

export function Login() {
  const navigate = useNavigate()
  const { setAuthed } = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = (e) => {
    e.preventDefault()
    setLoading(true)
    // No backend yet — simulate auth then enter the app.
    setTimeout(() => {
      setAuthed(true)
      navigate('/')
    }, 700)
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'grid',
        placeItems: 'center',
        background: colors.background,
        padding: 24
      }}
    >
      <div style={{ width: 380, animation: 'mmSlideUp .4s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
          <Logo size={28} />
        </div>

        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1 style={{ ...typography.h1, margin: 0, color: colors.textPrimary }}>Welcome back</h1>
          <p style={{ ...typography.body, color: colors.textSecondary, marginTop: 6 }}>
            Sign in to go live and stream your trades.
          </p>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          <Field label="Password" htmlFor="password">
            <Input
              id="password"
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          <Button type="submit" size="lg" full disabled={loading} style={{ marginTop: 4 }}>
            {loading ? <Spinner size={16} color="#fff" /> : 'Sign in'}
          </Button>
        </form>

        <p
          style={{
            textAlign: 'center',
            marginTop: 22,
            ...typography.body,
            color: colors.textSecondary
          }}
        >
          Don&apos;t have an account?{' '}
          <a href="https://millimore.app/signup" style={{ fontWeight: 600 }}>
            Sign up
          </a>
        </p>
      </div>
    </div>
  )
}
