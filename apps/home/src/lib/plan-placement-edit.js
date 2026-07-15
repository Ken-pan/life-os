/** @typedef {'place' | 'storage'} PlacementTool */

/**
 * @param {HTMLElement} el
 * @param {{
 *   getTool: () => PlacementTool,
 *   clientToSvg: (clientX: number, clientY: number) => { x: number, y: number },
 *   onPlacePoint?: (pt: { x: number, y: number }) => void,
 *   onSelectPlacement?: (id: string) => void,
 *   onAssignStorage?: (pt: { x: number, y: number }) => void,
 *   getPlacementRect?: (id: string) => { x: number, y: number, w: number, h: number } | null,
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
  /**
   * Where inside the piece the grab landed. Reported drag points are corrected
   * by this so the piece keeps its position relative to the cursor — without
   * it, grabbing a King bed near its edge teleports it up to half its width.
   * @type {{ x: number, y: number } | null}
   */
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
      const rect = opts.getPlacementRect?.(id)
      dragOffset = rect
        ? { x: pt.x - (rect.x + rect.w / 2), y: pt.y - (rect.y + rect.h / 2) }
        : { x: 0, y: 0 }
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

  /**
   * The pointer position expressed as where the piece's *centre* should go,
   * which is what the drag callbacks consume.
   * @param {PointerEvent} e
   */
  function centerPoint(e) {
    const pt = opts.clientToSvg(e.clientX, e.clientY)
    if (!dragOffset) return pt
    return { x: pt.x - dragOffset.x, y: pt.y - dragOffset.y }
  }

  /** @param {PointerEvent} e */
  function move(e) {
    if (!dragId) return
    e.preventDefault()
    opts.onPlacementDrag?.(dragId, centerPoint(e))
  }

  /** @param {PointerEvent} e */
  function up(e) {
    if (!dragId) return
    const pt = centerPoint(e)
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
