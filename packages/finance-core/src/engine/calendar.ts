// 日历工具 —— 把「真实日期」与引擎使用的「距今月偏移」互相转换，
// 并按发薪频率统计某个日历月内的发薪次数（用于双周/每周工资建模）。

import type { PayFrequency } from "../types.js";

export interface YearMonth {
  year: number;
  /** 0-11 */
  month: number;
}

const DAY = 86_400_000;

/** 本地日历日 YYYY-MM-DD（避免 UTC toISOString 跨日偏移）。 */
export function todayLocalISO(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** 把 "YYYY-MM-DD" 或完整 ISO 解析为「本地时区」日期，避免 UTC 偏移导致跨月误差。 */
export function parseLocalDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(iso);
}

export function ymOf(d: Date): YearMonth {
  return { year: d.getFullYear(), month: d.getMonth() };
}

export function addMonths(ym: YearMonth, n: number): YearMonth {
  const total = ym.year * 12 + ym.month + n;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

export function monthsBetween(from: YearMonth, to: YearMonth): number {
  return (to.year - from.year) * 12 + (to.month - from.month);
}

/** 日历日期 → 距起点(start 所在月)的月偏移，最小为 0。 */
export function dateToMonthOffset(start: Date, isoDate?: string): number {
  if (!isoDate) return 0;
  const d = parseLocalDate(isoDate);
  if (!Number.isFinite(d.getTime())) return 0;
  return Math.max(0, monthsBetween(ymOf(start), ymOf(d)));
}

/**
 * 日历日期 → 带符号的月偏移（过去为负，本月为 0，未来为正）。
 * 用于区分「已发生」与「未来」的一次性收支。
 */
export function signedMonthOffset(start: Date, isoDate?: string): number {
  if (!isoDate) return 0;
  const d = parseLocalDate(isoDate);
  if (!Number.isFinite(d.getTime())) return 0;
  return monthsBetween(ymOf(start), ymOf(d));
}

/** 月偏移 → 该日历月 (基于 start)。 */
export function monthOffsetToYM(start: Date, m: number): YearMonth {
  return addMonths(ymOf(start), m);
}

/** "2026-06" 形式的月份标签。 */
export function ymLabel(ym: YearMonth): string {
  return `${ym.year}-${String(ym.month + 1).padStart(2, "0")}`;
}

/**
 * 统计某发薪频率在指定年月内的发薪次数。
 * - monthly: 恒为 1；semimonthly: 恒为 2
 * - biweekly(14天)/weekly(7天): 以 anchor 为基准日，落在该月内的发薪日数量
 *   （这正是「有些月份发 3 次工资」的来源）。
 */
export function payCountInMonth(
  freq: PayFrequency,
  anchorISO: string | undefined,
  ym: YearMonth
): number {
  if (freq === "monthly") return 1;
  if (freq === "semimonthly") return 2;
  const stepDays = freq === "weekly" ? 7 : 14;
  if (!anchorISO) return freq === "weekly" ? 4 : 2;
  const anchor = parseLocalDate(anchorISO);
  if (!Number.isFinite(anchor.getTime())) return freq === "weekly" ? 4 : 2;

  const monthStart = new Date(ym.year, ym.month, 1).getTime();
  const monthEnd = new Date(ym.year, ym.month + 1, 1).getTime(); // 不含
  const stepMs = stepDays * DAY;
  const anchorT = anchor.getTime();

  // 第一个 >= monthStart 的发薪日
  const k = Math.ceil((monthStart - anchorT) / stepMs);
  let t = anchorT + k * stepMs;
  let count = 0;
  while (t < monthEnd) {
    if (t >= monthStart) count++;
    t += stepMs;
  }
  return count;
}

const DAY_MS = 86_400_000;

/** 日历周：周一 00:00 起，至下周周一 00:00（不含）止。 */
export function getCalendarWeekBounds(today: Date): { start: Date; endExclusive: Date } {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const daysSinceMonday = (d.getDay() + 6) % 7;
  const start = new Date(d);
  start.setDate(d.getDate() - daysSinceMonday);
  const endExclusive = new Date(start);
  endExclusive.setDate(start.getDate() + 7);
  return { start, endExclusive };
}

/** 从今天到本周日（含）的天数，用于按周折算计划存款。 */
export function daysThroughWeekEnd(today: Date): number {
  const { endExclusive } = getCalendarWeekBounds(today);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(1, Math.ceil((endExclusive.getTime() - start.getTime()) / DAY_MS));
}

/** 双周/每周下，把「月度等额金额」换算为单次发薪金额。 */
export function perPaycheckFromMonthly(amountMonthly: number, freq: PayFrequency): number {
  switch (freq) {
    case "weekly":
      return (amountMonthly * 12) / 52;
    case "biweekly":
      return (amountMonthly * 12) / 26;
    case "semimonthly":
      return amountMonthly / 2;
    case "monthly":
    default:
      return amountMonthly;
  }
}
