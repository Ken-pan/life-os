import type { FinanceData, Goal, ScenarioEvent } from "../types.js";
import { projectDaily } from "./daily";
import { projectMonthly } from "./monthly";
import { goalReachMonth, selectSafeToSpendBreakdown, summarize } from "./metrics";

export interface GoalMilestone {
  goalId: string;
  goalName: string;
  baselineReachMonth: number | null;
  scenarioReachMonth: number | null;
  delayMonths: number | null;
}

export interface DecisionAssumption {
  key: string;
  label: string;
  value: string;
}

export interface DecisionWarning {
  code: string;
  level: "info" | "warning" | "critical";
  message: string;
  action?: string;
}

export interface DecisionProjection {
  safeToSpendToday: number;
  lowestProjectedOperatingCash30d: number;
  monthlySurplus: number;
  investableMonthlySurplus: number;
  netWorth1y: number;
  netWorth5y: number;
  netWorth10y: number;
  goalMilestones: GoalMilestone[];
  emergencyRunwayMonths: number;
}

export interface DecisionDelta {
  safeToSpendToday: number;
  lowestProjectedOperatingCash30d: number;
  monthlySurplus: number;
  investableMonthlySurplus: number;
  netWorth1y: number;
  netWorth5y: number;
  netWorth10y: number;
  goalMilestoneDelayMonths: Record<string, number>;
}

export interface DecisionComparison {
  baseline: DecisionProjection;
  scenario: DecisionProjection;
  delta: DecisionDelta;
  assumptions: DecisionAssumption[];
  warnings: DecisionWarning[];
  confidence: "Ready to compare" | "Review assumptions" | "Limited confidence";
}

function monthlyAt(seriesNetWorth: number[], years: number): number {
  const idx = Math.min(seriesNetWorth.length - 1, years * 12);
  return seriesNetWorth[idx] ?? seriesNetWorth[seriesNetWorth.length - 1] ?? 0;
}

function projectionFor(
  data: FinanceData,
  scenarioEvents: ScenarioEvent[],
  baselineGoals: Goal[],
  baselineGoalMap: Map<string, number | null>,
  today: Date
): DecisionProjection {
  const daily = projectDaily(
    {
      ...data,
      events: scenarioEvents,
    },
    35,
    today
  );
  const monthly = projectMonthly({
    accounts: data.accounts,
    cashFlows: data.cashFlows,
    events: scenarioEvents,
    goals: data.goals,
    assumptions: data.assumptions,
    startDate: today,
  });
  const summary = summarize(monthly);
  const sts = selectSafeToSpendBreakdown({
    outlook: daily,
    assumptions: data.assumptions,
    goals: data.goals,
  });
  const netWorthSeries = monthly.map((m) => m.netWorth);
  const goalMilestones = baselineGoals.map((g) => {
    const baselineReach = baselineGoalMap.get(g.id) ?? null;
    const scenarioReach = goalReachMonth(monthly, g);
    return {
      goalId: g.id,
      goalName: g.name,
      baselineReachMonth: baselineReach,
      scenarioReachMonth: scenarioReach,
      delayMonths:
        baselineReach == null || scenarioReach == null
          ? null
          : scenarioReach - baselineReach,
    };
  });

  return {
    safeToSpendToday: sts.safeToSpend,
    lowestProjectedOperatingCash30d: sts.lowestProjectedOperatingCash30d,
    monthlySurplus: summary.monthlySurplus,
    investableMonthlySurplus:
      summary.monthlySurplus * Math.max(0, Math.min(1, data.assumptions.investRatio)),
    netWorth1y: monthlyAt(netWorthSeries, 1),
    netWorth5y: monthlyAt(netWorthSeries, 5),
    netWorth10y: monthlyAt(netWorthSeries, 10),
    goalMilestones,
    emergencyRunwayMonths: summary.emergencyRunwayMonths ?? 0,
  };
}

function confidenceFor(data: FinanceData): DecisionComparison["confidence"] {
  const hasAccounts = data.accounts.length > 0;
  if (!hasAccounts) return "Limited confidence";
  const stale = data.accounts.some((a) => {
    if (!a.updatedAt) return true;
    const days = (Date.now() - new Date(a.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
    return days > 30;
  });
  if (stale) return "Review assumptions";
  return "Ready to compare";
}

export function selectDecisionComparison(input: {
  data: FinanceData;
  scenarioEvents: ScenarioEvent[];
  baselineEvents?: ScenarioEvent[];
  today?: Date;
}): DecisionComparison {
  const today = input.today ?? new Date();
  const baselineEvents = input.baselineEvents ?? [];
  const baselineMonthly = projectMonthly({
    accounts: input.data.accounts,
    cashFlows: input.data.cashFlows,
    events: baselineEvents,
    goals: input.data.goals,
    assumptions: input.data.assumptions,
    startDate: today,
  });
  const baselineGoalMap = new Map<string, number | null>();
  for (const g of input.data.goals) baselineGoalMap.set(g.id, goalReachMonth(baselineMonthly, g));
  const baseline = projectionFor(
    input.data,
    baselineEvents,
    input.data.goals,
    baselineGoalMap,
    today
  );
  const scenario = projectionFor(
    input.data,
    input.scenarioEvents,
    input.data.goals,
    baselineGoalMap,
    today
  );
  const goalMilestoneDelayMonths: Record<string, number> = {};
  for (const m of scenario.goalMilestones) {
    if (m.delayMonths != null) goalMilestoneDelayMonths[m.goalId] = m.delayMonths;
  }
  const delta: DecisionDelta = {
    safeToSpendToday: scenario.safeToSpendToday - baseline.safeToSpendToday,
    lowestProjectedOperatingCash30d:
      scenario.lowestProjectedOperatingCash30d -
      baseline.lowestProjectedOperatingCash30d,
    monthlySurplus: scenario.monthlySurplus - baseline.monthlySurplus,
    investableMonthlySurplus:
      scenario.investableMonthlySurplus - baseline.investableMonthlySurplus,
    netWorth1y: scenario.netWorth1y - baseline.netWorth1y,
    netWorth5y: scenario.netWorth5y - baseline.netWorth5y,
    netWorth10y: scenario.netWorth10y - baseline.netWorth10y,
    goalMilestoneDelayMonths,
  };
  const assumptions: DecisionAssumption[] = [
    {
      key: "return",
      label: "基准年化回报",
      value: `${Math.round(input.data.assumptions.baselineReturn * 10000) / 100}%`,
    },
    {
      key: "inflation",
      label: "通胀率",
      value: `${Math.round(input.data.assumptions.inflation * 10000) / 100}%`,
    },
    {
      key: "buffer",
      label: "活期现金安全垫",
      value: `${Math.round(input.data.assumptions.checkingBuffer)}`,
    },
  ];
  const warnings: DecisionWarning[] = [];
  const confidence = confidenceFor(input.data);
  if (confidence !== "Ready to compare") {
    warnings.push({
      code: "stale_accounts",
      level: confidence === "Limited confidence" ? "critical" : "warning",
      message:
        confidence === "Limited confidence"
          ? "账户覆盖不完整，对比结果仅供方向性参考。"
          : "部分余额可能已过期，应用计划变更前请先刷新余额。",
      action:
        confidence === "Limited confidence"
          ? "补充账户与基线收支。"
          : "更新账户余额。",
    });
  }
  if (scenario.safeToSpendToday < 0 || scenario.lowestProjectedOperatingCash30d < 0) {
    warnings.push({
      code: "cash_shortfall",
      level: "critical",
      message: "该方案会导致预计短期现金短缺。",
      action: "减少金额、推迟，或改用分期融资。",
    });
  }
  return {
    baseline,
    scenario,
    delta,
    assumptions,
    warnings,
    confidence,
  };
}
