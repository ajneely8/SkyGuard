/**
 * What is actually moving the WBGT number.
 *
 * Nothing here is a rule of thumb. Each figure is the real ISO 7243 model run
 * twice — once with the measured conditions, once with a single input replaced
 * by a stated reference — and the difference reported. So "the sun is adding
 * 7.3°F" means precisely: this WBGT, minus the WBGT the same air would produce
 * in full shade.
 *
 * Every number therefore has a reference attached, because a contribution
 * without one is meaningless.
 */

import { estimateWbgtC, cToF, fToC, mphToMs } from './wbgt.js'

const wbgtF = ({ tempF, rh, windMph, solar }) =>
  cToF(estimateWbgtC({ tempC: fToC(tempF), rh, windMs: mphToMs(windMph), solar }).wbgtC)

const baseOf = (obs) => ({
  tempF: obs.tempF,
  rh: obs.rh,
  windMph: obs.windMph ?? 0,
  solar: obs.solarWm2 ?? 0,
})

/** Dry-air reference for the humidity contribution. */
const DRY_RH = 30

/**
 * How much each condition is adding to — or taking off — the current reading.
 * @returns {{actual:number, parts:Array<{id,label,delta,reference,detail}>}}
 */
export function wbgtDrivers(obs) {
  if (!obs) return null
  const base = baseOf(obs)
  const actual = wbgtF(base)

  const parts = [
    {
      id: 'sun',
      label: 'Sun',
      delta: actual - wbgtF({ ...base, solar: 0 }),
      reference: 'versus full shade',
      detail: `${Math.round(base.solar)} W/m² of solar radiation is falling on the field. Sunlight heats the black-globe term, which is 20% of WBGT — it is why a shaded thermometer misses the danger.`,
    },
    {
      id: 'humidity',
      label: 'Humidity',
      delta: actual - wbgtF({ ...base, rh: DRY_RH }),
      reference: `versus dry air at ${DRY_RH}%`,
      detail: `At ${Math.round(base.rh)}% relative humidity, sweat evaporates more slowly. This drives the wet-bulb term, which is 70% of WBGT — the single biggest lever.`,
    },
    {
      id: 'wind',
      label: 'Wind',
      delta: actual - wbgtF({ ...base, windMph: 0 }),
      reference: 'versus dead calm',
      detail: `${Math.round(base.windMph)} mph of wind carries heat and moisture away from skin and from the globe. More wind lowers WBGT; still air raises it.`,
    },
  ]

  return { actual, parts, base }
}

/**
 * What would move the number from here. Same model, one input nudged.
 * @returns {Array<{label:string, delta:number, note:string}>}
 */
export function wbgtSensitivities(obs) {
  if (!obs) return []
  const base = baseOf(obs)
  const actual = wbgtF(base)
  const d = (patch) => wbgtF({ ...base, ...patch }) - actual

  return [
    {
      label: 'Cloud covers the sun',
      delta: d({ solar: base.solar * 0.2 }),
      note: 'Solar radiation drops to about a fifth',
    },
    {
      label: 'Wind picks up 5 mph',
      delta: d({ windMph: base.windMph + 5 }),
      note: `From ${Math.round(base.windMph)} to ${Math.round(base.windMph + 5)} mph`,
    },
    {
      label: 'Wind drops to calm',
      delta: d({ windMph: 0 }),
      note: 'Still air, no evaporative help',
    },
    {
      label: 'Humidity rises 10 points',
      delta: d({ rh: Math.min(100, base.rh + 10) }),
      note: `From ${Math.round(base.rh)}% to ${Math.round(Math.min(100, base.rh + 10))}%`,
    },
    {
      label: 'Air temperature rises 5°F',
      delta: d({ tempF: base.tempF + 5 }),
      note: `From ${Math.round(base.tempF)}°F to ${Math.round(base.tempF + 5)}°F`,
    },
    {
      label: 'Move into full shade',
      delta: d({ solar: 0 }),
      note: 'No direct sun on the athletes',
    },
  ].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
}

/**
 * The WBGT that would result from crossing into the next band, expressed as
 * what would have to change. Used to answer "how close are we?".
 */
export function distanceToBand(obs, band) {
  if (!obs || !band) return null
  const actual = wbgtF(baseOf(obs))
  if (band.maxF == null) return null
  return { toNextBand: band.maxF - actual, nextAt: band.maxF }
}
