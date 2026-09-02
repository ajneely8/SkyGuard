/**
 * Rules — the WBGT table that decides how long you can be outside and what you
 * can wear. Editable, because governing bodies revise these numbers.
 */

import { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { Card, Field, Notice } from '../components/ui.jsx'
import { DEFAULT_BANDS, bandRange, timeOutsideLabel } from '../lib/guidelines.js'

export default function Rules() {
  const { state, patchSettings, guidelineNow, current, selectedLocation } = useStore()
  const bands = state.settings.bands?.length ? state.settings.bands : DEFAULT_BANDS
  const obs = selectedLocation ? current(selectedLocation.id) : null
  const activeBand = guidelineNow(obs?.wbgtF ?? null)

  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState(null)

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

  return (
    <div className="stack">
      <Card
        className="card-bare"
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
    </div>
  )
}
