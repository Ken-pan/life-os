/** @typedef {{ top: number, right: number, bottom: number, left: number }} ViewportInsets */
/** @typedef {{ x: number, y: number }} PlanPoint */
/** @typedef {'contain' | 'width'} PlanFitMode */

/**
 * Read padding insets from the plan viewer box (content area inside padding).
 * @param {HTMLElement | null} viewportEl
 * @returns {ViewportInsets}
 */
export function getViewportInsets(viewportEl) {
  if (!viewportEl) {
    return { top: 12, right: 12, bottom: 12, left: 12 }
  }
  const s = getComputedStyle(viewportEl)
  return {
    top: parseFloat(s.paddingTop) || 0,
    right: parseFloat(s.paddingRight) || 0,
    bottom: parseFloat(s.paddingBottom) || 0,
    left: parseFloat(s.paddingLeft) || 0,
  }
}

/**
 * Content box size inside viewer padding.
 * @param {HTMLElement} viewportEl
 * @returns {{ contentW: number, contentH: number, insets: ViewportInsets }}
 */
export function getViewportContentBox(viewportEl) {
  const insets = getViewportInsets(viewportEl)
  const contentW = Math.max(
    viewportEl.clientWidth - insets.left - insets.right,
    80,
  )
  const contentH = Math.max(
    viewportEl.clientHeight - insets.top - insets.bottom,
    80,
  )
  return { contentW, contentH, insets }
}

/**
 * Fit zoom/pan for SVG width:100% + canvas transform (origin top-left).
 * @param {{
 *   contentW: number,
 *   contentH: number,
 *   vbW: number,
 *   vbH: number,
 *   mode?: PlanFitMode,
 *   margin?: number,
 * }} opts
 */
export function computePlanFit(opts) {
  const {
    contentW,
    contentH,
    vbW,
    vbH,
    mode = 'contain',
    margin = 0.94,
  } = opts
  if (!vbW || !vbH) {
    return { zoom: 1, panX: 0, panY: 0, renderH: contentH }
  }

  const renderH = contentW * (vbH / vbW)
  let zoom = margin
  if (mode === 'contain') {
    zoom = Math.min(margin, (contentH * margin) / renderH)
  }
  zoom = Math.min(2.5, Math.max(0.1, zoom))

  let scaledH = renderH * zoom
  if (mode === 'contain' && scaledH > contentH - 1) {
    zoom = Math.max(0.1, (contentH - 1) / renderH)
    scaledH = renderH * zoom
  }

  const scaledW = contentW * zoom
  const panX = Math.max(0, (contentW - scaledW) / 2)
  const panY =
    mode === 'contain' ? Math.max(0, (contentH - scaledH) / 2) : 0

  return { zoom, panX, panY, renderH, scaledW, scaledH }
}

/**
 * Screen/client coords → SVG viewBox coords (uses browser CTM; handles pan/zoom/origin).
 * @param {SVGElement | null | undefined} svgEl
 * @param {number} clientX
 * @param {number} clientY
 * @returns {PlanPoint | null}
 */
export function clientToSvgPoint(svgEl, clientX, clientY) {
  if (!svgEl || typeof svgEl.createSVGPoint !== 'function') return null
  const svg = /** @type {SVGSVGElement} */ (svgEl)
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return null
  const local = pt.matrixTransform(ctm.inverse())
  return { x: local.x, y: local.y }
}

/**
 * SVG viewBox point → viewport-local CSS px (inside padding, before pan/zoom on canvas).
 * @param {SVGSVGElement} svgEl
 * @param {number} svgX
 * @param {number} svgY
 */
export function svgToClientPoint(svgEl, svgX, svgY) {
  const pt = svgEl.createSVGPoint()
  pt.x = svgX
  pt.y = svgY
  const ctm = svgEl.getScreenCTM()
  if (!ctm) return null
  const screen = pt.matrixTransform(ctm)
  return { x: screen.x, y: screen.y }
}

/**
 * Keep a canvas-local point fixed on screen while changing zoom (top-left transform origin).
 * @param {{
 *   viewportEl: HTMLElement,
 *   focalClientX: number,
 *   focalClientY: number,
 *   panX: number,
 *   panY: number,
 *   zoom: number,
 *   nextZoom: number,
 * }} args
 */
export function panForZoomAtPoint(args) {
  const {
    viewportEl,
    focalClientX,
    focalClientY,
    panX,
    panY,
    zoom,
    nextZoom,
  } = args
  const rect = viewportEl.getBoundingClientRect()
  const insets = getViewportInsets(viewportEl)
  const anchorX = focalClientX - rect.left - insets.left
  const anchorY = focalClientY - rect.top - insets.top
  const localX = (anchorX - panX) / zoom
  const localY = (anchorY - panY) / zoom
  return {
    zoom: nextZoom,
    panX: anchorX - localX * nextZoom,
    panY: anchorY - localY * nextZoom,
  }
}

/**
 * @param {number} z
 * @param {number} [min]
 */
export function clampPlanZoom(z, min = 0.1) {
  return Math.min(2.5, Math.max(min, Math.round(z * 100) / 100))
}
