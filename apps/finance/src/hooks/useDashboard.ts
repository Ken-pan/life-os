import { useMemo } from "react";
import type { FinanceData, Goal } from "../types";
import { useProjection, type Projection } from "./useProjection";
import { projectDaily, type DailyOutlook, type ProjectDailyOptions, timelineDailyOptions } from "../engine/daily";
import type { LiquidCashAnchors } from "../engine/reconciliation";
import { baselineCategoryAverages } from "../engine/realityLoop";
import {
  goalReachMonth,
  selectSafeToSpendBreakdown,
  selectMonthlySavingCapacity,
  type SafeToSpendBreakdown,
  type MonthlySavingCapacity,
} from "../engine/metrics";
import { buildActions, type ActionItem } from "../engine/actions";
import { isMilestoneGoal, primaryEmergencyReserveGoal } from "../engine/goals";
import { useTimeline } from "../store/timeline";
import { useTransactions } from "../store/transactions";

function buildDailyOpts(
  cashAnchors: LiquidCashAnchors,
  occurrences: ReturnType<typeof useTimeline>["occurrences"],
  txns: ReturnType<typeof useTransactions>["txns"]
): ProjectDailyOptions {
  let dailyBurnOverride: number | undefined;
  if (cashAnchors.hasAnchoredAccounts && txns.length > 0) {
    const byCat = baselineCategoryAverages(txns, 3);
    const monthlyActual = Object.values(byCat).reduce((s, v) => s + v, 0);
    if (monthlyActual > 0) dailyBurnOverride = monthlyActual / 30;
  }
  return timelineDailyOptions({
    startLiquid: cashAnchors.hasAnchoredAccounts ? cashAnchors.totalStartLiquid : undefined,
    occurrences,
    dailyBurnOverride,
    suppressTodayBurn: cashAnchors.hasAnchoredAccounts,
  });
}

export interface NextMilestone {
  goal: Goal;
  reachMonth: number | null;
}

export interface DashboardDerived {
  netWorth: number;
  liquidCash: number;
  /** P2：断言锚定后的现金口径。 */
  cashAnchors: LiquidCashAnchors;
  invested: number;
  monthlySurplus: number;
  emergencyFloor: number;
  safeToSpendBreakdown: SafeToSpendBreakdown;
  inflows30: number;
  obligations30: number;
  netObligations30: number;
  /** 本月（从今天到本日历月月底）内需支付的信用卡账单总额。 */
  cardObligations: number;
  safeToSpend: number;
  /** 本月预计能存多少 + 最佳存钱日。 */
  savingCapacity: MonthlySavingCapacity;
  nextMilestone: NextMilestone | null;
}

export interface Dashboard {
  projection: Projection;
  outlook: DailyOutlook;
  derived: DashboardDerived;
  actions: ActionItem[];
}

export function useDashboard(data: FinanceData): Dashboard {
  const { cashAnchors, occurrences } = useTimeline();
  const { txns } = useTransactions();

  const projectionOptions = useMemo(
    () =>
      cashAnchors.hasAnchoredAccounts
        ? { operatingLiquidOverride: cashAnchors.totalStartLiquid }
        : undefined,
    [cashAnchors.hasAnchoredAccounts, cashAnchors.totalStartLiquid]
  );

  const projection = useProjection(data, projectionOptions);

  return useMemo(() => {
    const today = new Date();
    const { summary, baseline } = projection;

    const dailyOpts = buildDailyOpts(cashAnchors, occurrences, txns);

    // 第一遍：不含 Emergency 月度预留，得到「最佳存钱日 + 当月可执行额」。
    const baseOutlook = projectDaily(data, 35, today, dailyOpts);
    const savingCapacity = selectMonthlySavingCapacity({
      outlook: baseOutlook,
      assumptions: data.assumptions,
      goals: data.goals,
      today,
    });

    // 第二遍：把 Emergency 月度预留按最佳日、当月实际额度注入现金日历，全局口径一致。
    const emergencyGoal = primaryEmergencyReserveGoal(data.goals);
    const outlook =
      savingCapacity.capacity > 0 && savingCapacity.bestDay
        ? projectDaily(data, 35, today, {
            ...dailyOpts,
            extraTransfers: [
              {
                date: savingCapacity.bestDay,
                label: `${emergencyGoal?.name ?? "应急储备"} 月度预留`,
                amount: savingCapacity.capacity,
              },
            ],
          })
        : baseOutlook;

    const emergencyFloor = Math.max(0, data.assumptions.emergencyReserveTarget);
    const safeToSpendBreakdown = selectSafeToSpendBreakdown({
      outlook,
      assumptions: data.assumptions,
      goals: data.goals,
    });

    // 本月窗口：从今天到本日历月月底（下月 1 号 00:00 为界，不含）。
    const now = today;
    const todayStartTs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const monthEndTs = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    const cardObligations = outlook.events
      .filter(
        (e) =>
          e.kind === "card" &&
          e.affectsBalance !== false &&
          e.ts >= todayStartTs &&
          e.ts < monthEndTs
      )
      .reduce((s, e) => s + Math.abs(e.amount), 0);
    const netObligations30 = Math.max(0, outlook.obligations30 - outlook.inflows30);

    const safeToSpend = safeToSpendBreakdown.safeToSpend;

    // 下一个里程碑：优先长期里程碑 (非预留 bucket)，取最早达成的一个。
    const milestoneGoals = data.goals.filter(isMilestoneGoal);
    const milestonePool = milestoneGoals.length > 0 ? milestoneGoals : data.goals;
    let nextMilestone: NextMilestone | null = null;
    for (const g of milestonePool) {
      const reachMonth = goalReachMonth(baseline, g);
      if (reachMonth == null) continue;
      if (!nextMilestone || reachMonth < (nextMilestone.reachMonth ?? Infinity)) {
        nextMilestone = { goal: g, reachMonth };
      }
    }
    if (!nextMilestone && milestonePool.length > 0) {
      nextMilestone = { goal: milestonePool[0], reachMonth: null };
    }

    const derived: DashboardDerived = {
      netWorth: summary.netWorth,
      liquidCash: cashAnchors.hasAnchoredAccounts
        ? cashAnchors.totalStartLiquid
        : summary.liquidCash,
      cashAnchors,
      invested: summary.invested,
      monthlySurplus: summary.monthlySurplus,
      emergencyFloor,
      safeToSpendBreakdown,
      inflows30: outlook.inflows30,
      obligations30: outlook.obligations30,
      netObligations30,
      cardObligations,
      safeToSpend,
      savingCapacity,
      nextMilestone,
    };

    const actions = buildActions(data, outlook, {
      safeToSpend,
      emergencyFloor,
      liquidCash: derived.liquidCash,
      savingCapacity,
    });

    return { projection, outlook, derived, actions };
  }, [data, projection, cashAnchors, occurrences, txns, projectionOptions]);
}
