/**
 * Lightning and storm proximity.
 *
 * READ THIS BEFORE CHANGING ANYTHING HERE.
 *
 * There is no free public feed of individual lightning strikes. Commercial
 * strike-detection networks (Vaisala NLDN, Earth Networks, Blitzortung's
 * licensed feed) are the real source, and they are paid. So this module does
 * NOT invent strike distances, and the UI must never present a number here as a
 * detected strike unless a real network is connected.
 *
 * What it does provide, from genuinely available public data:
 *
 *   1. STORM PROXIMITY — distance and bearing from a field to the nearest
 *      *active* National Weather Service thunderstorm/tornado warning polygon.
 *      This is measured, published, verifiable data.
 *   2. MODELLED LIGHTNING RISK — from convective available potential energy,
 *      the forecast weather code and precipitation probability. Labelled as a
 *      model, never as a detection.
 *
 * To add a real network, implement the StrikeProvider interface below and set
 * `strikeProvider`. Everything downstream — the alert distances, the practice
 * monitoring, the audit trail — already reads through `lightningStatus()`.
 */

import { haversineMiles, bearing } from './geo.js'

const NWS_ALERTS = 'https://api.weather.gov/alerts/active'

/** Warning types that mean "lightning is plausible right now". */
export const STORM_EVENTS = [
  'Tornado Warning',
  'Severe Thunderstorm Warning',
  'Special Marine Warning',
  'Severe Weather Statement',
  'Tornado Watch',
  'Severe Thunderstorm Watch',
]

export const SEVERE_EVENTS = new Set(['Tornado Warning', 'Severe Thunderstorm Warning'])

/** Alert distances a district can choose from, in miles. */
export const ALERT_DISTANCES = [10, 8, 6, 5]

/**
 * @typedef {Object} StrikeProvider
 * @property {string} name              Vendor name shown in the data-source strip.
 * @property {(loc:{lat:number,lon:number}, radiusMiles:number) => Promise<{
 *   strikes: Array<{lat:number, lon:number, ts:string, polarity?:string}>,
 *   nearestMiles: number|null,
 *   lastStrikeAt: string|null,
 * }>} fetchStrikes
 */

/**
 * No strike-detection network is connected in this build. Assign a
 * StrikeProvider here to light up true strike distances everywhere.
 * @type {StrikeProvider|null}
 */
export const strikeProvider = null

/* ------------------------------------------------------------------ */
/* geometry                                                            */
/* ------------------------------------------------------------------ */

/** Ray-casting point-in-polygon. ring is [[lon,lat], ...]. */
function pointInRing(lat, lon, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** Miles from a point to a line segment, on an equirectangular approximation. */
function distToSegmentMiles(p, a, b) {
  const latRad = (p.lat * Math.PI) / 180
  const mx = 69.172 * Math.cos(latRad) // miles per degree longitude
  const my = 69.055 // miles per degree latitude
  const px = p.lon * mx
  const py = p.lat * my
  const ax = a[0] * mx
  const ay = a[1] * my
  const bx = b[0] * mx
  const by = b[1] * my
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}

/** 0 when the point is inside the polygon, otherwise miles to its nearest edge. */
export function distanceToPolygonMiles(point, geometry) {
  if (!geometry) return null
  const polys =
    geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates
        : null
  if (!polys) return null

  let best = Infinity
  for (const poly of polys) {
    const ring = poly[0]
    if (!ring?.length) continue
    if (pointInRing(point.lat, point.lon, ring)) return 0
    for (let i = 0; i < ring.length - 1; i++) {
      best = Math.min(best, distToSegmentMiles(point, ring[i], ring[i + 1]))
    }
  }
  return Number.isFinite(best) ? best : null
}

/** Rough centroid of a polygon, for drawing and bearing. */
export function polygonCentroid(geometry) {
  const polys =
    geometry?.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry?.type === 'MultiPolygon'
        ? geometry.coordinates
        : null
  if (!polys) return null
  let sx = 0
  let sy = 0
  let n = 0
  for (const poly of polys) {
    for (const [lon, lat] of poly[0] || []) {
      sx += lon
      sy += lat
      n++
    }
  }
  return n ? { lat: sy / n, lon: sx / n } : null
}

/* ------------------------------------------------------------------ */
/* NWS storm proximity                                                 */
/* ------------------------------------------------------------------ */

async function getJson(url, timeout = 12000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/geo+json' } })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Active NWS alerts near a point, with real measured distance and bearing to
 * each warning polygon.
 *
 * @param {{lat:number, lon:number}} loc
 * @param {string|null} stateCode two-letter state, used to widen the search
 *   beyond alerts that already cover the point
 */
export async function fetchStormProximity(loc, stateCode = null) {
  const results = { alerts: [], overhead: [], nearest: null, zoneOnlyCount: 0, fetchedAt: null, error: null }
  try {
    // Alerts covering this exact point (these are "overhead" by definition).
    const pointData = await getJson(`${NWS_ALERTS}?point=${loc.lat.toFixed(4)},${loc.lon.toFixed(4)}`)
    results.overhead = (pointData.features || []).map((f) => ({
      id: f.id,
      event: f.properties?.event,
      severity: f.properties?.severity,
      urgency: f.properties?.urgency,
      headline: f.properties?.headline,
      description: f.properties?.description,
      expires: f.properties?.expires || f.properties?.ends,
      distanceMiles: 0,
      overhead: true,
      geometry: f.geometry || null,
    }))

    // Nearby storm warnings across the state, so a coach sees weather coming.
    if (stateCode) {
      const stateData = await getJson(`${NWS_ALERTS}?area=${stateCode}&status=actual&message_type=alert`)
      for (const f of stateData.features || []) {
        const event = f.properties?.event
        if (!STORM_EVENTS.includes(event)) continue
        if (!f.geometry) {
          results.zoneOnlyCount++
          continue
        }
        const distanceMiles = distanceToPolygonMiles(loc, f.geometry)
        if (distanceMiles == null) continue
        const centroid = polygonCentroid(f.geometry)
        results.alerts.push({
          id: f.id,
          event,
          severity: f.properties?.severity,
          urgency: f.properties?.urgency,
          headline: f.properties?.headline,
          expires: f.properties?.expires || f.properties?.ends,
          distanceMiles,
          overhead: distanceMiles === 0,
          bearing: centroid ? bearing(loc, centroid) : null,
          centroid,
          geometry: f.geometry,
        })
      }
      results.alerts.sort((a, b) => a.distanceMiles - b.distanceMiles)
      results.nearest = results.alerts[0] || null
    }

    results.fetchedAt = new Date().toISOString()
    return results
  } catch (e) {
    results.error = e.message || 'Storm data unavailable'
    return results
  }
}

/* ------------------------------------------------------------------ */
/* combined status                                                     */
/* ------------------------------------------------------------------ */

/**
 * The single object the UI renders. It always states which of the two kinds of
 * information it is showing, so nobody reads a model as a detection.
 *
 * @param {object} proximity result of fetchStormProximity
 * @param {object} risk      result of thunderRisk() for the current hour
 * @param {number} alertMiles configured warning distance
 */
export function lightningStatus(proximity, risk, alertMiles = 10) {
  const nearest = proximity?.nearest || null
  const overheadSevere = (proximity?.overhead || []).find((a) => SEVERE_EVENTS.has(a.event))

  const detection = strikeProvider
    ? { connected: true, network: strikeProvider.name }
    : {
        connected: false,
        network: null,
        note: 'No strike-detection network is connected. Distances below are to active National Weather Service storm warnings, not to individual lightning strikes.',
      }

  let level = 'clear'
  let headline = 'No active storm warnings near this location'

  if (overheadSevere) {
    level = 'critical'
    headline = `${overheadSevere.event} in effect at this location`
  } else if (nearest && nearest.distanceMiles <= alertMiles) {
    level = SEVERE_EVENTS.has(nearest.event) ? 'critical' : 'warning'
    headline = `${nearest.event} ${nearest.distanceMiles < 1 ? 'at this location' : `${nearest.distanceMiles.toFixed(1)} miles ${nearest.bearing?.compass || ''}`.trim()}`
  } else if (risk && (risk.level === 'high' || risk.level === 'moderate')) {
    level = 'watch'
    headline = `${risk.label} modelled thunderstorm risk this hour`
  } else if (nearest) {
    level = 'watch'
    headline = `Nearest ${nearest.event}: ${nearest.distanceMiles.toFixed(1)} miles ${nearest.bearing?.compass || ''}`.trim()
  }

  return {
    level, // clear | watch | warning | critical
    headline,
    nearest,
    overhead: proximity?.overhead || [],
    risk: risk || null,
    detection,
    alertMiles,
    triggered: level === 'critical' || (nearest ? nearest.distanceMiles <= alertMiles : false),
    zoneOnlyCount: proximity?.zoneOnlyCount || 0,
    error: proximity?.error || null,
    fetchedAt: proximity?.fetchedAt || null,
  }
}

export const LEVEL_META = {
  clear: { label: 'Clear', badge: 'green' },
  watch: { label: 'Watch', badge: 'yellow' },
  warning: { label: 'Warning', badge: 'orange' },
  critical: { label: 'Take shelter', badge: 'red' },
}
