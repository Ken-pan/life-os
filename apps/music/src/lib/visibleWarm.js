import { browser } from '$app/environment'
import { warmTrackAudioFireAndForget } from './audioWarm.js'

/**
 * Svelte action: warm track audio when the row enters the viewport.
 * @param {HTMLElement} node
 * @param {import('./types.js').Track | null | undefined} track
 */
export function visibleWarm(node, track) {
  if (!browser || !track) return {}

  /** @type {import('./types.js').Track | null | undefined} */
  let current = track
  let warmed = false

  const observer = new IntersectionObserver(
    (entries) => {
      if (warmed || !current) return
      if (!entries.some((e) => e.isIntersecting)) return
      warmed = true
      warmTrackAudioFireAndForget(current)
      observer.disconnect()
    },
    { rootMargin: '120px 0px', threshold: 0.01 },
  )

  observer.observe(node)

  return {
    /** @param {import('./types.js').Track | null | undefined} next */
    update(next) {
      if (next?.id !== current?.id) {
        current = next
        warmed = false
        if (current) observer.observe(node)
      }
    },
    destroy() {
      observer.disconnect()
    },
  }
}
