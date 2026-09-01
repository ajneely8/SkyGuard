/** Small formatting helpers shared across screens. */

export const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
export const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
export const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export const fmtTime = (d) => (d ? timeFmt.format(new Date(d)) : '—')

/**
 * Time rendered in a specific IANA zone — the field's, not the device's.
 * Falls back to device-local if the zone is missing or unrecognised.
 */
export function fmtTimeIn(d, timeZone) {
  if (!d) return '—'
  if (!timeZone) return fmtTime(d)
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone }).format(
      new Date(d),
    )
  } catch {
    return fmtTime(d)
  }
}

export function fmtDateTimeIn(d, timeZone) {
  if (!d) return '—'
  if (!timeZone) return dateTimeFmt.format(new Date(d))
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
    }).format(new Date(d))
  } catch {
    return dateTimeFmt.format(new Date(d))
  }
}

/** Short zone label for the clock, e.g. "CDT". */
export function zoneLabel(timeZone, at = new Date()) {
  if (!timeZone) return ''
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(at)
    return parts.find((p) => p.type === 'timeZoneName')?.value || ''
  } catch {
    return ''
  }
}

/** True when the field sits in a different zone from this device. */
export function differsFromDevice(timeZone) {
  if (!timeZone) return false
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone !== timeZone
  } catch {
    return false
  }
}
export const fmtDate = (d) => (d ? dateFmt.format(new Date(d)) : '—')
export const fmtDateTime = (d) => (d ? dateTimeFmt.format(new Date(d)) : '—')

export const fmtF = (v, digits = 1) => (v == null || Number.isNaN(v) ? '—' : `${v.toFixed(digits)}°F`)
export const fmtNum = (v, digits = 0, suffix = '') =>
  v == null || Number.isNaN(v) ? '—' : `${v.toFixed(digits)}${suffix}`

/** "4 minutes ago" style age string. */
export function ageString(iso, now = Date.now()) {
  if (!iso) return '—'
  const ms = now - new Date(iso).getTime()
  if (ms < 0) return 'just now'
  const min = Math.floor(ms / 60000)
  if (min < 1) return `${Math.floor(ms / 1000)} seconds`
  if (min === 1) return '1 minute'
  if (min < 60) return `${min} minutes`
  const hr = Math.floor(min / 60)
  if (hr === 1) return `1 hour ${min % 60} min`
  if (hr < 24) return `${hr} hours`
  const d = Math.floor(hr / 24)
  return d === 1 ? '1 day' : `${d} days`
}

/** Countdown "in 12 min" / "due now". */
export function untilString(iso, now = Date.now()) {
  if (!iso) return '—'
  const ms = new Date(iso).getTime() - now
  if (ms <= 0) return 'due now'
  const min = Math.round(ms / 60000)
  if (min < 1) return `in under a minute`
  if (min === 1) return 'in 1 minute'
  if (min < 60) return `in ${min} minutes`
  const hr = Math.floor(min / 60)
  return `in ${hr}h ${min % 60}m`
}

export const uid = (prefix = 'id') =>
  `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`

/* ---------- entering times in the field's zone ---------- */

/** Offset (ms) between UTC and `timeZone` at a given instant. */
function tzOffsetMs(utcMs, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const p = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]))
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second)
  return asUtc - utcMs
}

/**
 * Turn a date and wall-clock time the user typed into an instant, reading those
 * numbers in the FIELD's zone rather than the device's.
 *
 * A coach typing "4:00 PM" means 4pm at the field. If the device sits in another
 * zone, interpreting it locally schedules the practice at the wrong moment.
 */
export function zonedIso(dateStr, timeStr, timeZone) {
  if (!dateStr || !timeStr) return null
  if (!timeZone) return localIso(dateStr, timeStr)
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  // Two passes so a DST boundary between the guess and the answer settles.
  let utc = guess - tzOffsetMs(guess, timeZone)
  utc = guess - tzOffsetMs(utc, timeZone)
  return new Date(utc).toISOString()
}

/** "HH:mm" for an instant, read in `timeZone`. */
export function clockStrIn(d, timeZone) {
  if (!timeZone) return clockStr(d)
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
  return p
}

/** "yyyy-mm-dd" for an instant, read in `timeZone`. */
export function todayStrIn(d, timeZone) {
  if (!timeZone) return todayStr(d)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** Combine a yyyy-mm-dd and HH:mm into an ISO string in local time. */
export function localIso(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString()
}

export const todayStr = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const clockStr = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}
