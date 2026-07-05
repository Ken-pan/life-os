// 日级现金流引擎 —— 投影未来 N 天 (默认 35) 内每一笔有日期的现金进出，
// 用于：30 天现金流日历、流动现金最低余额、缓冲缺口、safe-to-spend 的 30 天义务。
// 与月度引擎 (monthly.ts) 不同：这里关心的是「短期流动性」而非「长期净资产」。

import type { Account, FinanceData } from "../types";
import { num, paysFromReserve, pickSpendingCard } from "./finance";
import { LOCKBOX_CONTRIBUTION_CATEGORY } from "./monthly";
import { getCalendarWeekBounds, parseLocalDate, perPaycheckFromMonthly } from "./calendar";
import {
  goalMonthlyAllocationDay,
  isEmergencyReserveGoal,
  monthlyGoalAllocations,
} from "./goals";
import type { ExpectedOccurrence, OccurrenceDisplayStatus } from "./timeline";
import {
  cardBillPaysFromReserve,
  occurrenceAffectsLiquidCash,
  occurrenceDayEventKind,
  occurrenceDisplayStatus,
} from "./timeline";

const DAY = 86_400_000;

export type DayEventKind = "income" | "expense" | "card" | "fee" | "transfer";

export interface DayEvent {
  date: string; // YYYY-MM-DD
  ts: number;
  label: string;
  kind: DayEventKind;
  /** 正=流入，负=流出。 */
  amount: number;
  balanceAfter: number;
  /** P4：链到时间轴条目；已结算条目仍展示但不改余额。 */
  occurrenceId?: string;
  affectsBalance?: boolean;
  /** 从受保护储备扣款；展示在日历但不占用流动现金。 */
  fundedFromReserve?: boolean;
  displayStatus?: OccurrenceDisplayStatus;
}

interface RawDayEvent {
  date: string;
  ts: number;
  label: string;
  kind: DayEventKind;
  amount: number;
  affectsBalance: boolean;
  fundedFromReserve?: boolean;
  occurrenceId?: string;
  displayStatus?: OccurrenceDisplayStatus;
}

export interface DailyBalancePoint {
  date: string; // YYYY-MM-DD
  ts: number;
  /** 当天收支都结算后的日终余额。 */
  balanceEnd: number;
}

export interface DailyOutlook {
  days: number;
  /** 当前流动现金池(= checking + savings + liquid other)。 */
  startLiquid: number;
  startChecking: number;
  savingsAvailable: number;
  buffer: number;
  events: DayEvent[];
  /** 从今天起每天的日终余额轨迹（用于择时/窗口约束计算）。 */
  dailyBalances: DailyBalancePoint[];
  lowestBalance: number;
  lowestDate: string | null;
  endingBalance: number;
  /** 最低余额低于缓冲线时的缺口金额 (向上取整到 $50)。 */
  recommendedTransfer: number;
  /** 未来 30 天内的现金义务总额 (房租/卡账单/年费 + 日常开销，绝对值)。 */
  obligations30: number;
  /** 未来 30 天内的预计流入 (发薪等)。 */
  inflows30: number;
  /** 本周（周一至周日）从今天起的现金义务与流入。 */
  obligationsWeek: number;
  inflowsWeek: number;
  /** 本周（从今天到周日）流动现金的最低余额。 */
  lowestBalanceWeek: number;
  lowestDateWeek: string | null;
  /** 本月（从今天到本日历月月底）流动现金的最低余额。 */
  lowestBalanceMonth: number;
  lowestDateMonth: string | null;
  nextPaydayDate: string | null;
  nextPaydayAmount: number;
  /** 无固定扣款日的日常开销月度总额。 */
  variableMonthly: number;
  /** 日常开销是否记入信用卡（true：账单日一次性扣现金；false：按日均摊扣现金）。 */
  everydayOnCard: boolean;
  /** 仅当 everydayOnCard=false（现金消费）时 > 0：按日均摊后的每日消耗。 */
  dailyBurn: number;
}

function fmtISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** 取某年某月的「第 day 天」(day 会被裁到该月最大天数)。 */
function dateOnDay(year: number, month: number, day: number): Date {
  const d = Math.min(Math.max(1, Math.round(day)), lastDayOfMonth(year, month));
  return new Date(year, month, d);
}

function isLiquid(a: Account): boolean {
  // 标记为非流动 (liquid===false) 的账户算作应急储备，不计入短期可动用现金。
  if (a.liquid === false) return false;
  return a.type === "checking" || a.type === "savings" || (a.type === "other" && num(a.balance) > 0);
}

function minCreditPayment(balance: number): number {
  return Math.min(balance, Math.max(25, balance * 0.02));
}

export interface ScheduledTransfer {
  date: string; // YYYY-MM-DD
  label: string;
  /** 转出金额（正数）。会以流出形式记入日历。 */
  amount: number;
}

export interface ProjectDailyOptions {
  /** 额外计划内转账（如 Emergency 月度预留按最佳日执行），按流出记入日历。 */
  extraTransfers?: ScheduledTransfer[];
  /** P2：重锚后的流动现金起点（替代账面余额之和）。 */
  startLiquid?: number;
  /** P4：时间轴预期条目；有则离散计划改由状态机驱动（已结算不扣余额）。 */
  occurrences?: ExpectedOccurrence[];
  /** P4：锚定后用实际基线日均消耗替代计划 variableMonthly/30。 */
  dailyBurnOverride?: number;
  /** 重锚当天 Working 余额已含当日均摊消耗，跳过首日 dailyBurn。 */
  suppressTodayBurn?: boolean;
}

/** 构造带时间轴的 projectDaily 选项。 */
export function timelineDailyOptions(input: {
  startLiquid?: number;
  occurrences: ExpectedOccurrence[];
  dailyBurnOverride?: number;
  suppressTodayBurn?: boolean;
}): ProjectDailyOptions {
  return {
    occurrences: input.occurrences,
    startLiquid: input.startLiquid,
    dailyBurnOverride: input.dailyBurnOverride,
    suppressTodayBurn: input.suppressTodayBurn,
  };
}

export function projectDaily(
  data: FinanceData,
  days = 35,
  today = new Date(),
  options: ProjectDailyOptions = {}
): DailyOutlook {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startTs = start.getTime();
  const endTs = startTs + days * DAY;
  const { endExclusive: weekEnd } = getCalendarWeekBounds(start);
  const weekEndTs = weekEnd.getTime();
  // 本月窗口：从今天到本日历月最后一天（下月 1 号 00:00 为界，不含）。
  const monthEndTs = new Date(start.getFullYear(), start.getMonth() + 1, 1).getTime();
  const buffer = Math.max(0, num(data.assumptions.checkingBuffer));

  const defaultStartLiquid = data.accounts.filter(isLiquid).reduce((s, a) => s + num(a.balance), 0);
  const startLiquid =
    options.startLiquid != null && Number.isFinite(options.startLiquid)
      ? options.startLiquid
      : defaultStartLiquid;
  const startChecking = startLiquid; // 兼容旧字段名；短期现金流不再区分 checking/savings
  const savingsAvailable = 0; // 兼容旧字段名；liquid 已合并为单一现金池

  const raw: RawDayEvent[] = [];
  const useOccurrences = (options.occurrences?.length ?? 0) > 0;
  const push = (
    d: Date,
    label: string,
    kind: DayEventKind,
    amount: number,
    meta: Partial<
      Pick<RawDayEvent, "affectsBalance" | "fundedFromReserve" | "occurrenceId" | "displayStatus">
    > = {}
  ) => {
    const ts = d.getTime();
    if (ts < startTs || ts >= endTs) return;
    raw.push({
      date: fmtISO(d),
      ts,
      label,
      kind,
      amount,
      affectsBalance: meta.affectsBalance ?? true,
      fundedFromReserve: meta.fundedFromReserve,
      occurrenceId: meta.occurrenceId,
      displayStatus: meta.displayStatus,
    });
  };
  const pushPlan = (d: Date, label: string, kind: DayEventKind, amount: number) => {
    push(d, label, kind, amount);
  };

  // 无固定扣款日的日常开销 → 按日均摊，避免在 1 号一次性扣光造成虚假资金缺口。
  let variableMonthly = 0;

  // 遍历窗口内涉及的所有 (year, month)
  const months: { year: number; month: number }[] = [];
  {
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const guard = new Date(endTs);
    while (cur.getTime() <= guard.getTime()) {
      months.push({ year: cur.getFullYear(), month: cur.getMonth() });
      cur.setMonth(cur.getMonth() + 1);
    }
  }

  // P4：时间轴驱动离散计划（含已结算展示项）
  if (useOccurrences) {
    for (const occ of options.occurrences!) {
      let d = parseLocalDate(occ.date);
      let ts = d.getTime();
      // 逾期未确认（pending）的账单仍是真实义务：钳制到今天入账，
      // 否则会被投影窗口过滤掉，导致 safe-to-spend 虚高。
      if (ts < startTs && occ.state === "pending") {
        d = new Date(startTs);
        ts = startTs;
      }
      if (ts < startTs || ts >= endTs) continue;
      const fromReserve = cardBillPaysFromReserve(occ, data.accounts);
      const affects = occurrenceAffectsLiquidCash(occ, data.accounts);
      push(d, occ.label, occurrenceDayEventKind(occ), occ.expectedAmount, {
        affectsBalance: affects,
        fundedFromReserve: fromReserve,
        occurrenceId: occ.id,
        displayStatus: occurrenceDisplayStatus(occ),
      });
    }
  }

  // 1) 现金流项 (收入/支出) — 时间轴未覆盖的部分（biweekly、无 dueDay 日常）
  for (const c of data.cashFlows) {
    if (c.frequency === "annual") continue;
    // 401(k)/HSA 税前 payroll 供款不走 checking，与月度引擎口径一致，不计入日常开销。
    if (c.category === LOCKBOX_CONTRIBUTION_CATEGORY) continue;
    const amt = num(c.amount);
    if (amt === 0) continue;

    if (c.type === "income") {
      const freq = c.payFrequency ?? "monthly";
      if (freq === "biweekly" || freq === "weekly") {
        const step = (freq === "weekly" ? 7 : 14) * DAY;
        const anchor = c.anchorDate ? parseLocalDate(c.anchorDate).getTime() : startTs;
        const per = perPaycheckFromMonthly(amt, freq);
        const k = Math.ceil((startTs - anchor) / step);
        let t = anchor + k * step;
        while (t < endTs) {
          if (t >= startTs) pushPlan(new Date(t), c.name || "工资", "income", per);
          t += step;
        }
      } else if (freq === "semimonthly") {
        for (const ym of months) {
          pushPlan(dateOnDay(ym.year, ym.month, 1), c.name || "工资", "income", amt / 2);
          pushPlan(dateOnDay(ym.year, ym.month, 15), c.name || "工资", "income", amt / 2);
        }
      } else if (!useOccurrences || c.dueDay == null) {
        const day = c.dueDay ?? 1;
        for (const ym of months) pushPlan(dateOnDay(ym.year, ym.month, day), c.name || "收入", "income", amt);
      }
    } else {
      if (c.dueDay != null) {
        if (!useOccurrences) {
          for (const ym of months) {
            pushPlan(dateOnDay(ym.year, ym.month, c.dueDay!), c.name || "支出", "expense", -amt);
          }
        }
      } else {
        variableMonthly += amt;
      }
    }
  }

  // 日常开销路由：默认刷主信用卡 —— 刷卡当下不掉现金，而是随卡账单一起还。
  const spendingCard = pickSpendingCard(data.accounts);
  const everydayOnCard = spendingCard != null && variableMonthly > 0;
  let dailyBurn = everydayOnCard ? 0 : variableMonthly / 30;
  if (
    options.dailyBurnOverride != null &&
    Number.isFinite(options.dailyBurnOverride) &&
    !everydayOnCard
  ) {
    dailyBurn = Math.max(0, options.dailyBurnOverride);
  }

  // 2) 信用卡账单 + 年费（无时间轴时）
  if (!useOccurrences) {
    for (const a of data.accounts) {
      if (a.type === "credit-card") {
        const bal = num(a.balance);
        const stmt = a.statementBalance != null ? num(a.statementBalance) : bal;
        const revolving = a.creditMode === "revolving";
        const mode = a.autoPayMode ?? (revolving ? "minimum" : "statement");
        let payAmt: number;
        if (mode === "none") payAmt = 0;
        else if (mode === "minimum") payAmt = minCreditPayment(bal);
        else if (mode === "full-balance") payAmt = bal;
        else payAmt = stmt;
        const isSpendingCard = everydayOnCard && a.id === spendingCard?.id;
        if (payAmt > 0 || isSpendingCard) {
          const fromReserve = paysFromReserve(a, data.accounts);
          const day = a.dueDay ?? 15;
          let emittedFirst = false;
          for (const ym of months) {
            const d = dateOnDay(ym.year, ym.month, day);
            const ts = d.getTime();
            if (ts < startTs || ts >= endTs) continue;
            const amt = isSpendingCard && emittedFirst ? variableMonthly : payAmt;
            emittedFirst = true;
            if (amt > 0) {
              push(d, `${a.name || "信用卡"} 账单`, "card", -amt, {
                affectsBalance: !fromReserve,
                fundedFromReserve: fromReserve,
              });
            }
          }
        }
      }
      if (a.annualFee && a.annualFeeDate && num(a.annualFee) > 0) {
        pushPlan(parseLocalDate(a.annualFeeDate), `${a.name || "卡"} 年费`, "fee", -num(a.annualFee));
      }
    }
  }

  // 3) 一次性情景事件
  if (!useOccurrences) {
    for (const e of data.events) {
      if (!e.enabled || !e.date) continue;
      const d = parseLocalDate(e.date);
      if (e.eventType === "windfall") pushPlan(d, e.name || "一次性收入", "income", num(e.amount));
      else if (e.eventType === "one-time-purchase") {
        const src = e.fundingSource ?? "checking";
        // 运营流动现金路径：checking / savings；invested 由月度引擎反映，日级不扣流动现金。
        if (src === "checking" || src === "savings") {
          pushPlan(d, e.name || "一次性支出", "expense", -num(e.amount));
        }
      }
    }
  }

  // 4) 目标月度预留
  if (!useOccurrences) {
    const allocationGoals = monthlyGoalAllocations(data.goals).filter(
      (goal) => !isEmergencyReserveGoal(goal)
    );
    if (allocationGoals.length > 0) {
      for (const ym of months) {
        for (const goal of allocationGoals) {
          const amount = Math.max(0, num(goal.monthlyAllocation));
          if (amount <= 0) continue;
          const d = dateOnDay(ym.year, ym.month, goalMonthlyAllocationDay(goal));
          if (d.getTime() < startTs) continue;
          pushPlan(d, `${goal.name || "目标"} 月度预留`, "transfer", -amount);
        }
      }
    }
  }

  // 5) 外部注入的计划内转账（如 Emergency 月度预留按最佳日执行）。
  for (const t of options.extraTransfers ?? []) {
    const amount = Math.abs(num(t.amount));
    if (amount <= 0 || !t.date) continue;
    push(parseLocalDate(t.date), t.label, "transfer", -amount);
  }

  // 同日排序：流入先于流出（先算存钱再算取钱）。
  raw.sort((x, y) => {
    if (x.ts !== y.ts) return x.ts - y.ts;
    const xInflowFirst = x.amount >= 0 ? 0 : 1;
    const yInflowFirst = y.amount >= 0 ? 0 : 1;
    return xInflowFirst - yInflowFirst;
  });

  let bal = startLiquid;
  let lowest = startLiquid;
  let lowestDate: string | null = null;
  let obligations30 = 0;
  let inflows30 = 0;
  let obligationsWeek = 0;
  let inflowsWeek = 0;
  let lowestWeek = startLiquid;
  let lowestDateWeek: string | null = null;
  let lowestMonth = startLiquid;
  let lowestDateMonth: string | null = null;
  let nextPaydayDate: string | null = null;
  let nextPaydayAmount = 0;
  const events: DayEvent[] = [];
  const dailyBalances: DailyBalancePoint[] = [];

  let ri = 0;
  for (let dIdx = 0; dIdx < days; dIdx++) {
    const dayStart = startTs + dIdx * DAY;
    const dayEnd = dayStart + DAY;
    const within30 = dIdx < 30;
    const inWeekForward = dayStart >= startTs && dayStart < weekEndTs;
    const inMonthForward = dayStart >= startTs && dayStart < monthEndTs;

    const skipBurn =
      dailyBurn > 0 &&
      options.suppressTodayBurn === true &&
      dIdx === 0;
    if (dailyBurn > 0 && !skipBurn) {
      bal -= dailyBurn;
      if (within30) obligations30 += dailyBurn;
      if (inWeekForward) obligationsWeek += dailyBurn;
      if (bal < lowest) {
        lowest = bal;
        lowestDate = fmtISO(new Date(dayStart));
      }
      if (inWeekForward && bal < lowestWeek) {
        lowestWeek = bal;
        lowestDateWeek = fmtISO(new Date(dayStart));
      }
      if (inMonthForward && bal < lowestMonth) {
        lowestMonth = bal;
        lowestDateMonth = fmtISO(new Date(dayStart));
      }
    }

    // 当日离散事件
    while (ri < raw.length && raw[ri].ts < dayEnd) {
      const e = raw[ri++];
      const delta = e.affectsBalance ? e.amount : 0;
      bal += delta;
      if (within30 && e.affectsBalance) {
        if (e.amount < 0) obligations30 += -e.amount;
        else inflows30 += e.amount;
      }
      if (inWeekForward && e.affectsBalance) {
        if (e.amount < 0) obligationsWeek += -e.amount;
        else inflowsWeek += e.amount;
      }
      if (e.kind === "income" && e.affectsBalance && nextPaydayDate == null) {
        nextPaydayDate = e.date;
        nextPaydayAmount = e.amount;
      }
      if (e.affectsBalance && bal < lowest) {
        lowest = bal;
        lowestDate = e.date;
      }
      if (inWeekForward && e.affectsBalance && bal < lowestWeek) {
        lowestWeek = bal;
        lowestDateWeek = e.date;
      }
      if (inMonthForward && e.affectsBalance && bal < lowestMonth) {
        lowestMonth = bal;
        lowestDateMonth = e.date;
      }
      events.push({
        date: e.date,
        ts: e.ts,
        label: e.label,
        kind: e.kind,
        amount: e.amount,
        balanceAfter: bal,
        occurrenceId: e.occurrenceId,
        affectsBalance: e.affectsBalance,
        fundedFromReserve: e.fundedFromReserve,
        displayStatus: e.displayStatus,
      });
    }
    dailyBalances.push({
      date: fmtISO(new Date(dayStart)),
      ts: dayStart,
      balanceEnd: bal,
    });
  }

  let recommendedTransfer = 0;
  if (lowest < buffer) {
    const need = buffer - lowest;
    recommendedTransfer = Math.ceil(need / 50) * 50;
  }

  return {
    days,
    startLiquid,
    startChecking,
    savingsAvailable,
    buffer,
    events,
    dailyBalances,
    lowestBalance: lowest,
    lowestDate,
    endingBalance: bal,
    recommendedTransfer,
    obligations30,
    inflows30,
    obligationsWeek,
    inflowsWeek,
    lowestBalanceWeek: lowestWeek,
    lowestDateWeek,
    lowestBalanceMonth: lowestMonth,
    lowestDateMonth,
    nextPaydayDate,
    nextPaydayAmount,
    variableMonthly,
    everydayOnCard,
    dailyBurn,
  };
}
