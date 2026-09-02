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
import { IconCheck, IconAlert, IconExpand, IconCollapse } from './Icons.jsx'

const FRAME_MS = 520
const HOLD_MS = 1500
const REFRESH_MS = 4 * 60000
const RADAR_OPACITY = 0.82

export default function RadarMap({ height = 440 }) {
  const {
    state,
    selectedLocation,
    setSelectedLocation,
    current,
    classifyNow,
    guidelineNow,
    strikesFor,
    strikeStatusFor,
    now,
  } = useStore()

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
  const strikeLayer = useRef(null)

  /* ---- fullscreen ---- */
  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    if (!fullscreen) return
    // Stop the page behind from scrolling while the map covers the screen.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => e.key === 'Escape' && setFullscreen(false)
    window.addEventListener('keydown', onKey)
    // The frame just resized (CSS takes over its height); Leaflet needs to
    // recompute its internal size once the layout has actually settled.
    const t1 = setTimeout(() => map.current?.invalidateSize(), 0)
    const t2 = setTimeout(() => map.current?.invalidateSize(), 260)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
      clearTimeout(t1)
      clearTimeout(t2)
      setTimeout(() => map.current?.invalidateSize(), 0)
    }
  }, [fullscreen])

  /* ---- the map's height scales with its own width, left to right, instead
     of sitting at one fixed number regardless of how wide the card is. ---- */
  const heightFromWidth = (w) => Math.round(Math.max(170, Math.min(600, w * 0.46)))
  const [mapHeight, setMapHeight] = useState(height)
  useEffect(() => {
    if (!mapEl.current) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width
      if (!w) return
      const next = heightFromWidth(w)
      setMapHeight((h) => (h === next ? h : next))
    })
    ro.observe(mapEl.current)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height])
  useEffect(() => {
    map.current?.invalidateSize()
  }, [mapHeight])

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
    // Top-right, not bottom-right — the bottom of the map is where the
    // WBGT/lightning overlay sits, and the two were colliding on a phone.
    L.control.attribution({ prefix: false, position: 'topright' }).addTo(map.current)

    const cfg = BASE_LAYERS.street
    L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom,
      zIndex: 100,
      className: 'base-dark',
    }).addTo(map.current)

    markerLayer.current = L.layerGroup().addTo(map.current)
    strikeLayer.current = L.layerGroup().addTo(map.current)
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

  /* ---- lightning strikes ---- */
  const strikes = selectedLocation ? strikesFor(selectedLocation.id) : []
  // Only redraw when the set changes, not on every clock tick.
  const strikeKey = strikes.map((s) => s.id).join('|')

  useEffect(() => {
    if (!map.current || !strikeLayer.current) return
    strikeLayer.current.clearLayers()

    strikes.forEach((s) => {
      const ageSec = (Date.now() - new Date(s.ts).getTime()) / 1000
      const ageMin = ageSec / 60
      // Fresh strikes flash and pulse a ring so the eye finds them immediately;
      // older ones fade to a small, static bolt so the eye tracks the storm.
      const justLanded = ageSec < 45
      const fresh = ageMin < 5
      const opacity = Math.max(0.32, 1 - ageMin / 60)
      const size = justLanded ? 34 : fresh ? 26 : 16
      const boltFill = fresh ? '#ffe08a' : '#e0a23c'

      const html = `<div class="strike-mk ${justLanded ? 'landed' : ''}" style="opacity:${opacity}">
          ${justLanded ? '<span class="strike-ring"></span><span class="strike-ring strike-ring-2"></span>' : ''}
          <svg class="strike-bolt" width="${size}" height="${size}" viewBox="0 0 24 24">
            <path d="M13 2 4 14h7l-2 8 11-13h-7l0-7z" fill="${boltFill}" stroke="#1a1200" stroke-width="1" stroke-linejoin="round"/>
          </svg>
        </div>`

      L.marker([s.lat, s.lon], {
        icon: L.divIcon({ className: 'strike-mk-wrap', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
        zIndexOffset: justLanded ? 1000 : fresh ? 500 : 0,
      })
        .bindPopup(
          `<div class="pop">
             <div class="pop-title">⚡ Lightning strike</div>
             <div class="pop-sub">${escapeHtml(fmtTimeIn(s.ts, selectedLocation?.timezone))} · ${Math.round(ageMin)} min ago</div>
             <table class="pop-tbl">
               <tr><td>Distance</td><td><strong>${s.miles.toFixed(1)} miles</strong></td></tr>
               <tr><td>Direction</td><td>${s.bearing?.compass || '—'} of ${escapeHtml(selectedLocation?.name || '')}</td></tr>
             </table>
             <div class="pop-coord mono">${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}</div>
           </div>`,
        )
        .addTo(strikeLayer.current)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strikeKey, selectedLocation?.id, Math.floor(now / 60000)])

  const tz = selectedLocation?.timezone || null
  const zone = zoneLabel(tz)

  /* WBGT and lightning status for the selected field, overlaid on the map
     the same way the location hero map does. */
  const overlayObs = selectedLocation ? current(selectedLocation.id) : null
  const overlayWbgtBand = guidelineNow(overlayObs?.wbgtF ?? null)
  const overlayWbgtTone = overlayWbgtBand?.tone || classifyNow(overlayObs?.wbgtF ?? null).status
  const overlayStatus = selectedLocation ? strikeStatusFor(selectedLocation.id) : null
  const overlayTone = overlayStatus?.level.tone || 'green'
  const overlayRadiusMiles = overlayStatus?.rules.warningMiles ?? 10
  // The most recent strike's real compass bearing — the scope points at this
  // instead of just spinning once a strike has actually been detected.
  const strikeBearingDeg = overlayStatus?.nearest?.bearing?.degrees ?? null

  return (
    <div className={`radar-wrap ${fullscreen ? 'radar-fullscreen' : ''}`}>
      <div className="radar-map-frame" style={{ height: mapHeight }}>
        <div ref={mapEl} className="radar-map" style={{ height: mapHeight }} />
        <RadarScope map={mapReady} center={selectedLocation} strikeBearingDeg={strikeBearingDeg} />

        <button
          type="button"
          className="radar-fs-btn"
          onClick={() => setFullscreen((v) => !v)}
          aria-label={fullscreen ? 'Exit full screen' : 'View full screen'}
          aria-pressed={fullscreen}
        >
          {fullscreen ? <IconCollapse width={17} height={17} /> : <IconExpand width={17} height={17} />}
        </button>

        {overlayObs && (
          <div className="hero-map-scrim">
            <div className="hero-map-wbgt">
              <span className={`hero-map-wbgt-value tone-${overlayWbgtTone}`}>{overlayObs.wbgtF.toFixed(1)}°</span>
              <span className="hero-map-wbgt-label">WBGT</span>
            </div>

            {overlayStatus && (
              <div className={`hero-map-status tone-${overlayTone}`}>
                {overlayTone === 'green' ? <IconCheck width={20} height={20} /> : <IconAlert width={20} height={20} />}
                <div>
                  <div className="hero-map-status-name">{overlayStatus.level.label}</div>
                  <div className="hero-map-status-radius">0–{overlayRadiusMiles} mi</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="radar-bar">
        <span className="radar-status">
          <span className="pulse" />
          {ready ? 'Live' : 'Syncing'}
        </span>

        <div className="radar-bar-spacer" />

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
