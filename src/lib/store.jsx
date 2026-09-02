/**
 * Application state.
 *
 * Persistence is localStorage — this build has no server. Live weather and storm
 * data are deliberately NOT persisted: a value is only "current" if it was
 * fetched this session and is younger than the staleness window, otherwise the
 * UI shows DATA UNAVAILABLE rather than a stale number.
 *
 * Mutations go through `apply`, which computes the next state from a ref and
 * hands React a plain value, so a mutator can return the record it just created
 * and back-to-back mutations in one tick see each other's writes.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { seedState, SCHEMA_VERSION } from './seed.js'
import { classify, METHOD, METHOD_LABEL } from './wbgt.js'
import { activityGuideline } from './guidelines.js'
import { fetchConditions, fetchAlerts, PROVIDER_NAME } from './weather.js'
import { fetchStormProximity, lightningStatus, evaluateStrikes, DEFAULT_STRIKE_RULES } from './lightning.js'
import { createStrikeFeed, strikeRelativeTo, STRIKE_TTL_MS, SOURCE_NAME } from './strikes.js'
import { notifyLightning, ensureNotificationPermission } from './notify.js'
import { fetchForecast } from './forecast.js'
import { uid } from './format.js'
import { loadSession, clearSession } from './auth.js'

const KEY = 'skyguard.app'

const Ctx = createContext(null)

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return seedState()
    const parsed = JSON.parse(raw)
    if (parsed.version !== SCHEMA_VERSION) return seedState()
    const base = seedState()
    return {
      ...base,
      ...parsed,
      // The session record is the ONLY source of truth for who is signed in.
      //
      // Restored synchronously because the route guard reads `account` on the
      // very first render, before any effect can run — doing it in an effect
      // bounced a signed-in user to /signin on every reload.
      //
      // It deliberately does not fall back to the `account` copy that gets
      // persisted alongside the rest of the state: that copy is not validated
      // against the accounts store, so falling back to it kept a user "signed
      // in" after their session was cleared or their account deleted.
      account: loadSession(),
      settings: {
        ...base.settings,
        ...(parsed.settings || {}),
        lightning: { ...base.settings.lightning, ...(parsed.settings?.lightning || {}) },
        strikeRules: { ...base.settings.strikeRules, ...(parsed.settings?.strikeRules || {}) },
      },
    }
  } catch {
    return seedState()
  }
}

export function StoreProvider({ children }) {
  const [state, setState] = useState(load)
  const [conditions, setConditions] = useState({})
  const [forecasts, setForecasts] = useState({})
  const [storms, setStorms] = useState({})
  /** Live strikes, newest last. Not persisted — they age out in an hour. */
  const [strikes, setStrikes] = useState([])
  const [strikeFeed, setStrikeFeed] = useState({ connected: false, connecting: true, source: SOURCE_NAME })
  const [nwsAlerts, setNwsAlerts] = useState({})
  const [now, setNow] = useState(() => Date.now())

  const inFlight = useRef(new Set())
  const stormInFlight = useRef(new Set())
  const forecastInFlight = useRef(new Set())

  const stateRef = useRef(state)
  stateRef.current = state
  const stormRef = useRef(storms)
  stormRef.current = storms
  const forecastRef = useRef(forecasts)
  forecastRef.current = forecasts

  const apply = useCallback((fn) => {
    const next = fn(stateRef.current)
    stateRef.current = next
    setState(next)
    return next
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch (e) {
      console.warn('Could not persist state', e)
    }
  }, [state])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const update = useCallback((fn) => apply(fn), [apply])

  /* ------------------------------------------------------------------ */
  /* Weather                                                             */
  /* ------------------------------------------------------------------ */

  const refresh = useCallback(async (locationId, { silent = false } = {}) => {
    const loc = stateRef.current.locations.find((l) => l.id === locationId)
    if (!loc) return null
    if (inFlight.current.has(locationId)) return null
    inFlight.current.add(locationId)
    if (!silent) setConditions((c) => ({ ...c, [locationId]: { ...(c[locationId] || {}), loading: true } }))
    try {
      const data = await fetchConditions({ lat: loc.lat, lon: loc.lon })
      setConditions((c) => ({
        ...c,
        [locationId]: { data, error: null, loading: false, fetchedAt: Date.now(), attemptedAt: Date.now() },
      }))
      fetchAlerts({ lat: loc.lat, lon: loc.lon }).then((a) =>
        setNwsAlerts((prev) => ({ ...prev, [locationId]: a })),
      )
      return data
    } catch (e) {
      setConditions((c) => ({
        ...c,
        [locationId]: {
          data: c[locationId]?.data || null,
          error: e.message || 'Weather source unavailable',
          loading: false,
          fetchedAt: c[locationId]?.fetchedAt || null,
          attemptedAt: Date.now(),
        },
      }))
      return null
    } finally {
      inFlight.current.delete(locationId)
    }
  }, [])

  const isStale = useCallback(
    (locationId) => {
      const c = conditions[locationId]
      if (!c?.data || !c.fetchedAt) return true
      return now - c.fetchedAt > (state.settings.staleAfterMin || 35) * 60000
    },
    [conditions, now, state.settings.staleAfterMin],
  )

  const current = useCallback(
    (locationId) => {
      const c = conditions[locationId]
      if (!c || c.error || !c.data) return null
      if (isStale(locationId)) return null
      return c.data
    },
    [conditions, isStale],
  )

  /* ------------------------------------------------------------------ */
  /* Forecast                                                            */
  /* ------------------------------------------------------------------ */

  const loadForecast = useCallback(async (locationId, { force = false } = {}) => {
    const loc = stateRef.current.locations.find((l) => l.id === locationId)
    if (!loc || forecastInFlight.current.has(locationId)) return null
    const existing = forecastRef.current[locationId]
    // The hourly model updates roughly every 15 minutes; no point re-pulling faster.
    if (!force && existing?.fetchedAt && Date.now() - existing.fetchedAt < 15 * 60000) return existing.data
    forecastInFlight.current.add(locationId)
    setForecasts((f) => ({ ...f, [locationId]: { ...(f[locationId] || {}), loading: true } }))
    try {
      const data = await fetchForecast({ lat: loc.lat, lon: loc.lon }, stateRef.current.settings.thresholds)
      setForecasts((f) => ({ ...f, [locationId]: { data, error: null, loading: false, fetchedAt: Date.now() } }))
      return data
    } catch (e) {
      setForecasts((f) => ({
        ...f,
        [locationId]: { data: null, error: e.message || 'Forecast unavailable', loading: false, fetchedAt: null },
      }))
      return null
    } finally {
      forecastInFlight.current.delete(locationId)
    }
  }, [])

  /* ------------------------------------------------------------------ */
  /* Storms                                                              */
  /* ------------------------------------------------------------------ */

  const loadStorms = useCallback(async (locationId, { force = false } = {}) => {
    const loc = stateRef.current.locations.find((l) => l.id === locationId)
    if (!loc || stormInFlight.current.has(locationId)) return null
    const existing = stormRef.current[locationId]
    if (!force && existing?.fetchedAt && Date.now() - existing.fetchedAt < 4 * 60000) return existing.data
    stormInFlight.current.add(locationId)
    setStorms((s) => ({ ...s, [locationId]: { ...(s[locationId] || {}), loading: true } }))
    try {
      const data = await fetchStormProximity({ lat: loc.lat, lon: loc.lon }, loc.stateCode || null)
      setStorms((s) => ({ ...s, [locationId]: { data, error: data.error, loading: false, fetchedAt: Date.now() } }))
      return data
    } catch (e) {
      setStorms((s) => ({
        ...s,
        [locationId]: { data: null, error: e.message || 'Storm data unavailable', loading: false, fetchedAt: null },
      }))
      return null
    } finally {
      stormInFlight.current.delete(locationId)
    }
  }, [])

  const lightningFor = useCallback(
    (locationId) => lightningStatus(storms[locationId]?.data, null, state.settings.lightning.alertMiles),
    [storms, state.settings.lightning.alertMiles],
  )

  /* ------------------------------------------------------------------ */
  /* Lightning strikes                                                   */
  /* ------------------------------------------------------------------ */

  /** Strikes near this field, nearest-first, with distance and bearing. */
  const strikesFor = useCallback(
    (locationId) => {
      const loc = state.locations.find((l) => l.id === locationId)
      if (!loc) return []
      return strikes
        .map((s) => strikeRelativeTo(s, loc))
        .sort((a, b) => a.miles - b.miles)
    },
    [strikes, state.locations],
  )

  /** Caution / advisory / warning status, with the restarting hold clock. */
  const strikeStatusFor = useCallback(
    (locationId) => evaluateStrikes(strikesFor(locationId), state.settings.strikeRules, now),
    [strikesFor, state.settings.strikeRules, now],
  )

  /* ------------------------------------------------------------------ */
  /* Readings                                                            */
  /* ------------------------------------------------------------------ */

  const addReading = useCallback(
    (reading) => {
      const s0 = stateRef.current
      const cls = classify(reading.wbgtF, s0.settings.thresholds)
      const band = activityGuideline(reading.wbgtF, s0.settings.bands)
      const prev = s0.readings
        .filter((r) => r.locationId === reading.locationId)
        .sort((a, b) => new Date(b.ts) - new Date(a.ts))[0]

      const created = {
        id: uid('rd'),
        ts: reading.ts || new Date().toISOString(),
        locationId: reading.locationId,
        sessionId: reading.sessionId || null,
        wbgtF: reading.wbgtF,
        classification: cls.classification,
        classIndex: cls.classIndex,
        status: cls.status,
        band: band ? { id: band.id, name: band.name, maxMinutes: band.maxMinutes, equipment: band.equipment } : null,
        method: reading.method || METHOD.ESTIMATED,
        provider: reading.provider || PROVIDER_NAME,
        kind: reading.kind || 'manual',
        tempF: reading.tempF ?? null,
        rh: reading.rh ?? null,
        windMph: reading.windMph ?? null,
        note: reading.note || '',
        enteredBy: s0.account?.name || 'unknown',
      }

      const alert =
        prev && cls.classIndex > prev.classIndex
          ? {
              id: uid('alr'),
              ts: created.ts,
              locationId: created.locationId,
              prevWbgtF: prev.wbgtF,
              wbgtF: created.wbgtF,
              prevClassification: prev.classification,
              classification: created.classification,
              bandName: band?.name || null,
              acknowledged: false,
            }
          : null

      apply((s) => ({
        ...s,
        readings: [created, ...s.readings].slice(0, 5000),
        alerts: (alert ? [alert, ...s.alerts] : s.alerts).slice(0, 200),
      }))
      return created
    },
    [apply],
  )

  const captureReading = useCallback(
    async (locationId, { sessionId = null, kind = 'manual', note = '' } = {}) => {
      const data = await refresh(locationId)
      if (!data) return { error: 'Weather source unavailable — reading not recorded.' }
      const created = addReading({
        locationId,
        sessionId,
        kind,
        note,
        ts: new Date().toISOString(),
        wbgtF: data.wbgtF,
        method: data.method,
        provider: data.provider,
        tempF: data.tempF,
        rh: data.rh,
        windMph: data.windMph,
      })
      return { reading: created }
    },
    [refresh, addReading],
  )

  const acknowledgeAlert = useCallback(
    (alertId) => apply((s) => ({ ...s, alerts: s.alerts.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a)) })),
    [apply],
  )

  /* ------------------------------------------------------------------ */
  /* Locations                                                           */
  /* ------------------------------------------------------------------ */

  const addLocation = useCallback(
    ({ name, type = 'practice', geo, select = true }) => {
      const created = {
        id: uid('loc'),
        name: name.trim(),
        type,
        lat: geo.lat,
        lon: geo.lon,
        accuracy: geo.accuracy ?? null,
        precise: !!geo.precise,
        source: geo.source || 'manual entry',
        place: geo.place || null,
        city: geo.city || null,
        stateCode: geo.stateCode || null,
        zip: geo.zip || null,
        address: geo.displayName || null,
        elevationFt: geo.elevationFt ?? null,
        // The field's own zone — every clock in the app renders against this.
        timezone: geo.timezone || null,
        timezoneAbbrev: geo.timezoneAbbrev || null,
        createdAt: new Date().toISOString(),
      }
      apply((s) => ({
        ...s,
        setupComplete: true,
        locations: [...s.locations, created],
        selectedLocationId: select || !s.selectedLocationId ? created.id : s.selectedLocationId,
      }))
      return created
    },
    [apply],
  )

  const removeLocation = useCallback(
    (locationId) =>
      apply((s) => {
        const remaining = s.locations.filter((l) => l.id !== locationId)
        return {
          ...s,
          locations: remaining,
          selectedLocationId:
            s.selectedLocationId === locationId ? remaining[0]?.id || null : s.selectedLocationId,
          // Deleting the last field drops back to the location setup screen
          // rather than stranding the user on an empty dashboard.
          setupComplete: remaining.length > 0,
        }
      }),
    [apply],
  )

  const renameLocation = useCallback(
    (locationId, patch) =>
      apply((s) => ({ ...s, locations: s.locations.map((l) => (l.id === locationId ? { ...l, ...patch } : l)) })),
    [apply],
  )

  /* ------------------------------------------------------------------ */
  /* Practice sessions                                                   */
  /* ------------------------------------------------------------------ */

  const buildSchedule = useCallback((startIso, endIso, settings) => {
    const start = new Date(startIso).getTime()
    const end = new Date(endIso).getTime()
    const interval = (settings.monitoringIntervalMin || 30) * 60000
    const checks = [
      {
        id: uid('ck'),
        due: new Date(start - (settings.preCheckMin || 15) * 60000).toISOString(),
        label: 'Check before practice',
        done: false,
        readingId: null,
      },
    ]
    let t = start + interval
    while (t <= end) {
      checks.push({ id: uid('ck'), due: new Date(t).toISOString(), label: 'WBGT check', done: false, readingId: null })
      t += interval
    }
    return checks
  }, [])

  const createSession = useCallback(
    (input) => {
      const s0 = stateRef.current
      const created = {
        id: uid('ses'),
        sport: input.sport,
        /** Locked to this field for the whole session. */
        locationId: input.locationId,
        start: input.start,
        end: input.end,
        status: 'scheduled',
        createdAt: new Date().toISOString(),
        checks: buildSchedule(input.start, input.end, s0.settings),
      }
      apply((s) => ({ ...s, sessions: [created, ...s.sessions] }))
      return created
    },
    [apply, buildSchedule],
  )

  const setSessionStatus = useCallback(
    (sessionId, status) =>
      apply((s) => ({
        ...s,
        sessions: s.sessions.map((x) =>
          x.id === sessionId
            ? {
                ...x,
                status,
                ...(status === 'active' ? { actualStart: new Date().toISOString() } : {}),
                ...(status === 'complete' ? { actualEnd: new Date().toISOString() } : {}),
              }
            : x,
        ),
      })),
    [apply],
  )

  const markCheckDone = useCallback(
    (sessionId, checkId, readingId) =>
      apply((s) => ({
        ...s,
        sessions: s.sessions.map((x) =>
          x.id === sessionId
            ? {
                ...x,
                checks: x.checks.map((c) =>
                  c.id === checkId ? { ...c, done: true, readingId, doneAt: new Date().toISOString() } : c,
                ),
              }
            : x,
        ),
      })),
    [apply],
  )

  const deleteSession = useCallback(
    (sessionId) => apply((s) => ({ ...s, sessions: s.sessions.filter((x) => x.id !== sessionId) })),
    [apply],
  )

  /* ------------------------------------------------------------------ */
  /* Monitoring                                                          */
  /* ------------------------------------------------------------------ */

  const activeSessions = useMemo(() => state.sessions.filter((s) => s.status === 'active'), [state.sessions])

  const selectedLocation = useMemo(
    () => state.locations.find((l) => l.id === state.selectedLocationId) || state.locations[0] || null,
    [state.locations, state.selectedLocationId],
  )

  /**
   * Locations kept warm: the one on screen plus any with a running practice.
   * A practice field is monitored regardless of what the user is looking at —
   * the coach's phone moving must never change which field is recorded.
   */
  const monitoredIds = useMemo(() => {
    const ids = new Set(activeSessions.map((s) => s.locationId))
    if (selectedLocation) ids.add(selectedLocation.id)
    return [...ids]
  }, [activeSessions, selectedLocation])

  useEffect(() => {
    if (!monitoredIds.length) return
    const tick = () => {
      monitoredIds.forEach((id) => {
        const c = conditions[id]
        const age = c?.attemptedAt ? Date.now() - c.attemptedAt : Infinity
        if (age > (state.settings.autoRefreshSec || 300) * 1000 && !c?.loading) refresh(id, { silent: true })
        const s = stormRef.current[id]
        const sAge = s?.fetchedAt ? Date.now() - s.fetchedAt : Infinity
        if (sAge > 4 * 60000 && !s?.loading) loadStorms(id)

        const f = forecastRef.current[id]
        const fAge = f?.fetchedAt ? Date.now() - f.fetchedAt : Infinity
        if (fAge > 15 * 60000 && !f?.loading) loadForecast(id)
      })
    }
    tick()
    const t = setInterval(tick, 30000)
    return () => clearInterval(t)
  }, [monitoredIds, conditions, refresh, loadStorms, loadForecast, state.settings.autoRefreshSec])

  /* ---- strike feed: one connection, filtered to the saved fields ---- */
  const locationsRef = useRef(state.locations)
  locationsRef.current = state.locations

  const addStrike = useCallback((s) => {
    setStrikes((prev) => {
      if (prev.some((x) => x.id === s.id)) return prev
      const cutoff = Date.now() - STRIKE_TTL_MS
      return [...prev.filter((x) => new Date(x.ts).getTime() > cutoff), s].slice(-2000)
    })
  }, [])

  useEffect(() => {
    if (!state.locations.length) return
    const feed = createStrikeFeed({
      getWatched: () => locationsRef.current.map((l) => ({ lat: l.lat, lon: l.lon })),
      onStrike: addStrike,
      onStatus: setStrikeFeed,
    })
    return () => feed.stop()
    // Reconnect only when the set of fields appears/disappears entirely.
  }, [state.locations.length > 0])

  /**
   * Test button: drops one synthetic strike near a field, through the exact
   * same pipeline a real one takes — the map marker, the band status, and the
   * notification — so the whole chain can be checked without waiting on a
   * real storm. Marked `test: true` so it can be told apart and cleared.
   */
  const simulateStrike = useCallback(
    (locationId, miles = 4) => {
      const loc = stateRef.current.locations.find((l) => l.id === locationId)
      if (!loc) return
      const bearingDeg = Math.random() * 360
      const rad = (bearingDeg * Math.PI) / 180
      const milesPerDegLat = 69.0
      const dLat = (miles / milesPerDegLat) * Math.cos(rad)
      const dLon = (miles / (milesPerDegLat * Math.cos((loc.lat * Math.PI) / 180))) * Math.sin(rad)
      addStrike({
        id: `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        lat: loc.lat + dLat,
        lon: loc.lon + dLon,
        ts: new Date().toISOString(),
        receivedAt: Date.now(),
        test: true,
      })
    },
    [addStrike],
  )

  /** Clears only the synthetic strikes a test dropped in, leaving anything real. */
  const clearTestStrikes = useCallback(() => {
    setStrikes((prev) => prev.filter((s) => !s.test))
  }, [])

  // Age strikes out so the map and the bands do not hold onto stale weather.
  useEffect(() => {
    const t = setInterval(() => {
      const cutoff = Date.now() - STRIKE_TTL_MS
      setStrikes((prev) => {
        const next = prev.filter((s) => new Date(s.ts).getTime() > cutoff)
        return next.length === prev.length ? prev : next
      })
    }, 60000)
    return () => clearInterval(t)
  }, [])

  /**
   * Notify on band CHANGES only — escalation, and the all-clear when the hold
   * expires. One per change, never one per strike.
   */
  const lastLevel = useRef({})
  useEffect(() => {
    monitoredIds.forEach((id) => {
      const loc = stateRef.current.locations.find((l) => l.id === id)
      if (!loc) return
      const status = evaluateStrikes(
        strikes.map((s) => strikeRelativeTo(s, loc)),
        stateRef.current.settings.strikeRules,
        now,
      )
      const prev = lastLevel.current[id]
      const curr = status.level.id
      if (prev === undefined) {
        lastLevel.current[id] = curr
        return
      }
      if (prev === curr) return
      lastLevel.current[id] = curr

      // Announce escalation, and the all-clear whenever the hold ends.
      //
      // The all-clear must fire on warning -> ANYTHING lower, not only
      // warning -> clear: a storm that has moved off usually leaves strikes
      // still inside the wider caution/advisory rings, so the level drops to
      // advisory and the "safe to resume" message would never be sent.
      const rank = { clear: 0, caution: 1, advisory: 2, warning: 3 }
      const escalated = rank[curr] > rank[prev]
      const holdEnded = prev === 'warning' && curr !== 'warning'
      if (!escalated && !holdEnded) return

      notifyLightning(holdEnded ? 'clear' : curr, {
        locationName: loc.name,
        miles: status.nearest?.miles,
        compass: status.nearest?.bearing?.compass,
        resumeMinutes: status.rules.holdMinutes,
      })
    })
  }, [strikes, now, monitoredIds])

  /**
   * Notify on EVERY qualifying strike, not just band changes — some coaches
   * want to feel each one land rather than only the escalation. Same-tag
   * renotify means these replace each other in the tray instead of piling
   * up, so this doesn't turn into a wall of alerts even in a busy storm.
   * Scoped to strikes inside the caution ring — anything farther out isn't
   * relevant to this field yet.
   */
  const notifiedStrikeIds = useRef(new Map())
  useEffect(() => {
    monitoredIds.forEach((id) => {
      const loc = stateRef.current.locations.find((l) => l.id === id)
      if (!loc) return
      const rules = stateRef.current.settings.strikeRules
      const cautionMiles = rules?.cautionMiles ?? 30
      const seen = notifiedStrikeIds.current.get(id) || new Set()

      const relevant = strikes
        .map((s) => strikeRelativeTo(s, loc))
        .filter((s) => s.miles <= cautionMiles && !seen.has(s.id))
        .sort((a, b) => new Date(a.ts) - new Date(b.ts))

      if (!relevant.length) return
      relevant.forEach((s) => {
        seen.add(s.id)
        notifyLightning('strike', { locationName: loc.name, miles: s.miles, compass: s.bearing?.compass })
      })
      notifiedStrikeIds.current.set(id, seen)
    })
  }, [strikes, monitoredIds])

  const firing = useRef(new Set())
  useEffect(() => {
    activeSessions.forEach((ses) => {
      const due = ses.checks.find((c) => !c.done && new Date(c.due).getTime() <= now)
      if (!due || firing.current.has(due.id)) return
      firing.current.add(due.id)
      captureReading(ses.locationId, { sessionId: ses.id, kind: 'scheduled', note: 'Automatic check' })
        .then((res) => {
          if (res.reading) markCheckDone(ses.id, due.id, res.reading.id)
        })
        .finally(() => setTimeout(() => firing.current.delete(due.id), 60000))
    })
  }, [activeSessions, now, captureReading, markCheckDone])

  /* ------------------------------------------------------------------ */
  /* Derived                                                             */
  /* ------------------------------------------------------------------ */

  const lastReading = useCallback(
    (locationId) =>
      state.readings
        .filter((r) => r.locationId === locationId)
        .sort((a, b) => new Date(b.ts) - new Date(a.ts))[0] || null,
    [state.readings],
  )

  const nextCheck = useCallback(
    (locationId) => {
      const ses = activeSessions.find((s) => s.locationId === locationId)
      if (!ses) return null
      const c = ses.checks.find((x) => !x.done)
      return c ? { ...c, sessionId: ses.id } : null
    },
    [activeSessions],
  )

  const locationName = useCallback(
    (id) => state.locations.find((x) => x.id === id)?.name || 'Unknown location',
    [state.locations],
  )

  const unackAlerts = useMemo(() => state.alerts.filter((a) => !a.acknowledged), [state.alerts])

  const setSelectedLocation = useCallback((id) => apply((s) => ({ ...s, selectedLocationId: id })), [apply])

  /* ---- account ---- */

  const setAccount = useCallback((account) => apply((s) => ({ ...s, account })), [apply])

  const signOut = useCallback(() => {
    clearSession()
    apply((s) => ({ ...s, account: null }))
  }, [apply])

  const patchSettings = useCallback(
    (patch) => apply((s) => ({ ...s, settings: { ...s.settings, ...patch } })),
    [apply],
  )

  const value = {
    state,
    setState: update,
    now,
    conditions,
    storms,
    nwsAlerts,
    refresh,
    loadStorms,
    strikes,
    strikeFeed,
    strikesFor,
    strikeStatusFor,
    simulateStrike,
    clearTestStrikes,
    ensureNotificationPermission,
    forecasts,
    loadForecast,
    lightningFor,
    current,
    isStale,
    addReading,
    captureReading,
    acknowledgeAlert,
    unackAlerts,
    addLocation,
    removeLocation,
    renameLocation,
    createSession,
    setSessionStatus,
    markCheckDone,
    deleteSession,
    activeSessions,
    lastReading,
    nextCheck,
    locationName,
    selectedLocation,
    setSelectedLocation,
    setAccount,
    signOut,
    patchSettings,
    classifyNow: (wbgtF) => classify(wbgtF, state.settings.thresholds),
    guidelineNow: (wbgtF) => activityGuideline(wbgtF, state.settings.bands),
    resetAll: () => {
      localStorage.removeItem(KEY)
      const fresh = seedState()
      stateRef.current = fresh
      setState(fresh)
    },
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore must be used inside <StoreProvider>')
  return v
}
