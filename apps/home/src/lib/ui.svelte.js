import { createToastStore } from '@life-os/platform-web/svelte/toast-store'

const toastStore = createToastStore()

export const toastState = toastStore.toastState
export const dismissToast = toastStore.dismissToast

/**
 * @param {string} msg
 * @param {'success'|'error'|'warn' | { error?: boolean, warn?: boolean, actionLabel?: string, onAction?: () => void, duration?: number }} [toneOrOptions]
 * @param {{ actionLabel?: string, onAction?: () => void, duration?: number }} [options]
 */
export function toast(msg, toneOrOptions = 'success', options = {}) {
  if (!String(msg ?? '').trim()) return
  toastStore.toast(msg, toneOrOptions, options)
}
