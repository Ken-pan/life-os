/**
 * Kenos Continuity local notifications for Finance bill due (no APNs).
 * Privacy: never put amounts in title/body — label + date only.
 */
import {
  getNativeCapabilities,
  hasNativeLocalNotifications,
  isNativeBridgeAvailable,
  nativeNotificationsCancel,
  nativeNotificationsSchedule,
} from '@life-os/platform-web/kenos-native-bridge'

export const BILL_REMINDERS_KEY = 'finance_os_bill_reminders_v1'
const TRACKED_KEY = 'finance_os_bill_alert_ids_v1'
const HORIZON_DAYS = 14
const MORNING_HOUR = 9
const MAX_SCHEDULE = 20

/** @type {{ at: number, ready: boolean } | null} */
let readyCache = null
const READY_TTL_MS = 8_000

/** @returns {boolean} */
export function isBillRemindersEnabled() {
  if (typeof localStorage === 'undefined') return true
  try {
    const raw = localStorage.getItem(BILL_REMINDERS_KEY)
    if (raw == null) return true
    return JSON.parse(raw) !== false
  } catch {
    return true
  }
}

/** @param {boolean} enabled */
export function setBillRemindersEnabled(enabled) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(BILL_REMINDERS_KEY, JSON.stringify(Boolean(enabled)))
  } catch {
    /* ignore */
  }
}

/** Continuity hosts system local bill alerts. */
export function canHostBillReminders() {
  return isNativeBridgeAvailable()
}

/** @returns {Promise<boolean>} */
export async function billLocalAlertsReady() {
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
 * @param {string} isoDate YYYY-MM-DD
 * @param {number} hour local hour
 * @returns {number} epoch ms
 */
export function localMorningMs(isoDate, hour = MORNING_HOUR) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ''))
  if (!m) return NaN
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hour, 0, 0, 0)
  return d.getTime()
}

function todayIso(now = new Date()) {
  const y = now.getFullYear()
  const mo = String(now.getMonth() + 1).padStart(2, '0')
  const da = String(now.getDate()).padStart(2, '0')
  return `${y}-${mo}-${da}`
}

function addDaysIso(iso, days) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  d.setDate(d.getDate() + days)
  return todayIso(d)
}

/**
 * Select outflow bills that still need attention within the horizon.
 * Pure — unit-testable without bridge.
 *
 * @param {Array<{
 *   id?: string,
 *   label?: string,
 *   date?: string,
 *   expectedAmount?: number,
 *   state?: string,
 * }>} occurrences
 * @param {{ now?: Date, horizonDays?: number }} [opts]
 */
export function selectBillDueCandidates(occurrences, opts = {}) {
  const now = opts.now ?? new Date()
  const horizon = opts.horizonDays ?? HORIZON_DAYS
  const today = todayIso(now)
  const until = addDaysIso(today, horizon)
  const open = new Set(['planned', 'upcoming', 'pending'])

  return (Array.isArray(occurrences) ? occurrences : [])
    .filter((row) => {
      if (!row?.id || !row.date) return false
      if (!open.has(String(row.state || ''))) return false
      if (!(Number(row.expectedAmount) < 0)) return false
      // overdue pending/upcoming still alert; future beyond horizon skip
      if (row.date > until) return false
      return true
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, MAX_SCHEDULE)
}

function loadTracked() {
  if (typeof localStorage === 'undefined') return new Set()
  try {
    const raw = JSON.parse(localStorage.getItem(TRACKED_KEY) || '[]')
    return new Set(Array.isArray(raw) ? raw.map(String) : [])
  } catch {
    return new Set()
  }
}

function saveTracked(set) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(TRACKED_KEY, JSON.stringify([...set].slice(-80)))
  } catch {
    /* ignore */
  }
}

/**
 * Sync UN locals from rolled timeline occurrences.
 * @param {Array<object>} occurrences
 * @param {{ now?: Date }} [opts]
 */
export async function syncBillDueAlerts(occurrences, opts = {}) {
  if (!(await billLocalAlertsReady())) {
    return { ok: false, skipped: true, code: 'native_unavailable' }
  }
  if (!isBillRemindersEnabled()) {
    await clearTrackedBillAlerts()
    return { ok: true, scheduled: 0, cleared: true }
  }

  const now = opts.now ?? new Date()
  const nowMs = now.getTime()
  const candidates = selectBillDueCandidates(occurrences, { now })
  const nextIds = new Set(candidates.map((c) => String(c.id)))
  const tracked = loadTracked()

  for (const id of [...tracked]) {
    if (!nextIds.has(id)) {
      tracked.delete(id)
      await nativeNotificationsCancel({ deduplicationKey: `money-bill-${id}` })
    }
  }

  let scheduled = 0
  for (const row of candidates) {
    const id = String(row.id)
    let fireAt = localMorningMs(row.date, MORNING_HOUR)
    if (!Number.isFinite(fireAt)) continue
    // Already past morning of due day → nudge once soon (not spam every sync).
    if (fireAt <= nowMs) {
      if (tracked.has(`${id}:fired`)) continue
      fireAt = nowMs + 2_000
      tracked.add(`${id}:fired`)
    }

    const label = String(row.label || 'Bill').slice(0, 64)
    const dueDate = String(row.date)
    await nativeNotificationsSchedule({
      type: 'money_bill_due',
      safeTitle: 'Bill due',
      safeBody: `${label} · ${dueDate}`.slice(0, 120),
      deepLink: 'kenos://money',
      deduplicationKey: `money-bill-${id}`,
      fireAt,
      risk: 'R1',
      classification: 'sensitive',
    })
    tracked.add(id)
    scheduled += 1
  }

  saveTracked(tracked)
  return { ok: true, scheduled }
}

export async function clearTrackedBillAlerts() {
  const tracked = loadTracked()
  for (const key of [...tracked]) {
    const id = String(key).replace(/:fired$/, '')
    await nativeNotificationsCancel({ deduplicationKey: `money-bill-${id}` })
  }
  saveTracked(new Set())
}

/** @internal */
export function __resetBillAlertCachesForTests() {
  readyCache = null
}
