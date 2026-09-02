/**
 * Distance rings over the radar.
 *
 * Measured through Leaflet's projection and centred on the selected field, so a
 * cell crossing the second ring really is 10 miles out. Thin navy strokes over a
 * plain map — this is a measuring overlay, not a decoration.
 */

import { useEffect, useState } from 'react'
import L from 'leaflet'

const RING_MILES = [5, 10, 20, 40]
const MILES_PER_DEG_LAT = 69.055

// Same three tiers the Lightning page uses for caution / advisory / warning —
// the sweep's color is literally "how close it is", not a fixed alert red.
const TONE_COLOR = { yellow: '#eab308', orange: '#f97316', red: '#ef4444' }

export default function RadarScope({ map, center, strikeTone = null }) {
  const [geom, setGeom] = useState(null)

  useEffect(() => {
    if (!map) return

    const update = () => {
      // Projection throws until Leaflet has positioned its panes. Skip the frame.
      try {
        if (!map._loaded) return
        const size = map.getSize()
        if (!size.x || !size.y) return
        const c = center ? L.latLng(center.lat, center.lon) : map.getCenter()
        const cp = map.latLngToContainerPoint(c)

        const rings = RING_MILES.map((miles) => {
          const north = L.latLng(c.lat + miles / MILES_PER_DEG_LAT, c.lng)
          const p = map.latLngToContainerPoint(north)
          return { miles, r: Math.abs(cp.y - p.y) }
        }).filter((x) => x.r > 16 && x.r < Math.max(size.x, size.y) * 1.5)

        setGeom({ cx: cp.x, cy: cp.y, w: size.x, h: size.y, rings })
      } catch {
        /* map not ready */
      }
    }

    map.whenReady(update)
    map.on('move moveend zoomend resize', update)
    return () => map.off('move moveend zoomend resize', update)
  }, [map, center?.lat, center?.lon])

  if (!geom || !geom.rings.length) return null

  const { cx, cy, w, h, rings } = geom
  const R = rings[rings.length - 1].r

  // 60-degree wedge ending at 0 degrees (pointing right), rotated by CSS.
  const wedge = `M ${cx} ${cy} L ${cx + R * Math.cos(-Math.PI / 3)} ${cy + R * Math.sin(-Math.PI / 3)} A ${R} ${R} 0 0 1 ${cx + R} ${cy} Z`

  // The sweep keeps spinning either way — a strike just recolors it, rather
  // than freezing it in place. Only recolors once the strike is actually
  // within the caution/advisory/warning radii; a distant strike outside
  // those rings still shows as a bolt on the map, but "Clear" status keeps
  // the sweep its plain decorative blue.
  const alert = !!TONE_COLOR[strikeTone]
  const sweepColor = alert ? TONE_COLOR[strikeTone] : '#1c8fd0'
  const sweepStyle = { transformOrigin: `${cx}px ${cy}px` }

  return (
    <svg className="scope" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <defs>
        <radialGradient id="sgSweep" cx={cx} cy={cy} r={R} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={sweepColor} stopOpacity="0.3" />
          <stop offset="0.75" stopColor={sweepColor} stopOpacity="0.11" />
          <stop offset="1" stopColor={sweepColor} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* rotating sweep — always spinning, coloured by lightning proximity
          when there's an active strike */}
      <g className={`scope-sweep ${alert ? 'scope-sweep-alert' : ''}`} style={sweepStyle}>
        <path d={wedge} fill="url(#sgSweep)" />
        <line x1={cx} y1={cy} x2={cx + R} y2={cy} stroke={sweepColor} strokeWidth={alert ? 2 : 1.4} strokeOpacity="0.85" />
      </g>

      {/* range rings */}
      {rings.map((ring) => (
        <g key={ring.miles}>
          <circle
            cx={cx}
            cy={cy}
            r={ring.r}
            fill="none"
            stroke="#1c8fd0"
            strokeWidth="1"
            strokeOpacity="0.55"
            strokeDasharray="3 4"
          />
          <text x={cx + 5} y={cy - ring.r + 12} className="scope-label" fill="#1c8fd0" fillOpacity="0.9">
            {ring.miles} mi
          </text>
        </g>
      ))}

      {/* light crosshair for bearing */}
      <g stroke="#1c8fd0" strokeOpacity="0.3" strokeWidth="1">
        <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} />
        <line x1={cx} y1={cy - R} x2={cx} y2={cy + R} />
      </g>

      {/* centre of the field */}
      <circle cx={cx} cy={cy} r="3.5" fill="#1c8fd0" />
      <circle cx={cx} cy={cy} r="7" fill="none" stroke="#1c8fd0" strokeOpacity="0.45" strokeWidth="1" />
    </svg>
  )
}
