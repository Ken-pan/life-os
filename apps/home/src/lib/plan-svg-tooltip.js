/**
 * HTML tooltip for floor-plan SVG (Bill Mill / D3 pattern: div outside SVG, pointer-events: none).
 * WCAG 1.4.13: Escape dismiss, focus parity, touch tap-to-pin on coarse pointers.
 * @param {HTMLElement} viewportEl
 * @param {{ enabled?: () => boolean }} [opts]
 */
export function bindPlanSvgTooltip(viewportEl, opts = {}) {
  const tipId = `plan-tip-${Math.random().toString(36).slice(2, 9)}`
  const tip = document.createElement('div')
  tip.id = tipId
  tip.className = 'plan-svg-tooltip'
  tip.setAttribute('role', 'tooltip')
  tip.setAttribute('aria-hidden', 'true')
  viewportEl.appendChild(tip)

  const TIP_SEL =
    '[data-plan-tip],[data-zone],[data-wall-id],[data-opening-id],[data-edge-id],.furn-item,.zone-label-hit,.room-fill,.room-circ,.zone-marker'

  /** @type {Element | null} */
  let activeTrigger = null
  let pinned = false
  let moveRaf = 0
  /** @type {{ x: number, y: number }} */
  let lastPointer = { x: 0, y: 0 }
  let lastText = ''

  const coarsePointer =
    typeof matchMedia !== 'undefined' &&
    matchMedia('(hover: none), (pointer: coarse)').matches

  /** @param {Element | null} el */
  function tipText(el) {
    if (!el) return ''
    const explicit = el.getAttribute('data-plan-tip')
    if (explicit) return explicit
    const label = el.getAttribute('aria-label')
    if (label) return label
    const title = el.querySelector('title')
    if (title?.textContent) return title.textContent
    return ''
  }

  function clearDescribedBy() {
    if (activeTrigger) {
      activeTrigger.removeAttribute('aria-describedby')
      activeTrigger = null
    }
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   * @param {string} text
   * @param {Element | null} trigger
   */
  function showAt(clientX, clientY, text, trigger) {
    lastPointer = { x: clientX, y: clientY }
    lastText = text
    const r = viewportEl.getBoundingClientRect()
    const pad = 10
    let left = clientX - r.left + pad
    let top = clientY - r.top - pad
    tip.textContent = text
    tip.setAttribute('aria-hidden', 'false')
    tip.dataset.visible = '1'
    tip.style.left = `${left}px`
    tip.style.top = `${top}px`
    const box = tip.getBoundingClientRect()
    if (box.right > r.right - 4) {
      left = Math.max(4, clientX - r.left - box.width - pad)
      tip.style.left = `${left}px`
    }
    if (box.top < r.top + 4) {
      top = clientY - r.top + pad + 16
      tip.style.top = `${top}px`
    }
    if (box.bottom > r.bottom - 4) {
      top = Math.max(4, r.height - box.height - 8)
      tip.style.top = `${top}px`
    }
    if (trigger && trigger !== activeTrigger) {
      clearDescribedBy()
      activeTrigger = trigger
      trigger.setAttribute('aria-describedby', tipId)
    }
  }

  /** @param {boolean} [force] */
  function hide(force = false) {
    if (pinned && !force) return
    tip.setAttribute('aria-hidden', 'true')
    delete tip.dataset.visible
    tip.textContent = ''
    lastText = ''
    clearDescribedBy()
  }

  /** @param {PointerEvent} e */
  function onMove(e) {
    if (pinned) return
    if (opts.enabled && !opts.enabled()) {
      hide(true)
      return
    }
    lastPointer = { x: e.clientX, y: e.clientY }
    if (moveRaf) return
    moveRaf = requestAnimationFrame(() => {
      moveRaf = 0
      const hit =
        e.target instanceof Element ? e.target.closest(TIP_SEL) : null
      const text = tipText(hit)
      if (!text || !hit) {
        hide(true)
        return
      }
      showAt(e.clientX, e.clientY, text, hit)
    })
  }

  /** @param {FocusEvent} e */
  function onFocusIn(e) {
    if (opts.enabled && !opts.enabled()) return
    const hit =
      e.target instanceof Element ? e.target.closest(TIP_SEL) : null
    const text = tipText(hit)
    if (!text || !hit) return
    const box = hit.getBoundingClientRect()
    showAt(box.left + box.width / 2, box.top + box.height / 2, text, hit)
  }

  /** @param {FocusEvent} e */
  function onFocusOut(e) {
    if (pinned) return
    const next =
      e.relatedTarget instanceof Element
        ? e.relatedTarget.closest(TIP_SEL)
        : null
    if (next) return
    hide(true)
  }

  /** @param {PointerEvent} e */
  function onPointerDown(e) {
    if (!coarsePointer) return
    if (opts.enabled && !opts.enabled()) return
    const hit =
      e.target instanceof Element ? e.target.closest(TIP_SEL) : null
    const text = tipText(hit)
    if (text && hit) {
      pinned = true
      showAt(e.clientX, e.clientY, text, hit)
      return
    }
    if (pinned) {
      pinned = false
      hide(true)
    }
  }

  /** @param {KeyboardEvent} e */
  function onKeyDown(e) {
    if (e.key !== 'Escape') return
    if (!tip.dataset.visible) return
    pinned = false
    hide(true)
  }

  function onPointerLeave() {
    hide(true)
  }

  function onViewportChange() {
    if (!tip.dataset.visible || !lastText) return
    showAt(lastPointer.x, lastPointer.y, lastText, activeTrigger)
  }

  viewportEl.addEventListener('pointermove', onMove)
  viewportEl.addEventListener('pointerleave', onPointerLeave)
  viewportEl.addEventListener('pointerdown', onPointerDown)
  viewportEl.addEventListener('focusin', onFocusIn)
  viewportEl.addEventListener('focusout', onFocusOut)
  document.addEventListener('keydown', onKeyDown)
  window.addEventListener('scroll', onViewportChange, true)
  window.addEventListener('resize', onViewportChange)

  return {
    destroy() {
      viewportEl.removeEventListener('pointermove', onMove)
      viewportEl.removeEventListener('pointerleave', onPointerLeave)
      viewportEl.removeEventListener('pointerdown', onPointerDown)
      viewportEl.removeEventListener('focusin', onFocusIn)
      viewportEl.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onViewportChange, true)
      window.removeEventListener('resize', onViewportChange)
      if (moveRaf) cancelAnimationFrame(moveRaf)
      tip.remove()
    },
  }
}
