/**
 * Lightning: caution / advisory / warning, with the restarting hold clock.
 *
 * The countdown is the part that matters. It restarts on every strike inside
 * the warning radius, so a storm sitting overhead keeps pushing the resume time
 * out — which is exactly the behaviour the 30-minute rule describes.
 */

import { useEffect, useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { Card, Notice } from './ui.jsx'
import { STRIKE_LEVELS } from '../lib/lightning.js'
import { SOURCE_NAME, SOURCE_COMMERCIAL } from '../lib/strikes.js'
import { fmtTimeIn, ageString } from '../lib/format.js'
import { notificationPermission, notificationsSupported } from '../lib/notify.js'

const ORDER = ['caution', 'advisory', 'warning']

export default function LightningPanel({ locationId, tz }) {
  const { strikeStatusFor, strikesFor, strikeFeed, ensureNotificationPermission, now, state } = useStore()
  const status = strikeStatusFor(locationId)
  const strikes = strikesFor(locationId)
  const rules = status.rules
  const [perm, setPerm] = useState(notificationPermission())

  useEffect(() => {
    const t = setInterval(() => setPerm(notificationPermission()), 3000)
    return () => clearInterval(t)
  }, [])

  const radiusFor = (id) =>
    id === 'warning' ? rules.warningMiles : id === 'advisory' ? rules.advisoryMiles : rules.cautionMiles

  const countWithin = (miles) => strikes.filter((s) => s.miles <= miles).length

  const mmss = (secs) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  return (
    <Card
      className="card-bare"
      title="Lightning"
      subtitle={
        strikeFeed.connected
          ? `Live strikes · ${strikes.length} within 80 miles in the last hour`
          : strikeFeed.connecting
            ? 'Connecting to the strike network…'
            : 'Strike feed offline'
      }
    >
      {/* current band */}
      <div className={`lx-head tone-${status.level.tone}`}>
        <div>
          <div className="lx-level">{status.level.label.toUpperCase()}</div>
          <div className="lx-heading">{status.level.heading}</div>
        </div>
        {status.nearest && (
          <div className="lx-nearest">
            <div className="label" style={{ marginBottom: 2 }}>Nearest strike</div>
            <div className="lx-miles">{status.nearest.miles.toFixed(1)} mi</div>
            <div className="small muted">
              {status.nearest.bearing?.compass} · {ageString(status.nearest.ts, now)} ago
            </div>
          </div>
        )}
      </div>

      {/* the hold clock */}
      {status.holdActive && (
        <div className="lx-hold">
          <div>
            <div className="label" style={{ marginBottom: 2 }}>Safe to resume in</div>
            <div className="lx-countdown mono">{mmss(status.secondsRemaining)}</div>
          </div>
          <div className="small">
            Resume at <strong>{fmtTimeIn(status.resumeAt, tz)}</strong>. The {rules.holdMinutes}-minute clock
            restarts on every strike within {rules.warningMiles} miles — {status.countInWarning} so far.
          </div>
        </div>
      )}

      {/* the hold has run out — say so even if strikes remain in the outer rings */}
      {!status.holdActive && status.resumable && (
        <div style={{ marginTop: 12 }}>
          <Notice kind="ok" title="Safe to resume">
            No strikes within {rules.warningMiles} miles for {rules.holdMinutes} minutes. Activity can restart.
            {status.nearest && status.nearest.miles <= rules.cautionMiles && (
              <> Keep watching — there is still lightning {status.nearest.miles.toFixed(1)} miles away.</>
            )}
          </Notice>
        </div>
      )}

      <p style={{ fontWeight: 600, marginTop: 14 }}>{status.level.action}</p>

      {/* the three bands */}
      <div className="lx-bands">
        {ORDER.map((id) => {
          const band = STRIKE_LEVELS[id]
          const miles = radiusFor(id)
          const n = countWithin(miles)
          const active = status.level.id === id
          return (
            <div key={id} className={`lx-band tone-${band.tone} ${active ? 'active' : ''}`}>
              <div className="lx-band-top">
                <span className="lx-band-name">{band.label.replace(' — suspend activity', '')}</span>
                <span className={`badge badge-${band.tone === 'yellow' ? 'yellow' : band.tone === 'orange' ? 'orange' : 'red'}`}>
                  within {miles} mi
                </span>
              </div>
              <div className="lx-band-count">
                {n} strike{n === 1 ? '' : 's'} in the last hour
              </div>
              <div className="lx-band-action">{band.action}</div>
            </div>
          )
        })}
      </div>

      {/* recent strikes */}
      {strikes.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table className="data">
            <thead>
              <tr><th>Time</th><th>Distance</th><th>Direction</th></tr>
            </thead>
            <tbody>
              {strikes.slice(0, 8).map((s) => (
                <tr key={s.id}>
                  <td className="small">{fmtTimeIn(s.ts, tz)}<div className="muted">{ageString(s.ts, now)} ago</div></td>
                  <td className="num">{s.miles.toFixed(1)} mi</td>
                  <td className="small">{s.bearing?.compass}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* notifications */}
      {notificationsSupported() && perm !== 'granted' && (
        <div style={{ marginTop: 14 }}>
          <Notice kind="info" title="Turn on alerts">
            Get a notification when lightning enters a band and when it is clear to resume.
            <div style={{ marginTop: 10 }}>
              <button
                className="btn btn-sm btn-primary"
                onClick={async () => setPerm(await ensureNotificationPermission())}
                disabled={perm === 'denied'}
              >
                {perm === 'denied' ? 'Blocked in browser settings' : 'Enable notifications'}
              </button>
            </div>
          </Notice>
        </div>
      )}

      {/* source honesty */}
      <div style={{ marginTop: 14 }}>
        {!strikeFeed.connected && !strikeFeed.connecting && (
          <Notice kind="warn" title="Strike feed offline">
            No live strike data right now{strikeFeed.error ? ` (${strikeFeed.error})` : ''}. The bands above cannot
            be trusted while this says offline — use the sky, the radar and your own judgement.
          </Notice>
        )}
        <div className="source-strip" style={{ marginTop: 8, padding: '12px 0' }}>
          <div><b>Strike source</b>{SOURCE_NAME}</div>
          <div><b>Status</b>{strikeFeed.connected ? 'Connected' : strikeFeed.connecting ? 'Connecting' : 'Offline'}</div>
          <div><b>Bands</b>{rules.cautionMiles} / {rules.advisoryMiles} / {rules.warningMiles} mi</div>
          <div><b>Hold</b>{rules.holdMinutes} min after the last strike inside {rules.warningMiles} mi</div>
        </div>
        {!SOURCE_COMMERCIAL && (
          <div className="small muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
            This is a volunteer network. It misses strikes, coverage varies, and its data is licensed for
            non-commercial use — fine for building and testing, not for a district you are selling to. Swap in a
            commercial network before this decides whether children stay on a field.
          </div>
        )}
      </div>
    </Card>
  )
}
