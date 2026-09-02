/**
 * The field, its lightning-warning radius, and the two numbers that matter
 * most, overlaid directly on the map. Static — no animation, no scrubbing;
 * that is what the Live radar card lower on the page is for.
 */

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useStore } from '../lib/store.jsx'
import { BASE_LAYERS } from '../lib/radar.js'
import { IconCheck, IconAlert } from './Icons.jsx'

const MILES_TO_M = 1609.34
const TONE_VAR = {
  green: '#4aa87b',
  yellow: '#d1a33c',
  orange: '#dd8146',
  red: '#dd5f6c',
  darkred: '#f8fafc',
}

export default function LocationHeroMap({ height = 260 }) {
  const { selectedLocation, current, guidelineNow, strikeStatusFor } = useStore()
  const mapEl = useRef(null)
  const map = useRef(null)
  const circle = useRef(null)
  const marker = useRef(null)

  const loc = selectedLocation
  const obs = loc ? current(loc.id) : null
  const band = guidelineNow(obs?.wbgtF ?? null)
  const status = loc ? strikeStatusFor(loc.id) : null
  const tone = status ? status.level.tone : 'green'
  const radiusMiles = status ? status.rules.warningMiles : 10
  const strokeColor = TONE_VAR[tone] || TONE_VAR.green

  /* ---- bootstrap once ---- */
  useEffect(() => {
    if (!mapEl.current || map.current || !loc) return
    map.current = L.map(mapEl.current, {
      center: [loc.lat, loc.lon],
      zoom: 11,
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      keyboard: false,
      attributionControl: false,
    })
    L.control.attribution({ prefix: false }).addTo(map.current)
    const cfg = BASE_LAYERS.street
    L.tileLayer(cfg.url, { attribution: cfg.attribution, maxZoom: cfg.maxZoom, className: 'base-dark' }).addTo(
      map.current,
    )
    circle.current = L.circle([loc.lat, loc.lon], {
      radius: radiusMiles * MILES_TO_M,
      color: strokeColor,
      weight: 2,
      fillColor: strokeColor,
      fillOpacity: 0.06,
    }).addTo(map.current)
    marker.current = L.marker([loc.lat, loc.lon], {
      icon: L.divIcon({ className: 'hero-pin-wrap', html: '<span class="hero-pin"></span>', iconSize: [16, 16], iconAnchor: [8, 8] }),
    }).addTo(map.current)
    return () => {
      map.current?.remove()
      map.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc?.id])

  /* ---- recentre + resize when the field or panel size changes ---- */
  useEffect(() => {
    if (!map.current || !loc) return
    map.current.setView([loc.lat, loc.lon], 11)
    const t = setTimeout(() => map.current?.invalidateSize(), 60)
    return () => clearTimeout(t)
  }, [loc?.id, loc?.lat, loc?.lon])

  /* ---- radius + colour track the current lightning status ---- */
  useEffect(() => {
    if (!circle.current || !loc) return
    circle.current.setLatLng([loc.lat, loc.lon])
    circle.current.setRadius(radiusMiles * MILES_TO_M)
    circle.current.setStyle({ color: strokeColor, fillColor: strokeColor })
  }, [loc?.lat, loc?.lon, radiusMiles, strokeColor])

  if (!loc) return null

  return (
    <div className="hero-map-wrap" style={{ height }}>
      <div ref={mapEl} className="hero-map" style={{ height }} />

      {obs && (
        <div className="hero-map-scrim">
          <div className="hero-map-wbgt">
            <span className="hero-map-wbgt-value">{obs.wbgtF.toFixed(1)}°</span>
            <span className="hero-map-wbgt-label">WBGT</span>
          </div>

          {status && (
            <div className={`hero-map-status tone-${tone}`}>
              {tone === 'green' ? <IconCheck width={16} height={16} /> : <IconAlert width={16} height={16} />}
              <div>
                <div className="hero-map-status-name">{status.level.label}</div>
                <div className="hero-map-status-radius">0–{radiusMiles} mi</div>
              </div>
            </div>
          )}
        </div>
      )}

      {band && <div className={`hero-map-band tone-${band.tone}`} />}
    </div>
  )
}
