/** @typedef {'viewAdd' | 'viewSelect'} ViewpointTool */

/**
 * 「视角」步骤的指针绑定。两种拖拽：拖圆点改位置，拖手柄改朝向。
 *
 * @param {HTMLElement} el
 * @param {{
 *   getTool: () => ViewpointTool,
 *   clientToSvg: (clientX: number, clientY: number) => { x: number, y: number },
 *   onAddPoint?: (pt: { x: number, y: number }) => void,
 *   onSelect?: (id: string) => void,
 *   onMoveStart?: (id: string) => void,
 *   onMove?: (id: string, pt: { x: number, y: number }) => void,
 *   onMoveDrop?: (id: string, pt: { x: number, y: number }) => void,
 *   onRotateStart?: (id: string) => void,
 *   onRotate?: (id: string, pt: { x: number, y: number }) => void,
 *   onRotateDrop?: (id: string, pt: { x: number, y: number }) => void,
 * }} opts
 */
export function bindPlanViewpointEdit(el, opts) {
  /** @type {string | null} */
  let dragId = null
  /** @type {'move' | 'rotate' | null} */
  let dragKind = null
  /** @type {number | null} */
  let capturePointerId = null

  /**
   * @param {Element | null} target
   * @param {string} attr
   */
  function idFrom(target, attr) {
    const hit = target instanceof Element ? target.closest(`[${attr}]`) : null
    return hit?.getAttribute(attr) ?? null
  }

  /** @param {PointerEvent} e */
  function down(e) {
    if (e.button !== 0) return
    const target = e.target instanceof Element ? e.target : null

    // 手柄要先于圆点判 —— 选中时两者在中轴上可能重叠。
    const rotateId = idFrom(target, 'data-viewpoint-rotate')
    if (rotateId) {
      e.preventDefault()
      e.stopPropagation()
      dragId = rotateId
      dragKind = 'rotate'
      capturePointerId = e.pointerId
      el.setPointerCapture(e.pointerId)
      opts.onRotateStart?.(rotateId)
      el.dataset.dragged = '1'
      return
    }

    const moveId = idFrom(target, 'data-viewpoint-id')
    if (moveId) {
      e.preventDefault()
      e.stopPropagation()
      dragId = moveId
      dragKind = 'move'
      capturePointerId = e.pointerId
      el.setPointerCapture(e.pointerId)
      opts.onSelect?.(moveId)
      opts.onMoveStart?.(moveId)
      el.dataset.dragged = '1'
      return
    }

    if (opts.getTool() === 'viewAdd') {
      e.preventDefault()
      e.stopPropagation()
      opts.onAddPoint?.(opts.clientToSvg(e.clientX, e.clientY))
      el.dataset.dragged = '1'
    }
  }

  /** @param {PointerEvent} e */
  function move(e) {
    if (!dragId) return
    e.preventDefault()
    const pt = opts.clientToSvg(e.clientX, e.clientY)
    if (dragKind === 'rotate') opts.onRotate?.(dragId, pt)
    else opts.onMove?.(dragId, pt)
  }

  /** @param {PointerEvent} e */
  function up(e) {
    if (!dragId) return
    const pt = opts.clientToSvg(e.clientX, e.clientY)
    if (dragKind === 'rotate') opts.onRotateDrop?.(dragId, pt)
    else opts.onMoveDrop?.(dragId, pt)
    dragId = null
    dragKind = null
    if (capturePointerId != null && el.hasPointerCapture(capturePointerId)) {
      el.releasePointerCapture(capturePointerId)
    }
    capturePointerId = null
  }

  el.addEventListener('pointerdown', down, { capture: true })
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
  return {
    destroy() {
      el.removeEventListener('pointerdown', down, { capture: true })
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    },
  }
}
