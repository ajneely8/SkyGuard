/**
 * Weather — the coming week at this field, one day per row.
 *
 * The 7-day data has always been fetched (fetchForecast() in forecast.js
 * asks Open-Meteo for forecast_days=7) but nothing displayed it — Home only
 * ever used the hourly strip. This is that data finally shown.
 */

import { useEffect } from 'react'
import { useStore } from '../lib/store.jsx'
import { Card, Empty } from '../components/ui.jsx'
import { WeatherIcon } from '../components/Icons.jsx'
import { timeOutsideLabel } from '../lib/guidelines.js'
import { fmtTimeIn } from '../lib/format.js'

function dayLabel(iso, tz, todayStr) {
  const d = new Date(iso)
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined }).format(d) // YYYY-MM-DD, stable for comparison
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long', timeZone: tz || undefined }).format(d)
  const date = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: tz || undefined }).format(d)
  if (dateStr === todayStr) return `Today · ${date}`
  return `${weekday} · ${date}`
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
    <div className="stack">
      <Card className="card-bare" title="Weather" subtitle={`The next ${days.length || 7} days at ${loc.name}`}>
        {!fc ? (
          <div className="muted small" style={{ padding: '10px 2px' }}>
            {entry?.error ? `Forecast unavailable: ${entry.error}` : 'Loading the week…'}
          </div>
        ) : days.length === 0 ? (
          <div className="muted small" style={{ padding: '10px 2px' }}>No forecast days available.</div>
        ) : (
          <div className="rules-list">
            {days.map((d) => {
              const band = guidelineNow(d.peakWbgtF)
              return (
                <div key={d.date} className={`rule-band tone-${band?.tone || 'none'}`}>
                  <div className="rb-range">
                    <div className="rb-wbgt">{d.peakWbgtF != null ? `${d.peakWbgtF.toFixed(1)}°` : '—'}</div>
                    <div className="rb-name">{dayLabel(d.date, tz, todayStr)}</div>
                    {band && <span className={`badge badge-${band.tone}`}>{band.name}</span>}
                  </div>
                  <div className="rb-cols">
                    <div>
                      <div className="label">Conditions</div>
                      <div className="rb-text row" style={{ gap: 6 }}>
                        <WeatherIcon icon={d.icon} width={16} height={16} />
                        {d.conditions || '—'}
                      </div>
                    </div>
                    <div>
                      <div className="label">High / Low</div>
                      <div className="rb-value">
                        {d.highF != null ? Math.round(d.highF) : '—'}° / {d.lowF != null ? Math.round(d.lowF) : '—'}°
                      </div>
                    </div>
                    <div>
                      <div className="label">Precip</div>
                      <div className="rb-text">
                        {d.precipProbMax != null ? `${Math.round(d.precipProbMax)}% chance` : '—'}
                        {d.precipSumIn ? ` · ${d.precipSumIn.toFixed(2)}"` : ''}
                      </div>
                    </div>
                    <div>
                      <div className="label">Wind</div>
                      <div className="rb-text">
                        {d.windMaxMph != null ? `${Math.round(d.windMaxMph)} mph` : '—'}
                        {d.gustMaxMph != null ? `, gusts ${Math.round(d.gustMaxMph)}` : ''}
                      </div>
                    </div>
                    <div>
                      <div className="label">UV index</div>
                      <div className="rb-text">{d.uvMax != null ? Math.round(d.uvMax) : '—'}</div>
                    </div>
                    <div>
                      <div className="label">Sun</div>
                      <div className="rb-text">
                        {d.sunrise ? fmtTimeIn(d.sunrise, tz) : '—'} – {d.sunset ? fmtTimeIn(d.sunset, tz) : '—'}
                      </div>
                    </div>
                  </div>
                  {band && d.peakWbgtAt && (
                    <div className="rb-note">
                      Peak WBGT around {fmtTimeIn(d.peakWbgtAt, tz)} — {timeOutsideLabel(band)}
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
