/**
 * Lightning — its own page instead of a card competing for space on Home.
 */

import { Link } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { Card } from '../components/ui.jsx'
import LightningPanel from '../components/LightningPanel.jsx'
import { DEFAULT_STRIKE_RULES } from '../lib/lightning.js'

export default function Lightning() {
  const { selectedLocation, state, simulateStrike, clearTestStrikes, strikesFor } = useStore()
  const loc = selectedLocation

  if (!loc) {
    return (
      <Card title="No locations yet">
        <p>Add the field you want to monitor.</p>
        <Link className="btn btn-primary" to="/app/locations">Add a location</Link>
      </Card>
    )
  }

  const rules = state.settings.strikeRules || DEFAULT_STRIKE_RULES
  const testMiles = (band) =>
    band === 'caution' ? Math.max(1, rules.advisoryMiles + 2) : band === 'advisory' ? Math.max(1, rules.warningMiles + 2) : Math.max(1, rules.warningMiles - 4)
  const hasTestStrikes = strikesFor(loc.id).some((s) => s.test)

  return (
    <div className="stack">
      <LightningPanel locationId={loc.id} tz={loc.timezone || null} />

      <Card className="card-bare" title="Test lightning" subtitle="Drops a fake strike near this field through the real pipeline — map, status, notification">
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={() => simulateStrike(loc.id, testMiles('caution'))}>
            Test: Caution ({testMiles('caution')} mi)
          </button>
          <button className="btn btn-sm" onClick={() => simulateStrike(loc.id, testMiles('advisory'))}>
            Test: Advisory ({testMiles('advisory')} mi)
          </button>
          <button className="btn btn-sm btn-danger" onClick={() => simulateStrike(loc.id, testMiles('warning'))}>
            Test: Warning ({testMiles('warning')} mi)
          </button>
          {hasTestStrikes && (
            <button className="btn btn-sm btn-ghost" onClick={clearTestStrikes}>
              Clear test strikes
            </button>
          )}
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>
          Each test strike appears on the Live radar map on Home, updates the Caution/Advisory/Warning status and the
          hold clock above, and — if notifications are turned on — fires the same push notification a real strike
          would.
        </p>
      </Card>
    </div>
  )
}
