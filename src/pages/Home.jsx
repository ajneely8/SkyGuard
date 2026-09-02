/**
 * Home — the whole app in one screen.
 *
 * Where am I, what is the WBGT, how long can we stay out, what can we wear,
 * is there a storm, and the live radar.
 *
 * The zone-threshold banner, live radar, current conditions and the hourly
 * WBGT check all share one card at the top of the page, then current safety
 * status, active weather threat, location, and everything else follow.
 */

import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { Card, Notice } from '../components/ui.jsx'
import RadarMap from '../components/RadarMap.jsx'
import LocationHeroMap from '../components/LocationHeroMap.jsx'
import LightningPanel from '../components/LightningPanel.jsx'
import { IconAlert, IconDroplet, IconThermometer, IconGauge, WeatherIcon } from '../components/Icons.jsx'
import { timeOutsideLabel, clothingLabel, bandRange } from '../lib/guidelines.js'
import { fmtF, fmtTimeIn, fmtNum, untilString } from '../lib/format.js'
import { dayThrough, peakHour } from '../lib/forecast.js'

export default function Home() {
  const {
    state,
    selectedLocation,
    conditions,
    current,
    classifyNow,
    guidelineNow,
    refresh,
    loadStorms,
    forecasts,
    loadForecast,
    lightningFor,
    activeSessions,
    nextCheck,
    lastReading,
    nwsAlerts,
    unackAlerts,
    acknowledgeAlert,
    now,
  } = useStore()

  const loc = selectedLocation
  const locId = loc?.id

  useEffect(() => {
    if (!locId) return
    refresh(locId)
    loadStorms(locId)
    loadForecast(locId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locId])

  /* Every clock on this page reads in the field's zone, not the device's. */
  const tz = loc?.timezone || null

  /* Rest of the day, in the field's local hours. */
  const fc = forecasts[locId]?.data
  const dayView = useMemo(
    () => (fc ? dayThrough(fc.hours, tz, { endHour: 21, from: now }) : { rows: [], isTomorrow: false }),
    // `now` ticks every second; only recompute when the hour rolls over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fc, tz, Math.floor(now / 600000)],
  )
  const peakRaw = useMemo(() => peakHour(dayView.rows), [dayView.rows])
  /** Marks the hottest hour in the strip below. */
  const peak = peakRaw ? { ...peakRaw, band: guidelineNow(peakRaw.wbgtF) } : null

  // Guard sits below every hook — an early return above them changes hook
  // order between renders and React throws.
  if (!loc) {
    return (
      <Card title="No locations yet">
        <p>Add the field you want to monitor.</p>
        <Link className="btn btn-primary" to="/app/locations">Add a location</Link>
      </Card>
    )
  }

  const slot = conditions[locId] || {}
  const obs = current(locId)
  const cls = classifyNow(obs?.wbgtF ?? null)
  const band = guidelineNow(obs?.wbgtF ?? null)
  const storm = lightningFor(locId)
  /* The two most severe bands, most severe first — the thresholds a coach needs
     to recognize on sight before anything else on this page. */
  const severeBands = [...state.settings.bands].slice(-2).reverse()
  const session = activeSessions.find((s) => s.locationId === locId)
  const next = nextCheck(locId)
  const last = lastReading(locId)
  const alerts = nwsAlerts[locId] || []
  const myAlerts = unackAlerts.filter((a) => a.locationId === locId).slice(0, 2)

  return (
    <div className="stack">
      {/* Zone-threshold reference, live radar, current conditions, and the
          hourly WBGT check — one card */}
      <Card title={<>Live radar<span className="live-dot" aria-hidden="true" /></>}>
        {severeBands.length > 0 && (
          <div className="zone-banner" style={{ marginBottom: 18 }}>
            <IconAlert width={18} height={18} />
            <div>
              {severeBands.map((b, i) => (
                <span key={b.id}>
                  <strong>WBGT {b.minF != null ? `${b.minF.toFixed(1)}°F` : `${b.maxF.toFixed(1)}°F`} or above</strong> —{' '}
                  {b.name} ({timeOutsideLabel(b)}).{i < severeBands.length - 1 ? ' ' : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        <RadarMap height={440} />

        <div className="section-divider">
          <div className="h3">Current conditions</div>
        </div>

        {obs && (
          <div className="metrics standalone">
            <div className="metric">
              <IconThermometer className="metric-icon" />
              <div className="k">Temp</div><div className="v">{fmtF(obs.tempF, 0)}</div>
            </div>
            <div className="metric">
              <IconGauge className="metric-icon" />
              <div className="k">WBGT</div><div className="v">{fmtF(obs.wbgtF, 1)}</div>
            </div>
            <div className="metric">
              <IconDroplet className="metric-icon" />
              <div className="k">Precip</div><div className="v">{obs.precipIn != null ? obs.precipIn.toFixed(2) : '—'}<small>"</small></div>
            </div>
            <div className="metric">
              <IconThermometer className="metric-icon" />
              <div className="k">Feels</div><div className="v">{fmtF(obs.apparentF ?? obs.heatIndexF, 0)}</div>
            </div>
          </div>
        )}

        <div className="section-divider">
          <div className="h3">Hourly WBGT</div>
        </div>

        {!fc ? (
          <div className="muted small" style={{ padding: '10px 2px' }}>
            {forecasts[locId]?.error ? `Forecast unavailable: ${forecasts[locId].error}` : 'Loading the day…'}
          </div>
        ) : dayView.rows.length === 0 ? (
          <div className="muted small" style={{ padding: '10px 2px' }}>No forecast hours left today.</div>
        ) : (
          <>
            <div className="day-strip">
              {dayView.rows.map((h) => {
                const band = guidelineNow(h.wbgtF)
                const isPeak = peak && h.ts === peak.ts
                return (
                  <div key={h.ts} className={`day-cell tone-${band?.tone || 'none'} ${isPeak ? 'peak' : ''}`}>
                    <div className="dc-time">{fmtTimeIn(h.ts, tz)}</div>
                    <WeatherIcon icon={h.icon} className="dc-icon" />
                    {/* One decimal: rounding to whole degrees makes the number
                        disagree with its own colour band at the boundaries. */}
                    <div className="dc-wbgt">{h.wbgtF != null ? h.wbgtF.toFixed(1) : '—'}</div>
                    <div className="dc-unit">WBGT °F</div>
                    <div className="dc-temp">{Math.round(h.tempF)}° air</div>
                    <div className="dc-cond">{h.conditions}</div>
                    <div className="dc-rain">{h.precipProb ?? 0}% rain</div>
                    {band && <div className="dc-band">{timeOutsideLabel(band)}</div>}
                  </div>
                )
              })}
            </div>

            <div className="day-legend small muted">
              Each hour shows the modelled WBGT and what it would allow, per the bands in{' '}
              <Link to="/app/rules">Rules</Link>.
            </div>
          </>
        )}
      </Card>

      {/* Current safety status */}
      {obs ? (
        <div className="now-card">
          <div className="now-main">
            <div>
              <div className="now-temp">
                {Math.round(obs.tempF)}
                <span className="deg">°F</span>
              </div>
              <div className="now-feels">Feels like {Math.round(obs.apparentF ?? obs.heatIndexF)}°F</div>
            </div>
            <div className="now-wbgt">
              <div className="wbgt-eyebrow">WBGT</div>
              <div className="now-wbgt-value">
                {obs.wbgtF.toFixed(1)}
                <span className="deg">°F</span>
              </div>
              <div className="small muted">{cls.classification}</div>
            </div>
          </div>

          {/* THE ANSWER */}
          {band && (
            <div className="answer">
              <div className="answer-band">{band.name.toUpperCase()}</div>
              <div className="answer-grid">
                <div>
                  <div className="label">How long outside</div>
                  <div className="answer-big">{timeOutsideLabel(band)}</div>
                </div>
                <div>
                  <div className="label">What to wear</div>
                  <div className="answer-big">{clothingLabel(band)}</div>
                </div>
                <div>
                  <div className="label">Breaks</div>
                  <div className="answer-mid">{band.breaks}</div>
                </div>
                <div>
                  <div className="label">Conditioning</div>
                  <div className="answer-mid">{band.conditioning}</div>
                </div>
              </div>
              <div className="answer-detail">
                <strong>Equipment:</strong> {band.equipment}
              </div>
              {band.note && <div className="answer-note">{band.note}</div>}
              <div className="answer-why">
                WBGT is {obs.wbgtF.toFixed(1)}°F, which falls in the {bandRange(band)} band of your rules.{' '}
                <Link to="/app/rules">See all rules</Link>
              </div>
            </div>
          )}
        </div>
      ) : (
        <Card title="Current safety status">
          <Notice kind="danger" title="WEATHER DATA UNAVAILABLE">
            {slot.loading
              ? 'Getting conditions…'
              : slot.error
                ? `Weather source error: ${slot.error}`
                : 'The last reading is too old to show as current.'}
            <br />
            Do not use this screen to make a decision until a current reading is available.
          </Notice>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => refresh(locId)} disabled={slot.loading}>
            {slot.loading ? 'Getting…' : 'Try again'}
          </button>
          {last && (
            <div className="recommendation" style={{ marginTop: 14 }}>
              <div className="label">Last reading (old — not current)</div>
              <div>
                <strong>{fmtF(last.wbgtF)}</strong> at {fmtTimeIn(last.ts, tz)}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Active weather threat */}
      {myAlerts.map((a) => (
        <div key={a.id} className="alert-banner" role="alert">
          <div className="ab-body">
            <h3>WBGT WENT UP — {loc.name}</h3>
            <div className="small">
              {fmtF(a.prevWbgtF)} → <strong>{fmtF(a.wbgtF)}</strong> ({a.prevClassification} →{' '}
              {a.classification}) at {fmtTimeIn(a.ts, tz)}. {a.bandName ? `Now in: ${a.bandName}.` : ''} Review the practice
              limits below.
            </div>
          </div>
          <button className="btn" onClick={() => acknowledgeAlert(a.id)}>Got it</button>
        </div>
      ))}

      {alerts.length > 0 && (
        <Notice kind="danger" title={`${alerts.length} National Weather Service alert${alerts.length > 1 ? 's' : ''} here`}>
          {alerts.map((a) => (
            <div key={a.id}>
              <strong>{a.event}</strong>
              {a.headline ? ` — ${a.headline}` : ''}
            </div>
          ))}
        </Notice>
      )}

      {(storm.nearest || storm.level !== 'clear') && (
        <Notice
          kind={storm.level === 'critical' ? 'danger' : storm.level === 'warning' ? 'warn' : 'info'}
          title={storm.headline}
        >
          {storm.nearest ? (
            <>
              {storm.nearest.event}
              {storm.nearest.distanceMiles > 0
                ? ` — ${storm.nearest.distanceMiles.toFixed(1)} miles ${storm.nearest.bearing?.compass || ''}`
                : ' — overhead'}
              . Your alert distance is {storm.alertMiles} miles.{' '}
            </>
          ) : null}
          Distances are to National Weather Service storm warning areas, not to individual lightning strikes.
        </Notice>
      )}

      {/* Location — the field's name already lives in the sidebar and the
          topbar selector on every screen, so this is just the map. */}
      <LocationHeroMap />

      {/* Lightning — its own section */}
      <LightningPanel locationId={locId} tz={tz} />

      {/* Additional information */}
      <Card title={session ? 'Practice running' : 'Practice'}>
        {session ? (
          <>
            <div className="row-between">
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{session.sport}</div>
                <div className="small muted">
                  {fmtTimeIn(session.start, tz)}–{fmtTimeIn(session.end, tz)} at {loc.name}
                </div>
              </div>
              <span className="badge badge-red">LIVE</span>
            </div>
            <dl className="kv" style={{ marginTop: 12 }}>
              <dt>Next check</dt>
              <dd>{next ? `${fmtTimeIn(next.due, tz)} · ${untilString(next.due, now)}` : 'All checks done'}</dd>
              <dt>Field</dt>
              <dd>{loc.name} — locked for this practice</dd>
            </dl>
            <Link className="btn btn-block btn-navy" to="/app/practice" style={{ marginTop: 12 }}>
              Open practice
            </Link>
          </>
        ) : (
          <>
            <p className="small muted">
              Start a practice and the app checks the WBGT here every {state.settings.monitoringIntervalMin} minutes on
              its own.
            </p>
            <Link className="btn btn-lg btn-primary btn-block" to="/app/practice">START PRACTICE</Link>
          </>
        )}
      </Card>
    </div>
  )
}
