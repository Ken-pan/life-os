import { browser } from '$app/environment'

/** Active background downloads (audio precache + import pipeline). */
export const backgroundActivity = $state({
  activeJobs: 0,
})

/** @param {number} delta */
export function trackBackgroundJob(delta) {
  if (!browser) return
  backgroundActivity.activeJobs = Math.max(0, backgroundActivity.activeJobs + delta)
}

/** @returns {() => void} */
export function beginBackgroundJob() {
  trackBackgroundJob(1)
  return () => trackBackgroundJob(-1)
}

/** @param {() => void} [listener] */
export function bindBackgroundJobAck(listener) {
  if (!browser || !('serviceWorker' in navigator)) return () => {}

  /** @param {MessageEvent} event */
  const onMessage = (event) => {
    if (event.data?.type === 'PRECACHE_AUDIO_DONE') listener?.()
  }

  navigator.serviceWorker.addEventListener('message', onMessage)
  return () => navigator.serviceWorker.removeEventListener('message', onMessage)
}
