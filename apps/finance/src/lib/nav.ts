/** Mobile 底栏 Primary Tab（4 + More 与 Planner 对齐） */
export const MOBILE_PRIMARY_TAB_IDS = [
  "today",
  "overview",
  "history",
  "forecast",
] as const;

export type MobilePrimaryTabId = (typeof MOBILE_PRIMARY_TAB_IDS)[number];

export type AppTab =
  | MobilePrimaryTabId
  | "stocks"
  | "review"
  | "decision"
  | "settings";

/** More Sheet 内路由（stocks / review / decision / settings）时底栏 More 应高亮 */
export function isMoreNavActive(tab: AppTab): boolean {
  return !(MOBILE_PRIMARY_TAB_IDS as readonly string[]).includes(tab);
}
