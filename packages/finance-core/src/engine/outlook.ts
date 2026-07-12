// Dashboard / Spend Impact 共用的日现金流 outlook（含 Emergency 月度预留第二遍注入）。

import type { FinanceData } from "../types.js";
import { projectDaily, type DailyOutlook, type ProjectDailyOptions } from "./daily";
import { primaryEmergencyReserveGoal } from "./goals";
import {
  selectMonthlySavingCapacity,
  type MonthlySavingCapacity,
} from "./metrics";

export interface AugmentedDailyOutlook {
  outlook: DailyOutlook;
  /** 基于未注入 Emergency 预留的第一遍 outlook。 */
  savingCapacity: MonthlySavingCapacity;
}

/**
 * 与 Today 主路径一致：先算最佳存钱日，再把 Emergency 月度预留按最佳日注入现金日历。
 * Spend 抽屉与 Today KPI 必须共用此函数，避免 STS 口径分裂（FINC.CORE.3）。
 */
export function buildAugmentedDailyOutlook(
  data: FinanceData,
  horizonDays = 35,
  today = new Date(),
  dailyOpts: ProjectDailyOptions = {}
): AugmentedDailyOutlook {
  const baseOutlook = projectDaily(data, horizonDays, today, dailyOpts);
  const savingCapacity = selectMonthlySavingCapacity({
    outlook: baseOutlook,
    assumptions: data.assumptions,
    goals: data.goals,
    today,
  });

  const emergencyGoal = primaryEmergencyReserveGoal(data.goals);
  const outlook =
    savingCapacity.capacity > 0 && savingCapacity.bestDay
      ? projectDaily(data, horizonDays, today, {
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

  return { outlook, savingCapacity };
}
