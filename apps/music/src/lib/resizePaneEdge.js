/**
 * Left-edge drag resize for a fixed right-side panel.
 * Pointer Events + capture + rAF coalescing (MDN / shadcn resizable pattern).
 */

/**
 * @param {HTMLElement} node
 * @param {{
 *   getWidth: () => number,
 *   onResize: (width: number) => void,
 *   onDragStart?: () => void,
 *   onDragEnd?: () => void,
 *   computeWidth?: (startWidth: number, startX: number, clientX: number) => number,
 *   keyboardStep?: number,
 * }} opts
 */
export function resizePaneEdge(node, opts) {
  /** @type {typeof opts} */
  let params = opts
  let dragging = false
  let startX = 0
  let startWidth = 0
  /** @type {number} */
  let rafId = 0
  let pendingX = 0

  /** @param {number} startW @param {number} originX @param {number} clientX */
  function defaultCompute(startW, originX, clientX) {
    return startW + (originX - clientX)
  }

  /** @param {number} clientX */
  function applyAt(clientX) {
    const compute = params.computeWidth ?? defaultCompute
    params.onResize(compute(startWidth, startX, clientX))
  }

  /** @param {PointerEvent} e */
  function onPointerDown(e) {
    if (!e.isPrimary || e.button !== 0) return
    e.preventDefault()
    dragging = true
    startX = e.clientX
    startWidth = params.getWidth()
    pendingX = e.clientX
    node.setPointerCapture(e.pointerId)
  }

  /** @param {PointerEvent} e */
  function onPointerMove(e) {
    if (!dragging || !e.isPrimary) return
    if (!rafId && startX === pendingX && e.clientX !== startX) {
      params.onDragStart?.()
    }
    pendingX = e.clientX
    if (rafId) return
    rafId = requestAnimationFrame(() => {
      rafId = 0
      if (!dragging) return
      applyAt(pendingX)
    })
  }

  /** @param {PointerEvent} e */
  function finishDrag(e) {
    if (!dragging) return
    dragging = false
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
      applyAt(pendingX || e.clientX)
    }
    if (node.hasPointerCapture(e.pointerId)) {
      node.releasePointerCapture(e.pointerId)
    }
    params.onDragEnd?.()
  }

  /** @param {PointerEvent} e */
  function onLostCapture(e) {
    if (!dragging) return
    dragging = false
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
      applyAt(pendingX || e.clientX)
    }
    params.onDragEnd?.()
  }

  /** @param {KeyboardEvent} e */
  function onKeyDown(e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const step = params.keyboardStep ?? (e.shiftKey ? 32 : 16)
    const delta = e.key === 'ArrowLeft' ? step : -step
    params.onResize(params.getWidth() + delta)
    params.onDragEnd?.()
  }

  node.addEventListener('pointerdown', onPointerDown)
  node.addEventListener('pointermove', onPointerMove)
  node.addEventListener('pointerup', finishDrag)
  node.addEventListener('pointercancel', finishDrag)
  node.addEventListener('lostpointercapture', onLostCapture)
  node.addEventListener('keydown', onKeyDown)

  return {
    /** @param {typeof opts} next */
    update(next) {
      params = next
    },
    destroy() {
      dragging = false
      if (rafId) cancelAnimationFrame(rafId)
      node.removeEventListener('pointerdown', onPointerDown)
      node.removeEventListener('pointermove', onPointerMove)
      node.removeEventListener('pointerup', finishDrag)
      node.removeEventListener('pointercancel', finishDrag)
      node.removeEventListener('lostpointercapture', onLostCapture)
      node.removeEventListener('keydown', onKeyDown)
    },
  }
}
