/**
 * Weather — the coming week at this field, as a 10-day-forecast-style list
 * (day, icon, low, a range bar, high) rather than side-scrolling cards —
 * rows line up by construction instead of fighting variable card heights.
 *
 * The 7-day data has always been fetched (fetchForecast() in forecast.js
 * asks Open-Meteo for forecast_days=7) but nothing displayed it — Home only
 * ever used the hourly strip. This is that data finally shown. The range
 * bar is colored by the day's WBGT band (green through darkred), not a
 * plain temperature gradient — it's telling you more than Apple Weather's
 * equivalent bar does.
 */

import { useEffect } from 'react'
import { useStore } from '../lib/store.jsx'
import { Card, Empty } from '../components/ui.jsx'
import {
  IconBolt,
  IconDroplet,
  IconCloudLightning,
  IconCloudDrizzle,
  IconCloudRain,
  IconCloudSnow,
  IconCloudSun,
  IconSun,
} from '../components/Icons.jsx'

/** A 0-8 modelled thunder score (see thunderRisk() in forecast.js) as a
 * rough risk percentage — a proxy, not a measured probability. */
const thunderPct = (maxThunder) => (maxThunder ? Math.round((maxThunder.score / 8) * 100) : 0)

const RAIN_ICONS = { drizzle: IconCloudDrizzle, rain: IconCloudRain, snow: IconCloudSnow }

/** Four looks on this page: sunny, partly cloudy (cloud + sun together),
 * some kind of rain, or a storm — no plain gray "overcast" cloud with no
 * story to tell. Every day's label and icon come from this same bucket, so
 * they never disagree. */
function simplifyDay(d, pct) {
  if (pct >= 50 || d.icon === 'storm') return { Icon: IconCloudLightning, label: 'Storms' }
  const RainIcon = RAIN_ICONS[d.icon]
  if (RainIcon) return { Icon: RainIcon, label: d.conditions }
  if (d.icon === 'cloudSun' || d.icon === 'cloudMoon') return { Icon: IconCloudSun, label: 'Partly cloudy' }
  return { Icon: IconSun, label: 'Sunny' }
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

  return (
    <div className="stack weather-page">
      {/* Purely decorative night sky behind the card — twinkling stars
          plus a soft gold sun glow and a cool cloud glow, the kind of
          atmosphere most weather apps put behind their forecast instead
          of a flat panel. */}
      <div className="weather-stars" aria-hidden="true" />
      <div className="weather-sky" aria-hidden="true">
        <div className="weather-sun-glow" />
        <div className="weather-cloud-glow" />
      </div>
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
              const pct = thunderPct(d.maxThunder)
              const hasLightning = pct > 0
              const isRain = pct < 50 && d.icon !== 'storm' && !!RAIN_ICONS[d.icon]
              const { Icon } = simplifyDay(d, pct)
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
