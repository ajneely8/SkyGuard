/**
 * Home — the whole app in one screen.
 *
 * Where am I, what is the WBGT, how long can we stay out, what can we wear,
 * is there a storm, and the live radar.
 */

import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { Card, Notice } from '../components/ui.jsx'
import RadarMap from '../components/RadarMap.jsx'
import { timeOutsideLabel, clothingLabel, bandRange } from '../lib/guidelines.js'
import { METHOD_LABEL } from '../lib/wbgt.js'
import { fmtF, fmtTimeIn, fmtNum, ageString, untilString, zoneLabel, differsFromDevice } from '../lib/format.js'
import { shortPlace } from '../lib/geo.js'
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
  const zone = zoneLabel(tz)
  const tzDiffers = differsFromDevice(tz)

  /* Rest of the day, in the field's local hours. */
  const fc = forecasts[locId]?.data
  const dayView = useMemo(
    () => (fc ? dayThrough(fc.hours, tz, { endHour: 21, from: now }) : { rows: [], isTomorrow: false }),
    // `now` ticks every second; only recompute when the hour rolls over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fc, tz, Math.floor(now / 600000)],
  )
  const peakRaw = useMemo(() => peakHour(dayView.rows), [dayView.rows])
  const peak = peakRaw ? { ...peakRaw, band: guidelineNow(peakRaw.wbgtF) } : null
  /** First hour after the peak that falls into an easier band. */
  const safeAfter = useMemo(() => {
    if (!peak?.band) return null
    const after = dayView.rows.filter((h) => new Date(h.ts) > new Date(peak.ts))
    for (const h of after) {
      const b = guidelineNow(h.wbgtF)
      if (b && b.id !== peak.band.id) return { ...h, band: b }
    }
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayView.rows, peak?.ts, peak?.band?.id])

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
  const session = activeSessions.find((s) => s.locationId === locId)
  const next = nextCheck(locId)
  const last = lastReading(locId)
  const alerts = nwsAlerts[locId] || []
  const myAlerts = unackAlerts.filter((a) => a.locationId === locId).slice(0, 2)

  return (
    <div className="stack">
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

      {/* Location */}
      <div className="loc-header">
        <div style={{ minWidth: 0 }}>
          <div className="loc-name">{loc.name}</div>
          <div className="small muted">{shortPlace(loc) || loc.address || 'Saved location'}</div>
        </div>
        <div className="loc-coords mono">
          {Math.abs(loc.lat).toFixed(6)}° {loc.lat >= 0 ? 'N' : 'S'}
          <br />
          {Math.abs(loc.lon).toFixed(6)}° {loc.lon >= 0 ? 'E' : 'W'}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className={`badge badge-${loc.precise ? 'green' : 'yellow'}`}>
            {loc.precise ? 'Using your precise location' : 'Approximate location'}
          </span>
          {zone && <span className="badge badge-blue">{zone}</span>}
        </div>
      </div>

      {tzDiffers && zone && (
        <Notice kind="info" title={`Times shown in ${loc.name} local time (${zone})`}>
          This device is in a different time zone. Every clock on this screen — radar frames, readings
          and practice checks — is shown in the field's local time.
        </Notice>
      )}

      {/* Weather + WBGT + the answer */}
      {obs ? (
        <div className={`now-card lvl-${band?.tone || cls.status}`}>
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
              <div className={`badge badge-${cls.status}`}>{cls.classification}</div>
            </div>
          </div>

          <div className="metrics">
            <div className="metric"><div className="k">Humidity</div><div className="v">{fmtNum(obs.rh, 0, '%')}</div></div>
            <div className="metric"><div className="k">Wind</div><div className="v">{fmtNum(obs.windMph, 0)} <small>mph</small></div></div>
            <div className="metric"><div className="k">Heat index</div><div className="v">{fmtF(obs.heatIndexF, 0)}</div></div>
            <div className="metric"><div className="k">Storms</div><div className="v" style={{ fontSize: 14 }}>{storm.nearest ? `${storm.nearest.distanceMiles.toFixed(0)} mi` : 'Clear'}</div></div>
          </div>

          {/* THE ANSWER */}
          {band && (
            <div className={`answer a-${band.tone}`}>
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

          <div className="source-strip">
            <div><b>Weather</b>{obs.provider}</div>
            <div><b>WBGT</b>{METHOD_LABEL[obs.method]}</div>
            <div><b>Updated</b>{fmtTimeIn(obs.observedAt, tz)}</div>
            <div><b>Data age</b>{ageString(obs.observedAt, now)}</div>
          </div>
        </div>
      ) : (
        <Card title="Current conditions">
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

      {/* Storms */}
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

      {/* Rest of the day */}
      <Card
        title={dayView.isTomorrow ? 'Tomorrow, through 9 PM' : 'Rest of today, through 9 PM'}
        subtitle={`Hour by hour in ${loc.name} local time${zone ? ` (${zone})` : ''}`}
      >
        {!fc ? (
          <div className="muted small" style={{ padding: '10px 2px' }}>
            {forecasts[locId]?.error ? `Forecast unavailable: ${forecasts[locId].error}` : 'Loading the day…'}
          </div>
        ) : dayView.rows.length === 0 ? (
          <div className="muted small" style={{ padding: '10px 2px' }}>No forecast hours left today.</div>
        ) : (
          <>
            {peak && peak.band && (
              <div className={`day-peak a-${peak.band.tone}`}>
                <div>
                  <div className="label">Hottest point</div>
                  <div className="answer-big">
                    {peak.wbgtF.toFixed(1)}°F at {fmtTimeIn(peak.ts, tz)}
                  </div>
                </div>
                <div>
                  <div className="label">Which means</div>
                  <div className="answer-mid">{peak.band.name}</div>
                </div>
                <div>
                  <div className="label">Outside limit then</div>
                  <div className="answer-mid">{timeOutsideLabel(peak.band)}</div>
                </div>
              </div>
            )}

            {safeAfter && (
              <div className="small muted" style={{ marginBottom: 12 }}>
                WBGT drops back to <strong>{safeAfter.band.name.toLowerCase()}</strong> from{' '}
                <strong>{fmtTimeIn(safeAfter.ts, tz)}</strong> — the first hour after the peak that eases up.
              </div>
            )}

            <div className="day-strip">
              {dayView.rows.map((h) => {
                const band = guidelineNow(h.wbgtF)
                const isPeak = peak && h.ts === peak.ts
                return (
                  <div key={h.ts} className={`day-cell tone-${band?.tone || 'none'} ${isPeak ? 'peak' : ''}`}>
                    <div className="dc-time">{fmtTimeIn(h.ts, tz)}</div>
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
              Each hour shows the modelled WBGT and what it would allow. Colours match the bands in{' '}
              <Link to="/app/rules">Rules</Link>.
            </div>
          </>
        )}
      </Card>

      {/* Radar */}
      <Card
        title="Live radar"
        subtitle="Past and forecast frames, looping. Drag the slider to scrub, tap a field for its WBGT."
      >
        <RadarMap height={440} />
      </Card>

      {/* Practice */}
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
