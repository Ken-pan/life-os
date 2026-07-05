import { describe, expect, it } from "vitest";
import type { AssumptionSet, Account, CashFlowItem, Goal, ScenarioEvent } from "../types";
import { projectMonthly } from "./monthly";
import { computeSpendImpact, goalReachMonth, summarize } from "./metrics";
import type { SafeToSpendBreakdown } from "./metrics";

const baseAssumptions = (over: Partial<AssumptionSet> = {}): AssumptionSet => ({
  conservativeReturn: 0.04,
  baselineReturn: 0.06,
  aggressiveReturn: 0.08,
  inflation: 0,
  cashYield: 0,
  salaryGrowth: 0,
  emergencyReserveTarget: 0,
  horizonYears: 20,
  displayMode: "today",
  checkingBuffer: 0,
  investRatio: 1,
  ...over,
});

const acc = (a: Partial<Account>): Account => ({
  id: a.id || "a",
  name: a.name || "acct",
  type: a.type || "checking",
  balance: a.balance ?? 0,
  ...a,
});

const income = (amount: number): CashFlowItem => ({
  id: "inc",
  name: "工资",
  type: "income",
  frequency: "monthly",
  amount,
});
const expense = (amount: number, essential = true): CashFlowItem => ({
  id: "exp" + amount,
  name: "支出",
  type: "expense",
  frequency: "monthly",
  amount,
  essential,
  category: "housing",
});

const ZERO_BREAKDOWN: SafeToSpendBreakdown = {
  lowestProjectedOperatingCash30d: 0,
  operatingCashBuffer: 0,
  earmarkedOperatingGoalCash: 0,
  safeToSpend: 0,
  protectedReserveExcludedUpstream: 0,
  upcomingObligations30d: 0,
};

describe("事件：工资变化", () => {
  it("百分比涨薪从指定月生效", () => {
    const assumptions = baseAssumptions();
    const cashFlows = [income(5000), expense(3000)];
    const raise: ScenarioEvent = {
      id: "r",
      name: "涨薪",
      eventType: "salary-change",
      enabled: true,
      monthOffset: 13,
      percent: 0.2,
    };
    const base = projectMonthly({ accounts: [], cashFlows, events: [], assumptions });
    const sim = projectMonthly({ accounts: [], cashFlows, events: [raise], assumptions });
    // 第 12 月 (涨薪前) 结余相同
    expect(sim[12].surplus).toBeCloseTo(base[12].surplus, 6);
    // 第 13 月起结余应增加 5000*20% = 1000
    expect(sim[13].surplus - base[13].surplus).toBeCloseTo(1000, 6);
  });

  it("固定额工资变化(可为负)", () => {
    const assumptions = baseAssumptions();
    const cashFlows = [income(5000), expense(3000)];
    const cut: ScenarioEvent = {
      id: "c",
      name: "减薪",
      eventType: "salary-change",
      enabled: true,
      monthOffset: 1,
      amount: -800,
    };
    const sim = projectMonthly({ accounts: [], cashFlows, events: [cut], assumptions });
    expect(sim[1].surplus).toBeCloseTo(5000 - 800 - 3000, 6);
  });

  it("停用的事件不生效", () => {
    const assumptions = baseAssumptions();
    const cashFlows = [income(5000), expense(3000)];
    const ev: ScenarioEvent = {
      id: "r",
      name: "涨薪",
      eventType: "salary-change",
      enabled: false,
      monthOffset: 1,
      amount: 1000,
    };
    const base = projectMonthly({ accounts: [], cashFlows, events: [], assumptions });
    const sim = projectMonthly({ accounts: [], cashFlows, events: [ev], assumptions });
    expect(sim[6].surplus).toBeCloseTo(base[6].surplus, 6);
  });
});

describe("事件：支出变化与伴侣分担", () => {
  it("每月支出增加降低结余", () => {
    const assumptions = baseAssumptions();
    const cashFlows = [income(5000), expense(2000)];
    const ev: ScenarioEvent = {
      id: "e",
      name: "升级房租",
      eventType: "expense-change",
      enabled: true,
      monthOffset: 1,
      amount: 500,
    };
    const sim = projectMonthly({ accounts: [], cashFlows, events: [ev], assumptions });
    expect(sim[1].surplus).toBeCloseTo(5000 - 2000 - 500, 6);
    expect(sim[1].expenses).toBeCloseTo(2500, 6);
  });

  it("伴侣按类别分担 50% 房租", () => {
    const assumptions = baseAssumptions();
    const cashFlows = [income(5000), expense(2000)]; // housing 类
    const ev: ScenarioEvent = {
      id: "p",
      name: "Kevin 分担",
      eventType: "partner-contribution",
      enabled: true,
      monthOffset: 13,
      contributionPercent: 0.5,
      expenseCategory: "housing",
    };
    const base = projectMonthly({ accounts: [], cashFlows, events: [], assumptions });
    const sim = projectMonthly({ accounts: [], cashFlows, events: [ev], assumptions });
    expect(base[13].expenses).toBeCloseTo(2000, 6);
    expect(sim[13].expenses).toBeCloseTo(1000, 6); // 房租减半
  });
});

describe("事件：windfall 与一次性消费的现金路径", () => {
  it("windfall 增加现金与净资产", () => {
    const assumptions = baseAssumptions();
    const accounts = [acc({ id: "ck", type: "checking", balance: 1000 })];
    const ev: ScenarioEvent = {
      id: "w",
      name: "奖金",
      eventType: "windfall",
      enabled: true,
      monthOffset: 1,
      amount: 5000,
    };
    const base = projectMonthly({ accounts, cashFlows: [], events: [], assumptions });
    const sim = projectMonthly({ accounts, cashFlows: [], events: [ev], assumptions });
    // 奖金落入现金后被分配进投资并增长一个月，差额略高于 5000
    const diff = sim[1].netWorth - base[1].netWorth;
    expect(diff).toBeGreaterThanOrEqual(5000);
    expect(diff).toBeLessThan(5100);
  });

  it("现金不足以支付一次性消费会触发负现金标记", () => {
    const assumptions = baseAssumptions({ emergencyReserveTarget: 0, checkingBuffer: 0 });
    const accounts = [acc({ id: "ck", type: "checking", balance: 500 })];
    const ev: ScenarioEvent = {
      id: "b",
      name: "大额消费",
      eventType: "one-time-purchase",
      enabled: true,
      monthOffset: 1,
      amount: 5000,
      fundingSource: "checking",
    };
    const sim = projectMonthly({ accounts, cashFlows: [], events: [ev], assumptions });
    expect(sim[1].negativeCash).toBe(true);
  });
});

describe("Spend Impact：每月支出", () => {
  it("每月多花会随时间放大差距，月结余变化为负", () => {
    const assumptions = baseAssumptions();
    const accounts = [acc({ id: "ck", type: "checking", balance: 0 })];
    const cashFlows = [income(5000), expense(2000)];
    const goals: Goal[] = [];
    const baseline = projectMonthly({ accounts, cashFlows, events: [], assumptions });
    const ev: ScenarioEvent = {
      id: "__sim__",
      name: "每月多花",
      eventType: "expense-change",
      enabled: true,
      monthOffset: 1,
      amount: 500,
    };
    const sim = projectMonthly({ accounts, cashFlows, events: [ev], assumptions });
    const impact = computeSpendImpact({
      baseline,
      sim,
      goals,
      safeToSpendBreakdownAfter: ZERO_BREAKDOWN,
      cashAfter: 0,
      compareYears: [5, 10, 20],
      spend: { amount: 500, type: "monthly", fundingSource: "checking" },
    });
    const y5 = impact.diffByYear.find((d) => d.year === 5)!.diff;
    const y20 = impact.diffByYear.find((d) => d.year === 20)!.diff;
    expect(y5).toBeLessThan(0);
    expect(Math.abs(y20)).toBeGreaterThan(Math.abs(y5)); // 越往后差距越大
    expect(impact.monthlySurplusChange).toBe(-500);
  });
});

describe("目标达成月份", () => {
  it("净资产目标在合理月份达成", () => {
    const assumptions = baseAssumptions();
    const accounts = [acc({ id: "bk", type: "brokerage", balance: 90000 })];
    const series = projectMonthly({ accounts, cashFlows: [], events: [], assumptions });
    const goal: Goal = { id: "g", name: "10万", metric: "net-worth", target: 100000 };
    const reach = goalReachMonth(series, goal);
    expect(reach).not.toBeNull();
    expect(reach!).toBeGreaterThan(0);
    expect(reach!).toBeLessThanOrEqual(assumptions.horizonYears * 12);
  });

  it("不可达目标返回 null", () => {
    const assumptions = baseAssumptions({ horizonYears: 5 });
    const series = projectMonthly({ accounts: [], cashFlows: [], events: [], assumptions });
    const goal: Goal = { id: "g", name: "100万", metric: "net-worth", target: 1000000 };
    expect(goalReachMonth(series, goal)).toBeNull();
  });
});

describe("空数据不崩溃", () => {
  it("无账户无现金流时各指标为 0/null", () => {
    const assumptions = baseAssumptions();
    const series = projectMonthly({ accounts: [], cashFlows: [], events: [], assumptions });
    const m = summarize(series);
    expect(m.netWorth).toBe(0);
    expect(m.liquidCash).toBe(0);
    expect(m.invested).toBe(0);
    expect(m.investedPct).toBe(0);
    expect(m.emergencyRunwayMonths).toBeNull();
  });
});
