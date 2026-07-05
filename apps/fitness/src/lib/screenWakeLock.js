/** @type {WakeLockSentinel | null} */
let sentinel = null;

/** 是否仍需要保持常亮（页面生命周期内） */
let shouldHold = false;

/** @type {(() => void) | null} */
let detachListeners = null;

export function screenWakeLockSupported() {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

function canRequestNow() {
  return (
    typeof document !== 'undefined' &&
    document.visibilityState === 'visible' &&
    shouldHold
  );
}

function onSentinelRelease() {
  sentinel = null;
  if (canRequestNow()) void acquireScreenWakeLock();
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible' && shouldHold) {
    void acquireScreenWakeLock();
  }
}

function onPageShow() {
  if (shouldHold && document.visibilityState === 'visible') {
    void acquireScreenWakeLock();
  }
}

function attachListeners() {
  if (detachListeners) return;
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pageshow', onPageShow);
  detachListeners = () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pageshow', onPageShow);
    detachListeners = null;
  };
}

/**
 * 申请 Screen Wake Lock（W3C 标准 API，替代 NoSleep 等 hack）
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
 */
export async function acquireScreenWakeLock() {
  if (!screenWakeLockSupported() || !canRequestNow()) return false;

  try {
    if (sentinel && !sentinel.released) return true;
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', onSentinelRelease, { once: true });
    return true;
  } catch {
    return false;
  }
}

export async function releaseScreenWakeLock() {
  shouldHold = false;
  detachListeners?.();
  detachListeners = null;

  if (!sentinel) return;

  try {
    await sentinel.release();
  } catch {
    /* already released */
  }
  sentinel = null;
}

/**
 * 页面活跃期间保持常亮。
 * - 切回前台 / 从 bfcache 恢复 / 系统意外释放后自动重新申请
 * @returns {() => void} cleanup
 */
export function bindScreenWakeLock() {
  shouldHold = true;
  attachListeners();
  void acquireScreenWakeLock();

  return () => {
    void releaseScreenWakeLock();
  };
}

/**
 * 部分 iOS 版本首次 request 需用户手势；可在首次交互时再试一次。
 * @returns {() => void} cleanup
 */
export function bindScreenWakeLockWithGestureFallback() {
  const release = bindScreenWakeLock();

  const onFirstGesture = () => {
    void acquireScreenWakeLock();
    window.removeEventListener('pointerdown', onFirstGesture, true);
  };

  window.addEventListener('pointerdown', onFirstGesture, true);

  return () => {
    window.removeEventListener('pointerdown', onFirstGesture, true);
    release();
  };
}
