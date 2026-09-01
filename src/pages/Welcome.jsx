/** First-run location permission screen. */

import { useState } from 'react'
import { LogoLockup } from '../components/Logo.jsx'
import { useNavigate, Navigate } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import LocationPicker, { ResolvedLocation } from '../components/LocationPicker.jsx'
import { Field } from '../components/ui.jsx'
import { LOCATION_TYPES, DISCLAIMER } from '../lib/seed.js'

export default function Welcome() {
  const { addLocation, refresh, loadStorms, state } = useStore()
  const navigate = useNavigate()
  const [geo, setGeo] = useState(null)
  const [name, setName] = useState('')
  const [type, setType] = useState('practice')

  // Guard sits below the hooks — an early return above them breaks hook order.
  if (!state.account) return <Navigate to="/signin" replace />

  const save = (e) => {
    e.preventDefault()
    if (!geo) return
    const label = name.trim() || geo.place || geo.city || 'Current Location'
    const created = addLocation({ name: label, type, geo })
    refresh(created.id)
    loadStorms(created.id)
    navigate('/app')
  }

  return (
    <div className="welcome-page">
      <div className="welcome-inner">
        <div className="brand" style={{ padding: 0, border: 0, marginBottom: 30 }}>
          <LogoLockup size={38} />
        </div>

        {!geo ? (
          <>
            <h1 className="welcome-title">Get Weather For Your Exact Location</h1>
            <p className="welcome-sub">
              Allow location access so we can provide the most accurate weather, radar, lightning, WBGT, and outdoor
              safety information for your current location.
            </p>

            <div className="welcome-card">
              <LocationPicker onResolved={setGeo} shareLabel="Share My Location" />
            </div>

            <ul className="welcome-points">
              <li>
                <span>
                  <strong>Coordinates, not city centres.</strong> Weather is requested for your exact latitude and
                  longitude. Two fields on the same campus can sit in different conditions.
                </span>
              </li>
              <li>
                <span>
                  <strong>Your location stays on your device.</strong> It is used to request weather and is never shown
                  to other users.
                </span>
              </li>
              <li>
                <span>
                  <strong>Not standing on the field?</strong> Choose the location manually and add the rest of your
                  fields later.
                </span>
              </li>
            </ul>
          </>
        ) : (
          <>
            <h1 className="welcome-title">Name this location</h1>
            <p className="welcome-sub">
              Save it so you can switch to it instantly, monitor it during practice, and see it on the radar.
            </p>

            <form onSubmit={save} className="welcome-card">
              <ResolvedLocation geo={geo} />

              <div style={{ marginTop: 18 }}>
                <Field label="Location name" id="wname" hint="e.g. High School Stadium, Band Field, Home">
                  <input
                    id="wname"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={geo.place || geo.city || 'Current Location'}
                    autoFocus
                  />
                </Field>
                <Field label="Type" id="wtype">
                  <select id="wtype" value={type} onChange={(e) => setType(e.target.value)}>
                    {LOCATION_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="row" style={{ gap: 10 }}>
                <button className="btn btn-lg btn-primary" type="submit" style={{ flex: 1 }}>
                  Save and show weather
                </button>
                <button className="btn btn-lg" type="button" onClick={() => setGeo(null)}>
                  Back
                </button>
              </div>
            </form>
          </>
        )}

        <p className="welcome-fine">{DISCLAIMER}</p>
      </div>
    </div>
  )
}
