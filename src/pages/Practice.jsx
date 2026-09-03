/**
 * Practice — start a session, and the app checks the WBGT on its own.
 *
 * The field is locked for the session: monitoring stays on those coordinates
 * whatever the coach's phone does. Every practice is kept afterwards with the
 * readings it produced, so the record builds itself.
 */

import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { Card, Field, Notice, Empty } from '../components/ui.jsx'
import { SPORTS } from '../lib/seed.js'
import { timeOutsideLabel, clothingLabel, practiceEndLimit } from '../lib/guidelines.js'
import { fmtTimeIn, fmtDate, untilString, zonedIso, todayStrIn, clockStrIn, timeFmt } from '../lib/format.js'

/** "15:30" -> "3:30 PM". The stored value is a bare time-of-day, not tied to
 * any real date/zone, so this just reads its hour/minute back out again
 * rather than route it through a real timezone-aware formatter. */
function fmtClock12(hhmm) {
  const [h, m] = (hhmm || '0:0').split(':').map(Number)
  return timeFmt.format(new Date(2000, 0, 1, h, m))
}

export default function Practice() {
  const {
    state,
    selectedLocation,
    setSelectedLocation,
    activeSessions,
    createSession,
    setSessionStatus,
    captureReading,
    markCheckDone,
    deleteSession,
    saveScheduleTemplate,
    deleteScheduleTemplate,
    current,
    guidelineNow,
    locationName,
    now,
  } = useStore()

  const locId = selectedLocation?.id
  const session = activeSessions.find((s) => s.locationId === locId)
  const obs = current(locId)
  const band = guidelineNow(obs?.wbgtF ?? null)
  const tz = selectedLocation?.timezone || null

  /** Practices not yet finished — these are the ones you can start. */
  const upcoming = useMemo(
    () => state.sessions.filter((s) => s.status !== 'complete').sort((a, b) => new Date(a.start) - new Date(b.start)),
    [state.sessions],
  )

  /**
   * Finished practices, newest first, each summarised by the readings it took.
   * This is the record — no separate reading log to keep.
   */
  const history = useMemo(() => {
    return state.sessions
      .filter((s) => s.status === 'complete')
      .sort((a, b) => new Date(b.start) - new Date(a.start))
      .map((s) => {
        const readings = state.readings.filter((r) => r.sessionId === s.id)
        const peak = readings.reduce((best, r) => (!best || r.wbgtF > best.wbgtF ? r : best), null)
        return {
          ...s,
          readings,
          peak,
          peakBand: peak ? guidelineNow(peak.wbgtF) : null,
          checksDone: s.checks?.filter((c) => c.done).length ?? 0,
          checksTotal: s.checks?.length ?? 0,
        }
      })
  }, [state.sessions, state.readings, guidelineNow])

  const [openId, setOpenId] = useState(null)
  // Clicking "Use" on a saved schedule hands its values down to
  // SessionCreator, which applies them to its own form fields — bumped so
  // reusing the SAME schedule twice in a row still re-applies it even
  // though the object reference would otherwise look unchanged.
  const [templateToApply, setTemplateToApply] = useState(null)

  if (!selectedLocation) return <Empty>Add a location first.</Empty>

  return (
    <div className="stack">
      {band && obs && (
        <div className="answer" style={{ margin: 0 }}>
          <div className="answer-band">{band.name.toUpperCase()}</div>
          <div className="answer-grid">
            <div>
              <div className="label">WBGT now</div>
              <div className="answer-big">{obs.wbgtF.toFixed(1)}°F</div>
            </div>
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
          </div>
        </div>
      )}

      {session ? (
        <ActiveSession
          session={session}
          band={band}
          locName={locationName(session.locationId)}
          tz={tz}
          now={now}
          onEnd={() => setSessionStatus(session.id, 'complete')}
          onCheck={async (check) => {
            const res = await captureReading(session.locationId, { sessionId: session.id, kind: 'manual' })
            if (res.error) return alert(res.error)
            if (check) markCheckDone(session.id, check.id, res.reading.id)
          }}
        />
      ) : (
        <>
          {state.scheduleTemplates.length > 0 && (
            <Card className="card-bare" title="Saved schedules" subtitle="Start a practice from one you've saved before">
              <div className="stack-sm">
                {state.scheduleTemplates.map((t) => (
                  <div key={t.id} className="item-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 650 }}>{t.name}</div>
                      <div className="small muted">
                        {t.sport} · {locationName(t.locationId)} · {fmtClock12(t.startTime)}–{fmtClock12(t.endTime)}
                      </div>
                    </div>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => setTemplateToApply({ ...t, _applyKey: Date.now() })}
                    >
                      Use
                    </button>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => {
                        if (confirm(`Delete the "${t.name}" schedule?`)) deleteScheduleTemplate(t.id)
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <SessionCreator
            locations={state.locations}
            defaultLocation={locId}
            settings={state.settings}
            tz={tz}
            template={templateToApply}
            onCreate={(input) => {
              const s = createSession(input)
              setSelectedLocation(s.locationId)
              return s
            }}
            onStart={(id) => setSessionStatus(id, 'active')}
            onSaveTemplate={saveScheduleTemplate}
          />
        </>
      )}

      {upcoming.length > 0 && (
        <Card className="card-bare" title="Scheduled" subtitle="Practices not yet finished">
          <div className="stack-sm">
            {upcoming.map((s) => (
              <div key={s.id} className="item-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 650 }}>
                    {s.sport}{' '}
                    <span className={`badge badge-${s.status === 'active' ? 'red' : 'neutral'}`}>{s.status}</span>
                  </div>
                  <div className="small muted">
                    {locationName(s.locationId)} · {fmtDate(s.start)} {fmtTimeIn(s.start, tz)}–
                    {fmtTimeIn(s.end, tz)}
                  </div>
                </div>
                {s.status === 'scheduled' && (
                  <button className="btn btn-sm btn-primary" onClick={() => setSessionStatus(s.id, 'active')}>
                    Start
                  </button>
                )}
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    if (confirm(`Delete the ${s.sport} practice?`)) deleteSession(s.id)
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card
        className="card-bare"
        title="Practice history"
        subtitle={
          history.length
            ? `${history.length} finished practice${history.length === 1 ? '' : 's'}`
            : 'Finished practices are kept here'
        }
      >
        {history.length === 0 ? (
          <Empty>
            No finished practices yet. Start one above — every WBGT check it takes is kept with it, so the record
            builds itself.
          </Empty>
        ) : (
          <div className="stack-sm">
            {history.map((h) => (
              <div key={h.id}>
                <button
                  className="item-row"
                  style={{ width: '100%', cursor: 'pointer' }}
                  onClick={() => setOpenId(openId === h.id ? null : h.id)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 650 }}>
                      {h.sport}
                      {h.peakBand && (
                        <span className={`badge badge-${h.peakBand.tone}`} style={{ marginLeft: 8 }}>
                          {h.peakBand.name}
                        </span>
                      )}
                    </div>
                    {/* The window that actually happened — pairing the scheduled
                        start with the actual end can read backwards. */}
                    <div className="small muted">
                      {fmtDate(h.actualStart || h.start)} · {fmtTimeIn(h.actualStart || h.start, tz)}–
                      {fmtTimeIn(h.actualEnd || h.end, tz)} · {locationName(h.locationId)}
                    </div>
                  </div>
                  <div className="loc-wbgt">
                    <div className="label" style={{ marginBottom: 0 }}>Peak WBGT</div>
                    <div
                      className={`tabnum ${h.peakBand ? `tone-${h.peakBand.tone}` : ''}`}
                      style={{ fontWeight: 650, fontSize: 16 }}
                    >
                      {h.peak ? `${h.peak.wbgtF.toFixed(1)}°F` : '—'}
                    </div>
                  </div>
                  <div className="small muted" style={{ minWidth: 78, textAlign: 'right' }}>
                    {h.checksDone}/{h.checksTotal} checks
                    <div>{openId === h.id ? 'Hide' : 'View'}</div>
                  </div>
                </button>

                {openId === h.id && (
                  <div style={{ padding: '10px 0 4px' }}>
                    {h.readings.length === 0 ? (
                      <div className="muted small" style={{ padding: '4px 14px' }}>
                        No readings were recorded during this practice.
                      </div>
                    ) : (
                      <div className="table-wrap">
                        <table className="data">
                          <thead>
                            <tr>
                              <th>Time</th>
                              <th>WBGT</th>
                              <th>What it allowed</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...h.readings]
                              .sort((a, b) => new Date(a.ts) - new Date(b.ts))
                              .map((r) => {
                                const b = guidelineNow(r.wbgtF)
                                return (
                                  <tr key={r.id}>
                                    <td className="small">{fmtTimeIn(r.ts, tz)}</td>
                                    <td className={`num tabnum ${b ? `tone-${b.tone}` : ''}`}>{r.wbgtF.toFixed(1)}°F</td>
                                    <td className="small">
                                      {b && <span className={`badge badge-${b.tone}`}>{b.name}</span>}{' '}
                                      <span className="muted">{b ? timeOutsideLabel(b) : ''}</span>
                                    </td>
                                  </tr>
                                )
                              })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="row" style={{ marginTop: 10 }}>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => {
                          if (confirm(`Delete the ${h.sport} practice from ${fmtDate(h.start)}?`))
                            deleteSession(h.id)
                        }}
                      >
                        Delete this practice
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function ActiveSession({ session, band, locName, tz, now, onEnd, onCheck }) {
  const [busy, setBusy] = useState(false)
  const nextIdx = session.checks.findIndex((c) => !c.done)
  const started = session.actualStart || session.start
  const limit = practiceEndLimit(started, band)
  const overLimit = limit && now > new Date(limit).getTime()

  return (
    <Card
      className="card-bare"
      title={`Practice running — ${session.sport}`}
      subtitle={`${fmtTimeIn(session.start, tz)}–${fmtTimeIn(session.end, tz)} at ${locName}`}
      actions={
        <>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await onCheck(session.checks[nextIdx])
              setBusy(false)
            }}
          >
            {busy ? 'Checking…' : 'Check WBGT now'}
          </button>
          <button className="btn" onClick={onEnd}>End practice</button>
        </>
      }
    >
      {limit && (
        <div className={`limit-bar ${overLimit ? 'over' : ''}`}>
          <div>
            <div className="label">Time limit for this WBGT band</div>
            <div style={{ fontWeight: 650, fontSize: 17 }}>
              {overLimit ? 'TIME LIMIT REACHED' : `Must finish by ${fmtTimeIn(limit, tz)}`}
            </div>
          </div>
          <div className="small">
            {overLimit
              ? `The ${band.name.toLowerCase()} band allows ${timeOutsideLabel(band).toLowerCase()}. End the outdoor session.`
              : untilString(limit, now)}
          </div>
        </div>
      )}

      <div className="timeline" style={{ marginTop: 16 }}>
        {session.checks.map((c, i) => (
          <div key={c.id} className={`timeline-item ${c.done ? 'done' : i === nextIdx ? 'next' : ''}`}>
            <div className="row-between">
              <div>
                <strong>{fmtTimeIn(c.due, tz)}</strong> — {c.label}
              </div>
              <div className="small muted">
                {c.done
                  ? `Done ${fmtTimeIn(c.doneAt || c.due, tz)}`
                  : i === nextIdx
                    ? untilString(c.due, now)
                    : 'Waiting'}
              </div>
            </div>
          </div>
        ))}
        <div className="timeline-item">
          <strong>{fmtTimeIn(session.end, tz)}</strong> — Practice ends
        </div>
      </div>

      <Notice kind="info" title="The app checks on its own">
        While this practice is running Skyguard reads the WBGT at {locName} on every check and keeps it with the
        practice. The field stays locked — walking around with your phone will not change which coordinates are used.
      </Notice>
    </Card>
  )
}

/* ------------------------------------------------------------------ */

function SessionCreator({ locations, defaultLocation, settings, tz, template, onCreate, onStart, onSaveTemplate }) {
  const [sport, setSport] = useState('Football')
  const [locationId, setLocationId] = useState(defaultLocation || locations[0]?.id)
  // Defaults and entry are read in the field's zone, not the device's.
  const [date, setDate] = useState(() => todayStrIn(new Date(), tz))
  const [start, setStart] = useState(() => clockStrIn(new Date(Date.now() + 15 * 60000), tz))
  const [end, setEnd] = useState(() => clockStrIn(new Date(Date.now() + 135 * 60000), tz))
  const [startNow, setStartNow] = useState(true)
  const [saveAsSchedule, setSaveAsSchedule] = useState(false)
  const [scheduleName, setScheduleName] = useState('')

  // A "Use" click on a saved schedule (Practice.jsx) lands here as a fresh
  // `template` prop — apply its sport/location/times to today's date,
  // leaving the coach to just confirm (or tweak) before starting.
  useEffect(() => {
    if (!template) return
    setSport(template.sport)
    if (template.locationId) setLocationId(template.locationId)
    setStart(template.startTime)
    setEnd(template.endTime)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?._applyKey])

  const startIso = zonedIso(date, start, tz)
  const endIso = zonedIso(date, end, tz)
  const valid = startIso && endIso && new Date(endIso) > new Date(startIso) && locationId

  const preview = useMemo(() => {
    if (!valid) return []
    const rows = [
      { t: new Date(new Date(startIso).getTime() - settings.preCheckMin * 60000), label: 'Check before practice' },
      { t: new Date(startIso), label: 'Practice begins' },
    ]
    let t = new Date(startIso).getTime() + settings.monitoringIntervalMin * 60000
    while (t <= new Date(endIso).getTime()) {
      rows.push({ t: new Date(t), label: 'WBGT check' })
      t += settings.monitoringIntervalMin * 60000
    }
    rows.push({ t: new Date(endIso), label: 'Practice ends' })
    return rows
  }, [valid, startIso, endIso, settings])

  return (
    <Card className="card-bare" title="Start a practice" subtitle="Checks are scheduled for you">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!valid) return
          if (saveAsSchedule && scheduleName.trim()) {
            onSaveTemplate({ name: scheduleName.trim(), sport, locationId, startTime: start, endTime: end })
          }
          const s = onCreate({ sport, locationId, start: startIso, end: endIso })
          if (startNow && s) onStart(s.id)
        }}
      >
        <div className="grid grid-2">
          <Field label="Sport" id="sport">
            <select id="sport" value={sport} onChange={(e) => setSport(e.target.value)}>
              {SPORTS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Location" id="loc">
            <select id="loc" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          <Field label="Date" id="date">
            <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <div />
          <Field label="Start" id="start">
            <input id="start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="End" id="end">
            <input id="end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>

        <label className="row" style={{ gap: 8, marginBottom: 14 }}>
          <input type="checkbox" checked={startNow} onChange={(e) => setStartNow(e.target.checked)} style={{ width: 18, height: 18 }} />
          <span>Start now</span>
        </label>

        <label className="row" style={{ gap: 8, marginBottom: saveAsSchedule ? 10 : 14 }}>
          <input
            type="checkbox"
            checked={saveAsSchedule}
            onChange={(e) => setSaveAsSchedule(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          <span>Save this as a schedule to reuse later</span>
        </label>
        {saveAsSchedule && (
          <div style={{ marginBottom: 14 }}>
            <Field label="Schedule name" id="scheduleName">
              <input
                id="scheduleName"
                placeholder="e.g. Football — Weekday afternoon"
                value={scheduleName}
                onChange={(e) => setScheduleName(e.target.value)}
              />
            </Field>
          </div>
        )}

        {valid && (
          <div style={{ marginBottom: 16 }}>
            <div className="label">Checks</div>
            <div className="timeline">
              {preview.map((r, i) => (
                <div key={i} className="timeline-item">
                  <strong>{fmtTimeIn(r.t.toISOString(), tz)}</strong> — {r.label}
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          className="btn btn-lg btn-primary btn-block"
          type="submit"
          disabled={!valid || (saveAsSchedule && !scheduleName.trim())}
        >
          {startNow ? 'Start practice' : 'Save practice'}
        </button>
      </form>
    </Card>
  )
}
