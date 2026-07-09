/** @typedef {import('./types.js').GraphOpening} GraphOpening */

/** @typedef {'swing' | 'double' | 'sliding' | 'bypass' | 'bifold' | 'pocket'} DoorStyle */

/** Cycle order for UI (plan recommendation set included). */
export const DOOR_STYLE_ORDER = /** @type {const} */ ([
  'swing',
  'double',
  'sliding',
  'bypass',
  'bifold',
  'pocket',
])

/** @type {Record<DoorStyle, string>} */
export const DOOR_STYLE_LABELS = {
  swing: '平开',
  double: '双开',
  sliding: '推拉',
  bypass: '双轨',
  bifold: '折叠',
  pocket: '口袋',
}

/** Default opening width in inches (residential presets). */
/** @type {Record<DoorStyle, number>} */
export const DOOR_DEFAULT_SPAN_IN = {
  swing: 32,
  double: 60,
  sliding: 72,
  bypass: 60,
  bifold: 60,
  pocket: 32,
}

/** @param {DoorStyle | undefined} style */
export function doorStyleLabel(style) {
  return DOOR_STYLE_LABELS[style ?? 'swing'] ?? '平开'
}

/** @param {DoorStyle | undefined} style */
export function defaultDoorSpanIn(style) {
  return DOOR_DEFAULT_SPAN_IN[style ?? 'swing'] ?? 32
}

/** @param {DoorStyle | undefined} style */
export function nextDoorStyle(style) {
  const cur = style ?? 'swing'
  const i = DOOR_STYLE_ORDER.indexOf(cur)
  const next = DOOR_STYLE_ORDER[(i + 1) % DOOR_STYLE_ORDER.length]
  return next
}

/**
 * @param {GraphOpening} go
 * @returns {GraphOpening}
 */
export function cycleDoorStyleOpening(go) {
  if (go.type !== 'door') return go
  const style = nextDoorStyle(/** @type {DoorStyle | undefined} */ (go.style))
  return {
    ...go,
    style,
    spanIn: defaultDoorSpanIn(style),
    swing: go.swing ?? 'out',
  }
}
