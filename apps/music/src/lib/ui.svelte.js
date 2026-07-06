export const toastState = $state({ msg: '', show: false });

let toastTimer = null;

/**
 * @param {string} msg
 * @param {{ duration?: number, error?: boolean }} [opts]
 */
export function toast(msg, opts = {}) {
  const ms = opts.duration ?? (opts.error ? 5000 : 2000);
  toastState.msg = msg;
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
