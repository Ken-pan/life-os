/** @typedef {{ id: string, label: string }} ShowcaseState */

/** @type {Record<string, ShowcaseState[]>} */
export const SHOWCASE_STATE_REGISTRY = {
  buttons: [
    { id: 'default', label: 'Default' },
    { id: 'disabled', label: 'Disabled' },
    { id: 'icon', label: 'Icon buttons' },
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
    { id: 'text', label: 'Divider / Kbd' },
    { id: 'portrait-gate', label: 'Portrait gate' },
  ],
  modal: [
    { id: 'default', label: 'Default' },
    { id: 'destructive', label: 'Destructive' },
  ],
  primitives: [
    { id: 'default', label: 'Skeleton' },
    { id: 'empty', label: 'Empty state' },
    { id: 'error', label: 'Error state' },
  ],
  progress: [
    { id: 'default', label: 'Default' },
    { id: 'status', label: 'Semantic colors' },
    { id: 'steps', label: 'Steps' },
    { id: 'indeterminate', label: 'Indeterminate' },
  ],
  chips: [
    { id: 'default', label: 'Static / tag' },
    { id: 'filter', label: 'Filter' },
    { id: 'removable', label: 'Removable' },
  ],
  stat: [
    { id: 'default', label: 'KPI grid' },
    { id: 'delta', label: 'Delta' },
  ],
  lists: [
    { id: 'list', label: 'List' },
    { id: 'pagination', label: 'Pagination' },
    { id: 'table', label: 'Table' },
  ],
  display: [
    { id: 'avatar', label: 'Avatar' },
    { id: 'rating', label: 'Rating' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'breadcrumbs', label: 'Breadcrumbs' },
  ],
  disclosure: [
    { id: 'accordion', label: 'Accordion' },
    { id: 'tooltip', label: 'Tooltip' },
  ],
  charts: [
    { id: 'line', label: 'Line / Area' },
    { id: 'bar', label: 'Bar / Grouped' },
    { id: 'stacked', label: 'Stacked / Ranking' },
    { id: 'donut', label: 'Donut' },
    { id: 'sparkline', label: 'Sparkline + Stat' },
    { id: 'heatmap', label: 'Heatmap' },
    { id: 'treemap', label: 'Treemap' },
    { id: 'mindmap', label: 'MindMap' },
    { id: 'timeline', label: 'Timeline' },
  ],
  menu: [{ id: 'default', label: 'Default' }],
  overlay: [
    { id: 'sheet', label: 'Sheet' },
    { id: 'dialog', label: 'Dialog' },
    { id: 'destructive', label: 'Destructive dialog' },
  ],
  forms: [
    { id: 'default', label: 'Fields' },
    { id: 'date', label: 'Date fields' },
    { id: 'error', label: 'Hint / Error' },
    { id: 'search', label: 'Search' },
    { id: 'upload', label: 'Dropzone' },
  ],
  selection: [
    { id: 'default', label: 'Default' },
    { id: 'stepper', label: 'QuantityStepper' },
    { id: 'disabled', label: 'Disabled' },
  ],
  tabs: [
    { id: 'default', label: 'Default' },
    { id: 'overflow', label: 'Overflow' },
  ],
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
  buttons: { default: 168, disabled: 168, icon: 168 },
  segments: 196,
  utilities: { default: 168, text: 260, 'portrait-gate': 220 },
  modal: 320,
  primitives: { default: 260, empty: 320, error: 340 },
  progress: { default: 300, status: 300, steps: 200, indeterminate: 180 },
  chips: { default: 160, filter: 160, removable: 160 },
  stat: { default: 420, delta: 520 },
  lists: { list: 360, pagination: 160, table: 340 },
  display: { avatar: 220, rating: 220, timeline: 420, breadcrumbs: 180 },
  disclosure: { accordion: 380, tooltip: 260 },
  charts: {
    line: 560,
    bar: 560,
    stacked: 620,
    donut: 300,
    sparkline: 480,
    heatmap: 260,
    treemap: 400,
    mindmap: 480,
    timeline: 360,
  },
  menu: 260,
  overlay: { sheet: 420, dialog: 380, destructive: 380 },
  forms: { default: 520, date: 320, error: 380, search: 300, upload: 380 },
  selection: { default: 520, stepper: 320, disabled: 500 },
  tabs: { default: 220, overflow: 200 },
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
