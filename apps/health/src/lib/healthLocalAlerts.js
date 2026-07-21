/**
 * Kenos Continuity local alerts for Health (no APNs).
 * Edge-only: focus warning + evening wind-down. Does not mirror Mac full-screen breaks.
 */
import {
  getNativeCapabilities,
  hasNativeLocalNotifications,
  isNativeBridgeAvailable,
  nativeNotificationsGetStatus,
  nativeNotificationsRequestPermission,
  nativeNotificationsSchedule,
} from '@life-os/platform-web/kenos-native-bridge'

const SEEN_KEY = 'health_native_local_alerts_v1'
const WIND_DOWN_HOUR = 21

/** @type {{ at: number, ready: boolean } | null} */
let readyCache = null
const READY_TTL_MS = 8_000

/** Continuity hosts system local Health alerts. */
export function canHostHealthLocalAlerts() {
  return isNativeBridgeAvailable()
}

/** @returns {Promise<boolean>} */
export async function healthLocalAlertsReady() {
  if (!isNativeBridgeAvailable()) {
    readyCache = null
    return false
  }
  const now = Date.now()
  if (readyCache && now - readyCache.at < READY_TTL_MS) return readyCache.ready
  const caps = await getNativeCapabilities()
  const ready = hasNativeLocalNotifications(caps)
  readyCache = { at: now, ready }
  return ready
}

/**
 * @returns {Promise<'granted'|'denied'|'default'|'unavailable'>}
 */
export async function requestHealthLocalAlertPermission() {
  if (!(await healthLocalAlertsReady())) return 'unavailable'
  const result = await nativeNotificationsRequestPermission()
  const status = String(result?.status || '')
  if (status === 'authorized' || status === 'granted') return 'granted'
  if (status === 'denied') return 'denied'
  const probe = await nativeNotificationsGetStatus()
  const probed = String(probe?.status || '')
  if (probed === 'authorized' || probed === 'granted') return 'granted'
  if (probed === 'denied') return 'denied'
  return 'default'
}

function dayKey(now = new Date()) {
  return now.toLocaleDateString('sv-SE')
}

function loadSeen() {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}')
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

function saveSeen(map) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

/**
 * Pure decision helpers for tests.
 * @param {{ sleepDebtLevel?: string, agentPhase?: string, hour: number }} input
 */
export function decideHealthAlerts(input) {
  const sleep = String(input.sleepDebtLevel || '')
  const phase = String(input.agentPhase || '')
  const windDown =
    (sleep === 'bad' || sleep === 'watch') && input.hour >= WIND_DOWN_HOUR
  const focusWarn = phase === 'warning'
  return { windDown, focusWarn }
}

/**
 * @param {{
 *   sleepDebtLevel?: string,
 *   agentPhase?: string,
 *   now?: Date,
 *   enabled?: boolean,
 * }} input
 */
export async function syncHealthLocalAlerts(input = {}) {
  if (input.enabled === false) {
    return { ok: true, skipped: true, code: 'disabled' }
  }
  if (!(await healthLocalAlertsReady())) {
    return { ok: false, skipped: true, code: 'native_unavailable' }
  }

  const now = input.now ?? new Date()
  const key = dayKey(now)
  const hour = now.getHours()
  const { windDown, focusWarn } = decideHealthAlerts({
    sleepDebtLevel: input.sleepDebtLevel,
    agentPhase: input.agentPhase,
    hour,
  })

  const seen = loadSeen()
  /** @type {Record<string, boolean>} */
  const day = seen[key] && typeof seen[key] === 'object' ? { ...seen[key] } : {}
  let scheduled = 0

  if (windDown && !day.windDown) {
    await nativeNotificationsSchedule({
      type: 'health_wind_down',
      safeTitle: 'Wind down',
      safeBody: 'Sleep debt is elevated — ease into evening.',
      deepLink: 'kenos://health?path=/focus',
      deduplicationKey: `health-wind-down-${key}`,
      fireAt: Date.now() + 1_500,
      risk: 'R0',
      classification: 'personal',
    })
    day.windDown = true
    scheduled += 1
  }

  if (focusWarn && !day.focusWarn) {
    await nativeNotificationsSchedule({
      type: 'health_focus_warn',
      safeTitle: 'Focus check-in',
      safeBody: 'Focus load is high — take a short break.',
      deepLink: 'kenos://health?path=/focus',
      deduplicationKey: `health-focus-warn-${key}`,
      fireAt: Date.now() + 1_500,
      risk: 'R0',
      classification: 'personal',
    })
    day.focusWarn = true
    scheduled += 1
  }

  // Keep only recent day keys
  const next = { ...seen, [key]: day }
  const keys = Object.keys(next).sort()
  while (keys.length > 7) {
    delete next[keys.shift()]
  }
  saveSeen(next)
  return { ok: true, scheduled }
}

/** @internal */
export function __resetHealthAlertCachesForTests() {
  readyCache = null
}
