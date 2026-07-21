/**
 * Kenos Continuity local notifications for AIOS (no APNs).
 * Daily brief / approvals / work deliverable-due → UN via kenosNative.notifications.
 */
import {
  getNativeCapabilities,
  hasNativeLocalNotifications,
  isNativeBridgeAvailable,
  nativeNotificationsCancel,
  nativeNotificationsSchedule,
} from '@life-os/platform-web/kenos-native-bridge'

const APPROVAL_SEEN_KEY = 'aios_native_approval_alerts_v1'
const DELIVERABLE_SEEN_KEY = 'aios_native_deliverable_alerts_v1'

/** @type {{ at: number, ready: boolean } | null} */
let readyCache = null
const READY_TTL_MS = 8_000

/** @returns {Promise<boolean>} */
export async function nativeLocalAlertsReady() {
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

/** Settings / proactive: Continuity or Tauri can host morning brief. */
export function canHostDailyBrief() {
  return isNativeBridgeAvailable()
}

/**
 * Immediate (or near-immediate) local notification for morning brief.
 * @param {{ title: string, body: string, dayKey: string }} brief
 */
export async function scheduleDailyBriefAlert(brief) {
  if (!(await nativeLocalAlertsReady())) {
    return { ok: false, skipped: true, code: 'native_unavailable' }
  }
  const dayKey = String(brief.dayKey || '').trim()
  if (!dayKey || !brief.title) {
    return { ok: false, skipped: true, code: 'bad_payload' }
  }
  return nativeNotificationsSchedule({
    type: 'kenos_daily_brief',
    safeTitle: String(brief.title).slice(0, 48),
    safeBody: String(brief.body || '').slice(0, 180),
    deepLink: 'kenos://today',
    deduplicationKey: `kenos-daily-brief-${dayKey}`,
    fireAt: Date.now() + 1_500,
    risk: 'R0',
    classification: 'personal',
  })
}

function loadSeen(key) {
  if (typeof localStorage === 'undefined') return new Set()
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]')
    return new Set(Array.isArray(raw) ? raw.map(String) : [])
  } catch {
    return new Set()
  }
}

function saveSeen(key, set) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify([...set].slice(-80)))
  } catch {
    /* ignore */
  }
}

/**
 * Fire once per pending approval id (Continuity only; skips demo spam).
 * @param {Array<{ id?: string, status?: string, safeImpactSummary?: string, summary?: string, risk?: string }>} approvals
 * @param {{ demo?: boolean }} [opts]
 */
export async function syncApprovalAlerts(approvals, opts = {}) {
  if (opts.demo) return { ok: true, skipped: true, code: 'demo' }
  if (!(await nativeLocalAlertsReady())) {
    return { ok: false, skipped: true, code: 'native_unavailable' }
  }
  const pending = (Array.isArray(approvals) ? approvals : []).filter(
    (a) => a && a.status === 'pending' && a.id,
  )
  const seen = loadSeen(APPROVAL_SEEN_KEY)
  const pendingIds = new Set(pending.map((a) => String(a.id)))
  for (const id of [...seen]) {
    if (!pendingIds.has(id)) seen.delete(id)
  }

  let scheduled = 0
  for (const approval of pending) {
    const id = String(approval.id)
    if (seen.has(id)) continue
    const body = String(
      approval.safeImpactSummary || approval.summary || 'Open Kenos to review',
    ).slice(0, 160)
    await nativeNotificationsSchedule({
      type: 'approval_requested',
      safeTitle: 'Approval requested',
      safeBody: body,
      deepLink: `kenos://approvals/${encodeURIComponent(id)}`,
      deduplicationKey: `approval-${id}`,
      fireAt: Date.now() + 1_500,
      risk: String(approval.risk || 'R2'),
      classification: 'personal',
    })
    seen.add(id)
    scheduled += 1
  }
  saveSeen(APPROVAL_SEEN_KEY, seen)
  return { ok: true, scheduled }
}

/**
 * Schedule / refresh work deliverable-due locals from Today cards.
 * @param {Array<{ kind?: string, id?: string, title?: string, summary?: string, dueAt?: string, entityRef?: { id?: string } }>} cards
 * @param {{ demo?: boolean }} [opts]
 */
export async function syncDeliverableDueAlerts(cards, opts = {}) {
  if (opts.demo) return { ok: true, skipped: true, code: 'demo' }
  if (!(await nativeLocalAlertsReady())) {
    return { ok: false, skipped: true, code: 'native_unavailable' }
  }

  const dueCards = (Array.isArray(cards) ? cards : []).filter(
    (c) => c && c.kind === 'deliverable_due_soon',
  )
  const nextIds = new Set(
    dueCards.map((c) => String(c.entityRef?.id || c.id?.replace?.(/^deliverable-due:/, '') || '')).filter(Boolean),
  )

  const seen = loadSeen(DELIVERABLE_SEEN_KEY)
  for (const id of [...seen]) {
    if (!nextIds.has(id)) {
      seen.delete(id)
      await nativeNotificationsCancel({ deduplicationKey: `work-due-${id}` })
    }
  }

  let scheduled = 0
  const now = Date.now()
  for (const card of dueCards) {
    const id = String(
      card.entityRef?.id || String(card.id || '').replace(/^deliverable-due:/, ''),
    )
    if (!id) continue
    const dueMs = Date.parse(card.dueAt || '')
    const future = Number.isFinite(dueMs) && dueMs > now
    // Overdue / unknown due: alert once. Future: calendar fire at due.
    if (!future && seen.has(id)) continue

    await nativeNotificationsSchedule({
      type: 'work_deliverable_due',
      safeTitle: 'Deliverable due',
      safeBody: String(card.title || card.summary || 'Open Work to review').slice(0, 160),
      deepLink: `kenos://work?path=/work/deliverables/${encodeURIComponent(id)}`,
      deduplicationKey: `work-due-${id}`,
      fireAt: future ? dueMs : now + 2_000,
      risk: 'R1',
      classification: 'work_confidential',
    })
    if (!future) seen.add(id)
    scheduled += 1
  }
  saveSeen(DELIVERABLE_SEEN_KEY, seen)
  return { ok: true, scheduled }
}

/** @internal */
export function __resetNativeAlertCachesForTests() {
  readyCache = null
}
