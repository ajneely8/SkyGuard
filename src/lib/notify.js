/**
 * Desktop/phone notifications for lightning status changes.
 *
 * These fire only on a CHANGE — escalating into a band, or the all-clear when
 * the hold expires. A notification per strike would be noise, and noise gets
 * muted, which is the last thing you want on a safety alert.
 *
 * Notifications need an explicit grant and a secure context. When either is
 * missing the app still shows everything in-page; nothing depends on this.
 */

const TAG = 'skyguard-lightning'

export const notificationsSupported = () =>
  typeof window !== 'undefined' && 'Notification' in window && window.isSecureContext !== false

export const notificationPermission = () =>
  notificationsSupported() ? Notification.permission : 'unsupported'

/** Ask once. Returns the resulting permission string. */
export async function ensureNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

function show(title, body) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false
  try {
    // Same tag replaces the previous one rather than stacking a pile of alerts.
    new Notification(title, { body, tag: TAG, renotify: true })
    return true
  } catch {
    return false
  }
}

/**
 * @param {'clear'|'caution'|'advisory'|'warning'|'strike'} levelId
 * @param {object} info { locationName, miles, compass, resumeMinutes }
 */
export function notifyLightning(levelId, info = {}) {
  const where = info.locationName ? ` — ${info.locationName}` : ''
  switch (levelId) {
    case 'strike':
      return show(
        `⚡ Lightning strike${where}`,
        `${info.miles?.toFixed(1)} miles ${info.compass || ''}`.trim(),
      )
    case 'warning':
      return show(
        `Lightning warning${where}`,
        `Strike ${info.miles?.toFixed(1)} miles ${info.compass || ''} . Suspend activity and take shelter. ${info.resumeMinutes ?? 30} minute hold started.`.replace(
          ' . ',
          '. ',
        ),
      )
    case 'advisory':
      return show(
        `Lightning approaching${where}`,
        `Nearest strike ${info.miles?.toFixed(1)} miles ${info.compass || ''}. Prepare to suspend.`,
      )
    case 'caution':
      return show(
        `Lightning in the area${where}`,
        `Nearest strike ${info.miles?.toFixed(1)} miles ${info.compass || ''}. Monitor and be ready to move.`,
      )
    case 'clear':
      return show(
        `All clear${where}`,
        `No strikes within the warning radius for ${info.resumeMinutes ?? 30} minutes. Safe to resume activity.`,
      )
    default:
      return false
  }
}
