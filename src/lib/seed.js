/**
 * Starting state.
 *
 * No sample district, campus or field is shipped. The app starts empty and the
 * first run captures the user's actual coordinates.
 */

import { DEFAULT_THRESHOLDS } from './wbgt.js'
import { DEFAULT_BANDS } from './guidelines.js'
import { DEFAULT_STRIKE_RULES } from './lightning.js'

export const SCHEMA_VERSION = 5

export const SPORTS = [
  'Football',
  'Marching Band',
  'Cross Country',
  'Volleyball',
  'Soccer',
  'Baseball',
  'Softball',
  'Track & Field',
  'Tennis',
  'Golf',
  'Cheer / Drill',
  'Strength & Conditioning',
  'Outdoor Event',
]

export const LOCATION_TYPES = [
  { id: 'stadium', label: 'Football Stadium' },
  { id: 'practice', label: 'Practice Field' },
  { id: 'baseball', label: 'Baseball Field' },
  { id: 'softball', label: 'Softball Field' },
  { id: 'soccer', label: 'Soccer Field' },
  { id: 'band', label: 'Band Field' },
  { id: 'track', label: 'Track' },
  { id: 'tennis', label: 'Tennis Courts' },
  { id: 'campus', label: 'Campus' },
  { id: 'home', label: 'Home' },
  { id: 'event', label: 'Event Site' },
]

export const DISCLAIMER =
  'Skyguard is a monitoring and decision-support tool. Schools remain responsible for following the current rules and requirements of their governing body. It is not a lightning strike-detection service and does not replace official National Weather Service warnings.'

export function seedState() {
  return {
    version: SCHEMA_VERSION,
    setupComplete: false,
    locations: [],
    /** Signed-in account summary. Credentials live in auth.js, never here. */
    account: null,
    selectedLocationId: null,
    settings: {
      /** Class 2 / Class 3+ labels, kept for schools that use that language. */
      thresholds: { ...DEFAULT_THRESHOLDS },
      /** The rules that drive time outside and clothing. Editable in Rules. */
      bands: DEFAULT_BANDS,
      monitoringIntervalMin: 15,
      preCheckMin: 15,
      staleAfterMin: 35,
      autoRefreshSec: 300,
      lightning: { alertMiles: 10, resumeWaitMin: 30 },
      /** Caution / advisory / warning radii and the post-strike hold. */
      strikeRules: { ...DEFAULT_STRIKE_RULES },
    },
    readings: [],
    sessions: [],
    /** Reusable practice schedules — a name, sport, location and time-of-day
     * range a coach saves once and starts a new practice from later, instead
     * of re-entering the same details every day. */
    scheduleTemplates: [],
    alerts: [],
  }
}
