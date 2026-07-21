/**
 * RAF-gated `.show` for `.kenos-sheet-motion` (theme kenos-motion.css).
 * Matches LifeOsDialog / LifeOsSheet enter: mount hidden, next frame reveal.
 *
 * @param {() => boolean} isOpen
 */
export function useSheetEnterShown(isOpen) {
  let shown = $state(false)

  $effect(() => {
    if (!isOpen()) {
      shown = false
      return
    }
    const raf = requestAnimationFrame(() => {
      shown = true
    })
    return () => cancelAnimationFrame(raf)
  })

  return {
    get shown() {
      return shown
    },
  }
}
