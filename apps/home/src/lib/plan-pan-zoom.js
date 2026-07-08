/**
 * Lightweight pan + pinch-zoom for floor plan viewport (zero dependencies).
 * Based on touch-action + Pointer Events (MDN / pan-zoom library patterns).
 */

/**
 * @param {HTMLElement} node
 * @param {{
 *   getScale: () => number,
 *   setScale: (n: number) => void,
 *   getPan: () => { x: number, y: number },
 *   setPan: (p: { x: number, y: number }) => void,
 *   onGestureEnd?: () => void,
 * }} params
 */
export function planPanZoom(node, params) {
  /** @type {Map<number, { x: number, y: number }>} */
  const pointers = new Map()
  let lastPinch = 0
  let drag = false
  let lastX = 0
  let lastY = 0
  let moved = 0

  node.style.touchAction = 'none'

  function dist() {
    const pts = [...pointers.values()]
    if (pts.length < 2) return 0
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
  }

  /** @param {PointerEvent} e */
  function down(e) {
    if (e.button !== 0) return
    if (
      e.target instanceof Element &&
      e.target.closest('[data-wall-id],[data-opening-id],[data-zone]')
    ) {
      return
    }
    node.setPointerCapture(e.pointerId)
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.size === 1) {
      drag = true
      moved = 0
      lastX = e.clientX
      lastY = e.clientY
    } else if (pointers.size === 2) {
      lastPinch = dist()
      drag = false
    }
  }

  /** @param {PointerEvent} e */
  function move(e) {
    if (!pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.size >= 2 && lastPinch > 0) {
      const d = dist()
      if (d > 0) {
        const next = Math.min(2.5, Math.max(0.55, params.getScale() * (d / lastPinch)))
        params.setScale(Math.round(next * 100) / 100)
        lastPinch = d
      }
      e.preventDefault()
      return
    }
    if (drag && pointers.size === 1) {
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      moved += Math.abs(dx) + Math.abs(dy)
      const pan = params.getPan()
      params.setPan({ x: pan.x + dx, y: pan.y + dy })
      lastX = e.clientX
      lastY = e.clientY
      e.preventDefault()
    }
  }

  /** @param {PointerEvent} e */
  function up(e) {
    pointers.delete(e.pointerId)
    if (pointers.size < 2) lastPinch = 0
    if (pointers.size === 0) {
      if (moved > 8) node.dataset.dragged = '1'
      else delete node.dataset.dragged
      drag = false
      params.onGestureEnd?.()
    }
    try {
      node.releasePointerCapture(e.pointerId)
    } catch {
      /* released */
    }
  }

  /** @param {WheelEvent} e */
  function wheel(e) {
    if (!(e.ctrlKey || e.metaKey)) return
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.08 : 0.08
    const next = Math.min(2.5, Math.max(0.55, params.getScale() + delta))
    params.setScale(Math.round(next * 100) / 100)
  }

  node.addEventListener('pointerdown', down)
  node.addEventListener('pointermove', move)
  node.addEventListener('pointerup', up)
  node.addEventListener('pointercancel', up)
  node.addEventListener('wheel', wheel, { passive: false })

  return {
    destroy() {
      node.removeEventListener('pointerdown', down)
      node.removeEventListener('pointermove', move)
      node.removeEventListener('pointerup', up)
      node.removeEventListener('pointercancel', up)
      node.removeEventListener('wheel', wheel)
    },
  }
}
