/**
 * Location capture: device GPS first, manual search second.
 *
 * Two rules this component exists to enforce:
 *  - Never claim GPS precision the device did not give us. The accuracy radius
 *    comes back with every fix and drives the "Precise" vs "Approximate" label.
 *  - Never dead-end on a denied permission. Denial always leaves the manual
 *    path open and shows how to re-enable.
 */

import { useEffect, useState } from 'react'
import {
  getPosition,
  locationPermissionState,
  watchPermission,
  describeCoordinate,
  geolocationSupported,
  permissionMessage,
  shortPlace,
} from '../lib/geo.js'
import { searchPlaces } from '../lib/weather.js'
import { Field, Notice } from './ui.jsx'

export default function LocationPicker({
  onResolved,
  shareLabel = 'Share My Location',
  showManualFirst = false,
  autoPrompt = false,
}) {
  const [perm, setPerm] = useState('unknown')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [manual, setManual] = useState(showManualFirst)
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchMsg, setSearchMsg] = useState('')

  useEffect(() => {
    let alive = true
    locationPermissionState().then((s) => alive && setPerm(s))
    let unwatch = () => {}
    watchPermission((s) => {
      if (!alive) return
      setPerm(s)
      // If the user allows location in browser settings while the app is open,
      // recover immediately instead of making them find the button again.
      if (s === 'granted') share()
    }).then((fn) => (unwatch = fn))
    return () => {
      alive = false
      unwatch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (autoPrompt && perm === 'granted') share()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrompt, perm])

  const share = async () => {
    setBusy(true)
    setError(null)
    try {
      const pos = await getPosition()
      const described = await describeCoordinate(pos.lat, pos.lon, {
        accuracy: pos.accuracy,
        source: 'device GPS',
      })
      setPerm('granted')
      onResolved?.(described)
    } catch (e) {
      setError({ kind: e.kind || 'unknown', message: e.message || permissionMessage('unknown') })
      if (e.kind === 'denied') {
        setPerm('denied')
        setManual(true)
      }
    } finally {
      setBusy(false)
    }
  }

  const doSearch = async (e) => {
    e?.preventDefault()
    if (!q.trim()) return
    setSearching(true)
    setSearchMsg('')
    try {
      const r = await searchPlaces(q)
      setResults(r)
      if (!r.length) setSearchMsg('No match. Try a full street address, a city and state, or a ZIP code.')
    } catch (err) {
      setSearchMsg(err.message || 'Search failed.')
    } finally {
      setSearching(false)
    }
  }

  const pick = async (r) => {
    setBusy(true)
    const described = await describeCoordinate(r.lat, r.lon, { accuracy: null, source: 'address search' })
    setBusy(false)
    setResults([])
    onResolved?.(described)
  }

  const unsupported = !geolocationSupported()

  return (
    <div className="stack-sm">
      {!unsupported && (
        <button type="button" className="btn btn-lg btn-block btn-primary" onClick={share} disabled={busy}>
          {busy ? 'Getting your location…' : shareLabel}
        </button>
      )}

      {perm === 'prompt' && !error && (
        <div className="small muted">
          Your browser will ask for permission. Choose <strong>Allow</strong> — Skyguard uses the coordinates only
          to request weather and is never shown to other users.
        </div>
      )}

      {error && error.kind === 'denied' && (
        <Notice kind="warn" title="Location access is currently turned off.">
          <div className="row" style={{ margin: '10px 0' }}>
            <button type="button" className="btn btn-sm" onClick={share}>
              Enable Location
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setManual(true)}>
              Choose Location Manually
            </button>
          </div>
          To enable: open the icon at the left of the address bar (a lock, sliders, or a crossed-out location pin), set
          <em> Location</em> to <em>Allow</em>, then press Enable Location. On iPhone also check Settings → Privacy &amp;
          Security → Location Services. The app keeps working with a manually chosen location in the meantime.
        </Notice>
      )}

      {error && error.kind !== 'denied' && (
        <Notice kind="info" title="Could not get your location">
          {error.message} You can choose a location manually below.
        </Notice>
      )}

      {unsupported && (
        <Notice kind="info" title="Device location unavailable">
          This browser cannot share location, or the page is not served over HTTPS. Choose a location manually.
        </Notice>
      )}

      {perm === 'granted' && !error && (
        <div className="perm-row">
          <span className="perm-dot on" />
          Location access is on for this site.
        </div>
      )}
      {perm === 'denied' && !error && (
        <div className="perm-row">
          <span className="perm-dot off" />
          Location access is off.{' '}
          <button type="button" className="linkish" onClick={share}>
            Turn it on
          </button>
        </div>
      )}

      {!manual && !unsupported ? (
        <button type="button" className="btn btn-block" onClick={() => setManual(true)}>
          Enter the school address instead
        </button>
      ) : (
        <div>
          <div className="or-divider">
            <span>enter the school address</span>
          </div>
          <form onSubmit={doSearch} className="row" style={{ alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 170 }}>
              <Field
                label="School name or street address"
                id="locpickq"
                hint="Street address is the most accurate. A ZIP alone can be miles from the field."
              >
                <input
                  id="locpickq"
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="1200 Green Valley Rd, Cibolo TX"
                />
              </Field>
            </div>
            <div className="field">
              <button className="btn btn-primary" type="submit" disabled={searching}>
                {searching ? 'Searching…' : 'Find'}
              </button>
            </div>
          </form>
          {searchMsg && <div className="small" style={{ color: 'var(--red)' }}>{searchMsg}</div>}
          {results.length > 0 && (
            <div className="stack-sm" style={{ marginTop: 8 }}>
              {results.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  className="item-row"
                  style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }}
                  onClick={() => pick(r)}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 600, display: 'block' }}>{r.label}</span>
                    <span className="small muted">
                      {r.lat.toFixed(4)}, {r.lon.toFixed(4)} · {r.source}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Compact readout of a resolved location, used after a fix is captured. */
export function ResolvedLocation({ geo }) {
  if (!geo) return null
  return (
    <div className="resolved-loc">
      <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{geo.place || geo.city || 'Selected location'}</div>
          <div className="small muted">{shortPlace(geo) || geo.displayName}</div>
        </div>
      </div>
      <div className="coord-block mono">
        {Math.abs(geo.lat).toFixed(6)}° {geo.lat >= 0 ? 'N' : 'S'}
        <br />
        {Math.abs(geo.lon).toFixed(6)}° {geo.lon >= 0 ? 'E' : 'W'}
      </div>
      <div className="row small" style={{ gap: 10 }}>
        <span className={`badge badge-${geo.precise ? 'green' : 'yellow'}`}>
          {geo.precise ? 'Precise location' : 'Approximate location detected'}
        </span>
        {geo.accuracy != null && <span className="muted">±{Math.round(geo.accuracy)} m</span>}
        {geo.elevationFt != null && <span className="muted">{Math.round(geo.elevationFt)} ft elevation</span>}
        {geo.timezone && <span className="muted">{geo.timezone}</span>}
      </div>
    </div>
  )
}
