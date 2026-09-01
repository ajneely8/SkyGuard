/** Role definitions and permission checks. */

export const ROLES = {
  DISTRICT_ADMIN: 'district_admin',
  ATHLETIC_DIRECTOR: 'athletic_director',
  ATHLETIC_TRAINER: 'athletic_trainer',
  COACH: 'coach',
  BAND_DIRECTOR: 'band_director',
  VIEWER: 'viewer',
}

export const ROLE_META = {
  [ROLES.DISTRICT_ADMIN]: {
    label: 'District Administrator',
    blurb: 'Full access — settings, thresholds, users, all campuses, all reports.',
  },
  [ROLES.ATHLETIC_DIRECTOR]: {
    label: 'Athletic Director',
    blurb: 'All athletic locations, sessions and reports across the district.',
  },
  [ROLES.ATHLETIC_TRAINER]: {
    label: 'Athletic Trainer',
    blurb: 'WBGT monitoring, cooling resources, emergency response, athlete safety.',
  },
  [ROLES.COACH]: {
    label: 'Coach',
    blurb: 'Own practices and assigned locations.',
  },
  [ROLES.BAND_DIRECTOR]: {
    label: 'Band Director',
    blurb: 'Marching band practices and competitions.',
  },
  [ROLES.VIEWER]: {
    label: 'Viewer',
    blurb: 'Read-only access to dashboards and reports.',
  },
}

/**
 * Capability matrix. Keep this the single source of truth — screens ask
 * `can(user, 'edit_settings')` rather than testing role strings inline.
 */
const MATRIX = {
  view_dashboard: Object.values(ROLES),
  view_admin: [ROLES.DISTRICT_ADMIN, ROLES.ATHLETIC_DIRECTOR, ROLES.ATHLETIC_TRAINER, ROLES.VIEWER],
  view_history: Object.values(ROLES),
  start_session: [
    ROLES.DISTRICT_ADMIN,
    ROLES.ATHLETIC_DIRECTOR,
    ROLES.ATHLETIC_TRAINER,
    ROLES.COACH,
    ROLES.BAND_DIRECTOR,
  ],
  log_reading: [
    ROLES.DISTRICT_ADMIN,
    ROLES.ATHLETIC_DIRECTOR,
    ROLES.ATHLETIC_TRAINER,
    ROLES.COACH,
    ROLES.BAND_DIRECTOR,
  ],
  complete_checklist: [
    ROLES.DISTRICT_ADMIN,
    ROLES.ATHLETIC_DIRECTOR,
    ROLES.ATHLETIC_TRAINER,
    ROLES.COACH,
    ROLES.BAND_DIRECTOR,
  ],
  acknowledge_alert: [
    ROLES.DISTRICT_ADMIN,
    ROLES.ATHLETIC_DIRECTOR,
    ROLES.ATHLETIC_TRAINER,
    ROLES.COACH,
    ROLES.BAND_DIRECTOR,
  ],
  manage_locations: [ROLES.DISTRICT_ADMIN, ROLES.ATHLETIC_DIRECTOR],
  manage_users: [ROLES.DISTRICT_ADMIN],
  edit_settings: [ROLES.DISTRICT_ADMIN],
  edit_thresholds: [ROLES.DISTRICT_ADMIN],
  edit_rules: [ROLES.DISTRICT_ADMIN, ROLES.ATHLETIC_TRAINER],
  export_reports: [
    ROLES.DISTRICT_ADMIN,
    ROLES.ATHLETIC_DIRECTOR,
    ROLES.ATHLETIC_TRAINER,
    ROLES.COACH,
    ROLES.BAND_DIRECTOR,
    ROLES.VIEWER,
  ],
  upload_eap: [ROLES.DISTRICT_ADMIN, ROLES.ATHLETIC_TRAINER],
}

export function can(user, capability) {
  if (!user) return false
  const allowed = MATRIX[capability]
  if (!allowed) return false
  return allowed.includes(user.role)
}

/** Locations a user may act on. Coaches and band directors are scoped. */
export function visibleLocations(user, locations) {
  if (!user) return []
  if (user.role === ROLES.COACH || user.role === ROLES.BAND_DIRECTOR) {
    if (user.locationIds?.length) return locations.filter((l) => user.locationIds.includes(l.id))
  }
  return locations
}
