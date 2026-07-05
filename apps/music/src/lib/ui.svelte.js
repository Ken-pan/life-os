export const toastState = $state({ msg: '', show: false });

let toastTimer = null;

/** @param {string} msg */
export function toast(msg) {
  toastState.msg = msg;
  toastState.show = true;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastState.show = false;
  }, 2000);
}

export const queueDrawerOpen = $state({ open: false });

export function openQueueDrawer() {
  queueDrawerOpen.open = true;
}

export function closeQueueDrawer() {
  queueDrawerOpen.open = false;
}
