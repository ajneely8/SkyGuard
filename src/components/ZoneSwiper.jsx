/**
 * Swipe through every WBGT zone and what it restricts.
 *
 * Horizontal scroll-snap, so it swipes with a thumb on a phone and drags or
 * arrows on a desktop. Opens on the zone you are currently in.
 */

import { useEffect, useRef, useState } from 'react'
import { Card } from './ui.jsx'
import { bandRange, timeOutsideLabel, clothingLabel } from '../lib/guidelines.js'

export default function ZoneSwiper({ bands, currentBandId }) {
  const trackRef = useRef(null)
  const startIndex = Math.max(0, bands.findIndex((b) => b.id === currentBandId))
  const [index, setIndex] = useState(startIndex < 0 ? 0 : startIndex)
  const didOpen = useRef(false)

  // Land on the current zone the first time, without animating past the others.
  useEffect(() => {
    if (didOpen.current || !trackRef.current) return
    didOpen.current = true
    const el = trackRef.current.children[startIndex]
    if (el) trackRef.current.scrollLeft = el.offsetLeft - trackRef.current.offsetLeft
    setIndex(startIndex)
  }, [startIndex])

  const goTo = (i) => {
    const clamped = Math.max(0, Math.min(bands.length - 1, i))
    const el = trackRef.current?.children[clamped]
    if (el && trackRef.current) {
      trackRef.current.scrollTo({
        left: el.offsetLeft - trackRef.current.offsetLeft,
        behavior: 'smooth',
      })
    }
    setIndex(clamped)
  }

  // Keep the dots in step with a thumb swipe.
  const onScroll = () => {
    const track = trackRef.current
    if (!track) return
    let nearest = 0
    let best = Infinity
    for (let i = 0; i < track.children.length; i++) {
      const d = Math.abs(track.children[i].offsetLeft - track.offsetLeft - track.scrollLeft)
      if (d < best) {
        best = d
        nearest = i
      }
    }
    setIndex(nearest)
  }

  return (
    <Card
      title="Zones and restrictions"
      subtitle="Swipe through every band to see what it allows"
      actions={
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-sm" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label="Previous zone">
            ‹
          </button>
          <button
            className="btn btn-sm"
            onClick={() => goTo(index + 1)}
            disabled={index === bands.length - 1}
            aria-label="Next zone"
          >
            ›
          </button>
        </div>
      }
    >
      <div
        className="zone-track"
        ref={trackRef}
        onScroll={onScroll}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') goTo(index + 1)
          if (e.key === 'ArrowLeft') goTo(index - 1)
        }}
      >
        {bands.map((b) => {
          const isNow = b.id === currentBandId
          return (
            <article key={b.id} className={`zone tone-${b.tone} ${isNow ? 'now' : ''}`}>
              <header className="zone-head">
                <div>
                  <div className="zone-range mono">{bandRange(b)}</div>
                  <div className="zone-name">{b.name}</div>
                </div>
                {isNow && <span className="badge badge-blue">You are here</span>}
              </header>

              <div className="zone-headline">
                <div>
                  <div className="label">How long outside</div>
                  <div className="zone-big">{timeOutsideLabel(b)}</div>
                </div>
                <div>
                  <div className="label">What to wear</div>
                  <div className="zone-big">{clothingLabel(b)}</div>
                </div>
              </div>

              <dl className="zone-rules">
                <dt>Breaks</dt>
                <dd>{b.breaks}</dd>
                <dt>Equipment</dt>
                <dd>{b.equipment}</dd>
                <dt>Conditioning</dt>
                <dd>{b.conditioning}</dd>
              </dl>

              {b.note && <div className="zone-note">{b.note}</div>}
            </article>
          )
        })}
      </div>

      <div className="zone-dots">
        {bands.map((b, i) => (
          <button
            key={b.id}
            className={`zone-dot tone-${b.tone} ${i === index ? 'on' : ''}`}
            onClick={() => goTo(i)}
            aria-label={`Zone ${b.name}`}
          />
        ))}
      </div>
    </Card>
  )
}
