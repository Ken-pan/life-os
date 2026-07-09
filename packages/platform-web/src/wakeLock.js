/**
 * Shared Screen Wake Lock helper (W3C Screen Wake Lock API), promoted from
 * fitness-os's original implementation so any app with a "keep the screen on
 * while this view is active" need (workout timers, recipe/reading views,
 * long-form audio/video controls) can reuse it instead of re-implementing
 * acquire/release/re-acquire-on-visible logic.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
 */

/**
 * Create an independent wake-lock controller. Each call owns its own sentinel
 * and listeners, so unrelated features in the same app (e.g. two timers) don't
 * fight over a shared module-level singleton.
 */
export function createScreenWakeLock() {
  /** @type {WakeLockSentinel | null} */
  let sentinel = null
  /** whether this controller should currently be holding the lock */
  let shouldHold = false
  /** @type {(() => void) | null} */
  let detachListeners = null

  function supported() {
    return typeof navigator !== 'undefined' && 'wakeLock' in navigator
  }

  function canRequestNow() {
    return typeof document !== 'undefined' && document.visibilityState === 'visible' && shouldHold
  }

  function onSentinelRelease() {
    sentinel = null
    if (canRequestNow()) void acquire()
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible' && shouldHold) void acquire()
  }

  function onPageShow() {
    if (shouldHold && document.visibilityState === 'visible') void acquire()
  }

  function attachListeners() {
    if (detachListeners) return
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pageshow', onPageShow)
    detachListeners = () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pageshow', onPageShow)
      detachListeners = null
    }
  }

  /** Request the lock now (no-op if unsupported or not currently eligible). */
  async function acquire() {
    if (!supported() || !canRequestNow()) return false
    try {
      if (sentinel && !sentinel.released) return true
      sentinel = await navigator.wakeLock.request('screen')
      sentinel.addEventListener('release', onSentinelRelease, { once: true })
      return true
    } catch {
      return false
    }
  }

  /** Release the lock and stop trying to re-acquire it. */
  async function release() {
    shouldHold = false
    detachListeners?.()
    detachListeners = null
    if (!sentinel) return
    try {
      await sentinel.release()
    } catch {
      // already released
    }
    sentinel = null
  }

  /**
   * Hold the lock for as long as the page is visible: re-acquires on
   * visibility return, bfcache restore (`pageshow`), or unexpected system release.
   * @returns {() => void} cleanup
   */
  function bind() {
    shouldHold = true
    attachListeners()
    void acquire()
    return () => {
      void release()
    }
  }

  /**
   * Same as {@link bind}, plus a retry on the first pointer interaction —
   * some iOS versions require a user gesture for the initial `request()`.
   * @returns {() => void} cleanup
   */
  function bindWithGestureFallback() {
    const cleanup = bind()
    const onFirstGesture = () => {
      void acquire()
      window.removeEventListener('pointerdown', onFirstGesture, true)
    }
    window.addEventListener('pointerdown', onFirstGesture, true)
    return () => {
      window.removeEventListener('pointerdown', onFirstGesture, true)
      cleanup()
    }
  }

  return { supported, acquire, release, bind, bindWithGestureFallback }
}
