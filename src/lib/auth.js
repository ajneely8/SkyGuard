/**
 * Accounts and sessions.
 *
 * HONEST LIMITS — read before shipping this to a district:
 *
 * There is no server in this build, so this is device-local authentication.
 * Accounts live in this browser's localStorage. Passwords are never stored in
 * the clear — each one is stretched with PBKDF2-SHA256 (210k iterations, per
 * account salt) and only the derived hash is kept — but anything running in this
 * browser can read that store, and nothing verifies the account against a
 * server. It keeps casual users out of each other's data on a shared sideline
 * tablet. It is NOT a security boundary.
 *
 * To make it real: move `createAccount` / `verify` behind an API, keep the same
 * function signatures, and issue a server session token instead of the local
 * session record. Nothing else in the app touches password material.
 */

const ACCOUNTS_KEY = 'skyguard.accounts'
const SESSION_KEY = 'skyguard.session'

const PBKDF2_ITERATIONS = 210_000
const KEY_BITS = 256

export const ROLES = [
  { id: 'athletic_director', label: 'Athletic Director' },
  { id: 'coach', label: 'Coach' },
  { id: 'athletic_trainer', label: 'Athletic Trainer' },
  { id: 'band_director', label: 'Band Director' },
  { id: 'administrator', label: 'District Administrator' },
  { id: 'other', label: 'Other staff' },
]

/* ---------- storage ---------- */

function readAccounts() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeAccounts(list) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list))
}

export const accountCount = () => readAccounts().length

export const normalizeEmail = (e) => String(e || '').trim().toLowerCase()

/**
 * Is this email already registered on this device?
 *
 * Checked BEFORE a verification code is sent. Without it, signing up with an
 * existing address burns a code, makes the user verify it, and only then fails —
 * leaving them with a spent code and a 60-second resend wait.
 */
export const accountExists = (email) => {
  const e = normalizeEmail(email)
  return readAccounts().some((a) => a.email === e)
}

/* ---------- crypto ---------- */

const toHex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

function randomHex(bytes = 16) {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return toHex(a)
}

async function derive(password, saltHex) {
  if (!crypto?.subtle) {
    throw new Error('This browser cannot hash passwords securely (needs HTTPS or localhost).')
  }
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(saltHex),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_BITS,
  )
  return toHex(bits)
}

/** Constant-time-ish comparison so a wrong password does not leak by timing. */
function sameHash(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/* ---------- validation ---------- */

export function passwordProblem(pw) {
  if (!pw || pw.length < 8) return 'Use at least 8 characters.'
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'Include at least one letter and one number.'
  return null
}

export function emailProblem(email) {
  const e = normalizeEmail(email)
  if (!e) return 'Enter your email.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return 'That does not look like an email address.'
  return null
}

/* ---------- email verification ---------- */

/**
 * Ask the mail server to send a 6-digit code.
 *
 * The code is generated and checked on the server — it is never returned here,
 * because a code the browser can read verifies nothing. `delivered:false` means
 * no mail provider is configured and the server printed the code to its own
 * terminal, which only happens in local development.
 */
export async function requestCode(email) {
  const res = await postJson('/api/auth/request-code', { email: normalizeEmail(email) })
  return res // { ok, delivered, expiresInSec }
}

/** Exchange a code for a short-lived proof token. Throws with the reason. */
export async function verifyCode(email, code) {
  const res = await postJson('/api/auth/verify-code', { email: normalizeEmail(email), code })
  return res.token
}

const SERVER_DOWN =
  'The Skyguard mail server is not running, so no code can be sent. Start it with "npm run dev" in the skyguard folder, then try again.'

async function postJson(url, body) {
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error(SERVER_DOWN)
  }

  // A 404 here means the request was answered by the web server rather than
  // forwarded to the mail server — the mail server is down, or /api is not
  // being proxied. Either way it is the same problem for the user, and the
  // raw status code tells them nothing.
  if (res.status === 404 || res.status === 502 || res.status === 504) {
    throw new Error(SERVER_DOWN)
  }

  let data = {}
  try {
    data = await res.json()
  } catch {
    /* HTML error page rather than JSON */
  }
  if (!res.ok) throw new Error(data.error || `The mail server returned an error (${res.status}).`)
  return data
}

/* ---------- public API ---------- */

/**
 * Create an account and return its public record.
 * `verifiedToken` comes from verifyCode() — accounts cannot be made without it.
 */
export async function createAccount({
  name,
  email,
  password,
  role = 'coach',
  school = '',
  verifiedToken,
}) {
  const e = normalizeEmail(email)
  if (!verifiedToken) throw new Error('Verify your email address first.')
  const accounts = readAccounts()
  if (accounts.some((a) => a.email === e)) {
    throw new Error('An account already exists for that email. Sign in instead.')
  }
  // Confirm with the server that this email really was proven, so the token
  // cannot simply be invented in the client.
  const check = await postJson('/api/auth/check-verified', { email: e, token: verifiedToken })
  if (!check.ok) throw new Error('That verification has expired. Request a new code.')
  const salt = randomHex(16)
  const hash = await derive(password, salt)
  const account = {
    id: `acct_${randomHex(8)}`,
    name: String(name || '').trim() || e.split('@')[0],
    email: e,
    role,
    school: String(school || '').trim(),
    salt,
    hash,
    emailVerified: true,
    createdAt: new Date().toISOString(),
  }
  writeAccounts([...accounts, account])
  return toPublic(account)
}

/** Verify credentials and return the public record, or throw. */
export async function verify({ email, password }) {
  const e = normalizeEmail(email)
  const account = readAccounts().find((a) => a.email === e)
  // Derive regardless of whether the account exists, so a missing account and a
  // wrong password take the same time and give the same message.
  const candidate = await derive(password, account?.salt || 'no-such-account')
  if (!account || !sameHash(candidate, account.hash)) {
    throw new Error('Email or password is incorrect.')
  }
  return toPublic(account)
}

export async function changePassword({ email, currentPassword, newPassword }) {
  const account = await verify({ email, password: currentPassword })
  const accounts = readAccounts()
  const idx = accounts.findIndex((a) => a.id === account.id)
  if (idx < 0) throw new Error('Account not found.')
  const salt = randomHex(16)
  accounts[idx] = { ...accounts[idx], salt, hash: await derive(newPassword, salt) }
  writeAccounts(accounts)
  return toPublic(accounts[idx])
}

const toPublic = ({ id, name, email, role, school, createdAt, emailVerified }) => ({
  id,
  name,
  email,
  role,
  school,
  createdAt,
  emailVerified: !!emailVerified,
})

/* ---------- session ---------- */

export function saveSession(account) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ account, at: new Date().toISOString() }))
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    if (!s?.account?.id) return null
    // Confirm the account still exists on this device.
    const live = readAccounts().find((a) => a.id === s.account.id)
    return live ? toPublic(live) : null
  } catch {
    return null
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}

export const roleLabel = (id) => ROLES.find((r) => r.id === id)?.label || 'Staff'
