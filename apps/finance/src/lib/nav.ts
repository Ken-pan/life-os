/** Mobile 底栏 Primary Tab（4 + More，与混合双层 IA 对齐）
 *  记录（交易流水 + 记一笔）属高频，置于底栏；审查（导入/对账管线）低频，下沉 More。 */
export const MOBILE_PRIMARY_TAB_IDS = [
  'home',
  'accounts',
  'forecast',
  'history',
] as const

export type MobilePrimaryTabId = (typeof MOBILE_PRIMARY_TAB_IDS)[number]

export type AppTab =
  | MobilePrimaryTabId
  | 'stocks'
  | 'review'
  | 'decision'
  | 'settings'

/** More Sheet 内路由时底栏 More 应高亮 */
export function isMoreNavActive(tab: AppTab): boolean {
  return !(MOBILE_PRIMARY_TAB_IDS as readonly string[]).includes(tab)
}
