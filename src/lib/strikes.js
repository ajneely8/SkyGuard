/**
 * Live lightning strike feed.
 *
 * Source: Blitzortung.org, a volunteer detection network. Read this before you
 * rely on it:
 *
 *  - It is a COMMUNITY network, not a commercial one. Detection efficiency
 *    varies by region and it will miss strikes, especially intracloud. Coverage
 *    is good over the continental US but is not guaranteed anywhere.
 *  - Blitzortung licenses its data for PERSONAL, NON-COMMERCIAL use. Selling a
 *    safety product on top of it is not covered. For a district deployment you
 *    want a commercial network (Vaisala NLDN, Earth Networks) — implement the
 *    same interface below and swap the feed.
 *  - The WebSocket protocol is undocumented and can change without notice.
 *
 * Because of all that, the UI always states which source is connected, and says
 * so plainly when none is. A missing strike is a safety problem, so this module
 * never invents one and never implies coverage it cannot promise.
 */

import { haversineMiles, bearing } from './geo.js'

export const SOURCE_NAME = 'Blitzortung.org community network'
export const SOURCE_COMMERCIAL = false

const HOSTS = ['wss://ws1.blitzortung.org/', 'wss://ws7.blitzortung.org/', 'wss://ws8.blitzortung.org/']

/** Strikes further than this from any watched field are discarded. */
const KEEP_WITHIN_MILES = 80
/** Strikes older than this are dropped — nothing uses them. */
export const STRIKE_TTL_MS = 60 * 60 * 1000

/** Blitzortung ships messages LZW-compressed with this scheme. */
function decode(b) {
  const dict = {}
  const data = String(b).split('')
  let currChar = data[0]
  let oldPhrase = currChar
  const out = [currChar]
  let code = 256
  for (let i = 1; i < data.length; i++) {
    const currCode = data[i].charCodeAt(0)
    const phrase = currCode < 256 ? data[i] : dict[currCode] ? dict[currCode] : oldPhrase + currChar
    out.push(phrase)
    currChar = phrase.charAt(0)
    dict[code] = oldPhrase + currChar
    code++
    oldPhrase = phrase
  }
  return out.join('')
}

/**
 * Connects to the strike network and reports strikes near the watched points.
 *
 * @param {object} opts
 * @param {() => Array<{lat:number, lon:number}>} opts.getWatched points to filter against
 * @param {(strike:object) => void} opts.onStrike
 * @param {(status:object) => void} opts.onStatus
 */
export function createStrikeFeed({ getWatched, onStrike, onStatus }) {
  let ws = null
  let hostIndex = 0
  let retry = 0
  let stopped = false
  let retryTimer = null

  const setStatus = (patch) => onStatus?.({ source: SOURCE_NAME, commercial: SOURCE_COMMERCIAL, ...patch })

  const open = () => {
    if (stopped) return
    const host = HOSTS[hostIndex % HOSTS.length]
    setStatus({ connected: false, connecting: true, host, error: null })

    try {
      ws = new WebSocket(host)
    } catch (e) {
      return scheduleRetry(e.message)
    }

    ws.onopen = () => {
      retry = 0
      // Handshake the network expects before it will stream.
      ws.send(JSON.stringify({ a: 111 }))
      setStatus({ connected: true, connecting: false, host, error: null, since: new Date().toISOString() })
    }

    ws.onmessage = (ev) => {
      let msg
      try {
        msg = JSON.parse(decode(ev.data))
      } catch {
        return // a frame we cannot read is not a strike; ignore it
      }
      if (typeof msg?.lat !== 'number' || typeof msg?.lon !== 'number') return

      const watched = getWatched?.() || []
      if (!watched.length) return

      // Nearest watched point decides whether this strike matters at all.
      let nearest = null
      for (const p of watched) {
        const miles = haversineMiles({ lat: msg.lat, lon: msg.lon }, p)
        if (!nearest || miles < nearest.miles) nearest = { miles, point: p }
      }
      if (!nearest || nearest.miles > KEEP_WITHIN_MILES) return

      onStrike?.({
        id: `${msg.time}-${msg.lat.toFixed(4)}-${msg.lon.toFixed(4)}`,
        lat: msg.lat,
        lon: msg.lon,
        // Blitzortung timestamps are nanoseconds since the epoch.
        ts: new Date(Math.round(msg.time / 1e6)).toISOString(),
        receivedAt: Date.now(),
      })
    }

    ws.onerror = () => {
      /* onclose follows; retry is handled there */
    }
    ws.onclose = () => {
      if (stopped) return
      hostIndex++
      scheduleRetry('connection closed')
    }
  }

  const scheduleRetry = (error) => {
    setStatus({ connected: false, connecting: false, error })
    if (stopped) return
    retry++
    // Back off to 30s so a persistent outage does not hammer the network.
    const wait = Math.min(30000, 1000 * 2 ** Math.min(retry, 5))
    clearTimeout(retryTimer)
    retryTimer = setTimeout(open, wait)
  }

  open()

  return {
    stop() {
      stopped = true
      clearTimeout(retryTimer)
      try {
        ws?.close()
      } catch {
        /* already gone */
      }
      setStatus({ connected: false, connecting: false, error: null })
    },
  }
}

/** Distance and bearing from a field to a strike. */
export function strikeRelativeTo(strike, loc) {
  const miles = haversineMiles({ lat: strike.lat, lon: strike.lon }, loc)
  return { ...strike, miles, bearing: bearing(loc, { lat: strike.lat, lon: strike.lon }) }
}
