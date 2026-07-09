import { browser } from '$app/environment';
import { supabase, isSupabaseConfigured } from './supabase.js';
import { requireUserId } from './repo.js';

/** @returns {string | null} */
export function readVapidPublicKey() {
  if (!browser) return null;
  const key = import.meta.env.PUBLIC_VAPID_PUBLIC_KEY?.trim();
  return key || null;
}

export function isWebPushConfigured() {
  return Boolean(readVapidPublicKey());
}

/** @param {string} base64Url */
function urlBase64ToUint8Array(base64Url) {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

/** @param {PushSubscription} subscription */
function serializeSubscription(subscription) {
  const json = subscription.toJSON();
  return {
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
  };
}

/**
 * Subscribe this device for server-sent task reminders.
 * Call after Notification permission is granted.
 * @returns {Promise<'subscribed' | 'skipped' | 'unsupported' | 'error'>}
 */
export async function subscribePlannerPushNotifications() {
  if (!browser || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported';
  }
  const vapidPublicKey = readVapidPublicKey();
  if (!vapidPublicKey || !isSupabaseConfigured) return 'skipped';

  try {
    const reg = await navigator.serviceWorker.ready;
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    }

    const userId = await requireUserId();
    const serialized = serializeSubscription(subscription);
    const { error } = await supabase.from('planner_push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: serialized.endpoint,
        p256dh: serialized.p256dh,
        auth: serialized.auth,
        user_agent: navigator.userAgent,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,endpoint' },
    );
    if (error) return 'error';
    return 'subscribed';
  } catch {
    return 'error';
  }
}

/** Remove push subscriptions for the signed-in user on this device. */
export async function unsubscribePlannerPushNotifications() {
  if (!browser || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      if (isSupabaseConfigured) {
        const userId = await requireUserId().catch(() => null);
        if (userId) {
          await supabase
            .from('planner_push_subscriptions')
            .delete()
            .eq('user_id', userId)
            .eq('endpoint', endpoint);
        }
      }
    }
  } catch {
    /* best-effort */
  }
}
