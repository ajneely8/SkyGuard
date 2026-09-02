/**
 * Locations — the fields you monitor, each with its own coordinates.
 *
 * Weather is requested per coordinate, so a GPS pin taken while standing on the
 * field beats a ZIP code that can sit miles away.
 */

import { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { Card, Field, Empty } from '../components/ui.jsx'
import LocationPicker, { ResolvedLocation } from '../components/LocationPicker.jsx'
import { LOCATION_TYPES } from '../lib/seed.js'
import { shortPlace } from '../lib/geo.js'
import { fmtF } from '../lib/format.js'

export default function SavedLocations() {
  const {
    state,
    addLocation,
    removeLocation,
    renameLocation,
    setSelectedLocation,
    selectedLocation,
    refresh,
    loadStorms,
    current,
    guidelineNow,
  } = useStore()

  const [geo, setGeo] = useState(null)
  const [name, setName] = useState('')
  const [type, setType] = useState('practice')
  const [editing, setEditing] = useState(null)
  const [draftName, setDraftName] = useState('')

  const save = (e) => {
    e.preventDefault()
    if (!geo) return
    const created = addLocation({
      name: name.trim() || geo.place || geo.city || 'New location',
      type,
      geo,
      select: false,
    })
    refresh(created.id)
    loadStorms(created.id)
    setGeo(null)
    setName('')
  }

  return (
    <div className="stack">
      <div className="grid grid-main">
        <Card className="card-bare" title="My locations" subtitle={`${state.locations.length} saved`}>
          {state.locations.length === 0 ? (
            <Empty>No locations yet. Add one on the right.</Empty>
          ) : (
            <div className="stack-sm">
              {state.locations.map((l) => {
                const obs = current(l.id)
                const band = guidelineNow(obs?.wbgtF ?? null)
                const t = LOCATION_TYPES.find((x) => x.id === l.type)
                const active = selectedLocation?.id === l.id
                return (
                  <div key={l.id} className={`loc-card ${active ? 'active' : ''}`}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {editing === l.id ? (
                        <div className="row" style={{ gap: 8 }}>
                          <input
                            value={draftName}
                            onChange={(e) => setDraftName(e.target.value)}
                            style={{ maxWidth: 220 }}
                            autoFocus
                          />
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => {
                              renameLocation(l.id, { name: draftName.trim() || l.name })
                              setEditing(null)
                            }}
                          >
                            Save
                          </button>
                          <button className="btn btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                        </div>
                      ) : (
                        <div style={{ fontWeight: 700 }}>
                          {l.name} <span className="badge badge-neutral">{t?.label || l.type}</span>
                          {active && <span className="badge badge-blue" style={{ marginLeft: 6 }}>Selected</span>}
                        </div>
                      )}
                      <div className="small muted">
                        {shortPlace(l) || l.address || 'Saved location'} ·{' '}
                        <span className="mono">{l.lat.toFixed(5)}, {l.lon.toFixed(5)}</span>
                      </div>
                      <div className="small muted">
                        Pinned by {l.source}
                        {l.accuracy != null && ` · ±${Math.round(l.accuracy)} m`}
                        {l.elevationFt != null && ` · ${Math.round(l.elevationFt)} ft`}
                      </div>
                    </div>

                    <div className="loc-wbgt">
                      <div className="label" style={{ marginBottom: 0 }}>WBGT</div>
                      <div
                        className={`tabnum ${band && obs ? `tone-${band.tone}` : ''}`}
                        style={{ fontWeight: 800, fontSize: 18 }}
                      >
                        {obs ? fmtF(obs.wbgtF) : '—'}
                      </div>
                      {band && obs && <span className={`badge badge-${band.tone}`}>{band.name}</span>}
                    </div>

                    <div className="row" style={{ gap: 6 }}>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => {
                          setSelectedLocation(l.id)
                          refresh(l.id)
                          loadStorms(l.id)
                        }}
                      >
                        Switch
                      </button>
                      <button
                        className="btn btn-sm"
                        onClick={() => {
                          setEditing(l.id)
                          setDraftName(l.name)
                        }}
                      >
                        Rename
                      </button>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => {
                          if (confirm(`Delete ${l.name}?`)) removeLocation(l.id)
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <div className="stack">
          <Card
            className="card-bare"
            title="Add a location"
            subtitle="Standing on the field? GPS pins it to metres. A ZIP centroid can be miles away."
          >
            {!geo ? (
              <LocationPicker onResolved={setGeo} shareLabel="Use my current location" />
            ) : (
              <form onSubmit={save}>
                <ResolvedLocation geo={geo} />
                <div style={{ marginTop: 16 }}>
                  <Field label="Name" id="nlname">
                    <input
                      id="nlname"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={geo.place || geo.city || 'e.g. Football Stadium'}
                      autoFocus
                    />
                  </Field>
                  <Field label="Type" id="nltype">
                    <select id="nltype" value={type} onChange={(e) => setType(e.target.value)}>
                      {LOCATION_TYPES.map((t) => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="row">
                  <button className="btn btn-primary" type="submit" style={{ flex: 1 }}>
                    Save location
                  </button>
                  <button className="btn" type="button" onClick={() => setGeo(null)}>Back</button>
                </div>
              </form>
            )}
          </Card>

          <Card className="card-bare" title="Privacy">
            <ul className="small" style={{ lineHeight: 1.7, paddingLeft: 18, margin: 0 }}>
              <li>Coordinates stay in this browser and are used only to request weather.</li>
              <li>Your location is never shown to anyone else.</li>
              <li>Delete a location above to remove its coordinates.</li>
              <li>You can turn location off in your browser at any time and pick places manually.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}
