/**
 * Sign in / create account.
 *
 * Email verification is currently OFF (EMAIL_VERIFICATION_ENABLED in auth.js),
 * so sign-up creates the account in one step and never contacts the mail
 * server. With it on, a second step asks for a 6-digit code that is generated
 * and checked server-side and never sent to this screen.
 */

import { useEffect, useState } from 'react'
import { useNavigate, Link, Navigate } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { Field, Notice } from '../components/ui.jsx'
import { LogoLockup } from '../components/Logo.jsx'
import {
  createAccount,
  verify,
  saveSession,
  accountCount,
  accountExists,
  normalizeEmail,
  EMAIL_VERIFICATION_ENABLED,
  emailProblem,
  passwordProblem,
  requestCode,
  verifyCode,
  ROLES,
} from '../lib/auth.js'

const RESEND_SECONDS = 60

export default function SignIn() {
  const { setAccount, state } = useStore()
  const navigate = useNavigate()

  const [mode, setMode] = useState(accountCount() === 0 ? 'up' : 'in')
  const [step, setStep] = useState('details') // details | code
  const [name, setName] = useState('')
  const [school, setSchool] = useState('')
  const [role, setRole] = useState('coach')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [code, setCode] = useState('')
  const [delivered, setDelivered] = useState(true)
  const [devCode, setDevCode] = useState(null)
  const [cooldown, setCooldown] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const isUp = mode === 'up'

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  const finish = (account) => {
    saveSession(account)
    setAccount(account)
    // Same invariant the route guard uses: the app needs a location, not just
    // the setup flag, or /app would bounce straight back to /welcome.
    const ready = state.setupComplete && state.locations.length > 0
    navigate(ready ? '/app' : '/welcome', { replace: true })
  }

  /** Drop everything tied to a pending code. */
  const resetCodeStep = () => {
    setCode('')
    setDevCode(null)
    setDelivered(true)
    setCooldown(0)
    setError(null)
  }

  /* ---- step 1: details ---- */
  const submitDetails = async (e) => {
    e.preventDefault()
    setError(null)

    const eProblem = emailProblem(email)
    if (eProblem) return setError(eProblem)

    if (!isUp) {
      if (!password) return setError('Enter your password.')
      setBusy(true)
      try {
        finish(await verify({ email, password }))
      } catch (err) {
        setError(err.message || 'Could not sign you in.')
      } finally {
        setBusy(false)
      }
      return
    }

    if (!name.trim()) return setError('Enter your name.')
    const pProblem = passwordProblem(password)
    if (pProblem) return setError(pProblem)
    if (password !== confirm) return setError('The two passwords do not match.')
    // Catch a duplicate before spending a code on it.
    if (accountExists(email)) {
      return setError('An account already exists for that email. Sign in instead.')
    }

    setBusy(true)
    try {
      if (!EMAIL_VERIFICATION_ENABLED) {
        // No mail server involved — create the account and go.
        finish(await createAccount({ name, email, password, role, school }))
        return
      }
      const res = await requestCode(email)
      setDelivered(res.delivered !== false)
      setDevCode(res.devCode || null)
      setCooldown(RESEND_SECONDS)
      setStep('code')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  /* ---- step 2: the code ---- */
  const submitCode = async (e) => {
    e.preventDefault()
    setError(null)
    if (!/^\d{6}$/.test(code.trim())) return setError('Enter the 6-digit code from your email.')

    setBusy(true)
    let token
    try {
      token = await verifyCode(email, code.trim())
    } catch (err) {
      // Code was wrong or expired — it may still be usable, so leave it be.
      setBusy(false)
      return setError(err.message)
    }

    try {
      const account = await createAccount({ name, email, password, role, school, verifiedToken: token })
      finish(account)
    } catch (err) {
      // Verification succeeded, so the code is spent. Clear the cooldown so the
      // user can request another immediately instead of waiting out a timer for
      // a code that can no longer work.
      setCode('')
      setCooldown(0)
      setError(`${err.message} Request a new code to try again.`)
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    setError(null)
    setBusy(true)
    try {
      const res = await requestCode(email)
      setDelivered(res.delivered !== false)
      setDevCode(res.devCode || null)
      setCooldown(RESEND_SECONDS)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Already signed in — nothing to do here. Guard sits below every hook.
  if (state.account) {
    return <Navigate to={state.setupComplete && state.locations.length > 0 ? '/app' : '/welcome'} replace />
  }

  /* ---- code step (only when verification is switched on) ---- */
  if (EMAIL_VERIFICATION_ENABLED && isUp && step === 'code') {
    return (
      <div className="auth-page">
        <div className="auth-inner">
          <Link to="/" className="brand">
            <LogoLockup size={38} />
          </Link>

          <h1 className="auth-title">Check your email</h1>
          <p className="auth-sub">
            We sent a 6-digit code to <strong>{normalizeEmail(email)}</strong>. It expires in 10 minutes.
          </p>

          <form onSubmit={submitCode} className="auth-card">
            {!delivered && (
              <div style={{ marginBottom: 16 }}>
                <Notice kind="warn" title="Email delivery is not set up yet">
                  {devCode ? (
                    <>
                      Use <strong className="mono" style={{ fontSize: 15 }}>{devCode}</strong> for now. Your real code
                      was also printed in the terminal running <code>npm run dev</code>.
                      <br />
                      This development code stops working the moment you add <code>RESEND_API_KEY</code> to{' '}
                      <code>skyguard/.env</code>.
                    </>
                  ) : (
                    <>
                      No mail provider key is set, so the server printed your code to its own terminal instead of
                      emailing it. Look for a line starting <code>[skyguard] verification code</code>.
                    </>
                  )}
                </Notice>
              </div>
            )}

            <Field label="Verification code" id="suCode">
              <input
                id="suCode"
                className="code-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                autoFocus
              />
            </Field>

            {error && (
              <div style={{ marginBottom: 14 }}>
                <Notice kind="warn" title="Check that again">{error}</Notice>
              </div>
            )}

            <button className="btn btn-lg btn-primary btn-block" type="submit" disabled={busy}>
              {busy ? 'Verifying…' : 'Verify and create account'}
            </button>

            <div className="row" style={{ marginTop: 10 }}>
              <button
                type="button"
                className="btn btn-subtle"
                style={{ flex: 1 }}
                onClick={resend}
                disabled={busy || cooldown > 0}
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </button>
              <button
                type="button"
                className="btn btn-subtle"
                onClick={() => {
                  setStep('details')
                  resetCodeStep()
                }}
              >
                Change email
              </button>
            </div>
          </form>

          <p className="auth-fine">
            {devCode
              ? 'Once email is configured, the code is created and checked on the Skyguard mail server and never sent to this browser — and this development code stops being accepted.'
              : 'The code is created and checked on the Skyguard mail server — it is never sent to this browser, so it cannot be read out of the page.'}
          </p>
        </div>
      </div>
    )
  }

  /* ---- details step ---- */
  return (
    <div className="auth-page">
      <div className="auth-inner">
        <Link to="/" className="brand">
          <LogoLockup size={38} />
        </Link>

        <h1 className="auth-title">{isUp ? 'Create your account' : 'Sign in'}</h1>
        <p className="auth-sub">
          {isUp
            ? 'One account keeps your fields, your rules and your readings together on this device.'
            : 'Welcome back. Sign in to get to your fields.'}
        </p>

        <form onSubmit={submitDetails} className="auth-card">
          {isUp && (
            <>
              <Field label="Your name" id="suName">
                <input
                  id="suName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Coach Alvarez"
                  autoComplete="name"
                  autoFocus
                />
              </Field>
              <div className="grid grid-2">
                <Field label="Role" id="suRole">
                  <select id="suRole" value={role} onChange={(e) => setRole(e.target.value)}>
                    {ROLES.map((r) => (
                      <option key={r.id} value={r.id}>{r.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="School or district" id="suSchool" hint="Optional">
                  <input
                    id="suSchool"
                    value={school}
                    onChange={(e) => setSchool(e.target.value)}
                    placeholder="e.g. Central High School"
                  />
                </Field>
              </div>
            </>
          )}

          <Field
            label="Email"
            id="suEmail"
            hint={isUp && EMAIL_VERIFICATION_ENABLED ? 'We send a verification code here before the account is created.' : undefined}
          >
            <input
              id="suEmail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@district.org"
              autoFocus={!isUp}
            />
          </Field>

          <Field
            label="Password"
            id="suPassword"
            hint={isUp ? 'At least 8 characters, with a letter and a number.' : undefined}
          >
            <input
              id="suPassword"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isUp ? 'new-password' : 'current-password'}
            />
          </Field>

          {isUp && (
            <Field label="Confirm password" id="suConfirm">
              <input
                id="suConfirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
          )}

          {error && (
            <div style={{ marginBottom: 14 }}>
              <Notice kind="warn" title={isUp ? 'Check that again' : 'Could not sign in'}>{error}</Notice>
            </div>
          )}

          <button className="btn btn-lg btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? 'Working…' : isUp ? (EMAIL_VERIFICATION_ENABLED ? 'Send verification code' : 'Create account') : 'Sign in'}
          </button>

          <button
            type="button"
            className="btn btn-subtle btn-block"
            style={{ marginTop: 10 }}
            onClick={() => {
              setMode(isUp ? 'in' : 'up')
              setStep('details')
              setPassword('')
              setConfirm('')
              resetCodeStep()
            }}
          >
            {isUp ? 'I already have an account' : 'Create a new account'}
          </button>
        </form>

        <p className="auth-fine">
          Accounts on this build are stored in this browser only — there is no account server, so signing in here
          does not sync to another device. Passwords are stretched with PBKDF2 and never stored in the clear.
        </p>
      </div>
    </div>
  )
}
