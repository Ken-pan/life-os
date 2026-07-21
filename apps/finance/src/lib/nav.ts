/** Mobile 底栏 Primary Tab（3 + More）
 *  Today / History（审核日用）/ Accounts；Forecast 等规划面下沉 More。 */
export const MOBILE_PRIMARY_TAB_IDS = ['home', 'history', 'accounts'] as const

export type MobilePrimaryTabId = (typeof MOBILE_PRIMARY_TAB_IDS)[number]

export type AppTab =
  | MobilePrimaryTabId
  | 'forecast'
  | 'stocks'
  | 'review'
  | 'decision'
  | 'settings'

/** More Sheet 内路由时底栏 More 应高亮 */
export function isMoreNavActive(tab: AppTab): boolean {
  return !(MOBILE_PRIMARY_TAB_IDS as readonly string[]).includes(tab)
}
