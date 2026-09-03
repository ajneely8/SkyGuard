/**
 * Weather — its own city search, decoupled from the app's saved locations.
 * The page starts blank: type a city, pick a result, and only then does the
 * hero (now, condition, high/low), outlook sentence, rolling 24-hour strip,
 * and 10-day row list appear. Modeled on a reference screenshot of Apple
 * Weather's layout.
 *
 * This is deliberately independent of selectedLocation/forecasts/loadForecast
 * — a district's saved fields stay on Locations/Home, this page is "look up
 * any city's weather" and fetches its own forecast for whatever coordinate
 * was searched.
 */

import { useEffect, useState, useCallback } from 'react'
import { useStore } from '../lib/store.jsx'
import { Card } from '../components/ui.jsx'
import { fetchForecast, upcomingHours } from '../lib/forecast.js'
import { searchPlaces, fetchAirQuality } from '../lib/weather.js'
import { timezoneFor } from '../lib/geo.js'
import { fmtTimeIn } from '../lib/format.js'
import {
  IconBolt,
  IconDroplet,
  IconCloudLightning,
  IconCloudDrizzle,
  IconCloudRain,
  IconCloudSnow,
  IconCloudSun,
  IconCloudMoon,
  IconSun,
  IconMoon,
} from '../components/Icons.jsx'

const RAIN_ICONS = { drizzle: IconCloudDrizzle, rain: IconCloudRain, snow: IconCloudSnow }

/** "12 AM" / "1 PM" — no minutes, so the label never wraps to two lines
 * inside a fixed-width hour cell and pushes the icon/temp below it down
 * by a different amount cell to cell. */
const fmtHour = (iso, tz) =>
  new Intl.DateTimeFormat(undefined, { hour: 'numeric', timeZone: tz || undefined }).format(new Date(iso))

/** "9:41 AM" — the saved-city card's own local clock, same idea as the
 * Apple Weather list this is modeled on. */
const fmtCityTime = (iso, tz) =>
  new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: tz || undefined }).format(new Date(iso))

/** Which of the five card backgrounds (clear/cloud/rain/storm/snow) a saved
 * city's card should use — day or night is applied separately as a class
 * modifier so there are 5 gradients, not 10. Snow gets its own icy look even
 * though it shares simplifyCondition's "rain" bucket with drizzle/rain, and
 * simplifyCondition's "sun" bucket (it covers both sun and moon icons) maps
 * to the "clear" background here. */
function skyClassFor(icon, bucket, isDay) {
  const sky = icon === 'snow' ? 'snow' : bucket === 'sun' ? 'clear' : bucket
  return `sky-${sky} ${isDay ? 'is-day' : 'is-night'}`
}

/** A 0-8 modelled thunder score (see thunderRisk() in forecast.js) as a
 * rough risk percentage — a proxy, not a measured probability. */
const scorePct = (thunder) => (thunder ? Math.round((thunder.score / 8) * 100) : 0)

/** Four looks used everywhere on this page: sunny, partly cloudy (cloud +
 * sun together), some kind of rain, or a storm — no plain gray "overcast"
 * cloud with no story to tell. Shared by both the daily rows and the
 * hourly strip so an hour and the day it belongs to never disagree. */
function simplifyCondition(icon, conditions, pct) {
  if (pct >= 50 || icon === 'storm') return { Icon: IconCloudLightning, label: 'Storms', bucket: 'storm' }
  const RainIcon = RAIN_ICONS[icon]
  if (RainIcon) return { Icon: RainIcon, label: conditions, bucket: 'rain' }
  // Night stays night: a gold sun (or a sun peeking out of a cloud) at
  // 4am reads as a real bug, not a stylistic choice — the API's own
  // is_day flag already picked 'cloudMoon'/'moon' for these hours, so use
  // the moon-bearing icons, not the sun ones, for them.
  if (icon === 'cloudSun') return { Icon: IconCloudSun, label: 'Partly cloudy', bucket: 'cloud' }
  if (icon === 'cloudMoon') return { Icon: IconCloudMoon, label: 'Partly cloudy', bucket: 'cloud' }
  if (icon === 'moon') return { Icon: IconMoon, label: 'Clear', bucket: 'sun' }
  return { Icon: IconSun, label: 'Sunny', bucket: 'sun' }
}

const BUCKET_ARRIVING = { storm: 'Storms', rain: 'Rain', cloud: 'Clouds', sun: 'Clearing skies' }

/**
 * One Apple-Weather-style sentence: either "X will continue for the rest
 * of the day" or "Y will arrive by <time>", plus a gust clause when the
 * data has one. Built from the same rolling hour window the strip below
 * uses, so the sentence and the strip can never disagree.
 */
function buildOutlook(hours, tz) {
  if (!hours.length) return null
  const nowBucket = simplifyCondition(hours[0].icon, hours[0].conditions, scorePct(hours[0].thunder))

  let changeIdx = -1
  for (let i = 1; i < hours.length; i++) {
    const b = simplifyCondition(hours[i].icon, hours[i].conditions, scorePct(hours[i].thunder)).bucket
    if (b !== nowBucket.bucket) {
      changeIdx = i
      break
    }
  }
  const span = hours.slice(0, changeIdx === -1 ? hours.length : changeIdx + 1)
  const maxGust = Math.max(0, ...span.map((h) => h.gustMph || 0))
  const gustText = maxGust >= 15 ? ` Wind gusts are up to ${Math.round(maxGust)} mph.` : ''

  if (changeIdx === -1) {
    return `${nowBucket.label} conditions will continue for the rest of the day.${gustText}`
  }
  const changeHour = hours[changeIdx]
  const changeBucket = simplifyCondition(changeHour.icon, changeHour.conditions, scorePct(changeHour.thunder)).bucket
  return `${BUCKET_ARRIVING[changeBucket]} will arrive by ${fmtTimeIn(changeHour.ts, tz)}.${gustText}`
}

/* ---------- air quality (US AQI, EPA breakpoints + official colors) ---------- */

const AQI_LEVELS = [
  { max: 50, label: 'Good', color: '#22c55e', note: 'Air quality is considered satisfactory.' },
  { max: 100, label: 'Moderate', color: '#eab308', note: 'Unusually sensitive people should consider limiting prolonged outdoor exertion.' },
  { max: 150, label: 'Unhealthy for Sensitive Groups', color: '#f97316', note: 'People with heart or lung disease, older adults, and children should limit prolonged outdoor exertion.' },
  { max: 200, label: 'Unhealthy', color: '#ef4444', note: 'Everyone may begin to experience health effects; sensitive groups may experience more serious effects.' },
  { max: 300, label: 'Very Unhealthy', color: '#a855f7', note: 'Health alert: everyone may experience more serious health effects.' },
  { max: Infinity, label: 'Hazardous', color: '#7f1d1d', note: 'Health warning of emergency conditions — the entire population is likely to be affected.' },
]

/** The EPA category (name, color, guidance) for a US AQI value. */
const classifyAqi = (value) => AQI_LEVELS.find((l) => value <= l.max) || AQI_LEVELS[AQI_LEVELS.length - 1]

/** Where a value sits on the bar's own 0-300 domain — AQI can run to 500,
 * but everything from "Very Unhealthy" up is a rare extreme, so the visible
 * scale is spent on the range schools actually see most days. */
const AQI_BAR_MAX = 300
const aqiBarPct = (value) => Math.max(0, Math.min(100, (value / AQI_BAR_MAX) * 100))

function dayLabel(iso, tz, todayStr) {
  const d = new Date(iso)
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined }).format(d) // YYYY-MM-DD, stable for comparison
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: tz || undefined }).format(d)
  const date = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: tz || undefined }).format(d)
  return { top: dateStr === todayStr ? 'Today' : weekday, date }
}

/** Where a value sits between lo/hi as a 0-100 percent, clamped. */
const pctBetween = (v, lo, hi) => (hi <= lo ? 0 : Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100)))

/* ---------- recently-searched cities, kept on this device only ---------- */

const RECENTS_KEY = 'skyguard.weather.recentCities'
const MAX_RECENTS = 8

function loadRecents() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

/** Adds a city to the front of the recents list, de-duping anything within
 * ~0.01° (about half a mile) of it rather than by exact name — the same
 * city searched two different ways shouldn't produce two entries. */
function saveRecent(city) {
  const list = loadRecents().filter(
    (c) => Math.abs(c.lat - city.lat) > 0.01 || Math.abs(c.lon - city.lon) > 0.01,
  )
  list.unshift({ name: city.name, lat: city.lat, lon: city.lon })
  const trimmed = list.slice(0, MAX_RECENTS)
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(trimmed))
  } catch {
    /* storage full or unavailable — recents are a convenience, not critical */
  }
  return trimmed
}

export default function Weather() {
  const { state, guidelineNow, now } = useStore()

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [results, setResults] = useState([])
  const [picked, setPicked] = useState(null) // { name, lat, lon, timezone }
  const [fc, setFc] = useState(null)
  const [fcError, setFcError] = useState(null)
  const [loadingFc, setLoadingFc] = useState(false)
  const [aqi, setAqi] = useState(null) // { value } | { error: true } | null while loading
  const [recents, setRecents] = useState(loadRecents)
  const [recentWeather, setRecentWeather] = useState({}) // "lat,lon" -> snapshot, for the recent-city card backgrounds

  const runSearch = useCallback(async (e) => {
    e?.preventDefault?.()
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setSearchError(null)
    try {
      const found = await searchPlaces(q)
      setResults(found)
      if (found.length === 0) setSearchError('No cities matched that search.')
    } catch {
      setSearchError('City search failed. Try again.')
    } finally {
      setSearching(false)
    }
  }, [query])

  const pickResult = useCallback((r) => {
    setResults([])
    setQuery('')
    setPicked({ name: r.label ?? r.name, lat: r.lat, lon: r.lon, timezone: null })
    setRecents(saveRecent({ name: r.label ?? r.name, lat: r.lat, lon: r.lon }))
  }, [])

  useEffect(() => {
    if (!picked) return
    let cancelled = false
    setLoadingFc(true)
    setFcError(null)
    Promise.all([
      fetchForecast({ lat: picked.lat, lon: picked.lon }, state.settings.thresholds),
      timezoneFor(picked.lat, picked.lon),
    ])
      .then(([forecastData, tzInfo]) => {
        if (cancelled) return
        setFc(forecastData)
        setPicked((p) => (p ? { ...p, timezone: tzInfo.timezone || null } : p))
      })
      .catch((err) => {
        if (cancelled) return
        setFc(null)
        setFcError(err?.message || 'Forecast unavailable')
      })
      .finally(() => {
        if (!cancelled) setLoadingFc(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked?.lat, picked?.lon])

  // Air quality is fetched separately from the forecast — a provider hiccup
  // here shouldn't take down the rest of the page, so it gets its own
  // loading/error state instead of riding along in the fc Promise.all.
  useEffect(() => {
    if (!picked) return
    let cancelled = false
    setAqi(null)
    fetchAirQuality({ lat: picked.lat, lon: picked.lon })
      .then((data) => {
        if (!cancelled) setAqi(data)
      })
      .catch(() => {
        if (!cancelled) setAqi({ error: true })
      })
    return () => {
      cancelled = true
    }
  }, [picked?.lat, picked?.lon])

  // A quick "now" snapshot (temp, condition, day/night, today's H/L) for
  // each recently-searched city, so its card can show a real background and
  // real numbers instead of a plain name — same idea as Apple Weather's
  // saved-city list. Only runs on the search screen, and only for cities
  // that don't have a snapshot yet.
  const recentsKey = picked ? '' : recents.map((r) => `${r.lat},${r.lon}`).join('|')
  useEffect(() => {
    if (picked || !recentsKey) return
    let cancelled = false
    recents.forEach((r) => {
      const key = `${r.lat},${r.lon}`
      setRecentWeather((m) => (m[key] ? m : { ...m, [key]: { loading: true } }))
      Promise.all([
        fetchForecast({ lat: r.lat, lon: r.lon }, state.settings.thresholds),
        timezoneFor(r.lat, r.lon),
      ])
        .then(([fcData, tzInfo]) => {
          if (cancelled) return
          // hours[0] is ~3 hours in the past (fetchForecast asks for
          // past_hours=3), not "now" — the same rolling-window pick the
          // hero card uses is needed here too, or a city near sunset would
          // show a stale sunny reading well after dark.
          const hour = upcomingHours(fcData.hours, 1, now)[0] || fcData.hours?.[0] || null
          const day = fcData.days?.[0] || null
          setRecentWeather((m) => ({
            ...m,
            [key]: {
              loading: false,
              tempF: hour?.tempF ?? null,
              icon: hour?.icon || 'cloud',
              conditions: hour?.conditions || null,
              isDay: hour?.isDay ?? true,
              highF: day?.highF ?? null,
              lowF: day?.lowF ?? null,
              tz: tzInfo.timezone || null,
            },
          }))
        })
        .catch(() => {
          if (cancelled) return
          setRecentWeather((m) => ({ ...m, [key]: { loading: false, error: true } }))
        })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentsKey])

  if (!picked) {
    return (
      <div className="stack weather-page">
        <div className="weather-stars" aria-hidden="true" />
        <div className="weather-sky" aria-hidden="true">
          <div className="weather-sun-glow" />
          <div className="weather-cloud-glow" />
        </div>
        <Card className="card-bare weather-search-card" title="Weather" subtitle="Look up any city's forecast">
          <form className="weather-search-form" onSubmit={runSearch}>
            <input
              type="text"
              placeholder="Search a city…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <button type="submit" className="btn btn-primary" disabled={searching || !query.trim()}>
              {searching ? 'Searching…' : 'Search'}
            </button>
          </form>
          {searchError && <div className="muted small" style={{ padding: '8px 2px' }}>{searchError}</div>}
          {results.length > 0 && (
            <div className="weather-search-results">
              {results.map((r) => (
                <button key={`${r.lat},${r.lon}`} type="button" className="weather-search-result" onClick={() => pickResult(r)}>
                  {r.label}
                </button>
              ))}
            </div>
          )}
          {results.length === 0 && recents.length > 0 && (
            <div className="weather-recents">
              <div className="weather-recents-label">Recently searched</div>
              <div className="city-card-list">
                {recents.map((r) => {
                  const key = `${r.lat},${r.lon}`
                  const w = recentWeather[key]
                  const ready = w && !w.loading && !w.error
                  const { label: condLabel, bucket } = ready
                    ? simplifyCondition(w.icon, w.conditions, 0)
                    : { label: null, bucket: 'cloud' }
                  const isDay = w?.isDay ?? true
                  const timeStr = ready && w.tz ? fmtCityTime(new Date(now).toISOString(), w.tz) : null
                  const subLine = w?.loading
                    ? 'Loading…'
                    : w?.error
                      ? 'Unavailable'
                      : [timeStr, condLabel].filter(Boolean).join(' · ')
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`city-card ${skyClassFor(ready ? w.icon : 'cloud', bucket, isDay)}`}
                      onClick={() => pickResult(r)}
                    >
                      {!isDay && <div className="city-card-stars" aria-hidden="true" />}
                      <div className="city-card-top">
                        <div className="city-card-name">{r.name.split(',')[0]}</div>
                        <div className="city-card-temp">{ready && w.tempF != null ? `${Math.round(w.tempF)}°` : '—'}</div>
                      </div>
                      <div className="city-card-bottom">
                        <div className="city-card-cond">{subLine}</div>
                        {ready && w.highF != null && w.lowF != null && (
                          <div className="city-card-hilo">
                            H:{Math.round(w.highF)}° L:{Math.round(w.lowF)}°
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </Card>
      </div>
    )
  }

  const days = fc?.days || []
  const tz = picked.timezone || null
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined }).format(new Date(now))

  // The bar for each day is scaled against the WEEK's low/high, not just
  // that day's own — otherwise every bar would span edge to edge and the
  // "this day is hotter than that one" comparison Apple's version gives
  // you for free would be lost.
  const weekLo = Math.min(...days.map((d) => d.lowF).filter((v) => v != null))
  const weekHi = Math.max(...days.map((d) => d.highF).filter((v) => v != null))

  const upcoming = fc ? upcomingHours(fc.hours, 24, now) : []
  const nowHour = upcoming[0] || null
  const heroCond = nowHour ? simplifyCondition(nowHour.icon, nowHour.conditions, scorePct(nowHour.thunder)) : null
  const today = days[0] || null
  const outlook = buildOutlook(upcoming, tz)

  return (
    <div className="stack weather-page">
      {/* Purely decorative night sky behind the cards — twinkling stars
          plus a soft gold sun glow and a cool cloud glow, the kind of
          atmosphere most weather apps put behind their forecast instead
          of a flat panel. */}
      <div className="weather-stars" aria-hidden="true" />
      <div className="weather-sky" aria-hidden="true">
        <div className="weather-sun-glow" />
        <div className="weather-cloud-glow" />
      </div>

      {fc && nowHour && (
        <Card className="card-bare weather-hero-card">
          <div className="weather-hero">
            <div className="hero-loc-row">
              <span className="hero-loc-label">SEARCHED CITY</span>
              <button type="button" className="hero-change-btn" onClick={() => { setPicked(null); setFc(null); setFcError(null) }}>
                Change city
              </button>
            </div>
            <div className="hero-loc-name">{picked.name}</div>
            <div className="hero-temp">{nowHour.tempF != null ? Math.round(nowHour.tempF) : '—'}°</div>
            <div className="hero-cond-row">
              <span>{heroCond?.label || '—'}</span>
              {today && (
                <span className="hero-hilo">
                  H:{today.highF != null ? Math.round(today.highF) : '—'}° L:
                  {today.lowF != null ? Math.round(today.lowF) : '—'}°
                </span>
              )}
            </div>
          </div>

          {outlook && <div className="weather-outlook">{outlook}</div>}

          <div className="hour-strip">
            {upcoming.map((h, i) => {
              const { Icon } = simplifyCondition(h.icon, h.conditions, scorePct(h.thunder))
              return (
                <div key={h.ts} className="hour-cell">
                  <div className="hr-time">{i === 0 ? 'Now' : fmtHour(h.ts, tz)}</div>
                  <Icon className="hr-icon" width={24} height={24} />
                  <div className="hr-temp">{h.tempF != null ? Math.round(h.tempF) : '—'}°</div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <Card className="card-bare weather-days-card" title="Weather" subtitle={`The next ${days.length || 7} days at ${picked.name}`}>
        {!fc ? (
          <div className="muted small" style={{ padding: '10px 2px' }}>
            {fcError ? `Forecast unavailable: ${fcError}` : 'Loading the week…'}
          </div>
        ) : days.length === 0 ? (
          <div className="muted small" style={{ padding: '10px 2px' }}>No forecast days available.</div>
        ) : (
          <div className="week-list">
            {days.map((d) => {
              const label = dayLabel(d.date, tz, todayStr)
              const band = guidelineNow(d.peakWbgtF)
              const tone = band?.tone || 'none'
              const pct = scorePct(d.maxThunder)
              const hasLightning = pct > 0
              const isRain = pct < 50 && d.icon !== 'storm' && !!RAIN_ICONS[d.icon]
              const { Icon } = simplifyCondition(d.icon, d.conditions, pct)
              const barStart = d.lowF != null ? pctBetween(d.lowF, weekLo, weekHi) : 0
              const barEnd = d.highF != null ? pctBetween(d.highF, weekLo, weekHi) : 0
              return (
                <div key={d.date} className="week-row">
                  <div className="wr-day">
                    {label.top}
                    <span className="wr-date">{label.date}</span>
                  </div>
                  <Icon className="wr-icon" width={20} height={20} />
                  <span className="wr-lo">{d.lowF != null ? Math.round(d.lowF) : '—'}°</span>
                  <div className="wr-bar-track">
                    <div
                      className={`wr-bar-fill tone-${tone}`}
                      style={{ left: `${barStart}%`, width: `${Math.max(6, barEnd - barStart)}%` }}
                    />
                  </div>
                  <span className="wr-hi">{d.highF != null ? Math.round(d.highF) : '—'}°</span>
                  <div className="wr-badges">
                    {isRain && d.precipProbMax != null && (
                      <span className="wr-chip wr-chip-rain">
                        <IconDroplet width={11} height={11} />
                        {Math.round(d.precipProbMax)}%
                      </span>
                    )}
                    {hasLightning && (
                      <span className="wr-chip wr-chip-lightning">
                        <IconBolt width={11} height={11} />
                        {pct}%
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {fc && (
        <Card className="card-bare weather-aqi-card">
          <div className="aqi-label">Air Quality</div>
          {aqi == null ? (
            <div className="muted small" style={{ padding: '4px 2px' }}>Loading…</div>
          ) : aqi.error || aqi.value == null ? (
            <div className="muted small" style={{ padding: '4px 2px' }}>Air quality unavailable</div>
          ) : (
            (() => {
              const level = classifyAqi(aqi.value)
              return (
                <>
                  <div className="aqi-headline">
                    {aqi.value} <span className="aqi-headline-dash">-</span> {level.label}
                  </div>
                  <div className="aqi-desc">{level.note}</div>
                  <div className="aqi-bar-track">
                    <div className="aqi-bar-dot" style={{ left: `${aqiBarPct(aqi.value)}%` }} />
                  </div>
                </>
              )
            })()
          )}
        </Card>
      )}
    </div>
  )
}
