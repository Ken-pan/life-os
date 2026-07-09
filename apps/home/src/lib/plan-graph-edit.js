/** @typedef {'wallAdd' | 'remove' | 'select'} GraphTool */

/**
 * @param {HTMLElement} el
 * @param {{
 *   getZoom: () => number,
 *   getTool: () => GraphTool,
 *   clientToSvg: (clientX: number, clientY: number) => { x: number, y: number },
 *   onWallChainPoint: (pt: { x: number, y: number }) => void,
 *   onRemoveEdge: (edgeId: string) => void,
 *   onSelectEdge: (edgeId: string) => void,
 * }} opts
 */
export function bindPlanGraphEdit(el, opts) {
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
      opts.onWallChainPoint(pt)
      el.dataset.dragged = '1'
      return
    }
    if (tool === 'select') {
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

  el.addEventListener('pointerdown', down, { capture: true })
  return {
    destroy() {
      el.removeEventListener('pointerdown', down, { capture: true })
    },
  }
}
