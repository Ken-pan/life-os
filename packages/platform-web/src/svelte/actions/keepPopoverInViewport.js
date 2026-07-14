/**
 * Svelte action: keep a trigger's popover child within the horizontal viewport.
 *
 * Popovers/tooltips anchored to a trigger (typically `position: absolute; left: 0`)
 * overflow and get clipped when the trigger sits near the right screen edge. On
 * hover/focus this measures the popover and shifts it horizontally (via inline
 * `left`) so it stays on-screen — the edge-safety any tooltip / menu / popover
 * needs, without each app re-deriving it.
 *
 * The popover must be the trigger's absolutely-positioned descendant. Measurement
 * is synchronous (getBoundingClientRect flushes layout) — no requestAnimationFrame,
 * so it stays reliable even when frames are throttled. Only horizontal overflow is
 * handled (the common tooltip case); vertical anchoring is left to CSS.
 *
 * Usage:
 *   <span class="tip" use:keepPopoverInViewport={{ selector: '.tip-pop' }}>
 *     ?<span class="tip-pop">…</span>
 *   </span>
 *
 * @param {HTMLElement} node the trigger element (hover/focus target)
 * @param {{ selector?: string, margin?: number }} [options]
 *   selector — CSS selector for the popover within `node` (default '[data-popover]')
 *   margin   — min gap kept from each viewport edge, in px (default 8)
 */
export function keepPopoverInViewport(node, options = {}) {
  const opts = { selector: '[data-popover]', margin: 8, ...options }
  /** @type {HTMLElement | null} */
  const pop = node.querySelector(opts.selector)
  if (!pop) return

  function reposition() {
    // 先归零到基准位；getBoundingClientRect 同步 flush 布局，无需等待 rAF。
    pop.style.left = '0px'
    const rect = pop.getBoundingClientRect()
    const vw = document.documentElement.clientWidth
    let shift = 0
    if (rect.right > vw - opts.margin) shift = -(rect.right - (vw - opts.margin))
    else if (rect.left < opts.margin) shift = opts.margin - rect.left
    pop.style.left = `${Math.round(shift)}px`
  }

  node.addEventListener('mouseenter', reposition)
  node.addEventListener('focusin', reposition)

  return {
    update(next) {
      Object.assign(opts, next)
    },
    destroy() {
      node.removeEventListener('mouseenter', reposition)
      node.removeEventListener('focusin', reposition)
    },
  }
}
