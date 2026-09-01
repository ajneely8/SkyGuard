/**
 * Radar and satellite tile frames.
 *
 * Source: RainViewer public weather maps API (https://www.rainviewer.com/api.html)
 * — free, keyless, and it publishes both past frames and a short nowcast, which
 * is what makes the "future radar" part of the timeline real rather than
 * decorative.
 *
 * Tiles are composited over an OpenStreetMap base layer by Leaflet; nothing
 * here is proprietary to any commercial weather product.
 */

const MAPS_URL = 'https://api.rainviewer.com/public/weather-maps.json'

/** Colour schemes RainViewer exposes for radar reflectivity. */
export const COLOR_SCHEMES = [
  { id: 2, name: 'Universal Blue' },
  { id: 4, name: 'Rainbow' },
  { id: 6, name: 'NEXRAD-style' },
  { id: 7, name: 'Dark Sky' },
  { id: 8, name: 'Meteored' },
]

/**
 * @returns {{host:string, past:Frame[], nowcast:Frame[], satellite:Frame[], generated:string}}
 * Frame = { time:number(unix s), path:string, kind:'past'|'nowcast', ts:string }
 */
export async function fetchRadarFrames({ timeout = 12000 } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(MAPS_URL, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`Radar source returned ${res.status}`)
    const d = await res.json()
    const map = (arr, kind) =>
      (arr || []).map((f) => ({ ...f, kind, ts: new Date(f.time * 1000).toISOString() }))
    return {
      host: d.host,
      generated: new Date((d.generated || Date.now() / 1000) * 1000).toISOString(),
      past: map(d.radar?.past, 'past'),
      nowcast: map(d.radar?.nowcast, 'nowcast'),
      satellite: map(d.satellite?.infrared, 'past'),
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Deepest zoom RainViewer's free tile cache actually holds radar for. Past this
 * it answers with a "Zoom Level Not Supported" placeholder image instead of a
 * transparent tile, which would render as text across the map — so the tile
 * layer is capped here and Leaflet upscales the z7 tiles for closer views.
 */
export const RADAR_MAX_NATIVE_ZOOM = 7

/** All radar frames oldest → newest, past then nowcast. */
export const allRadarFrames = (data) => (data ? [...data.past, ...data.nowcast] : [])

/** Index of the frame closest to now — the "NOW" position on the timeline. */
export function nowIndex(frames) {
  if (!frames.length) return 0
  const now = Date.now()
  let best = 0
  let bestDelta = Infinity
  frames.forEach((f, i) => {
    const delta = Math.abs(now - f.time * 1000)
    if (delta < bestDelta) {
      bestDelta = delta
      best = i
    }
  })
  return best
}

/**
 * Tile URL template for Leaflet.
 * @param {string} host RainViewer tile host
 * @param {object} frame frame from fetchRadarFrames
 */
export function radarTileUrl(host, frame, { size = 256, color = 2, smooth = 1, snow = 1 } = {}) {
  if (!host || !frame) return null
  return `${host}${frame.path}/${size}/{z}/{x}/{y}/${color}/${smooth}_${snow}.png`
}

/** Infrared satellite tiles use colour scheme 0 and no smoothing flags. */
export function satelliteTileUrl(host, frame, { size = 256 } = {}) {
  if (!host || !frame) return null
  return `${host}${frame.path}/${size}/{z}/{x}/{y}/0/0_0.png`
}

/* ---------- base + overlay layers that need no key ---------- */

/**
 * Base maps that need no API key. CARTO's basemaps are deliberately not used —
 * they now watermark unauthenticated tiles with "API KEY REQUIRED".
 */
export const BASE_LAYERS = {
  // Esri canvas basemaps ship place labels as a separate reference layer, drawn
  // above the radar so town names stay readable through precipitation.
  dark: {
    name: 'Dark',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    labels:
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles © Esri',
    maxZoom: 16,
  },
  light: {
    name: 'Light',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    labels:
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles © Esri',
    maxZoom: 16,
  },
  street: {
    name: 'Street',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  },
  imagery: {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    labels:
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles © Esri, Maxar, Earthstar Geographics',
    maxZoom: 18,
  },
}

/**
 * Overlay layers sourced from the U.S. NWS public map service. These are real
 * published services; nothing is simulated.
 */
export const NWS_WMS = 'https://mapservices.weather.noaa.gov/eventdriven/services/radar/radar_base_reflectivity_time/ImageServer/WMSServer'
