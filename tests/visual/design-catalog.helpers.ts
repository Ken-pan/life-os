export const APPS = ['planner', 'fitness', 'finance', 'music'] as const
export const MODES = ['light', 'dark'] as const

export const MATRIX_SHOWCASES = [
  'buttons',
  'segments',
  'utilities',
  'settings',
  'navigation',
  'feedback',
  'toast',
  'cards',
  'command-palette',
] as const

/** Default matrix state per showcase — matches showcaseStates.js registry. */
export const SNAPSHOT_DEFAULT_STATE: Record<
  (typeof MATRIX_SHOWCASES)[number],
  string
> = {
  buttons: 'default',
  segments: 'default',
  utilities: 'info',
  settings: 'default',
  navigation: 'default',
  feedback: 'sync-error',
  toast: 'success',
  cards: 'surface',
  'command-palette': 'default',
}

export function catalogUrl(
  showcase: string,
  app: string,
  mode: string,
  extra: Record<string, string> = {},
) {
  const params = new URLSearchParams({
    showcase,
    app,
    mode,
    viewport: 'desktop',
    embed: '1',
    ...extra,
  })
  return `/?${params.toString()}`
}

/** Wait for fonts + embed shell before pixel assertions. */
export async function waitForCatalogEmbed(
  page: import('@playwright/test').Page,
  showcase: string,
) {
  await page.waitForLoadState('domcontentloaded')
  await page.evaluate(() => document.fonts.ready)
  await page.getByTestId('catalog-embed').waitFor({ state: 'visible' })
  await page.getByTestId(`showcase-${showcase}`).waitFor({ state: 'visible' })
  await page.getByTestId('catalog-shell').waitFor({ state: 'visible' })
}

export const SNAPSHOT_OPTS = {
  animations: 'disabled' as const,
  caret: 'hide' as const,
  maxDiffPixelRatio: 0.01,
}
