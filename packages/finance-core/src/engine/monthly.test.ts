import { describe, expect, it } from "vitest";
import type { AssumptionSet, Account, CashFlowItem, ScenarioEvent, Goal } from "../types.js";
import { projectMonthly, resolveOneTimeEventMonth } from "./monthly";
import { computeSpendImpact, liquidAfterSimulatedSpend, summarize } from "./metrics";
import { futureCostOneTime } from "./finance";
import { todayLocalISO } from "./calendar";
import { projectDaily } from "./daily";
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

const ZERO_BREAKDOWN: SafeToSpendBreakdown = {
  lowestProjectedOperatingCash30d: 0,
  operatingCashBuffer: 0,
  earmarkedOperatingGoalCash: 0,
  safeToSpend: 0,
  protectedReserveExcludedUpstream: 0,
  upcomingObligations30d: 0,
};

describe("月度引擎结构", () => {
  it("快照数量 = 年限*12 + 1", () => {
    const series = projectMonthly({
      accounts: [],
      cashFlows: [],
      events: [],
      assumptions: baseAssumptions({ horizonYears: 10 }),
    });
    expect(series.length).toBe(121);
    expect(series[0].monthOffset).toBe(0);
  });
});

describe("一次性支出付款来源", () => {
  it("信用卡付款增加卡欠款而不扣活期", () => {
    const assumptions = baseAssumptions();
    const accounts = [
      acc({ id: "chk", type: "checking", balance: 5000 }),
      acc({
        id: "cc",
        type: "credit-card",
        balance: 500,
        apr: 0.2,
        creditMode: "paid-in-full",
        dueDay: 15,
      }),
    ];
    const purchase: ScenarioEvent = {
      id: "buy",
      name: "大额消费",
      eventType: "one-time-purchase",
      enabled: true,
      monthOffset: 1,
      amount: 2000,
      fundingSource: "credit-card",
    };
    const baseline = projectMonthly({ accounts, cashFlows: [], events: [], assumptions });
    const sim = projectMonthly({ accounts, cashFlows: [], events: [purchase], assumptions });
    expect(sim[1].checking).toBeCloseTo(baseline[1].checking, 0);
    expect(sim[1].liabilities - baseline[1].liabilities).toBeCloseTo(2000, 0);
  });
});

describe("券商成本估税", () => {
  it("主账户有成本时，忽略余额极小的空券商户缺成本", () => {
    const assumptions = baseAssumptions({ capitalGainsTaxRate: 0.15 });
    const series = projectMonthly({
      accounts: [
        acc({
          id: "rh",
          type: "brokerage",
          balance: 136342.75,
          basis: 88333.73,
        }),
        acc({ id: "chase", type: "brokerage", balance: 0.15 }),
      ],
      cashFlows: [],
      events: [],
      assumptions,
    });
    expect(series[0].taxBasisKnown).toBe(true);
    expect(series[0].capitalGainsTaxEstimate).toBeGreaterThan(0);
  });
});

describe("一次性消费的未来差额 = 机会成本公式", () => {
  const assumptions = baseAssumptions();
  const accounts = [acc({ id: "bk", type: "brokerage", balance: 100000 })];
  const goals: Goal[] = [];
  const purchase: ScenarioEvent = {
    id: "buy",
    name: "买东西",
    eventType: "one-time-purchase",
    enabled: true,
    monthOffset: 1,
    amount: 10000,
    fundingSource: "invested",
  };

  it("从投资账户支付 $10,000，5/10/20 年差额对齐 6% 复利", () => {
    const baseline = projectMonthly({ accounts, cashFlows: [], events: [], assumptions });
    const sim = projectMonthly({ accounts, cashFlows: [], events: [purchase], assumptions });
    const impact = computeSpendImpact({
      baseline,
      sim,
      goals,
      safeToSpendBreakdownAfter: ZERO_BREAKDOWN,
      cashAfter: 0,
    });
    const y5 = impact.diffByYear.find((d) => d.year === 5)!.diff;
    const y10 = impact.diffByYear.find((d) => d.year === 10)!.diff;
    const y20 = impact.diffByYear.find((d) => d.year === 20)!.diff;
    expect(Math.round(y5)).toBe(-Math.round(futureCostOneTime(10000, 0.06, 5)));
    expect(Math.round(y10)).toBe(-Math.round(futureCostOneTime(10000, 0.06, 10)));
    expect(Math.round(y20)).toBe(-Math.round(futureCostOneTime(10000, 0.06, 20)));
  });
});

describe("一次性事件月份解析", () => {
  it("本月 dated 事件在投影第 1 月执行", () => {
    const start = new Date(2026, 5, 1);
    const todayISO = "2026-06-01";
    const ev: ScenarioEvent = {
      id: "buy",
      name: "今天买",
      eventType: "one-time-purchase",
      enabled: true,
      date: todayISO,
      monthOffset: 0,
      amount: 4000,
      fundingSource: "checking",
    };
    expect(resolveOneTimeEventMonth(start, ev)).toBe(1);
    const accounts = [acc({ id: "ck", type: "checking", balance: 8000 })];
    const baseline = projectMonthly({
      accounts,
      cashFlows: [],
      events: [],
      assumptions: baseAssumptions(),
      startDate: start,
    });
    const sim = projectMonthly({
      accounts,
      cashFlows: [],
      events: [ev],
      assumptions: baseAssumptions(),
      startDate: start,
    });
    expect(sim[1].oneTimeExpense).toBe(4000);
    expect(sim[1].netWorth).toBeLessThan(baseline[1].netWorth);
    expect(baseline[1].netWorth - sim[1].netWorth).toBeGreaterThan(3900);
  });
});

describe("Spend Impact：一次性活期消费", () => {
  it("liquidAfterSimulatedSpend 反映当天日终流动现金", () => {
    const today = new Date();
    const todayISO = todayLocalISO(today);
    const accounts = [acc({ id: "ck", type: "checking", balance: 5032, liquid: true })];
    const assumptions = baseAssumptions({ checkingBuffer: 0 });
    const ev: ScenarioEvent = {
      id: "__sim__",
      name: "模拟消费",
      eventType: "one-time-purchase",
      enabled: true,
      date: todayISO,
      monthOffset: 0,
      amount: 4000,
      fundingSource: "checking",
    };
    const outlook = projectDaily(
      {
        version: 1,
        accounts,
        cashFlows: [],
        events: [ev],
        goals: [],
        assumptions,
        holdingsSnapshots: [],
        updatedAt: todayISO,
        privacy: false,
      },
      35,
      today
    );
    const after = liquidAfterSimulatedSpend(outlook, {
      amount: 4000,
      type: "one-time",
      fundingSource: "checking",
    });
    expect(after).toBeCloseTo(outlook.startLiquid - 4000, 0);
    expect(after).toBeLessThan(outlook.startLiquid);
  });

  it("savings 付款来源也会扣减日级流动现金", () => {
    const today = new Date();
    const todayISO = todayLocalISO(today);
    const accounts = [
      acc({ id: "ck", type: "checking", balance: 2000, liquid: true }),
      acc({ id: "sv", type: "savings", balance: 3000, liquid: true }),
    ];
    const ev: ScenarioEvent = {
      id: "__sim__",
      name: "模拟消费",
      eventType: "one-time-purchase",
      enabled: true,
      date: todayISO,
      monthOffset: 0,
      amount: 1500,
      fundingSource: "savings",
    };
    const outlook = projectDaily(
      {
        version: 1,
        accounts,
        cashFlows: [],
        events: [ev],
        goals: [],
        assumptions: baseAssumptions({ checkingBuffer: 0 }),
        holdingsSnapshots: [],
        updatedAt: todayISO,
        privacy: false,
      },
      35,
      today
    );
    expect(liquidAfterSimulatedSpend(outlook, {
      amount: 1500,
      type: "one-time",
      fundingSource: "savings",
    })).toBeCloseTo(3500, 0);
  });
});

describe("现金流与分配", () => {
  it("正向月结余使净资产增长，并把现金投入投资", () => {
    const assumptions = baseAssumptions({ emergencyReserveTarget: 0, checkingBuffer: 0 });
    const accounts = [acc({ id: "ck", type: "checking", balance: 0 })];
    const cashFlows: CashFlowItem[] = [
      { id: "inc", name: "工资", type: "income", frequency: "monthly", amount: 5000 },
      { id: "exp", name: "生活", type: "expense", frequency: "monthly", amount: 3000, essential: true },
    ];
    const series = projectMonthly({ accounts, cashFlows, events: [], assumptions });
    expect(series[1].surplus).toBeCloseTo(2000, 6);
    expect(series[12].invested).toBeGreaterThan(0);
    expect(series[12].netWorth).toBeGreaterThan(series[0].netWorth);
  });
});

describe("信用卡两种模式", () => {
  it("全额还清卡：下月付清且不计利息", () => {
    const assumptions = baseAssumptions();
    const accounts = [
      acc({ id: "ck", type: "checking", balance: 5000 }),
      acc({ id: "cc", type: "credit-card", balance: 1000, apr: 0.24, creditMode: "paid-in-full" }),
    ];
    const series = projectMonthly({ accounts, cashFlows: [], events: [], assumptions });
    expect(series[0].liabilities).toBeCloseTo(1000, 6);
    expect(series[1].liabilities).toBeCloseTo(0, 6);
  });

  it("滚动卡：计息且缓慢偿还", () => {
    const assumptions = baseAssumptions();
    const accounts = [
      acc({ id: "cc", type: "credit-card", balance: 1000, apr: 0.24, creditMode: "revolving" }),
    ];
    const series = projectMonthly({ accounts, cashFlows: [], events: [], assumptions });
    // 无现金还款，仅最低还款，余额下降但仍 > 0
    expect(series[1].liabilities).toBeGreaterThan(0);
    expect(series[1].liabilities).toBeLessThan(1000);
  });
});

describe("目标 monthlyAllocation 联动", () => {
  it("monthlyAllocation 降低可投资结余并改变月度投影", () => {
    const assumptions = baseAssumptions({
      checkingBuffer: 0,
      emergencyReserveTarget: 0,
      investRatio: 1,
      cashYield: 0,
      baselineReturn: 0,
    });
    const accounts = [acc({ id: "ck", type: "checking", balance: 0 })];
    const cashFlows: CashFlowItem[] = [
      { id: "inc", name: "工资", type: "income", frequency: "monthly", amount: 5000 },
      { id: "exp", name: "生活", type: "expense", frequency: "monthly", amount: 3000, essential: true },
    ];
    const base = projectMonthly({
      accounts,
      cashFlows,
      events: [],
      goals: [],
      assumptions,
    });
    const withAlloc = projectMonthly({
      accounts,
      cashFlows,
      events: [],
      goals: [
        {
          id: "goal-alloc",
          name: "旅行",
          metric: "liquid",
          target: 10000,
          reservePolicy: "earmarked_operating_cash",
          monthlyAllocation: 500,
        },
      ],
      assumptions,
    });
    expect(base[2].invested - withAlloc[2].invested).toBeCloseTo(1000, 0);
  });
});

describe("派生指标", () => {
  it("总览口径：流动现金/投资分离，应急跑道按必要支出计算", () => {
    const assumptions = baseAssumptions({ emergencyReserveTarget: 20000 });
    const accounts = [
      acc({ id: "ck", type: "checking", balance: 10000 }),
      acc({ id: "sv", type: "savings", balance: 20000 }),
      acc({ id: "bk", type: "brokerage", balance: 100000 }),
    ];
    const cashFlows: CashFlowItem[] = [
      { id: "inc", name: "工资", type: "income", frequency: "monthly", amount: 6000 },
      { id: "rent", name: "房租", type: "expense", frequency: "monthly", amount: 2000, essential: true },
    ];
    const series = projectMonthly({ accounts, cashFlows, events: [], assumptions });
    const m = summarize(series);
    expect(m.liquidCash).toBeCloseTo(30000, 6);
    expect(m.invested).toBeCloseTo(100000, 6);
    // 跑道 = 30000 / 2000 = 15 个月
    expect(m.emergencyRunwayMonths).toBeCloseTo(15, 6);
  });
});

describe("401(k) lockbox-contribution", () => {
  it("增加 investedLocked 但不从 checking 扣减（与税后工资不重复）", () => {
    const assumptions = baseAssumptions({ horizonYears: 1, baselineReturn: 0, cashYield: 0, investRatio: 0 });
    const accounts = [
      acc({ id: "ck", type: "checking", balance: 5000 }),
      acc({ id: "401", type: "retirement", balance: 50000 }),
    ];
    const income: CashFlowItem = {
      id: "inc",
      name: "工资",
      type: "income",
      frequency: "monthly",
      amount: 6000,
    };
    const lockbox: CashFlowItem = {
      id: "401k",
      name: "401k",
      type: "expense",
      frequency: "monthly",
      amount: 1200,
      category: "lockbox-contribution",
    };
    const baseline = projectMonthly({
      accounts,
      cashFlows: [income],
      events: [],
      assumptions,
    });
    const withLockbox = projectMonthly({
      accounts,
      cashFlows: [income, lockbox],
      events: [],
      assumptions,
    });
    expect(withLockbox[1].checking).toBeCloseTo(baseline[1].checking, 6);
    expect(withLockbox[1].investedLocked).toBeCloseTo(50000 + 1200, 6);
    expect(withLockbox[1].surplus).toBeCloseTo(baseline[1].surplus, 6);
  });
});
