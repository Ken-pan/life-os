import { describe, it, expect } from "vitest";
import { createEmptyData } from "../store/defaults";
import { projectMonthly } from "./monthly";
import { buildAugmentedDailyOutlook } from "./outlook";
import { selectSafeToSpendBreakdown, computeSpendImpact } from "./metrics";

const TODAY = new Date(2026, 4, 29);

describe("buildAugmentedDailyOutlook (F-P3)", () => {
  it("Today STS 与零额 SpendImpact 共用 augmented outlook", () => {
    const data = createEmptyData();
    data.accounts = [
      { id: "chk", name: "Checking", type: "checking", balance: 8000, liquid: true },
    ];
    data.cashFlows = [
      { id: "income", name: "工资", type: "income", frequency: "monthly", amount: 6000 },
      { id: "rent", name: "房租", type: "expense", frequency: "monthly", amount: 2200, dueDay: 1 },
    ];
    data.goals = [
      {
        id: "g-earmark",
        name: "旅行",
        metric: "liquid",
        target: 5000,
        current: 900,
        reservePolicy: "earmarked_operating_cash",
      },
    ];

    const { outlook } = buildAugmentedDailyOutlook(data, 35, TODAY);
    const breakdown = selectSafeToSpendBreakdown({
      outlook,
      assumptions: data.assumptions,
      goals: data.goals,
    });

    const baseline = projectMonthly({
      accounts: data.accounts,
      cashFlows: data.cashFlows,
      events: data.events,
      goals: data.goals,
      assumptions: data.assumptions,
      startDate: TODAY,
    });

    const impact = computeSpendImpact({
      baseline,
      sim: baseline,
      goals: data.goals,
      safeToSpendBreakdownAfter: breakdown,
      cashAfter: outlook.startLiquid,
      spend: { amount: 0, type: "one-time", fundingSource: "checking" },
    });

    expect(breakdown.earmarkedOperatingGoalCash).toBe(900);
    expect(impact.safeToSpendAfter).toBeCloseTo(breakdown.safeToSpend, 6);
  });
});
