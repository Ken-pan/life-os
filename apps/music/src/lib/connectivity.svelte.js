import { browser } from '$app/environment'
import { bindOnlineStatus } from '@life-os/platform-web/connectivity'

export const connectivity = $state({
  online: true,
  pendingSync: false,
  syncing: false,
  lastOnlineAt: 0,
  lastOfflineAt: 0,
  lastSyncAt: 0,
})

export function isOnline() {
  return !browser || navigator.onLine
}

export function markSyncPending() {
  connectivity.pendingSync = true
}

export function clearSyncPending() {
  connectivity.pendingSync = false
}

export function markSyncing(value) {
  connectivity.syncing = value
}

export function markSynced() {
  connectivity.pendingSync = false
  connectivity.lastSyncAt = Date.now()
}

/** @param {() => void | Promise<void>} [onOnline] */
export function bindConnectivity(onOnline) {
  if (!browser) return () => {}

  return bindOnlineStatus((online) => {
    if (connectivity.online === online) return
    connectivity.online = online
    if (online) {
      connectivity.lastOnlineAt = Date.now()
      if (connectivity.pendingSync) void onOnline?.()
    } else {
      connectivity.lastOfflineAt = Date.now()
    }
  })
}
