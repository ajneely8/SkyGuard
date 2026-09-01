/**
 * WBGT calculation and classification.
 *
 * IMPORTANT: WBGT is NOT heat index. Heat index uses only air temperature and
 * humidity. WBGT additionally accounts for solar radiation and wind speed,
 * which is why it is the standard for outdoor activity in direct sun.
 *
 * When the weather source does not publish a measured WBGT, this module
 * estimates it from measured temperature, relative humidity, wind speed and
 * downward shortwave solar radiation using published outdoor approximations:
 *
 *  - Psychrometric wet bulb: Stull (2011), "Wet-Bulb Temperature from Relative
 *    Humidity and Air Temperature", J. Appl. Meteor. Climatol. 50(11).
 *  - Black globe temperature: Hunter & Minyard (1999) outdoor regression,
 *    with a wind correction toward air temperature.
 *  - Natural wet bulb from psychrometric wet bulb: Malchaire (1976) style
 *    radiation/wind adjustment.
 *  - WBGT(outdoor) = 0.7 * Tnwb + 0.2 * Tg + 0.1 * Tdb  (ISO 7243)
 *
 * Every reading records which method produced it so the log is defensible.
 * A reading taken with an on-site WBGT instrument always outranks an estimate.
 */

export const METHOD = {
  MEASURED_STATION: 'measured-station',
  MEASURED_ONSITE: 'measured-onsite',
  ESTIMATED: 'estimated-iso7243',
}

export const METHOD_LABEL = {
  [METHOD.MEASURED_STATION]: 'Measured WBGT (weather provider)',
  [METHOD.MEASURED_ONSITE]: 'On-site WBGT instrument (manual entry)',
  [METHOD.ESTIMATED]: 'Estimated WBGT (ISO 7243 model from station data)',
}

/* ---------- unit helpers ---------- */

export const fToC = (f) => (f - 32) / 1.8
export const cToF = (c) => c * 1.8 + 32
export const mphToMs = (mph) => mph * 0.44704
export const msToMph = (ms) => ms / 0.44704

/* ---------- psychrometrics ---------- */

/**
 * Stull (2011) psychrometric wet-bulb temperature.
 * @param {number} tC dry-bulb air temperature, deg C
 * @param {number} rh relative humidity, percent (0-100)
 * @returns {number} wet-bulb temperature, deg C
 */
export function wetBulbC(tC, rh) {
  const r = Math.min(100, Math.max(1, rh))
  return (
    tC * Math.atan(0.151977 * Math.sqrt(r + 8.313659)) +
    Math.atan(tC + r) -
    Math.atan(r - 1.676331) +
    0.00391838 * Math.pow(r, 1.5) * Math.atan(0.023101 * r) -
    4.686035
  )
}

/**
 * Black globe temperature estimate for outdoor conditions.
 * Hunter & Minyard (1999) regression, damped toward air temperature as wind
 * rises (a ventilated globe converges on air temperature).
 * @param {number} tC air temperature, deg C
 * @param {number} rh relative humidity, percent
 * @param {number} solar downward shortwave radiation, W/m^2
 * @param {number} windMs wind speed, m/s
 */
export function globeTempC(tC, rh, solar, windMs) {
  const s = Math.max(0, solar)
  const raw = 0.01498 * s + 1.184 * tC - 0.0789 * rh - 2.739
  // Wind ventilation: at calm the regression stands; at high wind the globe
  // sheds radiant load and approaches air temperature.
  const ventilation = 1 / (1 + 0.25 * Math.max(0, windMs))
  const tg = tC + (raw - tC) * ventilation
  // A globe in shade/night cannot read below air temperature by any meaningful
  // amount, and cannot plausibly exceed air temp by more than ~25 C.
  return Math.min(tC + 25, Math.max(tC - 2, tg))
}

/**
 * Natural (unaspirated) wet bulb temperature from psychrometric wet bulb.
 * Malchaire-style adjustment for solar load and ventilation.
 */
export function naturalWetBulbC(tC, rh, solar, windMs) {
  const tw = wetBulbC(tC, rh)
  const s = Math.max(0, solar)
  const u = Math.max(0, windMs)
  const adj = 0.0021 * s - 0.43 * u + 1.93
  const tnwb = tw + adj
  // Physically bounded by the psychrometric wet bulb below and dry bulb above.
  return Math.min(tC, Math.max(tw, tnwb))
}

/**
 * Outdoor WBGT per ISO 7243 from standard weather observations.
 * @returns {{wbgtC:number, tnwbC:number, tgC:number, twC:number}}
 */
export function estimateWbgtC({ tempC, rh, windMs, solar }) {
  const tnwb = naturalWetBulbC(tempC, rh, solar, windMs)
  const tg = globeTempC(tempC, rh, solar, windMs)
  const wbgt = 0.7 * tnwb + 0.2 * tg + 0.1 * tempC
  return { wbgtC: wbgt, tnwbC: tnwb, tgC: tg, twC: wetBulbC(tempC, rh) }
}

/* ---------- heat index (shown alongside, never as WBGT) ---------- */

/**
 * NWS Rothfusz heat index, deg F. Displayed for context only.
 * This is NOT WBGT and is never used to classify activity.
 */
export function heatIndexF(tF, rh) {
  if (tF < 80) {
    // Steadman simple form for the low range.
    return 0.5 * (tF + 61 + (tF - 68) * 1.2 + rh * 0.094)
  }
  let hi =
    -42.379 +
    2.04901523 * tF +
    10.14333127 * rh -
    0.22475541 * tF * rh -
    0.00683783 * tF * tF -
    0.05481717 * rh * rh +
    0.00122874 * tF * tF * rh +
    0.00085282 * tF * rh * rh -
    0.00000199 * tF * tF * rh * rh
  if (rh < 13 && tF >= 80 && tF <= 112) {
    hi -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(tF - 95)) / 17)
  } else if (rh > 85 && tF >= 80 && tF <= 87) {
    hi += ((rh - 85) / 10) * ((87 - tF) / 5)
  }
  return hi
}

/* ---------- classification ---------- */

/**
 * Default thresholds in deg F. These mirror the reference practice/competition
 * guidelines but are stored in district settings and are fully editable — the
 * app must never hard-code a governing body's numbers permanently.
 */
export const DEFAULT_THRESHOLDS = {
  elevatedMinF: 76.0, // caution band; still "Normal conditions" classification
  class2MinF: 79.7,
  class3MinF: 82.0,
  extremeMinF: 86.0, // district-set ceiling for "Extreme conditions" status
}

export const STATUS = {
  GREEN: 'green',
  YELLOW: 'yellow',
  ORANGE: 'orange',
  RED: 'red',
  DARKRED: 'darkred',
}

export const STATUS_ORDER = [STATUS.GREEN, STATUS.YELLOW, STATUS.ORANGE, STATUS.RED, STATUS.DARKRED]

export const STATUS_TEXT = {
  [STATUS.GREEN]: 'Lower risk',
  [STATUS.YELLOW]: 'Elevated heat',
  [STATUS.ORANGE]: 'Class 2 — High heat',
  [STATUS.RED]: 'Class 3+ — Very high heat',
  [STATUS.DARKRED]: 'Extreme conditions',
}

export const CLASSIFICATION = {
  NORMAL: 'Normal conditions',
  CLASS2: 'Class 2',
  CLASS3: 'Class 3 or higher',
}

/**
 * Classify a WBGT reading against the district's configured thresholds.
 * @param {number} wbgtF
 * @param {object} thresholds
 */
export function classify(wbgtF, thresholds = DEFAULT_THRESHOLDS) {
  const t = { ...DEFAULT_THRESHOLDS, ...(thresholds || {}) }
  if (wbgtF == null || Number.isNaN(wbgtF)) {
    return {
      status: null,
      statusText: 'No data',
      classification: 'Unknown',
      classIndex: -1,
      practice: 'WBGT reading unavailable — do not rely on this screen.',
      competition: 'WBGT reading unavailable — do not rely on this screen.',
      reason: 'No valid WBGT value is available for this location.',
      thresholds: t,
    }
  }

  let status, classification, classIndex
  if (wbgtF >= t.extremeMinF) {
    status = STATUS.DARKRED
    classification = CLASSIFICATION.CLASS3
    classIndex = 4
  } else if (wbgtF >= t.class3MinF) {
    status = STATUS.RED
    classification = CLASSIFICATION.CLASS3
    classIndex = 3
  } else if (wbgtF >= t.class2MinF) {
    status = STATUS.ORANGE
    classification = CLASSIFICATION.CLASS2
    classIndex = 2
  } else if (wbgtF >= t.elevatedMinF) {
    status = STATUS.YELLOW
    classification = CLASSIFICATION.NORMAL
    classIndex = 1
  } else {
    status = STATUS.GREEN
    classification = CLASSIFICATION.NORMAL
    classIndex = 0
  }

  const practice = {
    0: 'Normal practice. Provide unrestricted access to water and monitor athletes.',
    1: 'Normal practice permitted. Watch conditions — WBGT is approaching the Class 2 threshold.',
    2: 'Practice modifications required. Rapid cooling zone required. Re-check WBGT every 30 minutes.',
    3: 'Increased precautions required. Rapid cooling zone required. Reduce intensity and duration; consider moving indoors.',
    4: 'Extreme conditions. Strongly consider cancelling or postponing outdoor activity. Rapid cooling zone and trained personnel required if any activity occurs.',
  }[classIndex]

  const competition = {
    0: 'Normal competition. Monitor conditions and keep the emergency action plan available.',
    1: 'Normal competition. Continue monitoring WBGT; have cooling resources staged.',
    2: 'Competition safety check recommended. Review recommended time, cooling and hydration modifications with the opposing school and officials.',
    3: 'Competition safety check recommended. Strongly consider time and cooling modifications; confirm cold-water immersion capability on site.',
    4: 'Extreme conditions. Strongly consider postponing or rescheduling. If the contest proceeds, full cooling and medical resources must be on site.',
  }[classIndex]

  const reason =
    classIndex >= 3
      ? `WBGT is ${wbgtF.toFixed(1)}°F, at or above the configured Class 3+ threshold of ${t.class3MinF}°F.`
      : classIndex === 2
        ? `WBGT is ${wbgtF.toFixed(1)}°F, which falls in the configured Class 2 band of ${t.class2MinF}°F to ${(t.class3MinF - 0.1).toFixed(1)}°F.`
        : classIndex === 1
          ? `WBGT is ${wbgtF.toFixed(1)}°F — below the configured Class 2 threshold of ${t.class2MinF}°F, but within the district's elevated-heat caution band starting at ${t.elevatedMinF}°F.`
          : `WBGT is ${wbgtF.toFixed(1)}°F, below the district's elevated-heat caution band starting at ${t.elevatedMinF}°F.`

  return {
    status,
    statusText: classIndex === 4 ? STATUS_TEXT[STATUS.DARKRED] : STATUS_TEXT[status],
    classification,
    classIndex,
    practice,
    competition,
    reason,
    thresholds: t,
    /** true when the Class 2 threshold is met or exceeded */
    atOrAboveClass2: classIndex >= 2,
    atOrAboveClass3: classIndex >= 3,
  }
}

/**
 * Recommended (not mandatory) practice modifications that scale with the level.
 * Each carries the reason it is being shown.
 */
export function practiceModifications(classIndex) {
  const mods = []
  const add = (text, why, mandatory = false) => mods.push({ text, why, mandatory })

  if (classIndex >= 1) {
    add(
      'Provide unrestricted access to water at all times',
      'Baseline requirement at every WBGT level under the configured practice guidelines.',
      true,
    )
    add('Watch for early signs of heat illness in every participant', 'Elevated heat band reached.')
  }
  if (classIndex >= 2) {
    add(
      'Re-check WBGT every 30 minutes for the duration of practice',
      'Required monitoring interval once WBGT reaches the Class 2 threshold.',
      true,
    )
    add(
      'Rest breaks must allow unlimited hydration and involve no physical activity',
      'Required rest-break condition at Class 2 and above.',
      true,
    )
    add('Rapid cooling zone must be available and staffed', 'Required at Class 2 and above.', true)
    add('Increase the number and length of hydration breaks')
    add('Increase rest periods between work periods')
    add('Reduce practice intensity')
    add('Provide additional shade at the activity area')
  }
  if (classIndex >= 3) {
    add('Reduce total practice duration')
    add('Provide fans and/or water misters at rest areas')
    add('Use ice towels and sponges during every rest break')
    add('Modify or remove high-intensity conditioning activities')
    add('Reduce or remove equipment/uniform layers where the sport allows')
    add('Move activities indoors when an appropriate indoor space is available')
  }
  if (classIndex >= 4) {
    add('Consider cancelling or postponing the activity')
    add('If activity proceeds, keep a trained employee or volunteer at the cooling zone at all times')
    add('Shorten work periods and increase rest ratio substantially')
  }
  return mods
}

/** Recommended competition modifications, grouped as in the reference guidance. */
export function competitionModifications(classIndex) {
  if (classIndex < 2) return []
  const groups = [
    {
      title: 'Time modifications',
      items: [
        'Adjust the contest start time',
        'Consider an earlier or later start',
        'Add additional official timeouts',
        'Consider a longer halftime',
        'Consider reducing quarter length for sub-varsity contests when both schools agree',
      ],
    },
    {
      title: 'Cooling modifications',
      items: [
        'Allow teams waiting to warm up to remain in air-conditioned areas',
        'Provide unlimited cool water',
        'Provide shade structures or tents',
        'Provide fans and/or misters',
        'Provide ice towels and sponges',
      ],
    },
    {
      title: 'Hydration and fueling',
      items: [
        'Increase hydration opportunities throughout the contest',
        'Provide appropriate snacks between contests',
        'Plan hydration and fueling strategies for long bus rides',
      ],
    },
  ]
  if (classIndex >= 3) {
    groups[1].items.push('Stage cold-water immersion capability at the venue, not in a distant training room')
    groups[0].items.push('Consider postponing or rescheduling the contest')
  }
  return groups
}
