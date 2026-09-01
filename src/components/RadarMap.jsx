/**
 * Live radar. Runs itself.
 *
 * No play/pause: the loop animates continuously and re-fetches frames on its
 * own. Two things keep it from flickering:
 *
 *  1. Every frame's tile layer is created and loaded up front. The loop does not
 *     start until all of them report `load`, so a frame is never shown while its
 *     tiles are still arriving.
 *  2. The step timer lives outside the React state updater. Scheduling inside an
 *     updater made it fire twice under StrictMode, which is what made the
 *     playback stutter and jump.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useStore } from '../lib/store.jsx'
import {
  fetchRadarFrames,
  allRadarFrames,
  nowIndex,
  radarTileUrl,
  BASE_LAYERS,
  RADAR_MAX_NATIVE_ZOOM,
} from '../lib/radar.js'
import { fmtTimeIn, zoneLabel } from '../lib/format.js'
import RadarScope from './RadarScope.jsx'

const FRAME_MS = 520
const HOLD_MS = 1500
const REFRESH_MS = 4 * 60000
const RADAR_OPACITY = 0.82

export default function RadarMap({ height = 440 }) {
  const { state, selectedLocation, setSelectedLocation, current, classifyNow, guidelineNow } = useStore()

  const mapEl = useRef(null)
  const map = useRef(null)
  const frameLayers = useRef(new Map())
  const markerLayer = useRef(null)
  const idxRef = useRef(0)

  const [frames, setFrames] = useState(null)
  const [loadedPaths, setLoadedPaths] = useState(() => new Set())
  const [error, setError] = useState(null)
  const [idx, setIdx] = useState(0)
  const [mapReady, setMapReady] = useState(null)

  const radarFrames = useMemo(() => allRadarFrames(frames), [frames])
  const ready = radarFrames.length > 0 && radarFrames.every((f) => loadedPaths.has(f.path))
  const nowIdx = radarFrames.length ? nowIndex(radarFrames) : 0
  // Until every frame is in, sit on the most recent real observation.
  const shownIdx = ready ? idx : nowIdx
  const activeFrame = radarFrames[shownIdx] || null
  const isFuture = activeFrame?.kind === 'nowcast'

  /* ---- map bootstrap ---- */
  useEffect(() => {
    if (map.current || !mapEl.current) return
    const start = selectedLocation ? [selectedLocation.lat, selectedLocation.lon] : [39.5, -98.35]
    map.current = L.map(mapEl.current, {
      center: start,
      zoom: selectedLocation ? 9 : 4,
      zoomControl: true,
      preferCanvas: true,
      // Leaflet's per-tile fade makes the frame swap flash. Turn it off.
      fadeAnimation: false,
      // Leaflet's default attribution prefix embeds a Ukrainian flag graphic.
      attributionControl: false,
    })
    L.control.attribution({ prefix: false }).addTo(map.current)

    const cfg = BASE_LAYERS.street
    L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom,
      zIndex: 100,
      className: 'base-dark',
    }).addTo(map.current)

    markerLayer.current = L.layerGroup().addTo(map.current)
    setMapReady(map.current)
    return () => {
      map.current?.remove()
      map.current = null
      setMapReady(null)
      frameLayers.current.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---- recentre on the selected field ---- */
  useEffect(() => {
    if (!map.current || !selectedLocation) return
    map.current.setView([selectedLocation.lat, selectedLocation.lon], Math.max(map.current.getZoom(), 9))
  }, [selectedLocation?.id, selectedLocation?.lat, selectedLocation?.lon])

  /* ---- frame list, refreshed on its own ---- */
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const data = await fetchRadarFrames()
        if (!alive) return
        setFrames(data)
        setError(null)
      } catch (e) {
        if (alive) setError(e.message || 'Radar unavailable')
      }
    }
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  /* ---- build every frame's layer up front, and track when it has loaded ---- */
  useEffect(() => {
    if (!map.current || !frames || !radarFrames.length) return

    radarFrames.forEach((f) => {
      if (frameLayers.current.has(f.path)) return
      const url = radarTileUrl(frames.host, f, { color: 4 })
      if (!url) return
      const layer = L.tileLayer(url, {
        opacity: 0,
        zIndex: 300,
        maxZoom: 19,
        maxNativeZoom: RADAR_MAX_NATIVE_ZOOM,
        updateWhenIdle: false,
        keepBuffer: 2,
      })
      const done = () => setLoadedPaths((s) => (s.has(f.path) ? s : new Set(s).add(f.path)))
      layer.on('load', done)
      // A frame with nothing to draw never fires `load`; don't wait forever.
      const bail = setTimeout(done, 12000)
      layer.on('load', () => clearTimeout(bail))
      layer.addTo(map.current)
      frameLayers.current.set(f.path, layer)
    })

    // Drop layers for frames that have rolled off the provider's list.
    const live = new Set(radarFrames.map((f) => f.path))
    frameLayers.current.forEach((layer, path) => {
      if (!live.has(path)) {
        map.current.removeLayer(layer)
        frameLayers.current.delete(path)
        setLoadedPaths((s) => {
          if (!s.has(path)) return s
          const next = new Set(s)
          next.delete(path)
          return next
        })
      }
    })
  }, [frames, radarFrames])

  /* ---- paint exactly one frame ---- */
  useEffect(() => {
    if (!activeFrame) return
    frameLayers.current.forEach((layer, path) => {
      layer.setOpacity(path === activeFrame.path ? RADAR_OPACITY : 0)
    })
  }, [activeFrame])

  /* ---- the loop. Timer lives here, not inside a state updater. ---- */
  useEffect(() => {
    if (!ready) return
    const count = radarFrames.length
    idxRef.current = nowIdx
    setIdx(nowIdx)
    let timer
    const step = () => {
      const next = (idxRef.current + 1) % count
      idxRef.current = next
      setIdx(next)
      // Hold a beat on the newest frame so the loop reads as a loop.
      timer = setTimeout(step, next === count - 1 ? HOLD_MS : FRAME_MS)
    }
    timer = setTimeout(step, FRAME_MS)
    return () => clearTimeout(timer)
  }, [ready, radarFrames.length, nowIdx])

  /* ---- field markers ---- */
  const markerKey = state.locations
    .map((l) => `${l.id}:${current(l.id)?.wbgtF?.toFixed(1) ?? '-'}`)
    .join('|')

  useEffect(() => {
    if (!map.current || !markerLayer.current) return
    markerLayer.current.clearLayers()
    state.locations.forEach((l) => {
      const obs = current(l.id)
      const cls = classifyNow(obs?.wbgtF ?? null)
      const band = guidelineNow(obs?.wbgtF ?? null)
      const tone = band?.tone || cls.status || 'none'
      const html = `<div class="mk mk-${tone} ${l.id === selectedLocation?.id ? 'mk-active' : ''}">
          <span class="mk-dot"></span>
          <span class="mk-name">${escapeHtml(l.name)}</span>
          ${obs ? `<span class="mk-wbgt s-${tone}">${obs.wbgtF.toFixed(1)}°</span>` : ''}
        </div>`
      L.marker([l.lat, l.lon], {
        icon: L.divIcon({ className: 'mk-wrap', html, iconSize: null, iconAnchor: [10, 10] }),
        title: l.name,
      })
        .on('click', () => setSelectedLocation(l.id))
        .addTo(markerLayer.current)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerKey, selectedLocation?.id])

  const progress = radarFrames.length ? ((shownIdx + 1) / radarFrames.length) * 100 : 0
  const tz = selectedLocation?.timezone || null
  const zone = zoneLabel(tz)

  return (
    <div className="radar-wrap">
      <div ref={mapEl} className="radar-map" style={{ height }} />
      <RadarScope map={mapReady} center={selectedLocation} />

      <div className="radar-bar">
        <span className="radar-status">
          <span className="pulse" />
          {ready ? 'Live' : 'Syncing'}
        </span>

        <div className="tl">
          <div className="tl-track">
            <div className="tl-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="tl-marks">
            {radarFrames.map((f, i) => (
              <span
                key={f.path}
                className={`tl-mark ${i === shownIdx ? 'on' : f.kind === 'nowcast' ? 'future' : 'past'}`}
              />
            ))}
          </div>
        </div>

        <div className="radar-time">
          {/* Frame times are shown in the field's own time zone, so a coach in a
              different zone still reads the sideline clock. */}
          <span className="rt-clock">{activeFrame ? fmtTimeIn(activeFrame.ts, tz) : '--:--'}</span>
          <span className={`rt-kind ${isFuture ? 'future' : ''}`}>
            {isFuture ? 'FORECAST' : shownIdx === nowIdx ? 'NOW' : 'PAST'}
            {zone ? ` · ${zone}` : ''}
          </span>
        </div>
      </div>

      {error && <div className="radar-err">Radar unavailable: {error}</div>}
    </div>
  )
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
