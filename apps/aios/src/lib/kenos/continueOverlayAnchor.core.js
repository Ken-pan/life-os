/**
 * Desktop Continue panel geometry — Floating UI–style flip/shift without a dependency.
 * Prefer CSS Anchor Positioning when browser + single stable anchor allow; until then
 * this keeps Direction A clear of left chrome (sidebar) and viewport edges.
 *
 * @see https://web.dev/learn/css/anchor-positioning
 * @see https://floating-ui.com/docs/flip
 */

/**
 * @param {{
 *   trigger: { left: number, right: number, top: number, bottom: number, height: number },
 *   viewport: { width: number, height: number },
 *   chromeLeft?: number,
 *   gap?: number,
 *   margin?: number,
 *   preferredWidth?: number,
 *   minWidth?: number,
 *   estimatedHeight?: number,
 * }} input
 * @returns {{ top: number, left: number, width: number, maxHeight: number }}
 */
export function computeAnchoredContinuePanel(input) {
  const gap = Number.isFinite(input.gap) ? Number(input.gap) : 8
  const margin = Number.isFinite(input.margin) ? Number(input.margin) : 12
  const preferredWidth = Number.isFinite(input.preferredWidth)
    ? Number(input.preferredWidth)
    : 440
  const minWidth = Number.isFinite(input.minWidth) ? Number(input.minWidth) : 320
  const estimatedHeight = Number.isFinite(input.estimatedHeight)
    ? Number(input.estimatedHeight)
    : 360
  const chromeLeft = Math.max(0, Number(input.chromeLeft) || 0)

  const vw = Math.max(0, Number(input.viewport?.width) || 0)
  const vh = Math.max(0, Number(input.viewport?.height) || 0)
  const r = input.trigger || { left: 0, right: 0, top: 0, bottom: 0, height: 0 }

  const width = Math.min(preferredWidth, Math.max(minWidth, vw - margin * 2))
  const maxHeight = Math.min(vh * 0.74, Math.max(160, vh - margin * 2))
  const panelH = Math.min(estimatedHeight, maxHeight)
  const minLeft = Math.max(margin, chromeLeft > 0 ? chromeLeft + gap : margin)

  // Prefer end-align when trigger sits in the right half (toolbar Continue).
  const preferEndAlign = r.left > vw * 0.45
  /** @type {number} */
  let left
  if (preferEndAlign) {
    left = Math.round(r.right - width)
  } else {
    // Prefer to the right of the trigger (sidebar Continue → panel clear of rail).
    left = Math.round(r.right + gap)
    if (left + width > vw - margin) {
      // flip-inline
      left = Math.round(r.left - gap - width)
    }
  }

  // shift: clamp into viewport, never under left chrome when measurable.
  left = Math.max(minLeft, Math.min(left, vw - width - margin))
  if (left + width > vw - margin) {
    left = Math.max(minLeft, vw - width - margin)
  }

  let top = Math.round(r.bottom + gap)
  if (top + panelH > vh - margin) {
    // flip-block
    top = Math.max(margin, Math.round(r.top - gap - panelH))
  }
  // Compact sidebar row: align to trigger top when height is small.
  if (!preferEndAlign && (r.height || 0) < 64) {
    top = Math.max(
      margin,
      Math.min(Math.round(r.top), vh - panelH - margin),
    )
  }
  top = Math.max(margin, Math.min(top, vh - Math.min(panelH, maxHeight) - margin))

  return {
    top,
    left,
    width: Math.round(width),
    maxHeight: Math.round(maxHeight),
  }
}

/**
 * Read left chrome inset (expanded sidebar) for desktop clamp.
 * @param {Document | null | undefined} doc
 * @param {number} [viewportWidth]
 * @returns {number}
 */
export function readContinueChromeLeftInset(doc, viewportWidth = 0) {
  if (!doc?.documentElement) return 0
  const vw = viewportWidth || doc.defaultView?.innerWidth || 0
  if (vw > 0 && vw < 900) return 0

  const sidebar = doc.querySelector(
    'aside.chat-sidebar, aside.sidebar, [data-testid="kenos-chat-sidebar"]',
  )
  if (sidebar && typeof sidebar.getBoundingClientRect === 'function') {
    const rect = sidebar.getBoundingClientRect()
    // Visible left rail only
    if (rect.width >= 160 && rect.left < 48 && rect.right > 80) {
      return Math.round(rect.right)
    }
  }

  try {
    const raw = getComputedStyle(doc.documentElement)
      .getPropertyValue('--sidebar-w')
      .trim()
    const parsed = Number.parseFloat(raw)
    if (Number.isFinite(parsed) && parsed >= 160) return Math.round(parsed)
  } catch {
    /* ignore */
  }
  return 0
}

/**
 * Serialize panel geometry for LifeOsSheet `sheetStyle`.
 * @param {{ top: number, left: number, width: number, maxHeight: number }} rect
 */
export function anchoredContinuePanelStyle(rect) {
  return [
    'position:fixed',
    `top:${rect.top}px`,
    `left:${rect.left}px`,
    `width:${rect.width}px`,
    `max-width:${rect.width}px`,
    `max-height:${rect.maxHeight}px`,
    'margin:0',
  ].join(';')
}
