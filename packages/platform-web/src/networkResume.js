import { bindPwaForegroundResume } from '@life-os/theme'

/**
 * @typedef {{
 *   onResume?: () => void;
 *   shouldDefer?: () => boolean;
 *   deferMs?: number;
 *   skipWhenOffline?: boolean;
 *   when?: () => boolean;
 * }} NetworkResumeOptions
 */

/**
 * Resume queued work when the app returns to foreground **or** network comes
 * back online. Always flushes iOS PWA viewport height via the underlying
 * {@link bindPwaForegroundResume} hook (even when `onResume` is omitted).
 *
 * This is the cross-app pattern for "background work" on Life OS: iOS does not
 * run Background Sync, so reconcile on foreground + on `online` instead.
 *
 * @param {NetworkResumeOptions} [options]
 * @returns {() => void} cleanup
 */
export function bindNetworkResume(options = {}) {
  const {
    onResume,
    shouldDefer = () => false,
    deferMs,
    skipWhenOffline = true,
    when = () => true,
  } = options

  if (typeof window === 'undefined') return () => {}

  const run = () => {
    if (!when()) return
    if (
      skipWhenOffline &&
      typeof navigator !== 'undefined' &&
      !navigator.onLine
    )
      return
    onResume?.()
  }

  const cleanupForeground = bindPwaForegroundResume({
    onForeground: run,
    shouldDefer,
    deferMs,
  })

  const onOnline = () => run()
  window.addEventListener('online', onOnline)

  return () => {
    cleanupForeground()
    window.removeEventListener('online', onOnline)
  }
}
