/**
 * Skyguard mark.
 *
 * Vector redraw of the supplied logo — shield silhouette, interlocking S/G
 * monogram, and the arc above the crest — in the logo's own navy with the blue
 * sweep. Redrawn rather than using the source PNG so it stays crisp at 22px and
 * carries no paper background. Original: public/brand/skyguard-logo-source.png.
 */

export default function Logo({ size = 30, className = '', title }) {
  return (
    <svg
      className={`logo ${className}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : 'true'}
      focusable="false"
    >
      {title && <title>{title}</title>}

      {/* arc above the crest */}
      <path
        d="M6 15C14 9.5 22.5 6.8 32 6.8S50 9.5 58 15"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* shield */}
      <path
        d="M32 11c8.6 0 16 2.1 21 4.6 0 17.4-4.6 31.6-21 41.4C15.6 47.2 11 33 11 15.6 16 13.1 23.4 11 32 11Z"
        fill="currentColor"
      />

      {/* blue sweep, upper right of the monogram */}
      <path
        d="M31 19.5c7.6-1 14 .6 18.6 3.4-.35 3.5-.95 6.8-1.85 9.9-3.6-4.6-9.2-7.9-16.75-8.6v-4.7Z"
        fill="#1c8fd0"
      />

      {/* G bowl, knocked out of the shield. The knockout colour follows the
          surface behind the mark — see --logo-knockout in styles.css. */}
      <path
        d="M32 21.5a11.6 11.6 0 1 0 11.6 11.6h-9.9"
        stroke="var(--logo-knockout, #ffffff)"
        strokeWidth="5.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* S sweep interlocking through the bowl */}
      <path
        d="M39.5 25.4c-4.4-2.6-9.6-1.6-11.4 1.9-1.9 3.7 1.1 6.6 4.9 7.6"
        stroke="#1c8fd0"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Wordmark + emblem lockup used in the sidebar, welcome and landing headers. */
export function LogoLockup({ size = 30, sub = 'Weather & Heat Safety' }) {
  return (
    <>
      <Logo size={size} />
      <span>
        <span className="brand-name">SKYGUARD</span>
        <span className="brand-sub">{sub}</span>
      </span>
    </>
  )
}
