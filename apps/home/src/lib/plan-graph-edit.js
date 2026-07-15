/** @typedef {'wallAdd' | 'remove' | 'select' | 'opening'} GraphTool */
/** @typedef {'move' | 'resize-start' | 'resize-end'} GraphOpeningDragMode */

/**
 * @param {HTMLElement} el
 * @param {{
 *   getZoom: () => number,
 *   getTool: () => GraphTool,
 *   clientToSvg: (clientX: number, clientY: number) => { x: number, y: number },
 *   onWallChainPoint: (pt: { x: number, y: number }, mods: { shiftKey: boolean, altKey: boolean }) => void,
 *   onRemoveEdge: (edgeId: string) => void,
 *   onSelectEdge: (edgeId: string) => void,
 *   onSelectOpening?: (openingId: string) => void,
 *   onOpeningDragStart?: (openingId: string, mode: GraphOpeningDragMode) => void,
   *   onOpeningDrag?: (openingId: string, pt: { x: number, y: number }, mode: GraphOpeningDragMode, clientX: number, clientY: number) => void,
 *   onOpeningDrop?: (openingId: string, pt: { x: number, y: number }, mode: GraphOpeningDragMode) => void,
 *   onVertexDragStart?: (vertexId: string) => void,
 *   onVertexDrag?: (vertexId: string, pt: { x: number, y: number }) => void,
 *   onVertexDrop?: (vertexId: string, pt: { x: number, y: number }) => void,
 *   onPlaceOpening?: (pt: { x: number, y: number }, edgeId: string) => void,
 * }} opts
 */
export function bindPlanGraphEdit(el, opts) {
  /** @type {string | null} */
  let dragVertexId = null
  /** @type {string | null} */
  let dragOpeningId = null
  /** @type {GraphOpeningDragMode | null} */
  let dragOpeningMode = null
  /** @type {number | null} */
  let capturePointerId = null

  /** @param {Element | null | undefined} target */
  function openingGrip(target) {
    const gripEl =
      target instanceof Element
        ? target.closest('[data-graph-opening-grip]')
        : null
    const grip = gripEl?.getAttribute('data-graph-opening-grip')
    if (grip === 'start' || grip === 'end') return grip
    return null
  }

  /** @param {Element | null | undefined} target */
  function openingIdFrom(target) {
    const hitEl =
      target instanceof Element
        ? target.closest('[data-graph-opening-id]')
        : null
    return hitEl?.getAttribute('data-graph-opening-id') ?? null
  }

  /** @param {PointerEvent} e */
  function down(e) {
    if (e.button !== 0) return
    const tool = opts.getTool()
    if (tool === 'remove') {
      const edgeEl =
        e.target instanceof Element ? e.target.closest('[data-edge-id]') : null
      const edgeId = edgeEl?.getAttribute('data-edge-id')
      if (edgeId) {
        e.preventDefault()
        e.stopPropagation()
        opts.onRemoveEdge(edgeId)
        el.dataset.dragged = '1'
      }
      return
    }
    if (tool === 'wallAdd') {
      e.preventDefault()
      e.stopPropagation()
      const pt = opts.clientToSvg(e.clientX, e.clientY)
      opts.onWallChainPoint(pt, { shiftKey: e.shiftKey, altKey: e.altKey })
      el.dataset.dragged = '1'
      return
    }
    if (tool === 'opening') {
      const openingId = openingIdFrom(
        e.target instanceof Element ? e.target : null,
      )
      if (openingId) {
        e.preventDefault()
        e.stopPropagation()
        opts.onSelectOpening?.(openingId)
        el.dataset.dragged = '1'
        return
      }
      const edgeEl =
        e.target instanceof Element ? e.target.closest('[data-edge-id]') : null
      const edgeId = edgeEl?.getAttribute('data-edge-id')
      if (edgeId) {
        e.preventDefault()
        e.stopPropagation()
        const pt = opts.clientToSvg(e.clientX, e.clientY)
        opts.onPlaceOpening?.(pt, edgeId)
        el.dataset.dragged = '1'
      }
      return
    }
    if (tool === 'select') {
      const grip = openingGrip(e.target instanceof Element ? e.target : null)
      const openingId = openingIdFrom(
        e.target instanceof Element ? e.target : null,
      )
      if (openingId) {
        e.preventDefault()
        e.stopPropagation()
        dragOpeningId = openingId
        dragOpeningMode = grip ? /** @type {GraphOpeningDragMode} */ (`resize-${grip}`) : 'move'
        capturePointerId = e.pointerId
        el.setPointerCapture(e.pointerId)
        opts.onSelectOpening?.(openingId)
        opts.onOpeningDragStart?.(openingId, dragOpeningMode)
        el.dataset.dragged = '1'
        return
      }
      const vertexEl =
        e.target instanceof Element
          ? e.target.closest('[data-vertex-id]')
          : null
      const vertexId = vertexEl?.getAttribute('data-vertex-id')
      if (vertexId) {
        e.preventDefault()
        e.stopPropagation()
        dragVertexId = vertexId
        capturePointerId = e.pointerId
        el.setPointerCapture(e.pointerId)
        opts.onVertexDragStart?.(vertexId)
        el.dataset.dragged = '1'
        return
      }
      const edgeEl =
        e.target instanceof Element ? e.target.closest('[data-edge-id]') : null
      const edgeId = edgeEl?.getAttribute('data-edge-id')
      if (edgeId) {
        e.preventDefault()
        e.stopPropagation()
        opts.onSelectEdge(edgeId)
        el.dataset.dragged = '1'
      }
    }
  }

  /** @param {PointerEvent} e */
  function move(e) {
    if (dragOpeningId && dragOpeningMode) {
      e.preventDefault()
      const pt = opts.clientToSvg(e.clientX, e.clientY)
      opts.onOpeningDrag?.(dragOpeningId, pt, dragOpeningMode, e.clientX, e.clientY)
      return
    }
    if (!dragVertexId) return
    e.preventDefault()
    const pt = opts.clientToSvg(e.clientX, e.clientY)
    opts.onVertexDrag?.(dragVertexId, pt)
  }

  /** @param {PointerEvent} e */
  function up(e) {
    if (dragOpeningId && dragOpeningMode) {
      const pt = opts.clientToSvg(e.clientX, e.clientY)
      opts.onOpeningDrop?.(dragOpeningId, pt, dragOpeningMode)
      dragOpeningId = null
      dragOpeningMode = null
      if (capturePointerId != null && el.hasPointerCapture(capturePointerId)) {
        el.releasePointerCapture(capturePointerId)
      }
      capturePointerId = null
      return
    }
    if (!dragVertexId) return
    const pt = opts.clientToSvg(e.clientX, e.clientY)
    opts.onVertexDrop?.(dragVertexId, pt)
    dragVertexId = null
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
