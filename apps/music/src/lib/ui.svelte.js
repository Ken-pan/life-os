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
