/**
 * Rules — the WBGT table that decides how long you can be outside and what you
 * can wear. Editable, because governing bodies revise these numbers.
 */

import { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { Card, Field, Notice } from '../components/ui.jsx'
import WbgtDrivers from '../components/WbgtDrivers.jsx'
import ZoneSwiper from '../components/ZoneSwiper.jsx'
import { DEFAULT_BANDS, bandRange, timeOutsideLabel, clothingLabel } from '../lib/guidelines.js'
import { DEFAULT_THRESHOLDS } from '../lib/wbgt.js'
import { DISCLAIMER } from '../lib/seed.js'

export default function Rules() {
  const { state, patchSettings, current, selectedLocation, guidelineNow, resetAll } = useStore()
  const bands = state.settings.bands?.length ? state.settings.bands : DEFAULT_BANDS
  const obs = selectedLocation ? current(selectedLocation.id) : null
  const activeBand = guidelineNow(obs?.wbgtF ?? null)

  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState(null)
  const [th, setTh] = useState(state.settings.thresholds)

  const startEdit = (b) => {
    setEditing(b.id)
    setDraft({ ...b })
  }

  const saveBand = () => {
    const minF = draft.minF === '' || draft.minF == null ? null : Number(draft.minF)
    const maxF = draft.maxF === '' || draft.maxF == null ? null : Number(draft.maxF)
    const maxMinutes =
      draft.maxMinutes === '' || draft.maxMinutes == null ? null : Number(draft.maxMinutes)
    if ((minF != null && Number.isNaN(minF)) || (maxF != null && Number.isNaN(maxF))) {
      return alert('WBGT limits must be numbers, or blank for an open end.')
    }
    if (minF != null && maxF != null && maxF <= minF) {
      return alert('The upper limit must be higher than the lower limit.')
    }
    patchSettings({
      bands: bands.map((b) => (b.id === editing ? { ...draft, minF, maxF, maxMinutes } : b)),
    })
    setEditing(null)
    setDraft(null)
  }

  const saveThresholds = () => {
    const vals = {
      elevatedMinF: Number(th.elevatedMinF),
      class2MinF: Number(th.class2MinF),
      class3MinF: Number(th.class3MinF),
      extremeMinF: Number(th.extremeMinF),
    }
    if (Object.values(vals).some((v) => !Number.isFinite(v))) return alert('All thresholds must be numbers.')
    if (!(vals.elevatedMinF < vals.class2MinF && vals.class2MinF < vals.class3MinF && vals.class3MinF <= vals.extremeMinF)) {
      return alert('Thresholds must increase: caution < Class 2 < Class 3+ ≤ Extreme.')
    }
    patchSettings({ thresholds: vals })
  }

  return (
    <div className="stack">
      {activeBand && obs && (
        <div className={`answer a-${activeBand.tone}`} style={{ margin: 0 }}>
          <div className="answer-band">
            RIGHT NOW AT {selectedLocation.name.toUpperCase()} — {activeBand.name.toUpperCase()}
          </div>
          <div className="answer-grid">
            <div>
              <div className="label">WBGT</div>
              <div className="answer-big">{obs.wbgtF.toFixed(1)}°F</div>
            </div>
            <div>
              <div className="label">How long outside</div>
              <div className="answer-big">{timeOutsideLabel(activeBand)}</div>
            </div>
            <div>
              <div className="label">What to wear</div>
              <div className="answer-big">{clothingLabel(activeBand)}</div>
            </div>
            <div>
              <div className="label">Breaks</div>
              <div className="answer-mid">{activeBand.breaks}</div>
            </div>
          </div>
        </div>
      )}

      <WbgtDrivers obs={obs} band={activeBand} />

      <ZoneSwiper bands={bands} currentBandId={activeBand?.id} />

      <Card
        title="WBGT activity rules"
        subtitle="Each band sets the maximum time outside, the break pattern and the equipment allowed"
      >
        <div className="rules-list">
          {bands.map((b) => {
            const isActive = activeBand?.id === b.id
            return (
              <div key={b.id} className={`rule-band tone-${b.tone} ${isActive ? 'active' : ''}`}>
                {editing === b.id ? (
                  <div style={{ width: '100%' }}>
                    <div className="grid grid-2">
                      <Field label="Band name" id={`n-${b.id}`}>
                        <input id={`n-${b.id}`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                      </Field>
                      <Field label="Max minutes outside" id={`m-${b.id}`} hint="Blank = no limit, 0 = no outdoor activity">
                        <input
                          id={`m-${b.id}`}
                          type="number"
                          value={draft.maxMinutes ?? ''}
                          onChange={(e) => setDraft({ ...draft, maxMinutes: e.target.value })}
                        />
                      </Field>
                      <Field label="WBGT from (°F)" id={`lo-${b.id}`} hint="Blank = no lower limit">
                        <input
                          id={`lo-${b.id}`}
                          type="number"
                          step="0.1"
                          value={draft.minF ?? ''}
                          onChange={(e) => setDraft({ ...draft, minF: e.target.value })}
                        />
                      </Field>
                      <Field label="WBGT up to (°F)" id={`hi-${b.id}`} hint="Blank = no upper limit">
                        <input
                          id={`hi-${b.id}`}
                          type="number"
                          step="0.1"
                          value={draft.maxF ?? ''}
                          onChange={(e) => setDraft({ ...draft, maxF: e.target.value })}
                        />
                      </Field>
                    </div>
                    <Field label="Breaks" id={`b-${b.id}`}>
                      <input id={`b-${b.id}`} value={draft.breaks} onChange={(e) => setDraft({ ...draft, breaks: e.target.value })} />
                    </Field>
                    <Field label="Equipment / clothing" id={`e-${b.id}`}>
                      <textarea
                        id={`e-${b.id}`}
                        rows={2}
                        value={draft.equipment}
                        onChange={(e) => setDraft({ ...draft, equipment: e.target.value })}
                      />
                    </Field>
                    <Field label="Conditioning" id={`c-${b.id}`}>
                      <input id={`c-${b.id}`} value={draft.conditioning} onChange={(e) => setDraft({ ...draft, conditioning: e.target.value })} />
                    </Field>
                    <Field label="Note" id={`no-${b.id}`}>
                      <input id={`no-${b.id}`} value={draft.note || ''} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
                    </Field>
                    <div className="row">
                      <button className="btn btn-primary" onClick={saveBand}>Save</button>
                      <button className="btn" onClick={() => { setEditing(null); setDraft(null) }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="rb-range">
                      <div className="rb-wbgt">{bandRange(b)}</div>
                      <div className="rb-name">{b.name}</div>
                      {isActive && <span className="badge badge-blue">Current</span>}
                    </div>
                    <div className="rb-cols">
                      <div>
                        <div className="label">How long outside</div>
                        <div className="rb-value">{timeOutsideLabel(b)}</div>
                      </div>
                      <div>
                        <div className="label">Breaks</div>
                        <div className="rb-text">{b.breaks}</div>
                      </div>
                      <div>
                        <div className="label">Equipment / clothing</div>
                        <div className="rb-text">{b.equipment}</div>
                      </div>
                      <div>
                        <div className="label">Conditioning</div>
                        <div className="rb-text">{b.conditioning}</div>
                      </div>
                    </div>
                    {b.note && <div className="rb-note">{b.note}</div>}
                    <button className="btn btn-sm" onClick={() => startEdit(b)}>Edit this band</button>
                  </>
                )}
              </div>
            )
          })}
        </div>

        <div className="row" style={{ marginTop: 16 }}>
          <button
            className="btn btn-sm"
            onClick={() => {
              if (confirm('Replace all bands with the shipped defaults?')) patchSettings({ bands: DEFAULT_BANDS })
            }}
          >
            Restore default rules
          </button>
        </div>

        <Notice kind="warn" title="Confirm these against your governing body">
          These bands are the widely used WBGT activity table. Your state association may publish different numbers, and
          they change. Edit each band above so the app matches the rules you are actually held to.
        </Notice>
      </Card>

      <Card title="Class labels" subtitle="Optional — for schools that use the Class 2 / Class 3+ language">
        <div className="grid grid-4">
          <Field label="Caution from (°F)" id="t1">
            <input id="t1" type="number" step="0.1" value={th.elevatedMinF} onChange={(e) => setTh({ ...th, elevatedMinF: e.target.value })} />
          </Field>
          <Field label="Class 2 from (°F)" id="t2">
            <input id="t2" type="number" step="0.1" value={th.class2MinF} onChange={(e) => setTh({ ...th, class2MinF: e.target.value })} />
          </Field>
          <Field label="Class 3+ from (°F)" id="t3">
            <input id="t3" type="number" step="0.1" value={th.class3MinF} onChange={(e) => setTh({ ...th, class3MinF: e.target.value })} />
          </Field>
          <Field label="Extreme from (°F)" id="t4">
            <input id="t4" type="number" step="0.1" value={th.extremeMinF} onChange={(e) => setTh({ ...th, extremeMinF: e.target.value })} />
          </Field>
        </div>
        <div className="row">
          <button className="btn btn-primary" onClick={saveThresholds}>Save labels</button>
          <button className="btn" onClick={() => setTh(DEFAULT_THRESHOLDS)}>Reset</button>
        </div>
      </Card>

      <Card title="Monitoring">
        <div className="grid grid-2">
          <Field label="Check every (minutes)" id="m1">
            <input
              id="m1"
              type="number"
              min="5"
              max="120"
              value={state.settings.monitoringIntervalMin}
              onChange={(e) => patchSettings({ monitoringIntervalMin: Number(e.target.value) })}
            />
          </Field>
          <Field label="Check before practice (minutes)" id="m2">
            <input
              id="m2"
              type="number"
              min="1"
              max="60"
              value={state.settings.preCheckMin}
              onChange={(e) => patchSettings({ preCheckMin: Number(e.target.value) })}
            />
          </Field>
        </div>
        <button
          className="btn btn-danger btn-sm"
          onClick={() => {
            if (confirm('Erase all locations, readings and practices from this browser?')) resetAll()
          }}
        >
          Reset all app data
        </button>
      </Card>

      <div className="small muted">{DISCLAIMER}</div>
    </div>
  )
}
