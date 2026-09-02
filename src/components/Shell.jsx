/** App chrome. Five screens, no icons. */

import { NavLink, Outlet, useLocation, Navigate } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { LogoLockup } from './Logo.jsx'
import { roleLabel } from '../lib/auth.js'

const NAV = [
  { to: '/app', label: 'Home', end: true },
  { to: '/app/locations', label: 'Locations' },
  { to: '/app/practice', label: 'Practice' },
  { to: '/app/rules', label: 'Rules' },
  { to: '/app/lightning', label: 'Lightning' },
]

export default function Shell() {
  const { state, selectedLocation, setSelectedLocation, unackAlerts, signOut } = useStore()
  const loc = useLocation()

  // Auth first, then a location. Both gate the app.
  // The real invariant is "has at least one field" — checking setupComplete
  // alone let the app sit on an empty dashboard after the last one was deleted.
  if (!state.account) return <Navigate to="/signin" replace />
  if (!state.setupComplete || state.locations.length === 0) return <Navigate to="/welcome" replace />

  const title = NAV.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)))?.label || 'Skyguard'

  return (
    <div className="shell">
      <aside className="sidebar">
        <NavLink to="/" className="brand">
          <LogoLockup size={30} sub="Weather & Heat Safety" />
        </NavLink>

        <div className="district-chip">
          <strong>{selectedLocation?.name || 'No location'}</strong>
          <span>
            {state.locations.length} saved
            {unackAlerts.length > 0 && ` · ${unackAlerts.length} alert${unackAlerts.length === 1 ? '' : 's'}`}
          </span>
        </div>

        <nav className="nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="acct">
            <div className="acct-name">{state.account.name}</div>
            <div className="acct-role">{roleLabel(state.account.role)}</div>
          </div>
          <button className="btn btn-sm btn-block" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <h1>{title}</h1>
          <div className="topbar-spacer" />
          <label className="sr-only" htmlFor="locsel">Location</label>
          {state.locations.length === 0 ? (
            <NavLink className="btn btn-sm btn-primary" to="/app/locations">Add a location</NavLink>
          ) : (
            <select
              id="locsel"
              value={selectedLocation?.id || ''}
              onChange={(e) => setSelectedLocation(e.target.value)}
              style={{ maxWidth: 260, minHeight: 38 }}
            >
              {state.locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          )}
        </header>

        <div className="content">
          <Outlet />
        </div>
      </div>

      <nav className="mobile-bar" aria-label="Primary">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
