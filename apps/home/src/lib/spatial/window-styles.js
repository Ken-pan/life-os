/** @typedef {import('./types.js').GraphOpening} GraphOpening */

/** @typedef {'fixed' | 'sliding' | 'casement' | 'hung'} WindowStyle */

/** Cycle order for UI. */
export const WINDOW_STYLE_ORDER = /** @type {const} */ ([
  'fixed',
  'sliding',
  'casement',
  'hung',
])

/** @type {Record<WindowStyle, string>} */
export const WINDOW_STYLE_LABELS = {
  fixed: '固定',
  sliding: '推拉',
  casement: '平开',
  hung: '上下推拉',
}

/** Default opening width in inches (US residential presets). */
/** @type {Record<WindowStyle, number>} */
export const WINDOW_DEFAULT_SPAN_IN = {
  fixed: 48,
  sliding: 60,
  casement: 30,
  hung: 36,
}

/** @param {WindowStyle | undefined} style */
export function windowStyleLabel(style) {
  return WINDOW_STYLE_LABELS[style ?? 'fixed'] ?? '固定'
}

/** @param {WindowStyle | undefined} style */
export function defaultWindowSpanIn(style) {
  return WINDOW_DEFAULT_SPAN_IN[style ?? 'fixed'] ?? 48
}

/** @param {WindowStyle | undefined} style */
export function nextWindowStyle(style) {
  const cur = style ?? 'fixed'
  const i = WINDOW_STYLE_ORDER.indexOf(cur)
  return WINDOW_STYLE_ORDER[(i + 1) % WINDOW_STYLE_ORDER.length]
}

/**
 * @param {GraphOpening} go
 * @returns {GraphOpening}
 */
export function cycleWindowStyleOpening(go) {
  if (go.type !== 'window') return go
  const style = nextWindowStyle(/** @type {WindowStyle | undefined} */ (go.style))
  return {
    ...go,
    style,
    spanIn: defaultWindowSpanIn(style),
    swing: go.swing ?? 'out',
  }
}
