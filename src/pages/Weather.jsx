/**
 * Weather — the coming week at this field, side to side, one card per day.
 *
 * The 7-day data has always been fetched (fetchForecast() in forecast.js
 * asks Open-Meteo for forecast_days=7) but nothing displayed it — Home only
 * ever used the hourly strip. This is that data finally shown, with the same
 * green/yellow/orange/red/darkred WBGT-band coloring used everywhere else
 * in the app.
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
  IconSun,
} from '../components/Icons.jsx'

/** A 0-8 modelled thunder score (see thunderRisk() in forecast.js) as a
 * rough risk percentage — a proxy, not a measured probability. */
const thunderPct = (maxThunder) => (maxThunder ? Math.round((maxThunder.score / 8) * 100) : 0)

const RAIN_ICONS = { drizzle: IconCloudDrizzle, rain: IconCloudRain, snow: IconCloudSnow }

/** Only three looks on this page: sunny, some kind of rain, or a storm —
 * no plain "overcast" gray cloud with no story to tell. Every day's label
 * and icon come from this same bucket, so they never disagree. */
function simplifyDay(d, pct) {
  if (pct >= 50 || d.icon === 'storm') return { Icon: IconCloudLightning, label: 'Storms' }
  const RainIcon = RAIN_ICONS[d.icon]
  if (RainIcon) return { Icon: RainIcon, label: d.conditions }
  return { Icon: IconSun, label: 'Sunny' }
}

function dayLabel(iso, tz, todayStr) {
  const d = new Date(iso)
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined }).format(d) // YYYY-MM-DD, stable for comparison
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: tz || undefined }).format(d)
  const date = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: tz || undefined }).format(d)
  return { top: dateStr === todayStr ? 'Today' : weekday, date }
}

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

  return (
    <div className="stack weather-page">
      {/* Purely decorative sky wash behind the card — a soft gold sun glow
          and a cool cloud glow, the kind of atmosphere most weather apps
          put behind their forecast instead of a flat panel. */}
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
          <div className="week-strip">
            {days.map((d) => {
              const label = dayLabel(d.date, tz, todayStr)
              const band = guidelineNow(d.peakWbgtF)
              const tone = band?.tone || 'none'
              const pct = thunderPct(d.maxThunder)
              const hasLightning = pct > 0
              const isRain = pct < 50 && d.icon !== 'storm' && !!RAIN_ICONS[d.icon]
              const { Icon, label: condLabel } = simplifyDay(d, pct)
              return (
                <div key={d.date} className={`week-cell ${hasLightning ? 'has-lightning' : ''}`}>
                  <div className="wc-day">{label.top}</div>
                  <div className="wc-date">{label.date}</div>
                  <Icon className="wc-icon" />
                  <div className="wc-cond">{condLabel}</div>
                  <div className={`wc-hilo tone-${tone}`}>
                    {d.highF != null ? Math.round(d.highF) : '—'}° <span className="wc-lo">{d.lowF != null ? Math.round(d.lowF) : '—'}°</span>
                  </div>
                  <div className={`wc-wbgt tone-${tone}`}>
                    {d.peakWbgtF != null ? `${d.peakWbgtF.toFixed(1)}°` : '—'}
                    <span className="wc-unit">PEAK WBGT</span>
                  </div>
                  <div className="wc-row">
                    <span className="label">Precip</span>
                    <span>{d.precipProbMax != null ? `${Math.round(d.precipProbMax)}%` : '—'}</span>
                  </div>
                  <div className="wc-row">
                    <span className="label">Wind</span>
                    <span>{d.windMaxMph != null ? `${Math.round(d.windMaxMph)} mph` : '—'}</span>
                  </div>
                  <div className="wc-row">
                    <span className="label">UV</span>
                    <span>{d.uvMax != null ? Math.round(d.uvMax) : '—'}</span>
                  </div>
                  {isRain && d.precipProbMax != null && (
                    <div className="wc-row wc-rain">
                      <span className="label">Rain</span>
                      <span className="wc-rain-value">
                        <IconDroplet className="wc-drop" width={13} height={13} />
                        {Math.round(d.precipProbMax)}%
                      </span>
                    </div>
                  )}
                  {hasLightning && (
                    <div className="wc-row wc-lightning">
                      <span className="label">Lightning</span>
                      <span className="wc-lightning-value">
                        <IconBolt className="wc-bolt" width={13} height={13} />
                        {pct}%
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
