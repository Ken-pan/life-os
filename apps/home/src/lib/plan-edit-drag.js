import { OPENING_EDIT_BINDINGS, resolveWallBinding } from './spatial/wall-edit.js'

/** @typedef {{ kind: 'wall' | 'opening', id: string, mode?: 'move' | 'width' }} EditDragSelection */

/**
 * @param {HTMLElement} el
 * @param {{
 *   getZoom: () => number,
 *   onDragStart: () => void,
 *   onSelect: (sel: EditDragSelection | null) => void,
 *   onPreview: (sel: EditDragSelection, deltaPx: number, clientX: number, clientY: number) => void,
 *   onCommit: (sel: EditDragSelection, deltaPx: number) => void,
 *   onDragEnd: () => void,
 * }} opts
 */
export function bindPlanEditDrag(el, opts) {
  /** @type {EditDragSelection | null} */
  let active = null
  let startX = 0
  let startY = 0
  let moved = 0

  /** @param {PointerEvent} e */
  function down(e) {
    if (e.button !== 0) return
    const wall = e.target instanceof Element ? e.target.closest('[data-wall-id]') : null
    const resize =
      e.target instanceof Element ? e.target.closest('[data-drag-mode="width"]') : null
    const opening =
      resize ??
      (e.target instanceof Element ? e.target.closest('[data-opening-id]') : null)
    if (!wall && !opening) return
    e.preventDefault()
    e.stopPropagation()
    el.setPointerCapture(e.pointerId)
    if (wall) {
      active = { kind: 'wall', id: wall.getAttribute('data-wall-id') ?? '' }
    } else if (opening) {
      active = {
        kind: 'opening',
        id: opening.getAttribute('data-opening-id') ?? '',
        mode: opening.getAttribute('data-drag-mode') === 'width' ? 'width' : 'move',
      }
    }
    startX = e.clientX
    startY = e.clientY
    moved = 0
    opts.onDragStart()
    if (active) opts.onSelect(active)
  }

  /** @param {PointerEvent} e */
  function move(e) {
    if (!active) return
    const dx = (e.clientX - startX) / opts.getZoom()
    const dy = (e.clientY - startY) / opts.getZoom()
    moved += Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY)
    const deltaPx =
      active.kind === 'wall'
        ? pickWallDelta(active.id, dx, dy)
        : pickOpeningDelta(active.id, dx, dy, active.mode)
    opts.onPreview(active, deltaPx, e.clientX, e.clientY)
    e.preventDefault()
  }

  /** @param {PointerEvent} e */
  function up(e) {
    if (!active) return
    const dx = (e.clientX - startX) / opts.getZoom()
    const dy = (e.clientY - startY) / opts.getZoom()
    const deltaPx =
      active.kind === 'wall'
        ? pickWallDelta(active.id, dx, dy)
        : pickOpeningDelta(active.id, dx, dy, active.mode)
    if (moved > 6) {
      opts.onCommit(active, deltaPx)
      el.dataset.dragged = '1'
    }
    active = null
    opts.onDragEnd()
    try {
      el.releasePointerCapture(e.pointerId)
    } catch {
      /* ok */
    }
  }

  el.addEventListener('pointerdown', down)
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)

  return {
    destroy() {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    },
  }
}

/** @param {string} wallId @param {number} dx @param {number} dy */
function pickWallDelta(wallId, dx, dy) {
  const binding = resolveWallBinding(wallId)
  return binding?.orientation === 'h' ? dy : dx
}

/** @param {string} openingId @param {number} dx @param {number} dy @param {'move' | 'width' | undefined} mode */
function pickOpeningDelta(openingId, dx, dy, mode) {
  if (mode === 'width') return dx
  const binding = OPENING_EDIT_BINDINGS[openingId]
  return binding?.axis === 'y' ? dy : dx
}
