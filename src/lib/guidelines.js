/**
 * WBGT activity guidelines: how long you can be outside, and what you can wear.
 *
 * These bands are the widely used WBGT activity table (NATA / state-association
 * style) that pairs each WBGT range with a maximum practice length, a required
 * break pattern, and what protective equipment is allowed. They are the DEFAULT
 * only — a district edits them in Rules, because governing bodies revise them.
 *
 * The separate Class 2 / Class 3+ labels from the UIL-style threshold system are
 * mapped on top, so a school using that language still sees it.
 */

export const DEFAULT_BANDS = [
  {
    id: 'b1',
    minF: null, // open lower bound
    maxF: 82.0,
    name: 'Normal activity',
    tone: 'green',
    maxMinutes: null, // no limit
    breaks: 'Three separate 3-minute breaks each hour',
    equipment: 'Full equipment and pads permitted',
    conditioning: 'Normal conditioning permitted',
    note: 'Watch for athletes who are new, returning from illness, or carrying extra equipment.',
  },
  {
    id: 'b2',
    minF: 82.0,
    maxF: 87.0,
    name: 'Use caution',
    tone: 'yellow',
    maxMinutes: null,
    breaks: 'Three separate 4-minute breaks each hour',
    equipment: 'Full equipment and pads permitted',
    conditioning: 'Use discretion for intense or prolonged conditioning',
    note: 'Monitor at-risk athletes closely throughout the session.',
  },
  {
    id: 'b3',
    minF: 87.0,
    maxF: 90.0,
    name: 'Reduce time and equipment',
    tone: 'orange',
    maxMinutes: 120,
    breaks: 'Four separate 4-minute breaks each hour',
    equipment: 'Football: helmet, shoulder pads and shorts only — no full pads. Other sports: lightest uniform allowed.',
    conditioning: 'Reduce intensity; avoid prolonged conditioning',
    note: 'Remove helmets and pads during every break.',
  },
  {
    id: 'b4',
    minF: 90.0,
    maxF: 92.1,
    name: 'Severely limit activity',
    tone: 'red',
    maxMinutes: 60,
    breaks: '20 minutes of breaks spread through the hour',
    equipment: 'No protective equipment — shorts and shirts only',
    conditioning: 'No conditioning activities',
    note: 'Keep a cooling area and trained personnel on site for the whole session.',
  },
  {
    id: 'b5',
    minF: 92.1,
    maxF: null, // open upper bound
    name: 'No outdoor activity',
    tone: 'darkred',
    maxMinutes: 0,
    breaks: 'Not applicable — move indoors',
    equipment: 'Not applicable — move indoors',
    conditioning: 'Cancel or postpone until WBGT drops',
    note: 'Delay practice until the WBGT falls into a lower band, or move the session indoors.',
  },
]

/** Find the band a WBGT value falls into. */
export function activityGuideline(wbgtF, bands = DEFAULT_BANDS) {
  if (wbgtF == null || Number.isNaN(wbgtF)) return null
  const list = bands?.length ? bands : DEFAULT_BANDS
  return (
    list.find((b) => (b.minF == null || wbgtF >= b.minF) && (b.maxF == null || wbgtF < b.maxF)) ||
    list[list.length - 1]
  )
}

/** "No limit" / "2 hours" / "1 hour" / "None — move indoors" */
export function timeOutsideLabel(band) {
  if (!band) return '—'
  if (band.maxMinutes == null) return 'No time limit'
  if (band.maxMinutes === 0) return 'None — move indoors'
  if (band.maxMinutes % 60 === 0) {
    const h = band.maxMinutes / 60
    return `${h} hour${h === 1 ? '' : 's'} maximum`
  }
  return `${band.maxMinutes} minutes maximum`
}

/** Short clothing answer for the top of the screen. */
export function clothingLabel(band) {
  if (!band) return '—'
  if (band.maxMinutes === 0) return 'Move indoors'
  if (/no protective equipment/i.test(band.equipment)) return 'Shorts and shirts only'
  if (/helmet, shoulder pads and shorts/i.test(band.equipment)) return 'Helmet, shoulder pads, shorts'
  return 'Full pads permitted'
}

/** Range text like "87.0°F – 89.9°F" for the rules table. */
export function bandRange(band) {
  if (band.minF == null) return `Below ${band.maxF.toFixed(1)}°F`
  if (band.maxF == null) return `${band.minF.toFixed(1)}°F and above`
  return `${band.minF.toFixed(1)}°F – ${(band.maxF - 0.1).toFixed(1)}°F`
}

/** When the practice clock must stop, given a start time and the band. */
export function practiceEndLimit(startIso, band) {
  if (!band || band.maxMinutes == null || band.maxMinutes === 0) return null
  return new Date(new Date(startIso).getTime() + band.maxMinutes * 60000).toISOString()
}
