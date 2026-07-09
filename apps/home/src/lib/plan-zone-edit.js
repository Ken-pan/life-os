/** @typedef {'zoneAdd' | 'zoneSelect' | 'zoneRemove'} ZoneTool */

/**
 * @param {HTMLElement} el
 * @param {{
 *   getTool: () => ZoneTool,
 *   clientToSvg: (clientX: number, clientY: number) => { x: number, y: number },
 *   onZoneChainPoint: (pt: { x: number, y: number }) => void,
 *   onSelectZone: (zoneId: string) => void,
 *   onRemoveZone: (zoneId: string) => void,
 *   onZoneVertexDragStart?: (zoneId: string, index: number) => void,
 *   onZoneVertexDrag?: (zoneId: string, index: number, pt: { x: number, y: number }) => void,
 *   onZoneVertexDrop?: (zoneId: string, index: number, pt: { x: number, y: number }) => void,
 * }} opts
 */
export function bindPlanZoneEdit(el, opts) {
  /** @type {string | null} */
  let dragZoneId = null
  /** @type {number | null} */
  let dragVertexIndex = null
  /** @type {number | null} */
  let capturePointerId = null

  /** @param {Element | null | undefined} target */
  function zoneIdFrom(target) {
    const hit =
      target instanceof Element ? target.closest('[data-spatial-zone-id]') : null
    return hit?.getAttribute('data-spatial-zone-id') ?? null
  }

  /** @param {Element | null | undefined} target */
  function vertexFrom(target) {
    const hit =
      target instanceof Element
        ? target.closest('[data-zone-vertex-index]')
        : null
    const zoneId = hit?.getAttribute('data-spatial-zone-id')
    const idx = hit?.getAttribute('data-zone-vertex-index')
    if (!zoneId || idx == null) return null
    return { zoneId, index: Number(idx) }
  }

  /** @param {PointerEvent} e */
  function down(e) {
    if (e.button !== 0) return
    const tool = opts.getTool()
    if (tool === 'zoneRemove') {
      const zoneId = zoneIdFrom(e.target instanceof Element ? e.target : null)
      if (zoneId) {
        e.preventDefault()
        e.stopPropagation()
        opts.onRemoveZone(zoneId)
        el.dataset.dragged = '1'
      }
      return
    }
    if (tool === 'zoneAdd') {
      e.preventDefault()
      e.stopPropagation()
      const pt = opts.clientToSvg(e.clientX, e.clientY)
      opts.onZoneChainPoint(pt)
      el.dataset.dragged = '1'
      return
    }
    if (tool === 'zoneSelect') {
      const vtx = vertexFrom(e.target instanceof Element ? e.target : null)
      if (vtx) {
        e.preventDefault()
        e.stopPropagation()
        dragZoneId = vtx.zoneId
        dragVertexIndex = vtx.index
        capturePointerId = e.pointerId
        el.setPointerCapture(e.pointerId)
        opts.onZoneVertexDragStart?.(vtx.zoneId, vtx.index)
        el.dataset.dragged = '1'
        return
      }
      const zoneId = zoneIdFrom(e.target instanceof Element ? e.target : null)
      if (zoneId) {
        e.preventDefault()
        e.stopPropagation()
        opts.onSelectZone(zoneId)
        el.dataset.dragged = '1'
      }
    }
  }

  /** @param {PointerEvent} e */
  function move(e) {
    if (dragZoneId == null || dragVertexIndex == null) return
    e.preventDefault()
    const pt = opts.clientToSvg(e.clientX, e.clientY)
    opts.onZoneVertexDrag?.(dragZoneId, dragVertexIndex, pt)
  }

  /** @param {PointerEvent} e */
  function up(e) {
    if (dragZoneId == null || dragVertexIndex == null) return
    const pt = opts.clientToSvg(e.clientX, e.clientY)
    opts.onZoneVertexDrop?.(dragZoneId, dragVertexIndex, pt)
    dragZoneId = null
    dragVertexIndex = null
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
