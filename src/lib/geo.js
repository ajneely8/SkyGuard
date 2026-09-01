/**
 * Precise location resolution.
 *
 * The product promise is "weather for your exact location", so this module is
 * careful about two things:
 *
 *  1. It asks the device for the highest practical accuracy and reports the
 *     accuracy radius it actually got.
 *  2. It never calls a fix "precise" when the device only returned a coarse
 *     network position. A 3 km accuracy radius is labelled approximate, and the
 *     UI says so.
 *
 * Weather is always requested by latitude/longitude, never by city name.
 */

const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse'
const OM_ELEVATION = 'https://api.open-meteo.com/v1/elevation'

async function getJson(url, { timeout = 9000, headers } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Nominatim's usage policy caps clients at one request per second and returns
 * HTTP 429 past that. Every call to it — reverse geocoding here and the address
 * search fallback in weather.js — goes through this queue so a screen that
 * resolves several locations at once cannot get the app throttled.
 */
const NOMINATIM_MIN_GAP_MS = 1100
let nominatimChain = Promise.resolve()
let lastNominatimAt = 0

export function queueNominatim(fn) {
  const run = async () => {
    const wait = Math.max(0, lastNominatimAt + NOMINATIM_MIN_GAP_MS - Date.now())
    if (wait) await new Promise((r) => setTimeout(r, wait))
    lastNominatimAt = Date.now()
    return fn()
  }
  // Chain regardless of whether the previous call succeeded.
  const next = nominatimChain.then(run, run)
  nominatimChain = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

/* ---------- permission ---------- */

export const geolocationSupported = () =>
  typeof navigator !== 'undefined' && 'geolocation' in navigator && window.isSecureContext !== false

/**
 * Permission state without prompting:
 * 'granted' | 'denied' | 'prompt' | 'unsupported' | 'insecure' | 'unknown'
 */
export async function locationPermissionState() {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return 'unsupported'
  if (window.isSecureContext === false) return 'insecure'
  if (!navigator.permissions?.query) return 'unknown'
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' })
    return status.state
  } catch {
    return 'unknown'
  }
}

/** Subscribe to permission changes so the app can recover the moment it is allowed. */
export async function watchPermission(onChange) {
  if (!navigator.permissions?.query) return () => {}
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' })
    const handler = () => onChange(status.state)
    status.addEventListener('change', handler)
    return () => status.removeEventListener('change', handler)
  } catch {
    return () => {}
  }
}

export class LocationError extends Error {
  constructor(kind, message) {
    super(message)
    this.name = 'LocationError'
    this.kind = kind // denied | unavailable | timeout | unsupported | insecure
  }
}

/** Anything coarser than this is reported as approximate, not GPS-precise. */
export const PRECISE_ACCURACY_M = 100

export function accuracyLabel(accuracyM) {
  if (accuracyM == null) return { precise: false, text: 'Accuracy unknown' }
  if (accuracyM <= PRECISE_ACCURACY_M)
    return { precise: true, text: `Precise location · ±${Math.round(accuracyM)} m` }
  if (accuracyM <= 1000)
    return { precise: false, text: `Approximate location detected · ±${Math.round(accuracyM)} m` }
  return { precise: false, text: `Approximate location detected · ±${(accuracyM / 1000).toFixed(1)} km` }
}

/**
 * Ask the device for coordinates at the highest practical accuracy.
 * Resolves { lat, lon, accuracy, altitude, at }.
 */
export function getPosition({ highAccuracy = true, timeout = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      return reject(new LocationError('unsupported', 'This browser does not support device location.'))
    }
    if (window.isSecureContext === false) {
      return reject(
        new LocationError(
          'insecure',
          'Browsers only share location over HTTPS (or on localhost). Serve Skyguard over HTTPS to use GPS.',
        ),
      )
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          accuracy: p.coords.accuracy ?? null,
          altitude: p.coords.altitude ?? null,
          at: new Date(p.timestamp).toISOString(),
        }),
      (e) => {
        const kind = e.code === 1 ? 'denied' : e.code === 2 ? 'unavailable' : 'timeout'
        reject(new LocationError(kind, permissionMessage(kind)))
      },
      { enableHighAccuracy: highAccuracy, timeout, maximumAge: 0 },
    )
  })
}

export function permissionMessage(kind) {
  switch (kind) {
    case 'denied':
      return 'Location access is currently turned off for this site.'
    case 'unavailable':
      return 'Your device could not determine a position. Turn on location services and try again — outdoors resolves fastest.'
    case 'timeout':
      return 'The location request timed out. Try again.'
    case 'insecure':
      return 'Location requires HTTPS (or localhost).'
    default:
      return 'This browser cannot share location.'
  }
}

/* ---------- enrichment ---------- */

/** City, state, ZIP and nearest place for a coordinate. */
export async function reverseGeocode(lat, lon) {
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      format: 'jsonv2',
      zoom: '18',
      addressdetails: '1',
    })
    const d = await queueNominatim(() => getJson(`${NOMINATIM_REVERSE}?${params}`))
    const a = d?.address || {}
    return {
      place: d?.name || a.leisure || a.amenity || a.building || null,
      city: a.city || a.town || a.village || a.hamlet || a.municipality || a.suburb || null,
      state: a.state || null,
      stateCode: a['ISO3166-2-lvl4']?.split('-')[1] || null,
      zip: a.postcode || null,
      county: a.county || null,
      country: a.country_code ? a.country_code.toUpperCase() : null,
      displayName: d?.display_name || null,
    }
  } catch {
    return null
  }
}

/**
 * The IANA time zone the coordinate actually sits in.
 *
 * This matters: the device may be in a different zone from the field. Radar
 * frame times and reading times are shown in the field's local time, so a coach
 * in another time zone still reads the sideline clock correctly.
 */
export async function timezoneFor(lat, lon) {
  try {
    const d = await getJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=1&current=temperature_2m`,
    )
    return {
      timezone: d?.timezone || null,
      abbreviation: d?.timezone_abbreviation || null,
      utcOffsetSeconds: d?.utc_offset_seconds ?? null,
    }
  } catch {
    return { timezone: null, abbreviation: null, utcOffsetSeconds: null }
  }
}

/** Ground elevation in metres for a coordinate, or null. */
export async function elevationFor(lat, lon) {
  try {
    const d = await getJson(`${OM_ELEVATION}?latitude=${lat}&longitude=${lon}`)
    const m = Array.isArray(d?.elevation) ? d.elevation[0] : null
    return typeof m === 'number' ? m : null
  } catch {
    return null
  }
}

export const metresToFeet = (m) => (m == null ? null : m * 3.28084)

/** Coordinate formatted the way a field crew reads it: 29.563200° N, 98.123400° W */
export function formatCoords(lat, lon, digits = 6) {
  if (lat == null || lon == null) return '—'
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lon >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(digits)}° ${ns}\n${Math.abs(lon).toFixed(digits)}° ${ew}`
}

/**
 * Resolve a coordinate into a full location record: address parts, elevation
 * and time zone. Enrichment failures degrade gracefully — the coordinate, which
 * is what weather actually needs, is never lost.
 */
export async function describeCoordinate(lat, lon, { accuracy = null, source = 'manual' } = {}) {
  const [addr, elevM, tz] = await Promise.all([
    reverseGeocode(lat, lon),
    elevationFor(lat, lon),
    timezoneFor(lat, lon),
  ])
  return {
    lat,
    lon,
    accuracy,
    source, // 'device GPS' | 'address search' | 'manual entry' | 'map pin'
    ...accuracyLabel(accuracy),
    place: addr?.place || null,
    city: addr?.city || null,
    state: addr?.state || null,
    stateCode: addr?.stateCode || null,
    zip: addr?.zip || null,
    county: addr?.county || null,
    country: addr?.country || null,
    displayName: addr?.displayName || null,
    elevationM: elevM,
    elevationFt: metresToFeet(elevM),
    // The field's zone, not the device's — see timezoneFor().
    timezone: tz.timezone,
    timezoneAbbrev: tz.abbreviation,
    resolvedAt: new Date().toISOString(),
  }
}

/** "Cibolo, TX 78108" style one-liner. */
export function shortPlace(loc) {
  if (!loc) return ''
  const bits = [loc.city, loc.stateCode || loc.state].filter(Boolean).join(', ')
  return [bits, loc.zip].filter(Boolean).join(' ')
}

/* ---------- distance ---------- */

const R_MI = 3958.8

export function haversineMiles(a, b) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const la1 = toRad(a.lat)
  const la2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * R_MI * Math.asin(Math.sqrt(h))
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']

/** Compass bearing from a → b, e.g. "SW". */
export function bearing(a, b) {
  const toRad = (d) => (d * Math.PI) / 180
  const toDeg = (r) => (r * 180) / Math.PI
  const la1 = toRad(a.lat)
  const la2 = toRad(b.lat)
  const dLon = toRad(b.lon - a.lon)
  const y = Math.sin(dLon) * Math.cos(la2)
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon)
  const deg = (toDeg(Math.atan2(y, x)) + 360) % 360
  return { degrees: deg, compass: COMPASS[Math.round(deg / 22.5) % 16] }
}
