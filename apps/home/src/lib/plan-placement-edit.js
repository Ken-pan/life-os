/** @typedef {'place' | 'storage'} PlacementTool */

/**
 * @param {HTMLElement} el
 * @param {{
 *   getTool: () => PlacementTool,
 *   clientToSvg: (clientX: number, clientY: number) => { x: number, y: number },
 *   onPlacePoint?: (pt: { x: number, y: number }) => void,
 *   onSelectPlacement?: (id: string) => void,
 *   onAssignStorage?: (pt: { x: number, y: number }) => void,
 *   onPlacementDragStart?: (id: string) => void,
 *   onPlacementDrag?: (id: string, pt: { x: number, y: number }) => void,
 *   onPlacementDrop?: (id: string, pt: { x: number, y: number }) => void,
 * }} opts
 */
export function bindPlanPlacementEdit(el, opts) {
  /** @type {string | null} */
  let dragId = null
  /** @type {number | null} */
  let capturePointerId = null
  /** @type {{ x: number, y: number } | null} */
  let dragOffset = null

  /** @param {Element | null | undefined} target */
  function placementIdFrom(target) {
    const hit =
      target instanceof Element ? target.closest('[data-placement-id]') : null
    return hit?.getAttribute('data-placement-id') ?? null
  }

  /** @param {Element | null | undefined} target */
  function spatialZoneIdFrom(target) {
    const hit =
      target instanceof Element ? target.closest('[data-spatial-zone-id]') : null
    return hit?.getAttribute('data-spatial-zone-id') ?? null
  }

  /** @param {PointerEvent} e */
  function down(e) {
    if (e.button !== 0) return
    const tool = opts.getTool()
    const pt = opts.clientToSvg(e.clientX, e.clientY)

    if (tool === 'storage') {
      e.preventDefault()
      e.stopPropagation()
      opts.onAssignStorage?.(pt)
      el.dataset.dragged = '1'
      return
    }

    const id = placementIdFrom(e.target instanceof Element ? e.target : null)
    if (id) {
      e.preventDefault()
      e.stopPropagation()
      dragId = id
      capturePointerId = e.pointerId
      el.setPointerCapture(e.pointerId)
      opts.onSelectPlacement?.(id)
      opts.onPlacementDragStart?.(id)
      el.dataset.dragged = '1'
      return
    }

    if (tool === 'place') {
      e.preventDefault()
      e.stopPropagation()
      opts.onPlacePoint?.(pt)
      el.dataset.dragged = '1'
    }
  }

  /** @param {PointerEvent} e */
  function move(e) {
    if (!dragId) return
    e.preventDefault()
    const pt = opts.clientToSvg(e.clientX, e.clientY)
    opts.onPlacementDrag?.(dragId, pt)
  }

  /** @param {PointerEvent} e */
  function up(e) {
    if (!dragId) return
    const pt = opts.clientToSvg(e.clientX, e.clientY)
    opts.onPlacementDrop?.(dragId, pt)
    dragId = null
    dragOffset = null
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
