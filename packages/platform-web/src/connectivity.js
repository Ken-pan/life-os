/** @returns {boolean} */
export function isOnline() {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine !== false
}

/**
 * Subscribe to browser online/offline transitions.
 * @param {(online: boolean) => void} listener
 * @returns {() => void}
 */
export function bindOnlineStatus(listener) {
  if (typeof window === 'undefined') return () => {}

  const notify = () => listener(isOnline())
  notify()
  window.addEventListener('online', notify)
  window.addEventListener('offline', notify)

  return () => {
    window.removeEventListener('online', notify)
    window.removeEventListener('offline', notify)
  }
}
