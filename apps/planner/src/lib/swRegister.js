import { browser } from '$app/environment';
import { syncRemindersToServiceWorker } from './services/reminders.js';

export async function registerServiceWorker() {
  if (!browser || !('serviceWorker' in navigator)) return () => {};
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await syncRemindersToServiceWorker();
    return () => {};
  } catch {
    return () => {};
  }
}

export { syncRemindersToServiceWorker };
