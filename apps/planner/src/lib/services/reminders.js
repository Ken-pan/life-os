import { browser } from '$app/environment';
import { S } from '../state.svelte.js';
import { saveReminderJobs, clearReminderJobs } from '../persist/reminderStore.js';
import {
  getNativeCapabilities,
  hasNativeLocalNotifications,
  isNativeBridgeAvailable,
  nativeNotificationsCancel,
  nativeNotificationsRequestPermission,
  nativeNotificationsSyncReminders,
} from '@life-os/platform-web/kenos-native-bridge';

/** @typedef {{ id: string, title: string, fireAt: number, dueDate?: string|null, dueTime?: string|null }} ReminderJob */

/** @type {{ at: number, value: boolean } | null} */
let nativeLocalCache = null
const NATIVE_LOCAL_TTL_MS = 8_000

/** @param {import('../types.js').Task} task */
export function reminderFireAt(task) {
  if (task.completed || !task.dueDate || task.reminderMinutes == null) return null;
  const [y, m, d] = task.dueDate.split('-').map(Number);
  let hours = 9;
  let minutes = 0;
  if (task.dueTime) {
    const [h, min] = task.dueTime.split(':').map(Number);
    hours = h;
    minutes = min;
  }
  const dueMs = new Date(y, m - 1, d, hours, minutes, 0, 0).getTime();
  const fireAt = dueMs - task.reminderMinutes * 60_000;
  return fireAt > Date.now() ? fireAt : null;
}

/** @returns {ReminderJob[]} */
export function buildReminderJobs() {
  if (!browser || !S.settings.notificationsEnabled) return [];
  return S.tasks
    .filter((t) => !t.completed && !t.deletedAt)
    .map((t) => {
      const fireAt = reminderFireAt(t);
      if (!fireAt) return null;
      return {
        id: t.id,
        title: t.title,
        fireAt,
        dueDate: t.dueDate,
        dueTime: t.dueTime
      };
    })
    .filter(Boolean);
}

/** @returns {Promise<boolean>} */
async function nativeLocalNotificationsReady() {
  if (!isNativeBridgeAvailable()) {
    nativeLocalCache = null;
    return false;
  }
  const now = Date.now();
  if (nativeLocalCache && now - nativeLocalCache.at < NATIVE_LOCAL_TTL_MS) {
    return nativeLocalCache.value;
  }
  const caps = await getNativeCapabilities();
  const value = hasNativeLocalNotifications(caps);
  nativeLocalCache = { at: now, value };
  return value;
}

/** @internal test helper */
export function __resetNativeLocalCacheForTests() {
  nativeLocalCache = null;
}

export async function requestNotificationPermission() {
  if (!browser) return 'unsupported';

  if (await nativeLocalNotificationsReady()) {
    const result = await nativeNotificationsRequestPermission();
    const status = String(result?.status || '');
    if (status === 'authorized' || status === 'granted') return 'granted';
    if (status === 'denied') return 'denied';
    if (status === 'not_determined') return 'default';
    if (result?.skipped) {
      /* fall through to web Notification */
    } else if (status) {
      return status === 'unsupported' ? 'unsupported' : 'denied';
    }
  }

  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  const result = await Notification.requestPermission();
  return result;
}

export function notificationPermission() {
  if (!browser) return 'unsupported';
  if (isNativeBridgeAvailable()) {
    // Sync probe only — detailed status is async via getStatus.
    return typeof Notification !== 'undefined' ? Notification.permission : 'default';
  }
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/**
 * Sync reminders to Kenos iOS local notifications when inside Continuity.
 * @param {ReminderJob[]} jobs
 * @param {{ nativeReady?: boolean }} [opts]
 */
export async function syncRemindersToNative(jobs, opts = {}) {
  const ready =
    typeof opts.nativeReady === 'boolean' ? opts.nativeReady : await nativeLocalNotificationsReady();
  if (!ready) {
    return { ok: false, skipped: true, code: 'native_local_notifications_unavailable' };
  }
  if (!S.settings.notificationsEnabled || !jobs.length) {
    await nativeNotificationsCancel({ type: 'plan_reminder' });
    return { ok: true, scheduled: 0, cleared: true };
  }
  return nativeNotificationsSyncReminders({ jobs });
}

/**
 * Continuity → native UN; browser/PWA → Service Worker.
 * Call sites keep using `syncRemindersToServiceWorker` (alias).
 */
export async function syncReminders() {
  if (!browser) return;

  const nativeReady = await nativeLocalNotificationsReady();

  if (!S.settings.notificationsEnabled) {
    await clearReminderJobs().catch(() => {});
    if (nativeReady) {
      await nativeNotificationsCancel({ type: 'plan_reminder' });
    }
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      reg?.active?.postMessage({ type: 'CLEAR_REMINDERS' });
    }
    return;
  }

  const jobs = buildReminderJobs();
  await saveReminderJobs(jobs).catch(() => {});

  if (nativeReady) {
    await syncRemindersToNative(jobs, { nativeReady: true });
    // Avoid double-fire: clear any leftover SW timers while in Continuity.
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      reg?.active?.postMessage({ type: 'CLEAR_REMINDERS' });
    }
    return;
  }

  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  if (!reg?.active) return;
  reg.active.postMessage({
    type: 'RESCHEDULE_REMINDERS',
    jobs
  });
}

/** @deprecated Prefer syncReminders — kept for existing call sites. */
export async function syncRemindersToServiceWorker() {
  return syncReminders();
}

/** Best-effort Web Push subscription after local reminders are synced. */
export async function ensurePushSubscription() {
  if (!browser || !S.settings.notificationsEnabled) return;
  // Continuity uses native local notifications; skip Web Push there.
  if (await nativeLocalNotificationsReady()) return;
  if (notificationPermission() !== 'granted') return;
  const { subscribePlannerPushNotifications } = await import('../pushSubscription.js');
  await subscribePlannerPushNotifications();
}

/** @param {import('../types.js').Task} task */
export async function showLocalNotification(task) {
  if (!browser) return;
  if (await nativeLocalNotificationsReady()) {
    // Native path schedules via syncReminders; no immediate web banner.
    return;
  }
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  if (reg?.showNotification) {
    await reg.showNotification('Kenos Plan', {
      body: task.title,
      icon: '/notify-192.png',
      badge: '/notify-192.png',
      tag: `planos-${task.id}`,
      data: { url: '/', taskId: task.id }
    });
  } else {
    new Notification('Kenos Plan', { body: task.title, icon: '/notify-192.png' });
  }
}
