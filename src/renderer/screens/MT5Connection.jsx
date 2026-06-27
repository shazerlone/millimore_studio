import { useEffect, useState } from 'react'
import { colors, radius } from '@theme/colors'
import { typography } from '@theme/typography'
import { Page, PageHeader } from '@components/Page'
import { Card, Field, Input, Button, Badge, Spinner, VerifiedBadge } from '@components/ui'
import { TradeCard } from '@components/TradeCard'
import { LockIcon, CheckCircleIcon, CheckIcon, PlugIcon } from '@components/Icons'
import { mt5Sample, sampleTrade } from '../data/mock'
import { useApp } from '../store'

export function MT5Connection() {
  const { bridge, setMt5Connected } = useApp()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ account: '', password: '', server: '' })
  const [account, setAccount] = useState(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState(null)
  const [testTrade, setTestTrade] = useState(null)
  const [testConfirmed, setTestConfirmed] = useState(false)

  // If already connected (e.g. returning to the screen), jump to status.
  useEffect(() => {
    if (!bridge) return
    bridge.mt5.getAccount().then((acc) => {
      if (acc) {
        setAccount(acc)
        setMt5Connected(true)
        setStep(2)
      }
    })
  }, [bridge, setMt5Connected])

  const connect = async (e) => {
    e.preventDefault()
    setError(null)
    setConnecting(true)
    try {
      const acc = bridge
        ? await bridge.mt5.connect(form)
        : { ...mt5Sample, login: form.account, server: form.server, readOnly: true }
      setAccount(acc)
      setMt5Connected(true)
      setStep(2)
    } catch (err) {
      setError(err.message || 'Could not connect. Check your details and try again.')
    } finally {
      setConnecting(false)
    }
  }

  const runSyncTest = async () => {
    setStep(3)
    setTestConfirmed(false)
    const trade = bridge ? await bridge.mt5.runSyncTest() : { ...sampleTrade, test: true }
    setTimeout(() => setTestTrade(trade), 600)
  }

  const disconnect = async () => {
    await bridge?.mt5.disconnect()
    setMt5Connected(false)
    setAccount(null)
    setStep(1)
    setTestTrade(null)
  }

  return (
    <Page maxWidth={920}>
      <PageHeader
        title="MT5 Connection"
        subtitle="Connect your MetaTrader 5 account to show trades automatically on stream."
      />

      <Stepper step={step} />

      {step === 1 && (
        <Card padding={28} style={{ animation: 'mmSlideUp .3s ease' }}>
          <h2 style={{ ...typography.h2, margin: '0 0 4px', color: colors.textPrimary }}>
            Connect your MT5 account
          </h2>
          <p style={{ ...typography.body, color: colors.textSecondary, margin: '0 0 22px' }}>
            Use your <strong>investor (read-only) password</strong> — never your main password.
          </p>

          <form onSubmit={connect} style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 460 }}>
            <Field label="MT5 account number">
              <Input
                required
                inputMode="numeric"
                placeholder="e.g. 5042118"
                value={form.account}
                onChange={(e) => setForm({ ...form, account: e.target.value })}
              />
            </Field>
            <Field label="MT5 investor password" hint="Read-only password — we can never trade with it.">
              <Input
                required
                type="password"
                placeholder="Investor (read-only) password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>
            <Field label="MT5 server name">
              <Input
                required
                placeholder="e.g. ICMarketsSC-Live08"
                value={form.server}
                onChange={(e) => setForm({ ...form, server: e.target.value })}
              />
            </Field>

            {error && (
              <div style={{ ...typography.small, color: colors.live, background: colors.liveSoft, padding: '10px 12px', borderRadius: radius.button }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...typography.small, color: colors.textSecondary }}>
              <LockIcon size={15} />
              Your password is sent only to your broker — never stored on Millimore servers.
            </div>

            <Button type="submit" size="lg" disabled={connecting} icon={!connecting && <PlugIcon size={18} />}>
              {connecting ? <Spinner size={16} color="#fff" /> : 'Connect'}
            </Button>
          </form>
        </Card>
      )}

      {step === 2 && account && (
        <Card padding={28} style={{ animation: 'mmSlideUp .3s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
            <span style={{ color: colors.success }}>
              <CheckCircleIcon size={30} />
            </span>
            <div>
              <h2 style={{ ...typography.h2, margin: 0, color: colors.textPrimary, display: 'flex', alignItems: 'center', gap: 8 }}>
                Connected <VerifiedBadge size={18} />
              </h2>
              <p style={{ ...typography.small, color: colors.textSecondary, margin: 0 }}>
                {account.name} · {account.broker || account.server}
              </p>
            </div>
            <Badge tone="green" style={{ marginLeft: 'auto' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: colors.success }} />
              Live
            </Badge>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            <Stat label="Account type" value={account.type || 'Hedge · USD'} />
            <Stat label="Live balance" value={`$${Number(account.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} />
            <Stat label="Open positions" value={account.openPositions ?? 0} />
            <Stat label="Broker" value={account.broker || '—'} />
            <Stat label="Leverage" value={account.leverage || '1:100'} />
            <Stat label="Login" value={account.login} />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: 14,
              borderRadius: radius.card,
              background: colors.successSoft,
              color: colors.success,
              marginBottom: 20
            }}
          >
            <LockIcon size={18} />
            <span style={{ ...typography.bodyStrong }}>
              Connection is read-only. We can never place or modify trades.
            </span>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <Button onClick={runSyncTest}>Run trade sync test</Button>
            <Button variant="secondary" onClick={disconnect}>
              Disconnect
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card padding={28} style={{ animation: 'mmSlideUp .3s ease' }}>
          <h2 style={{ ...typography.h2, margin: '0 0 4px', color: colors.textPrimary }}>
            Trade sync test
          </h2>
          <p style={{ ...typography.body, color: colors.textSecondary, margin: '0 0 20px' }}>
            We fired a test trade to verify your overlay sync is working. The card below should
            appear exactly like it will on your live stream.
          </p>

          <div
            style={{
              position: 'relative',
              borderRadius: radius.card,
              overflow: 'hidden',
              background: '#0B1220',
              aspectRatio: '16/9',
              display: 'grid',
              placeItems: 'center',
              marginBottom: 20
            }}
          >
            {testTrade ? (
              <TradeCard trade={testTrade} style="detailed" theme="dark" showCopy scale={0.95} />
            ) : (
              <div style={{ color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Spinner size={18} color="#fff" /> Waiting for test trade…
              </div>
            )}
          </div>

          {testConfirmed ? (
            <Badge tone="green"><CheckIcon size={13} /> Sync confirmed — you&apos;re all set</Badge>
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              <Button onClick={() => setTestConfirmed(true)} disabled={!testTrade} icon={<CheckIcon size={17} />}>
                It works — confirm
              </Button>
              <Button variant="secondary" onClick={() => setStep(2)}>
                Back
              </Button>
            </div>
          )}
        </Card>
      )}
    </Page>
  )
}

function Stepper({ step }) {
  const steps = ['Connect', 'Account', 'Sync test']
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      {steps.map((label, i) => {
        const n = i + 1
        const done = step > n
        const active = step === n
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  background: done ? colors.success : active ? colors.primary : colors.surfaceMuted,
                  color: done || active ? '#fff' : colors.textTertiary
                }}
              >
                {done ? <CheckIcon size={13} /> : n}
              </span>
              <span style={{ ...typography.bodyStrong, color: active ? colors.textPrimary : colors.textTertiary }}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span style={{ width: 28, height: 2, background: colors.border, borderRadius: 2 }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{ padding: 14, borderRadius: radius.card, border: `1px solid ${colors.border}`, background: colors.surfaceMuted }}>
      <div style={{ ...typography.caption, color: colors.textTertiary }}>{label}</div>
      <div style={{ ...typography.h3, color: colors.textPrimary, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  )
}
