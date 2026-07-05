// 预算脉搏 —— 纯函数集合。
// 以「固定支出计划」推导默认月预算，把真实流水折算成：
// 本月已花 / 今日已花 / 近 N 日每日花销 / 按进度的超支状态。

import { spendingOf, type Txn } from "./transactions";
import { LOCKBOX_CONTRIBUTION_CATEGORY } from "./monthly";
import type { CashFlowItem } from "../types";

export interface DaySpend {
  date: string; // YYYY-MM-DD
  amount: number;
}

/** 近 days 天（含 endDate 当天）的每日净花销序列，按日期升序，缺日补 0。 */
export function dailySpendSeries(txns: Txn[], endDate: string, days: number): DaySpend[] {
  const map = new Map<string, number>();
  for (const t of txns) {
    const s = spendingOf(t);
    if (s === 0) continue;
    map.set(t.date, (map.get(t.date) ?? 0) + s);
  }
  const out: DaySpend[] = [];
  const end = new Date(`${endDate}T00:00:00`);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
    out.push({ date: iso, amount: Math.round((map.get(iso) ?? 0) * 100) / 100 });
  }
  return out;
}

/**
 * 固定支出计划折算的默认月预算（年度项 /12）。
 * 排除 401(k)/HSA 等税前供款（lockbox-contribution）：它们不会出现在 checking 花销流水里，
 * 与 daily.ts / monthly.ts 的口径保持一致。
 */
export function plannedMonthlyBudget(cashFlows: CashFlowItem[]): number {
  return cashFlows
    .filter((c) => c.type === "expense" && c.category !== LOCKBOX_CONTRIBUTION_CATEGORY)
    .reduce((a, c) => a + (c.frequency === "annual" ? c.amount / 12 : c.amount), 0);
}

export type BudgetPace = "under" | "on" | "over";

export interface BudgetProgress {
  /** 月预算（<=0 表示没有可用预算基准）。 */
  budget: number;
  /** 本月已花（净花销）。 */
  spent: number;
  remaining: number;
  /** 今日已花。 */
  todaySpend: number;
  dayOfMonth: number;
  daysInMonth: number;
  daysLeft: number;
  /** 剩余预算 ÷ 剩余天数（预算不足时为 0）。 */
  dailyAllowance: number;
  /** 与「按天数线性花完预算」的对比。 */
  pace: BudgetPace;
  /** 本月已花占预算比例（0-1+）。 */
  spentRatio: number;
  /** 时间进度（0-1）。 */
  timeRatio: number;
}

/** 本月预算进度。today 为 "YYYY-MM-DD"。 */
export function budgetProgress(txns: Txn[], budget: number, today: string): BudgetProgress {
  const month = today.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const dayOfMonth = Number(today.slice(8, 10));
  const daysLeft = Math.max(0, daysInMonth - dayOfMonth);

  let spent = 0;
  let todaySpend = 0;
  for (const t of txns) {
    if (t.month !== month || t.date > today) continue;
    const s = spendingOf(t);
    spent += s;
    if (t.date === today) todaySpend += s;
  }
  spent = Math.round(spent * 100) / 100;
  todaySpend = Math.round(todaySpend * 100) / 100;

  const remaining = Math.max(0, budget - spent);
  const timeRatio = daysInMonth > 0 ? dayOfMonth / daysInMonth : 1;
  const spentRatio = budget > 0 ? spent / budget : 0;
  let pace: BudgetPace = "on";
  if (budget > 0) {
    if (spentRatio > timeRatio + 0.08) pace = "over";
    else if (spentRatio < timeRatio - 0.08) pace = "under";
  }
  const dailyAllowance = daysLeft > 0 ? remaining / daysLeft : remaining;

  return {
    budget: Math.round(budget * 100) / 100,
    spent,
    remaining: Math.round(remaining * 100) / 100,
    todaySpend,
    dayOfMonth,
    daysInMonth,
    daysLeft,
    dailyAllowance: Math.round(dailyAllowance * 100) / 100,
    pace,
    spentRatio,
    timeRatio,
  };
}
