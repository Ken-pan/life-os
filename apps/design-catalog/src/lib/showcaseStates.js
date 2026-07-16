/** @typedef {{ id: string, label: string }} ShowcaseState */

/** @type {Record<string, ShowcaseState[]>} */
export const SHOWCASE_STATE_REGISTRY = {
  buttons: [
    { id: 'default', label: 'Default' },
    { id: 'disabled', label: 'Disabled' },
  ],
  segments: [
    { id: 'default', label: 'Default' },
    { id: 'disabled', label: 'Disabled' },
  ],
  utilities: [
    { id: 'info', label: 'Info' },
    { id: 'positive', label: 'Success' },
    { id: 'warn', label: 'Warning' },
    { id: 'critical', label: 'Critical' },
    { id: 'portrait-gate', label: 'Portrait gate' },
  ],
  modal: [
    { id: 'default', label: 'Default' },
    { id: 'destructive', label: 'Destructive' },
  ],
  primitives: [
    { id: 'default', label: 'Skeleton' },
    { id: 'empty', label: 'Empty state' },
  ],
  menu: [{ id: 'default', label: 'Default' }],
  settings: [
    { id: 'default', label: 'Default' },
    { id: 'disabled', label: 'Disabled' },
    { id: 'destructive', label: 'Destructive' },
  ],
  'explain-panel': [
    { id: 'collapsed', label: 'Collapsed' },
    { id: 'expanded', label: 'Expanded' },
  ],
  navigation: [
    { id: 'default', label: 'BackButton' },
    { id: 'sheet-open', label: 'Sheet open' },
  ],
  feedback: [
    { id: 'sync-error', label: 'Sync error' },
    { id: 'warn', label: 'Warn toast' },
    { id: 'error', label: 'Error toast' },
  ],
  toast: [
    { id: 'success', label: 'Success' },
    { id: 'info', label: 'Info' },
  ],
  cards: [
    { id: 'surface', label: 'Surface' },
    { id: 'interactive', label: 'Interactive' },
    { id: 'disabled', label: 'Disabled' },
  ],
  'command-palette': [
    { id: 'default', label: 'Default' },
    { id: 'empty', label: 'Empty results' },
  ],
}

/**
 * @param {string} showcaseId
 * @returns {ShowcaseState[]}
 */
export function getShowcaseStates(showcaseId) {
  return (
    SHOWCASE_STATE_REGISTRY[showcaseId] ?? [{ id: 'default', label: 'Default' }]
  )
}

/**
 * @param {string} showcaseId
 * @param {string} stateId
 */
export function isValidShowcaseState(showcaseId, stateId) {
  return getShowcaseStates(showcaseId).some((s) => s.id === stateId)
}

/** @type {Record<string, number | Record<string, number>>} */
const MATRIX_IFRAME_HEIGHTS = {
  buttons: 168,
  segments: 196,
  utilities: { default: 168, 'portrait-gate': 220 },
  modal: 320,
  primitives: { default: 260, empty: 320 },
  menu: 260,
  settings: { default: 268, disabled: 228, destructive: 248 },
  'explain-panel': { collapsed: 168, expanded: 260 },
  navigation: { default: 132, 'sheet-open': 300 },
  feedback: 196,
  toast: 176,
  cards: 320,
  'command-palette': { default: 340, empty: 220 },
}

/**
 * @param {string} showcaseId
 * @param {string} [stateId]
 */
export function getMatrixIframeHeight(showcaseId, stateId) {
  const entry = MATRIX_IFRAME_HEIGHTS[showcaseId]
  if (typeof entry === 'number') return entry
  if (entry && stateId && entry[stateId]) return entry[stateId]
  if (entry && typeof entry === 'object') {
    return entry.default ?? 260
  }
  return 240
}
