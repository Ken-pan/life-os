/**
 * Ask the browser to protect this origin's storage (IndexedDB, Cache Storage,
 * localStorage) from eviction under storage pressure.
 *
 * Without this, Chrome/Firefox may silently wipe an origin's data when disk is
 * low — fatal for apps that keep real data locally (music's Dexie library,
 * planner's reminder jobs). iOS Home Screen web apps are persisted implicitly,
 * so this is a no-op there; on other platforms it's a one-time cheap call.
 *
 * Best-effort: browsers may grant based on engagement heuristics without any
 * prompt, or deny silently. Safe to call on every startup.
 *
 * @returns {Promise<boolean>} whether storage is (now) persisted
 */
export async function requestPersistentStorage() {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
