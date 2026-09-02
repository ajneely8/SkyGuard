/**
 * Lightning — its own page instead of a card competing for space on Home.
 */

import { Link } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { Card } from '../components/ui.jsx'
import LightningPanel from '../components/LightningPanel.jsx'

export default function Lightning() {
  const { selectedLocation } = useStore()
  const loc = selectedLocation

  if (!loc) {
    return (
      <Card title="No locations yet">
        <p>Add the field you want to monitor.</p>
        <Link className="btn btn-primary" to="/app/locations">Add a location</Link>
      </Card>
    )
  }

  return (
    <div className="stack">
      <LightningPanel locationId={loc.id} tz={loc.timezone || null} />
    </div>
  )
}
