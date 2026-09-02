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

export function IconSun(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.4M12 19.1v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7" />
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

/** Maps the icon key from lib/forecast.js's iconForCode() to a glyph. */
export function WeatherIcon({ icon, ...rest }) {
  switch (icon) {
    case 'sun': return <IconSun {...rest} />
    case 'moon': return <IconMoon {...rest} />
    case 'cloudSun': return <IconCloud {...rest} />
    case 'cloudMoon': return <IconCloudMoon {...rest} />
    case 'storm': return <IconBolt {...rest} />
    case 'rain':
    case 'drizzle':
    case 'snow':
    case 'fog':
    default:
      return <IconCloud {...rest} />
  }
}
