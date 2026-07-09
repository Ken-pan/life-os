/** 现金日历 / 投影共用的物化窗口（须 ≥ projectDaily 最长窗口）。 */
export const TIMELINE_PROJECTION_HORIZON_DAYS = 220;

/** P1B 时间轴 / 匹配默认参数（§17 已锁定）。 */
export const TIMELINE_DEFAULTS = {
  upcomingWindowDays: 7,
  matchDateToleranceDays: 3,
  /** 金额容差：max(固定下限, 比例 × 预期金额)。 */
  matchAmountTolerance(amount: number): number {
    return Math.max(1, Math.abs(amount) * 0.02);
  },
} as const;
