// 派生指标 —— Overview 五卡、目标达成、Spend Impact 差额计算

import type { AssumptionSet, ForecastMetric, FundingSource, Goal } from "../types.js";
import type { DailyOutlook } from "./daily";
import type { MonthSnapshot } from "./monthly";
import {
  primaryEmergencyReserveGoal,
  sumEarmarkedOperatingGoalCash,
  sumProtectedReserveGoalCash,
} from "./goals";

export interface OverviewMetrics {
  netWorth: number;
  liquidCash: number;
  invested: number;
  investedPct: number;
  /** 能动的钱（可动用）：除 401k/HSA 外、扣资本利得税与负债后真正可调动的钱。 */
  accessible: number;
  /** 不能动的钱（锁定）：退休金/401k + HSA。 */
  locked: number;
  monthlySurplus: number;
  /** 应急储备：标记为非流动的现金，不计入可动用现金/可安心花。 */
  reserve: number;
  /** 应税券商市值（税前）。 */
  investedTaxable: number;
  investedTaxableBasis: number;
  unrealizedGainEstimate: number;
  capitalGainsTaxEstimate: number;
  investedTaxableAfterTax: number;
  taxBasisKnown: boolean;
  emergencyRunwayMonths: number | null;
  netWorthChangeThisYear: number;
}

export function summarize(series: MonthSnapshot[]): OverviewMetrics {
  const now = series[0];
  const m1 = series[1] ?? now;
  const m12 = series[12] ?? series[series.length - 1] ?? now;

  const totalAssets =
    now.checking + now.savings + now.invested + now.property + now.reserve;
  const essential = m1.essentialExpenses;

  // 经常性月结余取「一个完整发薪周期(约 12 个月)的均值」，
  // 跳过首月一次性还清的失真，并平滑双周发薪带来的 2/3 次月波动。
  let sum = 0;
  let count = 0;
  for (let m = 2; m <= 13 && m < series.length; m++) {
    sum += series[m].surplus;
    count++;
  }
  const monthlySurplus = count > 0 ? sum / count : (series[2] ?? m1).surplus;

  return {
    netWorth: now.netWorth,
    liquidCash: now.liquidCash,
    invested: now.invested,
    investedPct: totalAssets > 0 ? now.invested / totalAssets : 0,
    accessible: now.accessible,
    locked: now.locked,
    monthlySurplus,
    reserve: now.reserve,
    investedTaxable: now.investedTaxable,
    investedTaxableBasis: now.investedTaxableBasis,
    unrealizedGainEstimate: now.unrealizedGainEstimate,
    capitalGainsTaxEstimate: now.capitalGainsTaxEstimate,
    investedTaxableAfterTax: now.investedTaxableAfterTax,
    taxBasisKnown: now.taxBasisKnown,
    emergencyRunwayMonths: essential > 0 ? now.liquidCash / essential : null,
    netWorthChangeThisYear: m12.netWorth - now.netWorth,
  };
}

/**
 * Safe-to-spend：现在可以安心花掉的钱（低谷法，全应用唯一来源）。
 *
 * 思路：今天多花 1 元，会让未来每一天的现金都少 1 元，因此真正的约束是
 * 「未来现金低谷」——把接下来几周的发薪和所有账单（含大额支出）排进日历后，
 * 现金最紧张的那一刻。能放心花的钱 = 在这个低谷上，仍能保留活期安全垫和
 * 已为目标预留的钱之后剩下的部分。
 *
 * = max(0, 未来现金低谷 − 活期安全垫 − 已预留目标资金)
 *
 * 这样即便低谷出现在几周后的大额账单当天，也已经留足了钱。
 * 应急储备放在非流动账户里，已被排除在低谷之外，无需重复扣减。
 * 默认不含券商/HSA/退休账户。
 */
export interface SafeToSpendBreakdown {
  lowestProjectedOperatingCash30d: number;
  operatingCashBuffer: number;
  earmarkedOperatingGoalCash: number;
  safeToSpend: number;
  protectedReserveExcludedUpstream: number;
  upcomingObligations30d: number;
}

export function selectSafeToSpendBreakdown(p: {
  outlook: DailyOutlook;
  assumptions: AssumptionSet;
  goals: Goal[];
}): SafeToSpendBreakdown {
  const lowestProjectedOperatingCash30d = p.outlook.lowestBalance;
  const operatingCashBuffer = Math.max(0, p.assumptions.checkingBuffer);
  const earmarkedOperatingGoalCash = sumEarmarkedOperatingGoalCash(p.goals);
  const protectedReserveExcludedUpstream = sumProtectedReserveGoalCash(p.goals);
  const safeToSpend = Math.max(
    0,
    lowestProjectedOperatingCash30d -
      operatingCashBuffer -
      earmarkedOperatingGoalCash
  );
  return {
    lowestProjectedOperatingCash30d,
    operatingCashBuffer,
    earmarkedOperatingGoalCash,
    safeToSpend,
    protectedReserveExcludedUpstream,
    upcomingObligations30d: p.outlook.obligations30,
  };
}

/**
 * 本月存钱能力 —— 回答「这个月还能存多少钱、最好哪天存」。
 *
 * 能存多少：在本月每一天都试算一次“今天转走一笔钱”，并把安全窗口延长到「下月 3 日前」。
 * 每个候选日可转走的上限 = 该日到下月 3 日窗口内的最低余额 - 安全垫 - earmark。
 * 取本月候选日里上限最大的那一天，作为“本月可存最多的时候”。
 *
 * 哪天存：返回“可转上限最大的那天”。若该天有收入事件，文案可提示“发薪后存”；若无，
 * 则提示“按现金低谷约束的最佳时点”。
 */
export interface MonthlySavingCapacity {
  /** 本月（今天到月底）现金低谷。 */
  lowestBalanceMonth: number;
  lowestDateMonth: string | null;
  operatingCashBuffer: number;
  earmarkedOperatingGoalCash: number;
  /** 本月在不跌破安全垫的前提下，最多还能存起来的钱。 */
  capacity: number;
  /** 按现金轨迹算出的本月理论最大可存（不含计划上限截断）。 */
  maxCapacity: number;
  /** Emergency 月度预留计划上限。0 表示未设置计划上限。 */
  plannedCapacity: number;
  /** Emergency 距目标还差多少；无 Emergency 目标时为 Infinity。 */
  remainingToTarget: number;
  /** 推荐的最佳存钱日 (YYYY-MM-DD)；null 表示现在就可以存或无可存金额。 */
  bestDay: string | null;
  /** 推荐日当天的进账（发薪）金额，用于文案。 */
  bestDayInflow: number;
  /** 推荐理由：发薪后存 / 现在就能存 / 本月最佳时点 / 暂无可存。 */
  rationale: "after-payday" | "today" | "timed" | "none";
}

export function selectMonthlySavingCapacity(p: {
  outlook: DailyOutlook;
  assumptions: AssumptionSet;
  goals: Goal[];
  today?: Date;
}): MonthlySavingCapacity {
  const lowestBalanceMonth = p.outlook.lowestBalanceMonth;
  const operatingCashBuffer = Math.max(0, p.assumptions.checkingBuffer);
  const earmarkedOperatingGoalCash = sumEarmarkedOperatingGoalCash(p.goals);
  const floor = operatingCashBuffer + earmarkedOperatingGoalCash;
  const emergencyGoal = primaryEmergencyReserveGoal(p.goals);

  const now = p.today ?? new Date();
  const todayStartTs = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const monthEndTs = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  // 约束窗口延长到下月 3 日（下月 4 日 00:00 为界，不含）。
  const guardEndExclusiveTs = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    4
  ).getTime();

  const guardSeries = p.outlook.dailyBalances.filter(
    (d) => d.ts >= todayStartTs && d.ts < guardEndExclusiveTs
  );
  const monthCandidates = guardSeries.filter((d) => d.ts < monthEndTs);

  let bestDay: string | null = null;
  let maxCapacity = 0;
  if (monthCandidates.length > 0) {
    const suffixMin = new Map<number, number>();
    let minBal = Number.POSITIVE_INFINITY;
    for (let i = guardSeries.length - 1; i >= 0; i--) {
      minBal = Math.min(minBal, guardSeries[i].balanceEnd);
      suffixMin.set(guardSeries[i].ts, minBal);
    }

    for (const point of monthCandidates) {
      const minAfter = suffixMin.get(point.ts) ?? point.balanceEnd;
      const canSave = Math.max(0, minAfter - floor);
      if (canSave > maxCapacity) {
        maxCapacity = canSave;
        bestDay = point.date;
      }
    }
  }

  const plannedCapacity = Math.max(0, emergencyGoal?.monthlyAllocation ?? 0);
  // Emergency 已存满后不再继续预留，执行额不超过「距目标还差多少」。
  const remainingToTarget = emergencyGoal
    ? Math.max(0, emergencyGoal.target - Math.max(0, emergencyGoal.current ?? 0))
    : Number.POSITIVE_INFINITY;
  // 计划上限：设了月度预留就用它，否则按「最大额度」。
  const ceiling = plannedCapacity > 0 ? plannedCapacity : maxCapacity;
  // 执行额：按当月实际可行额度与目标剩余额一起截断。
  const capacity = Math.max(0, Math.min(maxCapacity, ceiling, remainingToTarget));

  if (capacity <= 0) {
    return {
      lowestBalanceMonth,
      lowestDateMonth: p.outlook.lowestDateMonth,
      operatingCashBuffer,
      earmarkedOperatingGoalCash,
      capacity: 0,
      maxCapacity,
      plannedCapacity,
      remainingToTarget,
      bestDay: null,
      bestDayInflow: 0,
      rationale: "none",
    };
  }

  const bestDayInflow = bestDay
    ? p.outlook.events
        .filter((e) => e.kind === "income" && e.date === bestDay)
        .reduce((sum, e) => sum + e.amount, 0)
    : 0;
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(now.getDate()).padStart(2, "0")}`;

  return {
    lowestBalanceMonth,
    lowestDateMonth: p.outlook.lowestDateMonth,
    operatingCashBuffer,
    earmarkedOperatingGoalCash,
    capacity,
    maxCapacity,
    plannedCapacity,
    remainingToTarget,
    bestDay,
    bestDayInflow,
    rationale:
      bestDay == null
        ? "today"
        : bestDay === todayIso
          ? "today"
          : bestDayInflow > 0
            ? "after-payday"
            : "timed",
  };
}

export function computeSafeToSpend(p: {
  /** 未来窗口（默认 35 天）内的现金低谷。 */
  lowestBalance: number;
  /** 活期安全垫：低于此线就该补钱，不算可花。 */
  buffer: number;
  /** 已为目标预留、不应动用的钱。 */
  plannedSavings: number;
}): number {
  return Math.max(0, p.lowestBalance - p.buffer - p.plannedSavings);
}

export type GoalMetricValue = (s: MonthSnapshot) => number;

export function metricValue(metric: ForecastMetric): GoalMetricValue {
  switch (metric) {
    case "liquid":
      return (s) => s.liquidCash;
    case "invested":
      return (s) => s.invested;
    case "accessible":
      return (s) => s.accessible;
    case "locked":
      return (s) => s.locked;
    case "net-worth":
    default:
      return (s) => s.netWorth;
  }
}

/** 返回首次达标的月偏移；未达标返回 null。 */
export function goalReachMonth(series: MonthSnapshot[], goal: Goal): number | null {
  const read = metricValue(goal.metric);
  for (const s of series) {
    if (read(s) >= goal.target) return s.monthOffset;
  }
  return null;
}

export function valueAtMonth(
  series: MonthSnapshot[],
  monthOffset: number,
  read: GoalMetricValue = (s) => s.netWorth
): number {
  const clamped = Math.max(0, Math.min(series.length - 1, monthOffset));
  return read(series[clamped]);
}

export interface SpendImpactResult {
  // 第一层：现在
  cashAfter: number;
  safeToSpendAfter: number;
  safeToSpendBreakdown: SafeToSpendBreakdown;
  /** 未来 30 天最低运营现金是否仍高于 checkingBuffer。 */
  operatingCashBufferOk: boolean;
  monthlySurplusChange: number;
  // 第二层：未来差额 (sim - baseline) at 5/10/20 年
  diffByYear: { year: number; diff: number }[];
  // 第三层：目标延迟 (月)
  goalDelays: { goal: Goal; baselineMonth: number | null; simMonth: number | null; delayMonths: number | null }[];
  // 综合结论
  verdict: "low" | "noticeable" | "plan-change" | "funding";
}

export interface SpendDescriptor {
  amount: number;
  type: "one-time" | "monthly";
  fundingSource: FundingSource;
}

/** 模拟消费后当天日终的流动现金（checking + savings 池）。 */
export function liquidAfterSimulatedSpend(
  outlook: DailyOutlook,
  spend: SpendDescriptor
): number {
  if (spend.type === "one-time" && (spend.fundingSource === "invested" || spend.fundingSource === "credit-card")) {
    return outlook.startLiquid;
  }
  return outlook.dailyBalances[0]?.balanceEnd ?? outlook.startLiquid;
}

export function computeSpendImpact(params: {
  baseline: MonthSnapshot[];
  sim: MonthSnapshot[];
  goals: Goal[];
  safeToSpendBreakdownAfter: SafeToSpendBreakdown;
  cashAfter: number;
  compareYears?: number[];
  spend?: SpendDescriptor;
}): SpendImpactResult {
  const { baseline, sim, goals, spend } = params;
  const years = params.compareYears ?? [5, 10, 20];
  const safeBreakdown = params.safeToSpendBreakdownAfter;
  const operatingCashBufferOk =
    safeBreakdown.lowestProjectedOperatingCash30d >= safeBreakdown.operatingCashBuffer;
  const surplusChange = spend && spend.type === "monthly" ? -spend.amount : 0;

  const diffByYear = years.map((y) => {
    const month = y * 12;
    const b = baseline[Math.min(baseline.length - 1, month)]?.netWorth ?? 0;
    const s = sim[Math.min(sim.length - 1, month)]?.netWorth ?? 0;
    return { year: y, diff: s - b };
  });

  const goalDelays = goals.map((goal) => {
    const baselineMonth = goalReachMonth(baseline, goal);
    const simMonth = goalReachMonth(sim, goal);
    let delayMonths: number | null = null;
    if (baselineMonth != null && simMonth != null) delayMonths = simMonth - baselineMonth;
    else if (baselineMonth != null && simMonth == null) delayMonths = Infinity;
    return { goal, baselineMonth, simMonth, delayMonths };
  });

  // 综合结论
  const tenYearDiff = diffByYear.find((d) => d.year === 10)?.diff ?? 0;
  const maxDelay = goalDelays.reduce((acc, g) => {
    const d = g.delayMonths;
    if (d == null) return acc;
    if (d === Infinity) return Infinity;
    return Math.max(acc, d);
  }, 0);
  const anyNegativeCash = sim.some((s) => s.negativeCash) && !baseline.some((s) => s.negativeCash);

  let verdict: SpendImpactResult["verdict"] = "low";
  if (anyNegativeCash || !operatingCashBufferOk) verdict = "funding";
  else if (maxDelay === Infinity || maxDelay >= 12) verdict = "plan-change";
  else if (Math.abs(tenYearDiff) >= 10000 || maxDelay >= 2) verdict = "noticeable";

  return {
    cashAfter: params.cashAfter,
    safeToSpendAfter: safeBreakdown.safeToSpend,
    safeToSpendBreakdown: safeBreakdown,
    operatingCashBufferOk,
    monthlySurplusChange: surplusChange,
    diffByYear,
    goalDelays,
    verdict,
  };
}
