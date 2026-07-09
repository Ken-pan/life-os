import { browser } from '$app/environment';
import { S } from '../state.svelte.js';
import { saveReminderJobs, clearReminderJobs } from '../persist/reminderStore.js';

/** @typedef {{ id: string, title: string, fireAt: number, dueDate?: string|null, dueTime?: string|null }} ReminderJob */

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

export async function requestNotificationPermission() {
  if (!browser || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  const result = await Notification.requestPermission();
  return result;
}

export function notificationPermission() {
  if (!browser || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function syncRemindersToServiceWorker() {
  if (!browser || !('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready.catch(() => null);

  if (!S.settings.notificationsEnabled) {
    await clearReminderJobs().catch(() => {});
    reg?.active?.postMessage({ type: 'CLEAR_REMINDERS' });
    return;
  }

  const jobs = buildReminderJobs();
  await saveReminderJobs(jobs).catch(() => {});
  if (!reg?.active) return;
  reg.active.postMessage({
    type: 'RESCHEDULE_REMINDERS',
    jobs
  });
}

/** Best-effort Web Push subscription after local reminders are synced. */
export async function ensurePushSubscription() {
  if (!browser || !S.settings.notificationsEnabled) return;
  if (notificationPermission() !== 'granted') return;
  const { subscribePlannerPushNotifications } = await import('../pushSubscription.js');
  await subscribePlannerPushNotifications();
}

/** @param {import('../types.js').Task} task */
export async function showLocalNotification(task) {
  if (!browser || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  if (reg?.showNotification) {
    await reg.showNotification('PLANNER.OS', {
      body: task.title,
      icon: '/notify-192.png',
      badge: '/notify-192.png',
      tag: `planos-${task.id}`,
      data: { url: '/', taskId: task.id }
    });
  } else {
    new Notification('PLANNER.OS', { body: task.title, icon: '/notify-192.png' });
  }
}
