/**
 * "Why is the number this?"
 *
 * Splits the current WBGT into what each condition is contributing, and shows
 * what would move it. Every figure is the real model run against a stated
 * reference — see wbgtFactors.js.
 */

import { useState } from 'react'
import { Card } from './ui.jsx'
import { wbgtDrivers, wbgtSensitivities, distanceToBand } from '../lib/wbgtFactors.js'

const sign = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}°F`

export default function WbgtDrivers({ obs, band }) {
  const [open, setOpen] = useState(null)
  if (!obs) return null

  const drivers = wbgtDrivers(obs)
  const sens = wbgtSensitivities(obs)
  const gap = distanceToBand(obs, band)
  if (!drivers) return null

  // Scale the bars against the largest absolute contribution.
  const max = Math.max(...drivers.parts.map((p) => Math.abs(p.delta)), 1)

  return (
    <Card
      title="What is moving this number"
      subtitle="Each figure is the WBGT model re-run with one condition swapped for a reference"
    >
      <div className="drv-list">
        {drivers.parts.map((p) => {
          const pct = (Math.abs(p.delta) / max) * 100
          const up = p.delta >= 0
          return (
            <button
              key={p.id}
              className={`drv ${open === p.id ? 'open' : ''}`}
              onClick={() => setOpen(open === p.id ? null : p.id)}
            >
              <div className="drv-top">
                <span className="drv-name">{p.label}</span>
                <span className={`drv-delta ${up ? 'up' : 'down'}`}>{sign(p.delta)}</span>
              </div>
              <div className="drv-bar">
                <div className={`drv-fill ${up ? 'up' : 'down'}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="drv-ref">{p.reference}</div>
              {open === p.id && <div className="drv-detail">{p.detail}</div>}
            </button>
          )
        })}
      </div>

      {gap && gap.toNextBand > 0 && (
        <div className="drv-gap">
          <strong>{gap.toNextBand.toFixed(1)}°F</strong> of WBGT below the next band, which starts at{' '}
          {gap.nextAt.toFixed(1)}°F.
        </div>
      )}

      <div className="label" style={{ marginTop: 18 }}>What would change it</div>
      <div className="sens-list">
        {sens.map((s) => (
          <div key={s.label} className="sens">
            <div style={{ minWidth: 0 }}>
              <div className="sens-label">{s.label}</div>
              <div className="sens-note">{s.note}</div>
            </div>
            <div className={`sens-delta ${s.delta >= 0 ? 'up' : 'down'}`}>{sign(s.delta)}</div>
          </div>
        ))}
      </div>

      <div className="small muted" style={{ marginTop: 14, lineHeight: 1.55 }}>
        WBGT is 70% wet bulb, 20% black globe, 10% air temperature. That weighting is why humidity moves it far more
        than air temperature does, and why shade and wind matter so much.
      </div>
    </Card>
  )
}
