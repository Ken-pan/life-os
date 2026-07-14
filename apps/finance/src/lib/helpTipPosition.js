/**
 * Svelte action：让 `.help-tip` 的气泡始终留在视口内。
 *
 * 气泡默认以触发图标为原点向右展开（`left: 0`）。当图标靠近屏幕右缘时，
 * 固定宽度的气泡会溢出被裁切。悬停/聚焦时测量气泡实际边界，用 `--ht-shift`
 * 自定义属性把它横向推回视口内（右缘超出则左移，左缘超出则右移）。
 *
 * 仅在触发时测量一次即可——横向平移不改变宽度。
 *
 * @param {HTMLElement} node 挂 `.help-tip` 的元素，其内应含一个 `.help-tip-pop`
 */
export function helpTipPosition(node) {
  /** @type {HTMLElement | null} */
  const pop = node.querySelector('.help-tip-pop')
  if (!pop) return

  const MARGIN = 8

  function reposition() {
    // 用 left 偏移（对绝对定位元素恒生效）。先归零到基准位再同步测量：
    // getBoundingClientRect 会强制 flush 布局，无需等待 rAF。
    pop.style.left = '0px'
    const rect = pop.getBoundingClientRect()
    const vw = document.documentElement.clientWidth
    let shift = 0
    if (rect.right > vw - MARGIN) shift = -(rect.right - (vw - MARGIN))
    else if (rect.left < MARGIN) shift = MARGIN - rect.left
    pop.style.left = `${Math.round(shift)}px`
  }

  node.addEventListener('mouseenter', reposition)
  node.addEventListener('focusin', reposition)

  return {
    destroy() {
      node.removeEventListener('mouseenter', reposition)
      node.removeEventListener('focusin', reposition)
    },
  }
}
