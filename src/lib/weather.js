/**
 * Weather data access.
 *
 * Provider: Open-Meteo (https://open-meteo.com) — no API key required, and it
 * publishes shortwave solar radiation and wind, which is what separates a
 * defensible WBGT estimate from a heat-index guess.
 *
 * Active weather alerts come from the U.S. National Weather Service
 * (https://api.weather.gov/alerts/active) for locations inside the U.S.
 *
 * Nothing here ever fabricates a value. If a fetch fails, the caller gets an
 * error and the UI shows "WEATHER DATA UNAVAILABLE" rather than a stale number.
 *
 * Device location, reverse geocoding and elevation live in geo.js.
 * Forecasts live in forecast.js. Radar tiles live in radar.js.
 */

import { estimateWbgtC, cToF, fToC, mphToMs, heatIndexF, METHOD } from './wbgt.js'
import { queueNominatim } from './geo.js'

const OM_FORECAST = 'https://api.open-meteo.com/v1/forecast'
const OM_GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search'
const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const NWS_ALERTS = 'https://api.weather.gov/alerts/active'

export const PROVIDER_NAME = 'Open-Meteo (NOAA/GFS + HRRR blend)'

async function getJson(url, { timeout = 12000, headers } = {}) {
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

/** Series timestamps come back as unix seconds (timeformat=unixtime) so there
 *  is no ambiguity between the location's local time and the browser's. */
const toMs = (t) => (typeof t === 'number' ? t * 1000 : new Date(t).getTime())

/**
 * Index of the most recent series slot at or before now. Never returns a future
 * slot while a past one exists — a forecast value must not be labelled as an
 * observation on a safety screen.
 */
function nearestIndex(times) {
  if (!Array.isArray(times) || !times.length) return -1
  const now = Date.now()
  let best = -1
  let bestDelta = Infinity
  for (let i = 0; i < times.length; i++) {
    const delta = now - toMs(times[i])
    if (delta >= 0 && delta < bestDelta) {
      bestDelta = delta
      best = i
    }
  }
  // Entirely-future series (shouldn't happen with past_minutes set): take the first.
  return best === -1 ? 0 : best
}

/**
 * Fetch current conditions and derive WBGT for a coordinate.
 * @param {{lat:number, lon:number}} loc
 * @returns {Promise<object>} observation record
 */
export async function fetchConditions({ lat, lon }) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current:
      'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,wind_direction_10m,surface_pressure',
    // The 15-minute series is what actually drives WBGT: the provider's
    // `current` block can lag the clock by an hour or more, and a heat-safety
    // reading has to reflect conditions on the field right now.
    minutely_15:
      'temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,wind_gusts_10m,precipitation,shortwave_radiation,direct_radiation,is_day',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    timeformat: 'unixtime',
    // GMT, not 'auto': with a timezone set, Open-Meteo shifts unixtime values by
    // the location's UTC offset, which would make every timestamp wrong here.
    // Times are formatted for display in the viewer's own locale instead.
    timezone: 'GMT',
    forecast_days: '1',
    past_minutes: '60',
  })

  const data = await getJson(`${OM_FORECAST}?${params.toString()}`)
  const c = data.current || {}
  const m = data.minutely_15 || {}
  const i = nearestIndex(m.time)
  const at = (key) => (i >= 0 && Array.isArray(m[key]) ? m[key][i] : null)

  // Prefer the 15-minute slot nearest to now; fall back to `current`.
  const pick = (key) => at(key) ?? c[key] ?? null

  const tempF = pick('temperature_2m')
  const rh = pick('relative_humidity_2m')
  if (tempF == null || rh == null) {
    throw new Error('Weather provider returned no usable current observation')
  }

  const solar = at('shortwave_radiation')
  const windMph = pick('wind_speed_10m') ?? 0
  const observedMs = i >= 0 ? toMs(m.time[i]) : c.time ? toMs(c.time) : Date.now()

  const est = estimateWbgtC({
    tempC: fToC(tempF),
    rh,
    windMs: mphToMs(windMph),
    // Solar radiation is required for a real WBGT. If the provider omits it we
    // fall back to a cloud-cover derived estimate and flag lower confidence.
    solar: solar ?? fallbackSolar(c.cloud_cover, pick('is_day')),
  })

  return {
    ts: new Date().toISOString(),
    observedAt: new Date(observedMs).toISOString(),
    provider: PROVIDER_NAME,
    method: METHOD.ESTIMATED,
    solarConfidence: solar == null ? 'modeled-from-cloud-cover' : 'measured-shortwave',
    tempF,
    rh,
    windMph,
    windGustMph: pick('wind_gusts_10m'),
    windDirDeg: c.wind_direction_10m ?? null,
    cloudCover: c.cloud_cover ?? null,
    precipIn: pick('precipitation'),
    pressureHpa: c.surface_pressure ?? null,
    isDay: pick('is_day') === 1,
    solarWm2: solar ?? fallbackSolar(c.cloud_cover, pick('is_day')),
    apparentF: pick('apparent_temperature'),
    heatIndexF: heatIndexF(tempF, rh),
    wbgtF: cToF(est.wbgtC),
    naturalWetBulbF: cToF(est.tnwbC),
    globeTempF: cToF(est.tgC),
    wetBulbF: cToF(est.twC),
    timezone: data.timezone || null,
  }
}

/** Crude clear-sky-scaled solar estimate used only when the provider omits radiation. */
function fallbackSolar(cloudCover, isDay) {
  if (!isDay) return 0
  const cc = cloudCover == null ? 40 : cloudCover
  const clearSky = 850 // W/m^2, mid-day mid-latitude approximation
  return Math.max(0, clearSky * (1 - 0.75 * (cc / 100)))
}

/**
 * Active NWS alerts for a point. Returns [] when unavailable rather than
 * throwing — alerts are supplementary and must not block the WBGT reading.
 */
export async function fetchAlerts({ lat, lon }) {
  try {
    const url = `${NWS_ALERTS}?point=${lat.toFixed(4)},${lon.toFixed(4)}`
    const data = await getJson(url, { headers: { Accept: 'application/geo+json' }, timeout: 8000 })
    return (data.features || []).map((f) => ({
      id: f.id,
      event: f.properties?.event,
      severity: f.properties?.severity,
      headline: f.properties?.headline,
      ends: f.properties?.ends || f.properties?.expires,
    }))
  } catch {
    return []
  }
}

/**
 * Location search by school name, address, city, or ZIP.
 * Tries Open-Meteo geocoding first, then OpenStreetMap Nominatim for street
 * addresses and named places (schools, stadiums) it does not index.
 */
/** The viewer's own country, used only to rank results — never to filter them. */
function localRegion() {
  try {
    const loc = new Intl.Locale(navigator.language)
    return (loc.region || navigator.language.split('-')[1] || '').toUpperCase() || null
  } catch {
    return null
  }
}

export async function searchPlaces(query) {
  const q = query.trim()
  if (!q) return []
  const results = []

  try {
    const params = new URLSearchParams({ name: q, count: '10', language: 'en', format: 'json' })
    const data = await getJson(`${OM_GEOCODE}?${params}`, { timeout: 8000 })
    for (const r of data.results || []) {
      results.push({
        label: [r.name, r.admin1, r.country_code].filter(Boolean).join(', '),
        lat: r.latitude,
        lon: r.longitude,
        country: r.country_code || null,
        source: 'Open-Meteo Geocoding',
      })
    }
  } catch {
    /* fall through to Nominatim */
  }

  if (results.length < 3) {
    try {
      const params = new URLSearchParams({ q, format: 'json', limit: '5', addressdetails: '0' })
      // Rate-limited: Nominatim allows one request per second per client.
      const data = await queueNominatim(() => getJson(`${NOMINATIM}?${params}`, { timeout: 8000 }))
      for (const r of data) {
        results.push({
          label: r.display_name,
          lat: Number(r.lat),
          lon: Number(r.lon),
          country: null,
          source: 'OpenStreetMap Nominatim',
        })
      }
    } catch {
      /* ignore */
    }
  }

  // De-duplicate coordinates that land within ~100 m of each other.
  const seen = []
  const unique = results.filter((r) => {
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lon)) return false
    const dup = seen.some((s) => Math.abs(s.lat - r.lat) < 0.001 && Math.abs(s.lon - r.lon) < 0.001)
    if (dup) return false
    seen.push(r)
    return true
  })

  // Postal codes collide across countries — "78660" is both a Texas ZIP and a
  // French code. Put the viewer's own country first rather than dropping the
  // others, so an international district still sees its own results.
  const region = localRegion()
  if (region) {
    unique.sort((a, b) => (b.country === region ? 1 : 0) - (a.country === region ? 1 : 0))
  }
  return unique.slice(0, 6)
}

