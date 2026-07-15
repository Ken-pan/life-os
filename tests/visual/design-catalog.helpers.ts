import {
  APPS as NAV_APPS,
  MATRIX_SHOWCASES as NAV_MATRIX_SECTIONS,
  MODES as NAV_MODES,
} from '../../apps/design-catalog/src/lib/catalogNav.js'
import { getShowcaseStates } from '../../apps/design-catalog/src/lib/showcaseStates.js'

/**
 * 单一真源（2026-07-14）：app / mode / showcase 列表与默认状态全部从 catalog 自身的
 * 注册表派生，测试侧不再手抄。以前这三份列表同时硬编码在 catalogNav.js、本文件、
 * design-catalog.spec.ts —— 加一个 showcase 要改 5~6 处，且漏改不会报错、只是静默少跑。
 * 现在加 showcase 只需改 catalogNav.js + showcaseStates.js，测试自动跟上。
 */
export const APPS = NAV_APPS
export const MODES = NAV_MODES

/** catalogNav 的 MATRIX_SHOWCASES 是 section 对象数组；测试只要 id。 */
export const MATRIX_SHOWCASES: string[] = NAV_MATRIX_SECTIONS.map(
  (s: { id: string }) => s.id,
)

/**
 * 每个 showcase 的默认状态 = 其状态注册表的第一项（2026-07-14 核对：9/9 与原手维护表吻合，
 * 故基线文件名不变）。改注册表顺序会改基线名 —— 届时快照缺失会直接报错，不会静默漂移。
 */
export const SNAPSHOT_DEFAULT_STATE: Record<string, string> =
  Object.fromEntries(
    MATRIX_SHOWCASES.map((id) => [id, getShowcaseStates(id)[0].id]),
  )

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
