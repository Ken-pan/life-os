/** Mobile 底栏 Primary Tab（4 + More，与混合双层 IA 对齐） */
export const MOBILE_PRIMARY_TAB_IDS = [
  'home',
  'accounts',
  'forecast',
  'review',
] as const

export type MobilePrimaryTabId = (typeof MOBILE_PRIMARY_TAB_IDS)[number]

export type AppTab =
  | MobilePrimaryTabId
  | 'stocks'
  | 'history'
  | 'decision'
  | 'settings'

/** More Sheet 内路由时底栏 More 应高亮 */
export function isMoreNavActive(tab: AppTab): boolean {
  return !(MOBILE_PRIMARY_TAB_IDS as readonly string[]).includes(tab)
}
