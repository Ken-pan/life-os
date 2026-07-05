import { describe, expect, it } from "vitest";
import { budgetProgress, dailySpendSeries, plannedMonthlyBudget } from "./budget";
import type { Txn } from "./transactions";

function txn(over: Partial<Txn> & Pick<Txn, "date" | "budgetImpact">): Txn {
  return {
    month: over.date.slice(0, 7),
    merchant: "M",
    category: "C",
    account: "A",
    flow: "expense",
    amount: -over.budgetImpact,
    inSpending: true,
    inCashFlow: true,
    ...over,
  };
}

describe("dailySpendSeries", () => {
  it("缺日补 0，按日期升序，退款相抵", () => {
    const txns = [
      txn({ date: "2026-07-01", budgetImpact: -30 }),
      txn({ date: "2026-07-01", budgetImpact: -20 }),
      txn({ date: "2026-07-02", budgetImpact: 10 }), // 退款
    ];
    const series = dailySpendSeries(txns, "2026-07-03", 3);
    expect(series.map((d) => d.date)).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"]);
    expect(series[0].amount).toBe(50);
    expect(series[1].amount).toBe(-10);
    expect(series[2].amount).toBe(0);
  });
});

describe("plannedMonthlyBudget", () => {
  it("月度直接加总，年度 /12", () => {
    const budget = plannedMonthlyBudget([
      { id: "1", name: "房租", type: "expense", frequency: "monthly", amount: 1800 },
      { id: "2", name: "保险", type: "expense", frequency: "annual", amount: 1200 },
      { id: "3", name: "工资", type: "income", frequency: "monthly", amount: 5000 },
    ]);
    expect(budget).toBe(1900);
  });

  it("排除 401(k)/HSA 税前供款（lockbox-contribution）", () => {
    const budget = plannedMonthlyBudget([
      { id: "1", name: "房租", type: "expense", frequency: "monthly", amount: 1800 },
      {
        id: "2",
        name: "401(k) 供款",
        type: "expense",
        frequency: "monthly",
        amount: 1000,
        category: "lockbox-contribution",
      },
    ]);
    expect(budget).toBe(1800);
  });
});

describe("budgetProgress", () => {
  const txns = [
    txn({ date: "2026-07-01", budgetImpact: -900 }),
    txn({ date: "2026-07-10", budgetImpact: -100 }),
    txn({ date: "2026-06-30", budgetImpact: -500 }), // 上月，不计
    txn({ date: "2026-07-20", budgetImpact: -50 }), // 未来日期，不计
  ];

  it("只统计本月截至今天的净花销，含今日已花", () => {
    const p = budgetProgress(txns, 3000, "2026-07-10");
    expect(p.spent).toBe(1000);
    expect(p.todaySpend).toBe(100);
    expect(p.remaining).toBe(2000);
    expect(p.daysLeft).toBe(21);
    expect(p.dailyAllowance).toBeCloseTo(2000 / 21, 2);
  });

  it("超速 / 慢于进度判断", () => {
    // 7/10（约 1/3 进度）已花 2/3 预算 → over
    expect(budgetProgress(txns, 1500, "2026-07-10").pace).toBe("over");
    // 花得很少 → under
    expect(budgetProgress(txns, 30000, "2026-07-10").pace).toBe("under");
  });

  it("无预算时 pace 保持 on 且 spentRatio 为 0", () => {
    const p = budgetProgress(txns, 0, "2026-07-10");
    expect(p.pace).toBe("on");
    expect(p.spentRatio).toBe(0);
  });
});
