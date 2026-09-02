/**
 * Rules — the WBGT table that decides how long you can be outside and what you
 * can wear.
 */

import { useStore } from '../lib/store.jsx'
import { Card, Notice } from '../components/ui.jsx'
import { DEFAULT_BANDS, bandRange, timeOutsideLabel } from '../lib/guidelines.js'

export default function Rules() {
  const { state, patchSettings, guidelineNow, current, selectedLocation } = useStore()
  const bands = state.settings.bands?.length ? state.settings.bands : DEFAULT_BANDS
  const obs = selectedLocation ? current(selectedLocation.id) : null
  const activeBand = guidelineNow(obs?.wbgtF ?? null)

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
          they change.
        </Notice>
      </Card>
    </div>
  )
}
