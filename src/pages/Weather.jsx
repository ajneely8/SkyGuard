/**
 * Weather — a city-style hero (now, condition, high/low), a one-line
 * outlook sentence, a rolling 24-hour strip, then the 10-day row list.
 * Modeled on a reference screenshot of Apple Weather's layout.
 *
 * "Grab the weather from that exact city" already works: adding a location
 * (Locations page, or the address search in onboarding) geocodes whatever
 * text is typed — a full street address or just a city name — through the
 * same Nominatim search, so a city name alone resolves fine. This page
 * just displays whatever field is currently selected.
 *
 * The 7-day + hourly data has always been fetched (fetchForecast() in
 * forecast.js asks Open-Meteo for forecast_days=7) but nothing displayed
 * the daily list, the rolling hour strip, or an outlook sentence — Home
 * only ever used a same-day hourly strip. This page uses upcomingHours()
 * (already built, unused) for a true rolling "now + next 24 hours" window
 * that runs into tomorrow instead of resetting at midnight.
 */

import { useEffect } from 'react'
import { useStore } from '../lib/store.jsx'
import { Card, Empty } from '../components/ui.jsx'
import { upcomingHours } from '../lib/forecast.js'
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

function dayLabel(iso, tz, todayStr) {
  const d = new Date(iso)
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined }).format(d) // YYYY-MM-DD, stable for comparison
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: tz || undefined }).format(d)
  const date = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: tz || undefined }).format(d)
  return { top: dateStr === todayStr ? 'Today' : weekday, date }
}

/** Where a value sits between lo/hi as a 0-100 percent, clamped. */
const pctBetween = (v, lo, hi) => (hi <= lo ? 0 : Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100)))

export default function Weather() {
  const { selectedLocation, forecasts, loadForecast, guidelineNow, now } = useStore()
  const loc = selectedLocation
  const locId = loc?.id

  useEffect(() => {
    if (!locId) return
    loadForecast(locId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locId])

  if (!loc) return <Empty>Add a location first.</Empty>

  const entry = forecasts[locId]
  const fc = entry?.data
  const days = fc?.days || []
  const tz = loc.timezone || null
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
            <div className="hero-loc-label">MY LOCATION</div>
            <div className="hero-loc-name">{loc.name}</div>
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

      <Card className="card-bare" title="Weather" subtitle={`The next ${days.length || 7} days at ${loc.name}`}>
        {!fc ? (
          <div className="muted small" style={{ padding: '10px 2px' }}>
            {entry?.error ? `Forecast unavailable: ${entry.error}` : 'Loading the week…'}
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
                    <span className={`wr-wbgt-chip tone-${tone}`}>
                      {d.peakWbgtF != null ? `${d.peakWbgtF.toFixed(1)}°` : '—'}
                    </span>
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
    </div>
  )
}
