/** @typedef {{ height: number; width: number; offsetTop: number; offsetLeft: number }} ViewportRect */

/** @type {number | null} */
let lastSyncedHeight = null;

/** @returns {boolean} */
export function isStandalonePwa() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    /** @type {{ standalone?: boolean }} */ (navigator).standalone === true
  );
}

/** @returns {boolean} */
export function needsViewportHeightSync() {
  if (typeof window === 'undefined') return false;
  if (isStandalonePwa()) return true;
  return window.matchMedia('(max-width: 860px)').matches;
}

/** @returns {ViewportRect} */
export function getViewportRect() {
  if (typeof window === 'undefined') {
    return { height: 0, width: 0, offsetTop: 0, offsetLeft: 0 };
  }

  const vv = window.visualViewport;
  if (!vv) {
    return {
      height: window.innerHeight,
      width: window.innerWidth,
      offsetTop: 0,
      offsetLeft: 0
    };
  }

  return {
    height: vv.height,
    width: vv.width,
    offsetTop: vv.offsetTop,
    offsetLeft: vv.offsetLeft
  };
}

/** @returns {number} */
export function getVisualViewportHeight() {
  return getViewportRect().height;
}

/**
 * Bottom fixed chrome height (tab bar + visible mini player).
 * Prefers CSS `--bottom-chrome-h`, then live bottom-shell box height.
 * @returns {number}
 */
export function getBottomChromeHeight() {
  if (typeof document === 'undefined') return 0;

  const shell = document.querySelector('.bottom-shell');
  if (shell) {
    const token = parseFloat(getComputedStyle(shell).getPropertyValue('--bottom-chrome-h'));
    if (Number.isFinite(token) && token > 0) return token;

    const measured = shell.getBoundingClientRect().height;
    if (measured > 0) return measured;
  }

  const root = getComputedStyle(document.documentElement);
  const tabbar = parseFloat(root.getPropertyValue('--mobile-tabbar-total-h')) || 0;
  const miniPlayer = document.querySelector('.mini-player.show');
  const mini = miniPlayer ? parseFloat(root.getPropertyValue('--mini-player-h')) || 0 : 0;
  return tabbar + mini;
}

/**
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {{ padding?: number; bottomInset?: number }} [opts]
 * @returns {{ left: number; top: number }}
 */
export function clampPopoverPosition(x, y, width, height, opts = {}) {
  const padding = opts.padding ?? 8;
  const bottomInset = opts.bottomInset ?? getBottomChromeHeight() + padding;
  const { height: vh, width: vw, offsetTop, offsetLeft } = getViewportRect();

  let left = x;
  let top = y;

  const maxRight = offsetLeft + vw - padding;
  const minLeft = offsetLeft + padding;
  const maxBottom = offsetTop + vh - bottomInset;
  const minTop = offsetTop + padding;

  if (left + width > maxRight) left = Math.max(minLeft, maxRight - width);
  if (left < minLeft) left = minLeft;

  if (top + height > maxBottom) top = Math.max(minTop, maxBottom - height);
  if (top < minTop) top = minTop;

  return { left, top };
}

function syncViewportHeight(force = false) {
  const height = getVisualViewportHeight();
  if (!force && lastSyncedHeight === height) return;
  lastSyncedHeight = height;
  document.documentElement.style.setProperty('--app-vh', `${height}px`);
}

function syncStandaloneClass() {
  document.documentElement.classList.toggle('standalone-pwa', isStandalonePwa());
}

/**
 * Keep --app-vh aligned with visualViewport (iOS PWA standalone).
 * Uses rAF coalescing; skips work when height is unchanged.
 * @returns {() => void}
 */
export function bindViewportHeight() {
  if (typeof window === 'undefined') return () => {};

  syncViewportHeight(true);
  syncStandaloneClass();

  if (!needsViewportHeightSync()) {
    return () => {};
  }

  /** @type {number | null} */
  let rafId = null;

  const flush = () => {
    rafId = null;
    syncViewportHeight();
    syncStandaloneClass();
  };

  const schedule = () => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(flush);
  };

  window.visualViewport?.addEventListener('resize', schedule);
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);

  const standaloneMq = window.matchMedia('(display-mode: standalone)');
  standaloneMq.addEventListener('change', schedule);

  return () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    window.visualViewport?.removeEventListener('resize', schedule);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('orientationchange', schedule);
    standaloneMq.removeEventListener('change', schedule);
  };
}
