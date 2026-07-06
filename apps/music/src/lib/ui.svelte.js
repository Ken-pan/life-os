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
