/**
 * Small line icons, feather-style. currentColor throughout so they inherit
 * whatever text color they sit in — no separate icon palette to maintain.
 */

const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }

export function IconThermometer(props) {
  return (
    <svg {...base} {...props}>
      <path d="M14 14.76V3.5a2 2 0 0 0-4 0v11.26a4 4 0 1 0 4 0Z" />
    </svg>
  )
}

export function IconWind(props) {
  return (
    <svg {...base} {...props}>
      <path d="M9.5 4.5a2 2 0 1 1 1.9 2.7H2" />
      <path d="M17.5 8a2.5 2.5 0 1 1 2.4 3.3H2" />
      <path d="M12 19.5a2 2 0 1 0 1.9-2.7H2" />
    </svg>
  )
}

export function IconGauge(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 15a8 8 0 1 1 16 0" />
      <path d="M12 15V9M12 15l3.5-4.2" />
      <path d="M4 15h1M19 15h1" />
    </svg>
  )
}

export function IconDroplet(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 2.7s6.5 7 6.5 11.3a6.5 6.5 0 0 1-13 0C5.5 9.7 12 2.7 12 2.7Z" />
    </svg>
  )
}

/** Slowly spinning rays + a soft pulsing disc, warm gold — only used for
 * clear/sunny conditions via WeatherIcon. */
export function IconSun({ className = '', ...rest }) {
  return (
    <svg {...base} {...rest} className={`icon-sun ${className}`}>
      <circle className="sun-disc" cx="12" cy="12" r="4.2" />
      <g className="sun-rays">
        <path d="M12 2.5v2.4M12 19.1v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7" />
      </g>
    </svg>
  )
}

export function IconMoon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z" />
    </svg>
  )
}

export function IconCloud(props) {
  return (
    <svg {...base} {...props}>
      <path d="M7.5 18.5a4.5 4.5 0 0 1-.5-8.97A5.5 5.5 0 0 1 17.6 8.1 4 4 0 0 1 17 16h-.1" />
      <path d="M7.5 18.5H17" />
    </svg>
  )
}

/** Small sun peeking above the cloud, gold — partly cloudy only. */
export function IconCloudSun({ className = '', ...rest }) {
  return (
    <svg {...base} {...rest} className={`icon-cloud-sun ${className}`}>
      <g className="cs-sun">
        <circle cx="8" cy="7.5" r="2.6" />
        <path d="M8 2.3v1.4M8 11.6v.6M3.3 7.5h1M12.7 6.9h.9M4.5 4l.7.7M11 3.6l-.7.8" />
      </g>
      <path d="M9 18.5a4.5 4.5 0 0 1-.5-8.9 5.5 5.5 0 0 1 9.9 3.2A4 4 0 0 1 18 18.5h-.1" />
      <path d="M9 18.5h9" />
    </svg>
  )
}

/** Cloud + heavier, faster rain lines than drizzle, deeper blue. */
export function IconCloudRain({ className = '', ...rest }) {
  return (
    <svg {...base} {...rest} className={`icon-rain ${className}`}>
      <path d="M7.5 16.5a4.5 4.5 0 0 1-.5-8.97A5.5 5.5 0 0 1 17.6 6.1 4 4 0 0 1 17 14h-.1" />
      <path d="M7.5 16.5H17" />
      <line className="rain-drop" x1="8.5" y1="18" x2="7" y2="22.5" />
      <line className="rain-drop rain-drop-2" x1="12" y1="18" x2="10.5" y2="22.5" />
      <line className="rain-drop rain-drop-3" x1="15.5" y1="18" x2="14" y2="22.5" />
    </svg>
  )
}

/** Cloud + drifting snowflakes, near-white. */
export function IconCloudSnow({ className = '', ...rest }) {
  return (
    <svg {...base} {...rest} className={`icon-snow ${className}`}>
      <path d="M7.5 16.5a4.5 4.5 0 0 1-.5-8.97A5.5 5.5 0 0 1 17.6 6.1 4 4 0 0 1 17 14h-.1" />
      <path d="M7.5 16.5H17" />
      <circle className="snow-flake" cx="9" cy="19.5" r="0.9" fill="currentColor" stroke="none" />
      <circle className="snow-flake snow-flake-2" cx="12.5" cy="21" r="0.9" fill="currentColor" stroke="none" />
      <circle className="snow-flake snow-flake-3" cx="16" cy="19.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Drifting horizontal fog bands, muted. */
export function IconFog({ className = '', ...rest }) {
  return (
    <svg {...base} {...rest} className={`icon-fog ${className}`}>
      <path d="M6.5 14.5a4.5 4.5 0 0 1-.4-8.97A5.5 5.5 0 0 1 16.1 4.6 4 4 0 0 1 15.5 12" />
      <line className="fog-band" x1="4" y1="16.5" x2="20" y2="16.5" />
      <line className="fog-band fog-band-2" x1="6" y1="20" x2="18" y2="20" />
    </svg>
  )
}

/** Cloud + falling drops, light blue, only used for drizzle conditions. */
export function IconCloudDrizzle({ className = '', ...rest }) {
  return (
    <svg {...base} {...rest} className={`icon-drizzle ${className}`}>
      <path d="M7.5 18.5a4.5 4.5 0 0 1-.5-8.97A5.5 5.5 0 0 1 17.6 8.1 4 4 0 0 1 17 16h-.1" />
      <path d="M7.5 18.5H17" />
      <line className="drizzle-drop" x1="9" y1="20" x2="8" y2="23" />
      <line className="drizzle-drop drizzle-drop-2" x1="13" y1="20" x2="12" y2="23" />
      <line className="drizzle-drop drizzle-drop-3" x1="17" y1="20" x2="16" y2="23" />
    </svg>
  )
}

/** Cloud + a flashing bolt, amber — used in place of the normal weather
 * icon once modelled lightning risk hits 50% or higher (see Weather.jsx). */
export function IconCloudLightning({ className = '', ...rest }) {
  return (
    <svg {...base} {...rest} className={`icon-cloud-lightning ${className}`}>
      <path d="M7.5 16.5a4.5 4.5 0 0 1-.5-8.97A5.5 5.5 0 0 1 17.6 6.1 4 4 0 0 1 17 14h-.1" />
      <path
        className="cl-bolt"
        d="M12.8 12.5 9.3 17.5h2.7l-1 4 4.2-5.5h-2.6l1.2-3.5Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  )
}

export function IconCloudMoon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M15.2 8.1a5 5 0 0 0-4.6-2.6 5.6 5.6 0 0 0-1 11.1" />
      <path d="M17.5 20.5a4 4 0 0 0 .3-8h-.3a5 5 0 0 0-9 2" />
    </svg>
  )
}

export function IconAlert(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <circle cx="12" cy="16.2" r="0.15" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconCheck(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.3 12.3 2.6 2.6 4.8-5.4" />
    </svg>
  )
}

export function IconBolt(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12.5 2.5 4 13.5h6l-1.5 8L20 10.5h-6.5l-1-8Z" />
    </svg>
  )
}

export function IconExpand(props) {
  return (
    <svg {...base} {...props}>
      <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5" />
    </svg>
  )
}

export function IconCollapse(props) {
  return (
    <svg {...base} {...props}>
      <path d="M9 3v5H4M15 3v5h5M15 21v-5h5M9 21v-5H4" />
    </svg>
  )
}

/** Maps the icon key from lib/forecast.js's iconForCode() to a glyph — every
 * key gets its own distinct icon, not just a shared fallback cloud. */
export function WeatherIcon({ icon, ...rest }) {
  switch (icon) {
    case 'sun': return <IconSun {...rest} />
    case 'moon': return <IconMoon {...rest} />
    case 'cloudSun': return <IconCloudSun {...rest} />
    case 'cloudMoon': return <IconCloudMoon {...rest} />
    case 'storm': return <IconCloudLightning {...rest} />
    case 'drizzle': return <IconCloudDrizzle {...rest} />
    case 'rain': return <IconCloudRain {...rest} />
    case 'snow': return <IconCloudSnow {...rest} />
    case 'fog': return <IconFog {...rest} />
    default:
      return <IconCloud {...rest} />
  }
}
