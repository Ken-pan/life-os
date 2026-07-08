import { createToastStore } from '@life-os/platform-web/svelte/toast-store'

const toastStore = createToastStore()

export const toastState = toastStore.toastState
export const dismissToast = toastStore.dismissToast

/**
 * @param {string} msg
 * @param {'success'|'error'|'warn'} [tone]
 */
export function toast(msg, tone = 'success') {
  if (!String(msg ?? '').trim()) return
  toastStore.toast(msg, tone)
}
