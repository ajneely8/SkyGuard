/**
 * Skyguard mail server — email verification codes.
 *
 * WHY THIS EXISTS: a verification code is only meaningful if the person signing
 * up cannot read it. A browser-only app would have to generate the code in the
 * client, where anyone can open devtools and read it — that is theatre, not
 * verification. So the code is generated here, never sent to the client, and
 * only compared here.
 *
 * Delivery uses Resend. Set RESEND_API_KEY and MAIL_FROM in .env. Without a key
 * the server still issues codes but prints them to THIS terminal instead of
 * emailing them, so local development works; it never returns the code to the
 * browser.
 *
 * Codes live in memory, so restarting the server invalidates pending codes.
 * For production, move `codes` to Redis or a table with the same TTL semantics.
 */

import express from 'express'
import crypto from 'node:crypto'

const app = express()
app.use(express.json({ limit: '16kb' }))

const PORT = process.env.VERIFY_PORT || 8787
const CODE_TTL_MS = 10 * 60 * 1000 // 10 minutes
const MAX_ATTEMPTS = 5
const RESEND_COOLDOWN_MS = 60 * 1000
const MAX_SENDS_PER_HOUR = 5

/** email -> { hash, salt, expiresAt, attempts, sentAt, sends: number[] } */
const codes = new Map()

const normalize = (e) => String(e || '').trim().toLowerCase()
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)

function hashCode(code, salt) {
  return crypto.createHmac('sha256', salt).update(code).digest('hex')
}

/** Timing-safe compare of two hex digests. */
function sameHash(a, b) {
  const ab = Buffer.from(a, 'hex')
  const bb = Buffer.from(b, 'hex')
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb)
}

// Sweep expired entries so the map cannot grow without bound.
setInterval(() => {
  const now = Date.now()
  for (const [email, rec] of codes) {
    if (rec.expiresAt < now && (rec.sends?.at(-1) ?? 0) < now - 60 * 60 * 1000) codes.delete(email)
  }
}, 60_000).unref()

/* ------------------------------------------------------------------ */
/* delivery                                                            */
/* ------------------------------------------------------------------ */

const MAIL_FROM = process.env.MAIL_FROM || 'Skyguard <onboarding@resend.dev>'

/**
 * Fixed code that works while no mail provider is configured, so sign-up is not
 * blocked before email is wired up.
 *
 * It is accepted ONLY when RESEND_API_KEY is absent. The moment a real key is
 * set, this stops working — there is no way to leave it on in production by
 * accident. Override with DEV_CODE in .env.
 */
const DEV_CODE = process.env.DEV_CODE || '123456'
const mailConfigured = () => !!process.env.RESEND_API_KEY

async function sendCodeEmail(to, code) {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    // No provider configured. Print locally so development still works — and
    // never return the code to the browser.
    console.log(`\n[skyguard] verification code for ${to}: ${code}  (expires in 10 min)`)
    console.log('[skyguard] set RESEND_API_KEY in skyguard/.env to email these instead.\n')
    return { delivered: false, reason: 'no-provider' }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: [to],
      subject: `${code} is your Skyguard verification code`,
      text: `Your Skyguard verification code is ${code}.\n\nIt expires in 10 minutes. If you did not request it, ignore this email.`,
      html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#070b16;color:#e2ecfb;padding:32px">
        <p style="letter-spacing:.24em;font-size:11px;color:#35e0ff;margin:0 0 6px;font-weight:800">SKYGUARD</p>
        <h1 style="font-size:20px;margin:0 0 16px;color:#fff">Verify your email</h1>
        <p style="color:#a9bcda;margin:0 0 20px">Enter this code to finish creating your account.</p>
        <p style="font-size:34px;font-weight:800;letter-spacing:.32em;color:#fff;margin:0 0 20px">${code}</p>
        <p style="color:#7186a8;font-size:13px;margin:0">It expires in 10 minutes. If you did not request it, ignore this email.</p>
      </div>`,
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Email provider rejected the send (${res.status}). ${detail.slice(0, 200)}`)
  }
  return { delivered: true }
}

/* ------------------------------------------------------------------ */
/* routes                                                              */
/* ------------------------------------------------------------------ */

app.post('/api/auth/request-code', async (req, res) => {
  const email = normalize(req.body?.email)
  if (!isEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' })

  const now = Date.now()
  const rec = codes.get(email)

  if (rec && now - rec.sentAt < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - rec.sentAt)) / 1000)
    return res.status(429).json({ error: `Wait ${wait} seconds before requesting another code.`, retryAfter: wait })
  }

  const sends = (rec?.sends || []).filter((t) => now - t < 60 * 60 * 1000)
  if (sends.length >= MAX_SENDS_PER_HOUR) {
    return res.status(429).json({ error: 'Too many codes requested for this email. Try again in an hour.' })
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  const salt = crypto.randomBytes(16).toString('hex')

  try {
    const result = await sendCodeEmail(email, code)
    codes.set(email, {
      hash: hashCode(code, salt),
      salt,
      expiresAt: now + CODE_TTL_MS,
      attempts: 0,
      sentAt: now,
      sends: [...sends, now],
    })
    // `delivered:false` tells the client to say "check the server terminal",
    // which is only ever true in local development. The dev code is returned
    // only in that case — never once email is actually configured.
    res.json({
      ok: true,
      delivered: result.delivered,
      expiresInSec: CODE_TTL_MS / 1000,
      ...(mailConfigured() ? {} : { devCode: DEV_CODE }),
    })
  } catch (e) {
    console.error('[skyguard] send failed:', e.message)
    res.status(502).json({ error: 'Could not send the email. Check the mail provider configuration.' })
  }
})

app.post('/api/auth/verify-code', (req, res) => {
  const email = normalize(req.body?.email)
  const code = String(req.body?.code || '').trim()
  const rec = codes.get(email)

  // Development escape hatch — impossible once a mail provider is configured.
  if (!mailConfigured() && code === DEV_CODE) {
    codes.delete(email)
    const token = crypto.createHmac('sha256', SERVER_SECRET).update(`${email}:${Date.now()}`).digest('hex')
    verified.set(email, { token, at: Date.now() })
    console.log(`[skyguard] dev code accepted for ${email} (no mail provider configured)`)
    return res.json({ ok: true, token })
  }

  if (!rec) return res.status(400).json({ error: 'Request a code first.' })
  if (Date.now() > rec.expiresAt) {
    codes.delete(email)
    return res.status(400).json({ error: 'That code expired. Request a new one.' })
  }
  if (rec.attempts >= MAX_ATTEMPTS) {
    codes.delete(email)
    return res.status(429).json({ error: 'Too many incorrect attempts. Request a new code.' })
  }
  if (!/^\d{6}$/.test(code)) {
    rec.attempts++
    return res.status(400).json({ error: 'Enter the 6-digit code.' })
  }

  if (!sameHash(hashCode(code, rec.salt), rec.hash)) {
    rec.attempts++
    const left = MAX_ATTEMPTS - rec.attempts
    return res.status(400).json({
      error: left > 0 ? `That code is not right. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many incorrect attempts. Request a new code.',
    })
  }

  codes.delete(email)
  // Short-lived proof the client presents when it creates the account.
  const token = crypto.createHmac('sha256', SERVER_SECRET).update(`${email}:${Date.now()}`).digest('hex')
  verified.set(email, { token, at: Date.now() })
  res.json({ ok: true, token })
})

/** Emails proven in the last 30 minutes, so account creation can check. */
const verified = new Map()
const SERVER_SECRET = process.env.SERVER_SECRET || crypto.randomBytes(32).toString('hex')

app.post('/api/auth/check-verified', (req, res) => {
  const email = normalize(req.body?.email)
  const token = String(req.body?.token || '')
  const rec = verified.get(email)
  const ok = !!rec && rec.token === token && Date.now() - rec.at < 30 * 60 * 1000
  res.json({ ok })
})

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, mail: process.env.RESEND_API_KEY ? 'configured' : 'not-configured' }),
)

app.listen(PORT, () => {
  console.log(`[skyguard] mail server on http://localhost:${PORT}`)
  if (!process.env.RESEND_API_KEY) {
    console.log('[skyguard] RESEND_API_KEY not set — verification codes will print here instead of being emailed.')
    console.log(`[skyguard] development code ${DEV_CODE} also works. It stops working as soon as a mail key is set.`)
  }
})
