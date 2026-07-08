/** @type {Array<{ id: string, label: string, group: 'theme' | 'components', testId: string }>} */
export const CATALOG_SECTIONS = [
  {
    id: 'tokens',
    label: 'Brand tokens',
    group: 'theme',
    testId: 'showcase-tokens',
  },
  {
    id: 'buttons',
    label: 'Buttons',
    group: 'theme',
    testId: 'showcase-buttons',
  },
  {
    id: 'segments',
    label: 'Segments',
    group: 'theme',
    testId: 'showcase-segments',
  },
  {
    id: 'utilities',
    label: 'Banners & utilities',
    group: 'theme',
    testId: 'showcase-utilities',
  },
  {
    id: 'settings',
    label: 'Settings',
    group: 'components',
    testId: 'showcase-settings',
  },
  {
    id: 'brand',
    label: 'Brand',
    group: 'components',
    testId: 'showcase-brand',
  },
  {
    id: 'navigation',
    label: 'Navigation',
    group: 'components',
    testId: 'showcase-navigation',
  },
  { id: 'icon', label: 'Icon', group: 'components', testId: 'showcase-icon' },
  {
    id: 'feedback',
    label: 'Feedback',
    group: 'components',
    testId: 'showcase-feedback',
  },
  {
    id: 'toast',
    label: 'Toast',
    group: 'components',
    testId: 'showcase-toast',
  },
  {
    id: 'cards',
    label: 'Cards',
    group: 'components',
    testId: 'showcase-cards',
  },
]

export const SHOWCASE_IDS = CATALOG_SECTIONS.map((s) => s.id)

/** P3 component showcases — full 4×2 matrix in catalog + smoke tests */
export const MATRIX_SHOWCASES = CATALOG_SECTIONS.filter((s) =>
  [
    'buttons',
    'segments',
    'utilities',
    'settings',
    'navigation',
    'feedback',
    'toast',
    'cards',
  ].includes(s.id),
)

export const APPS = /** @type {const} */ ([
  'planner',
  'fitness',
  'finance',
  'music',
])
export const MODES = /** @type {const} */ (['light', 'dark'])
export const VIEWPORTS = /** @type {const} */ (['desktop', 'tablet', 'mobile'])
