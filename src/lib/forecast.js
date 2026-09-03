/**
 * Hourly and 7-day forecast, with WBGT computed for every hour.
 *
 * The hourly WBGT is the point of this module: a coach planning a 4pm practice
 * needs to know what the heat category will be at 4pm, not what it is now.
 * Every hour runs through the same ISO 7243 estimator as the live reading, so
 * the forecast and the current value cannot disagree about method.
 */

import { estimateWbgtC, fToC, cToF, mphToMs, heatIndexF, classify } from './wbgt.js'

const OM_FORECAST = 'https://api.open-meteo.com/v1/forecast'

async function getJson(url, timeout = 14000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/** WMO weather interpretation codes → plain language + an icon key. */
export const WMO = {
  0: ['Clear', 'sun'],
  1: ['Mainly clear', 'sun'],
  2: ['Partly cloudy', 'cloudSun'],
  3: ['Overcast', 'cloud'],
  45: ['Fog', 'fog'],
  48: ['Freezing fog', 'fog'],
  51: ['Light drizzle', 'drizzle'],
  53: ['Drizzle', 'drizzle'],
  55: ['Heavy drizzle', 'drizzle'],
  56: ['Freezing drizzle', 'drizzle'],
  57: ['Freezing drizzle', 'drizzle'],
  61: ['Light rain', 'rain'],
  63: ['Rain', 'rain'],
  65: ['Heavy rain', 'rain'],
  66: ['Freezing rain', 'rain'],
  67: ['Freezing rain', 'rain'],
  71: ['Light snow', 'snow'],
  73: ['Snow', 'snow'],
  75: ['Heavy snow', 'snow'],
  77: ['Snow grains', 'snow'],
  80: ['Rain showers', 'rain'],
  81: ['Rain showers', 'rain'],
  82: ['Violent rain showers', 'rain'],
  85: ['Snow showers', 'snow'],
  86: ['Snow showers', 'snow'],
  95: ['Thunderstorm', 'storm'],
  96: ['Thunderstorm with hail', 'storm'],
  99: ['Severe thunderstorm with hail', 'storm'],
}

export const describeCode = (code) => WMO[code]?.[0] || 'Unknown'
export const iconForCode = (code, isDay = true) => {
  const key = WMO[code]?.[1] || 'cloud'
  if (key === 'sun' && !isDay) return 'moon'
  if (key === 'cloudSun' && !isDay) return 'cloudMoon'
  return key
}

const THUNDER_CODES = new Set([95, 96, 99])

/**
 * Thunderstorm / lightning risk for a single hour.
 *
 * This is a MODELLED risk from convective available potential energy, the
 * forecast weather code and precipitation probability. It is NOT a strike
 * detection and never claims to be — see lightning.js for that distinction.
 */
export function thunderRisk({ code, cape, precipProb }) {
  const c = cape ?? 0
  const p = precipProb ?? 0
  let score = 0
  if (THUNDER_CODES.has(code)) score += 3
  if (c >= 2500) score += 3
  else if (c >= 1500) score += 2
  else if (c >= 800) score += 1
  if (p >= 60) score += 2
  else if (p >= 30) score += 1

  if (score >= 5) return { level: 'high', label: 'High', score }
  if (score >= 3) return { level: 'moderate', label: 'Moderate', score }
  if (score >= 1) return { level: 'low', label: 'Low', score }
  return { level: 'none', label: 'Minimal', score }
}

const toMs = (t) => (typeof t === 'number' ? t * 1000 : new Date(t).getTime())

/**
 * Fetch hourly + daily forecast for a coordinate.
 * @returns {{hours: object[], days: object[], fetchedAt: string}}
 */
export async function fetchForecast({ lat, lon }, thresholds) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly:
      'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,shortwave_radiation,cape,is_day,uv_index',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,uv_index_max,sunrise,sunset',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    timeformat: 'unixtime',
    timezone: 'GMT',
    forecast_days: '7',
    past_hours: '3',
  })

  const d = await getJson(`${OM_FORECAST}?${params}`)
  const h = d.hourly
  if (!h?.time?.length) throw new Error('Forecast provider returned no hourly data')

  const hours = h.time.map((t, i) => {
    const tempF = h.temperature_2m?.[i]
    const rh = h.relative_humidity_2m?.[i]
    const windMph = h.wind_speed_10m?.[i] ?? 0
    const solar = h.shortwave_radiation?.[i] ?? 0
    const code = h.weather_code?.[i]

    let wbgtF = null
    if (tempF != null && rh != null) {
      const est = estimateWbgtC({
        tempC: fToC(tempF),
        rh,
        windMs: mphToMs(windMph),
        solar,
      })
      wbgtF = cToF(est.wbgtC)
    }

    return {
      ts: new Date(toMs(t)).toISOString(),
      tempF,
      feelsLikeF: h.apparent_temperature?.[i] ?? null,
      rh,
      windMph,
      gustMph: h.wind_gusts_10m?.[i] ?? null,
      precipProb: h.precipitation_probability?.[i] ?? null,
      precipIn: h.precipitation?.[i] ?? null,
      cloudCover: h.cloud_cover?.[i] ?? null,
      solarWm2: solar,
      cape: h.cape?.[i] ?? null,
      uv: h.uv_index?.[i] ?? null,
      isDay: h.is_day?.[i] === 1,
      code,
      conditions: describeCode(code),
      icon: iconForCode(code, h.is_day?.[i] === 1),
      heatIndexF: tempF != null && rh != null ? heatIndexF(tempF, rh) : null,
      wbgtF,
      wbgt: wbgtF == null ? null : classify(wbgtF, thresholds),
      thunder: thunderRisk({ code, cape: h.cape?.[i], precipProb: h.precipitation_probability?.[i] }),
    }
  })

  const dd = d.daily || {}
  const days = (dd.time || []).map((t, i) => {
    const dayStart = toMs(t)
    const dayEnd = dayStart + 86400000
    const within = hours.filter((x) => {
      const ms = new Date(x.ts).getTime()
      return ms >= dayStart && ms < dayEnd
    })
    const wbgts = within.map((x) => x.wbgtF).filter((v) => v != null)
    const peak = wbgts.length ? Math.max(...wbgts) : null
    const peakHour = peak != null ? within.find((x) => x.wbgtF === peak) : null

    return {
      date: new Date(dayStart).toISOString(),
      code: dd.weather_code?.[i],
      conditions: describeCode(dd.weather_code?.[i]),
      icon: iconForCode(dd.weather_code?.[i], true),
      highF: dd.temperature_2m_max?.[i] ?? null,
      lowF: dd.temperature_2m_min?.[i] ?? null,
      feelsMaxF: dd.apparent_temperature_max?.[i] ?? null,
      precipProbMax: dd.precipitation_probability_max?.[i] ?? null,
      precipSumIn: dd.precipitation_sum?.[i] ?? null,
      windMaxMph: dd.wind_speed_10m_max?.[i] ?? null,
      gustMaxMph: dd.wind_gusts_10m_max?.[i] ?? null,
      uvMax: dd.uv_index_max?.[i] ?? null,
      sunrise: dd.sunrise?.[i] ? new Date(toMs(dd.sunrise[i])).toISOString() : null,
      sunset: dd.sunset?.[i] ? new Date(toMs(dd.sunset[i])).toISOString() : null,
      peakWbgtF: peak,
      peakWbgtAt: peakHour?.ts || null,
      peakWbgt: peak == null ? null : classify(peak, thresholds),
      maxThunder: within.reduce(
        (acc, x) => (x.thunder.score > (acc?.score ?? -1) ? x.thunder : acc),
        null,
      ),
    }
  })

  return { hours, days, fetchedAt: new Date().toISOString() }
}

/** The forecast hours from now forward, for the "next N hours" strip. */
export const upcomingHours = (hours, count = 24, from = Date.now()) =>
  hours.filter((h) => new Date(h.ts).getTime() >= from - 3600000).slice(0, count)

/* ---------- day view, in the field's own time zone ---------- */

/** Hour-of-day (0-23) for an instant, read in a given IANA zone. */
export function localHour(iso, timeZone) {
  try {
    return Number(
      new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone }).format(new Date(iso)),
    )
  } catch {
    return new Date(iso).getHours()
  }
}

/** Calendar day (YYYY-MM-DD) for an instant, read in a given IANA zone. */
export function localDay(iso, timeZone) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone,
    }).format(new Date(iso))
  } catch {
    return new Date(iso).toISOString().slice(0, 10)
  }
}

/**
 * The rest of today, hour by hour, up to `endHour` in the FIELD's local time.
 *
 * If the day is already past `endHour`, rolls forward to tomorrow rather than
 * returning an empty strip — a coach checking at 10pm still wants tomorrow.
 *
 * @returns {{rows: object[], isTomorrow: boolean, endHour: number}}
 */
export function dayThrough(hours, timeZone, { endHour = 23, from = Date.now() } = {}) {
  if (!hours?.length) return { rows: [], isTomorrow: false, endHour }

  const nowIso = new Date(from).toISOString()
  const today = localDay(nowIso, timeZone)
  const nowHour = localHour(nowIso, timeZone)

  const pick = (day) =>
    hours.filter((h) => {
      if (localDay(h.ts, timeZone) !== day) return false
      const hh = localHour(h.ts, timeZone)
      if (hh > endHour) return false
      // Keep the current hour, drop hours already gone.
      if (day === today && hh < nowHour) return false
      return true
    })

  let rows = pick(today)
  let isTomorrow = false

  if (!rows.length) {
    const tomorrow = localDay(new Date(from + 86400000).toISOString(), timeZone)
    rows = hours.filter((h) => {
      if (localDay(h.ts, timeZone) !== tomorrow) return false
      const hh = localHour(h.ts, timeZone)
      return hh <= endHour
    })
    isTomorrow = rows.length > 0
  }

  return { rows, isTomorrow, endHour }
}

/** The hottest hour of a set, by WBGT. */
export function peakHour(rows) {
  return rows.reduce((best, h) => {
    if (h.wbgtF == null) return best
    return !best || h.wbgtF > best.wbgtF ? h : best
  }, null)
}

/**
 * The first upcoming hour whose WBGT crosses into a higher class than now —
 * what an athletic director actually wants to know when scheduling.
 */
export function nextEscalation(hours, currentClassIndex, from = Date.now()) {
  return (
    upcomingHours(hours, 24, from).find((h) => h.wbgt && h.wbgt.classIndex > currentClassIndex) || null
  )
}
