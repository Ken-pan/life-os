export const toastState = $state({ msg: '', show: false, error: false });

let toastTimer = null;

export function dismissToast() {
  toastState.show = false;
  clearTimeout(toastTimer);
}

/**
 * @param {string} msg
 * @param {{ duration?: number, error?: boolean }} [opts]
 */
export function toast(msg, opts = {}) {
  const ms = opts.duration ?? (opts.error ? 5000 : 2000);
  toastState.msg = msg;
  toastState.error = Boolean(opts.error);
  toastState.show = true;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastState.show = false;
  }, ms);
}

export const queueDrawerOpen = $state({ open: false });

export function openQueueDrawer() {
  queueDrawerOpen.open = true;
}

export function closeQueueDrawer() {
  queueDrawerOpen.open = false;
}

/** @type {{ open: boolean; tab: 'queue' | 'lyrics' }} */
export const utilityPane = $state({ open: false, tab: 'queue' });

/** @param {'queue' | 'lyrics'} [tab='queue'] */
export function openUtilityPane(tab = 'queue') {
  utilityPane.open = true;
  utilityPane.tab = tab;
}

export function closeUtilityPane() {
  utilityPane.open = false;
}

/** @param {'queue' | 'lyrics'} [tab] */
export function toggleUtilityPane(tab) {
  if (utilityPane.open && (!tab || utilityPane.tab === tab)) {
    closeUtilityPane();
  } else {
    openUtilityPane(tab ?? utilityPane.tab);
  }
}

const REC_DEBUG_STORAGE_KEY = 'musicos:debug-rec';

/** Dev / audit only — never shown to normal users in production. */
export const recDebug = $state({ enabled: false });

/** @returns {boolean} */
function readRecDebugFlag() {
  if (typeof window === 'undefined') return false;
  try {
    const v = localStorage.getItem(REC_DEBUG_STORAGE_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* ignore */
  }
  return import.meta.env.DEV;
}

export function initRecDebug() {
  recDebug.enabled = readRecDebugFlag();
}

/** @param {boolean} on */
export function setRecDebugEnabled(on) {
  recDebug.enabled = on;
  if (!on) recommendationPreview.length = 0;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(REC_DEBUG_STORAGE_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function toggleRecDebug() {
  setRecDebugEnabled(!recDebug.enabled);
}

export function installRecDebugConsole() {
  if (typeof window === 'undefined') return;
  window.toggleMusicosRecDebug = () => {
    toggleRecDebug();
    console.info(
      `[musicos] recommendation debug ${recDebug.enabled ? 'enabled' : 'disabled'}`,
    );
    return recDebug.enabled;
  };
}

/** Last similar-continue picks — dev/audit queue panel only. */
export const recommendationPreview = $state(
  /** @type {Array<{ track: import('./types.js').Track, score: number, reasons: string[], matchedTags: string[] }>} */ ([]),
);
