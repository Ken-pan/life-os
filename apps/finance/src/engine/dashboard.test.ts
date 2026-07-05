import { describe, it, expect } from "vitest";
import { createEmptyData, defaultAssumptions } from "../store/defaults";
import { projectDaily } from "./daily";
import { projectMonthly } from "./monthly";
import {
  computeSafeToSpend,
  computeSpendImpact,
  selectSafeToSpendBreakdown,
  selectMonthlySavingCapacity,
} from "./metrics";
import { buildActions } from "./actions";
import type { Account, FinanceData } from "../types";

const TODAY = new Date(2026, 4, 29); // 2026-05-29

describe("从应急储备账户还信用卡 (paymentAccountId)", () => {
  const base: Account[] = [
    { id: "chk", name: "Checking", type: "checking", balance: 5000, liquid: true },
    { id: "reserve", name: "Robinhood Cash", type: "savings", balance: 5000, liquid: false },
    {
      id: "card",
      name: "Card",
      type: "credit-card",
      balance: 2000,
      statementBalance: 2000,
      creditMode: "paid-in-full",
      dueDay: 12,
    },
  ];
  const assumptions = { ...defaultAssumptions, horizonYears: 1 };

  it("从活期还款时，月度可动用现金被卡账单拉低约 2000", () => {
    const series = projectMonthly({ accounts: base, cashFlows: [], events: [], assumptions, startDate: TODAY });
    // 月1 还清 2000 → 活期从 5000 降到约 3000（含少量现金收益）
    expect(Math.abs(series[1].liquidCash - 3000)).toBeLessThan(50);
  });

  it("指定从 Robinhood Cash 还款时，活期不受影响，净资产不变", () => {
    const accounts = base.map((a) => (a.id === "card" ? { ...a, paymentAccountId: "reserve" } : a));
    const fromReserve = projectMonthly({ accounts, cashFlows: [], events: [], assumptions, startDate: TODAY });
    const fromChecking = projectMonthly({ accounts: base, cashFlows: [], events: [], assumptions, startDate: TODAY });
    // 从储备还款时，月1 活期比从活期还款时高出约 2000（即卡账单未占用活期，含少量现金收益）
    expect(Math.abs(fromReserve[1].liquidCash - fromChecking[1].liquidCash - 2000)).toBeLessThan(50);
    // 储备相应下降约 2000
    expect(Math.abs(fromChecking[1].reserve - fromReserve[1].reserve - 2000)).toBeLessThan(50);
    // 两种还款方式净资产一致（资产-负债守恒）
    expect(fromReserve[1].netWorth).toBeCloseTo(fromChecking[1].netWorth, 0);
  });

  it("daily：从储备还款的卡仍出现在现金日历，但不占用流动现金", () => {
    const accounts = base.map((a) => (a.id === "card" ? { ...a, paymentAccountId: "reserve" } : a));
    const out = projectDaily(
      { accounts, cashFlows: [], events: [], goals: [], assumptions, holdingsSnapshots: [], updatedAt: TODAY.toISOString(), version: 5, privacy: false },
      35,
      TODAY
    );
    const cardEvents = out.events.filter((e) => e.kind === "card");
    expect(cardEvents.length).toBeGreaterThan(0);
    expect(cardEvents.every((e) => e.fundedFromReserve === true)).toBe(true);
    expect(cardEvents.every((e) => e.affectsBalance === false)).toBe(true);
    const fromChecking = projectDaily(
      { accounts: base, cashFlows: [], events: [], goals: [], assumptions, holdingsSnapshots: [], updatedAt: TODAY.toISOString(), version: 5, privacy: false },
      35,
      TODAY
    );
    expect(out.lowestBalance).toBeCloseTo(fromChecking.startLiquid, 0);
  });
});

describe("daily outlook (30天现金流)", () => {
  function buildFixture(): FinanceData {
    const base = createEmptyData();
    return {
      ...base,
      accounts: [
        { id: "chk", name: "Checking", type: "checking", balance: 4200, liquid: true },
        { id: "sav", name: "Savings", type: "savings", balance: 3000, liquid: true },
        {
          id: "reserve",
          name: "Robinhood Cash",
          type: "savings",
          balance: 5000,
          liquid: false,
        },
        {
          id: "card-a",
          name: "Main Card",
          type: "credit-card",
          balance: 1800,
          statementBalance: 1800,
          creditMode: "paid-in-full",
          dueDay: 12,
        },
        {
          id: "card-rh",
          name: "Robinhood Card",
          type: "credit-card",
          balance: 900,
          statementBalance: 900,
          creditMode: "paid-in-full",
          dueDay: 12,
          paymentAccountId: "reserve",
        },
      ],
      cashFlows: [
        {
          id: "income",
          name: "工资",
          type: "income",
          frequency: "monthly",
          amount: 7000,
          payFrequency: "biweekly",
          anchorDate: "2026-06-05",
        },
        { id: "rent", name: "房租", type: "expense", frequency: "monthly", amount: 2200, dueDay: 1 },
      ],
      goals: [{ id: "g1", name: "应急", metric: "liquid", target: 12000, reserve: true, monthlyAllocation: 300 }],
    };
  }

  it("把信用卡账单算作未来现金义务，并算出最低余额", () => {
    const data = buildFixture();
    const out = projectDaily(data, 35, TODAY);
    expect(out.startLiquid).toBeCloseTo(7200, 0);
    const cardEvents = out.events.filter((e) => e.kind === "card");
    expect(cardEvents.length).toBeGreaterThan(0);
    const rhCard = cardEvents.find((e) => e.label.includes("Robinhood"));
    expect(rhCard).toBeDefined();
    expect(rhCard?.fundedFromReserve).toBe(true);
    expect(rhCard?.affectsBalance).toBe(false);
    const liquidCardEvents = cardEvents.filter((e) => e.affectsBalance !== false);
    const totalCard = liquidCardEvents.reduce((a, e) => a + Math.abs(e.amount), 0);
    expect(totalCard).toBeGreaterThan(0);
    expect(totalCard).toBeCloseTo(1800, 0);
  });

  it("本周指标：从今天到周日的义务不超过 30 天窗口", () => {
    const data = buildFixture();
    const out = projectDaily(data, 35, TODAY);
    expect(out.obligationsWeek).toBeLessThanOrEqual(out.obligations30);
    expect(out.inflowsWeek).toBeLessThanOrEqual(out.inflows30);
    expect(out.lowestBalanceWeek).toBeLessThanOrEqual(out.startLiquid);
    expect(out.lowestBalanceWeek).toBeGreaterThanOrEqual(out.lowestBalance);
    // 本月窗口介于本周与 35 天之间：低谷不高于本周、不低于整窗。
    expect(out.lowestBalanceMonth).toBeLessThanOrEqual(out.lowestBalanceWeek);
    expect(out.lowestBalanceMonth).toBeGreaterThanOrEqual(out.lowestBalance);
  });

  it("发薪日按双周锚点出现在窗口内", () => {
    const data = buildFixture();
    const out = projectDaily(data, 35, TODAY);
    const incomes = out.events.filter((e) => e.kind === "income");
    expect(incomes.length).toBeGreaterThanOrEqual(2);
  });

  it("同一天事件先入账再出账（先存钱再取钱）", () => {
    const data = createEmptyData();
    data.accounts = [
      { id: "chk", name: "Checking", type: "checking", balance: 1000, liquid: true },
    ];
    data.cashFlows = [
      { id: "income", name: "工资", type: "income", frequency: "monthly", amount: 500, dueDay: 1 },
      { id: "rent", name: "房租", type: "expense", frequency: "monthly", amount: 800, dueDay: 1 },
    ];
    const out = projectDaily(data, 35, TODAY);
    const sameDay = out.events.filter((e) => e.date === "2026-06-01");
    expect(sameDay.length).toBe(2);
    expect(sameDay[0].amount).toBeGreaterThan(0);
    expect(sameDay[1].amount).toBeLessThan(0);
  });
});

describe("信用卡还款日（含每月最后一天）在现金日历中的映射", () => {
  it("dueDay=99 时，30天窗口内落在当月最后一天", () => {
    const data = createEmptyData();
    const start = new Date(2026, 5, 1); // 2026-06-01
    data.accounts = [
      { id: "chk", name: "Checking", type: "checking", balance: 5000, liquid: true },
      {
        id: "apple",
        name: "Apple Card",
        type: "credit-card",
        balance: 800,
        statementBalance: 800,
        creditMode: "paid-in-full",
        dueDay: 99,
      },
    ];
    const out = projectDaily(data, 35, start);
    const appleBill = out.events.find((e) => e.kind === "card" && e.label.includes("Apple Card"));
    expect(appleBill).toBeTruthy();
    expect(appleBill?.date).toBe("2026-06-30");
  });

  it("历史值 dueDay=31 也会按当月最后一天结算（2月→28）", () => {
    const data = createEmptyData();
    const start = new Date(2026, 1, 1); // 2026-02-01（非闰年）
    data.accounts = [
      { id: "chk", name: "Checking", type: "checking", balance: 5000, liquid: true },
      {
        id: "legacy",
        name: "Legacy Card",
        type: "credit-card",
        balance: 600,
        statementBalance: 600,
        creditMode: "paid-in-full",
        dueDay: 31,
      },
    ];
    const out = projectDaily(data, 35, start);
    const bill = out.events.find((e) => e.kind === "card" && e.label.includes("Legacy Card"));
    expect(bill).toBeTruthy();
    expect(bill?.date).toBe("2026-02-28");
  });
});

describe("日常开销：刷主卡（免息期，不重复计入 statement）", () => {
  function everydayData(withCard: boolean): FinanceData {
    const base = createEmptyData();
    const accounts: Account[] = [
      { id: "chk", name: "Checking", type: "checking", balance: 6000, liquid: true },
    ];
    if (withCard) {
      accounts.push({
        id: "card",
        name: "Main Card",
        type: "credit-card",
        balance: 1800,
        // 本期账单已包含日常消费。
        statementBalance: 1800,
        creditMode: "paid-in-full",
        dueDay: 12,
      });
    }
    return {
      ...base,
      accounts,
      // 无 dueDay 的日常开销（买菜/外食），全部刷主卡。
      cashFlows: [{ id: "food", name: "日常", type: "expense", frequency: "monthly", amount: 1500 }],
      goals: [],
    };
  }

  it("最近一期只付当前账单，不在同一天再加一笔日常开销（无重复计入）", () => {
    const out = projectDaily(everydayData(true), 35, TODAY);
    expect(out.everydayOnCard).toBe(true);
    expect(out.dailyBurn).toBe(0);
    // 窗口内只有 6/12 一个还款日：付当前 statement 1800，而不是 1800+1500。
    const cardEvents = out.events.filter((e) => e.kind === "card");
    const totalCard = cardEvents.reduce((s, e) => s + Math.abs(e.amount), 0);
    expect(totalCard).toBeCloseTo(1800, 0);
    // 日常开销不再作为独立的现金支出事件出现。
    expect(out.events.some((e) => e.kind === "expense")).toBe(false);
  });

  it("下一个账单周期才计入当期日常消费（体现免息期）", () => {
    const out = projectDaily(everydayData(true), 70, TODAY);
    const cardEvents = out.events.filter((e) => e.kind === "card").sort((a, b) => a.ts - b.ts);
    expect(cardEvents.length).toBe(2);
    // 第一期 = 当前账单；第二期 = 当期日常消费。
    expect(Math.abs(cardEvents[0].amount)).toBeCloseTo(1800, 0);
    expect(Math.abs(cardEvents[1].amount)).toBeCloseTo(1500, 0);
  });

  it("没有从活期还款的信用卡时，退回到按日均摊扣现金", () => {
    const out = projectDaily(everydayData(false), 35, TODAY);
    expect(out.everydayOnCard).toBe(false);
    expect(out.dailyBurn).toBeCloseTo(1500 / 30, 6);
  });
});

describe("safe-to-spend", () => {
  function baseData(): FinanceData {
    const data = createEmptyData();
    data.accounts = [
      { id: "chk", name: "Checking", type: "checking", balance: 8000, liquid: true },
      { id: "sav", name: "Savings", type: "savings", balance: 2000, liquid: true },
    ];
    data.cashFlows = [
      { id: "income", name: "工资", type: "income", frequency: "monthly", amount: 6000 },
      { id: "rent", name: "房租", type: "expense", frequency: "monthly", amount: 2200, dueDay: 1 },
    ];
    data.goals = [{ id: "g1", name: "旅行", metric: "liquid", target: 5000, reserve: true, monthlyAllocation: 200 }];
    return data;
  }

  it("按未来现金低谷扣减安全垫与目标预留，不含券商/退休账户", () => {
    const data = baseData();
    const out = projectDaily(data, 35, TODAY);
    const plannedSavings30 = data.goals
      .filter((g) => g.reserve)
      .reduce((s, g) => s + (g.monthlyAllocation ?? 0), 0);
    const sts = computeSafeToSpend({
      lowestBalance: out.lowestBalance,
      buffer: out.buffer,
      plannedSavings: plannedSavings30,
    });
    expect(sts).toBe(Math.max(0, out.lowestBalance - out.buffer - plannedSavings30));
    expect(sts).toBeGreaterThan(0);
    // 绝不超过未来低谷本身（不会把未来要用的钱算成可花）。
    expect(sts).toBeLessThanOrEqual(out.lowestBalance);
  });

  it("接下来几周的大额支出会拉低可安心花", () => {
    const data = baseData();
    const plannedSavings30 = 200;
    const before = computeSafeToSpend({
      lowestBalance: projectDaily(data, 35, TODAY).lowestBalance,
      buffer: data.assumptions.checkingBuffer,
      plannedSavings: plannedSavings30,
    });
    // 明天一笔从活期支付的大额一次性支出（在发薪前发生，确保会拉低低谷）。
    data.events = [
      {
        id: "trip",
        name: "旅行",
        eventType: "one-time-purchase",
        date: "2026-05-30",
        monthOffset: 1,
        amount: 3000,
        fundingSource: "checking",
        enabled: true,
      },
    ];
    const after = computeSafeToSpend({
      lowestBalance: projectDaily(data, 35, TODAY).lowestBalance,
      buffer: data.assumptions.checkingBuffer,
      plannedSavings: plannedSavings30,
    });
    expect(after).toBeLessThan(before);
    expect(before - after).toBeCloseTo(3000, 0);
  });

  it("milestone_only 目标不降低 safe-to-spend", () => {
    const data = baseData();
    data.goals = [
      {
        id: "g-milestone",
        name: "净资产里程碑",
        metric: "net-worth",
        target: 500000,
        current: 8000,
        reservePolicy: "milestone_only",
      },
    ];
    const out = projectDaily(data, 35, TODAY);
    const breakdown = selectSafeToSpendBreakdown({
      outlook: out,
      assumptions: data.assumptions,
      goals: data.goals,
    });
    expect(breakdown.earmarkedOperatingGoalCash).toBe(0);
    expect(breakdown.safeToSpend).toBeCloseTo(
      Math.max(0, out.lowestBalance - out.buffer),
      0
    );
  });

  it("earmarked_operating_cash 只扣一次 current", () => {
    const data = baseData();
    data.goals = [
      {
        id: "g-earmark",
        name: "旅行",
        metric: "liquid",
        target: 5000,
        current: 1200,
        reservePolicy: "earmarked_operating_cash",
      },
    ];
    const out = projectDaily(data, 35, TODAY);
    const breakdown = selectSafeToSpendBreakdown({
      outlook: out,
      assumptions: data.assumptions,
      goals: data.goals,
    });
    expect(breakdown.earmarkedOperatingGoalCash).toBe(1200);
    expect(breakdown.safeToSpend).toBeCloseTo(
      Math.max(0, out.lowestBalance - out.buffer - 1200),
      0
    );
  });

  it("protected_account 上游排除，不重复扣减", () => {
    const data = baseData();
    data.accounts.push({
      id: "protect",
      name: "Protected reserve",
      type: "savings",
      balance: 4000,
      liquid: false,
    });
    data.goals = [
      {
        id: "g-protected",
        name: "医疗备用金",
        metric: "liquid",
        target: 4000,
        current: 4000,
        reservePolicy: "protected_account",
        fundingAccountId: "protect",
      },
    ];
    const out = projectDaily(data, 35, TODAY);
    const breakdown = selectSafeToSpendBreakdown({
      outlook: out,
      assumptions: data.assumptions,
      goals: data.goals,
    });
    expect(breakdown.protectedReserveExcludedUpstream).toBe(4000);
    expect(breakdown.earmarkedOperatingGoalCash).toBe(0);
    expect(breakdown.safeToSpend).toBeCloseTo(
      Math.max(0, out.lowestBalance - out.buffer),
      0
    );
  });

  it("monthlyAllocation 在未来 30 天内应影响日投影", () => {
    const data = baseData();
    const outBefore = projectDaily(data, 35, TODAY);
    const beforeBreakdown = selectSafeToSpendBreakdown({
      outlook: outBefore,
      assumptions: data.assumptions,
      goals: data.goals,
    });
    data.goals = [
      {
        id: "g-alloc",
        name: "车险预留",
        metric: "liquid",
        target: 6000,
        reservePolicy: "earmarked_operating_cash",
        monthlyAllocation: 500,
        monthlyAllocationDay: 5,
      },
    ];
    const out = projectDaily(data, 35, TODAY);
    const afterBreakdown = selectSafeToSpendBreakdown({
      outlook: out,
      assumptions: data.assumptions,
      goals: data.goals,
    });
    expect(
      out.events.some(
        (event) =>
          event.kind === "transfer" && event.label.includes("车险预留")
      )
    ).toBe(true);
    expect(afterBreakdown.upcomingObligations30d).toBeGreaterThan(
      beforeBreakdown.upcomingObligations30d
    );
  });

  it("零额模拟时，Today STS 与 SpendImpact safe-after 一致", () => {
    const data = baseData();
    const baselineMonthly = projectMonthly({
      accounts: data.accounts,
      cashFlows: data.cashFlows,
      events: data.events,
      goals: data.goals,
      assumptions: data.assumptions,
      startDate: TODAY,
    });
    const outlook = projectDaily(data, 35, TODAY);
    const breakdown = selectSafeToSpendBreakdown({
      outlook,
      assumptions: data.assumptions,
      goals: data.goals,
    });
    const impact = computeSpendImpact({
      baseline: baselineMonthly,
      sim: baselineMonthly,
      goals: data.goals,
      safeToSpendBreakdownAfter: breakdown,
      cashAfter: outlook.startLiquid,
      spend: { amount: 0, type: "one-time", fundingSource: "checking" },
    });
    expect(impact.safeToSpendAfter).toBeCloseTo(breakdown.safeToSpend, 6);
  });

  it("券商/HSA/退休资产默认不计入可花现金", () => {
    const data = baseData();
    data.accounts.push(
      { id: "broker", name: "Broker", type: "brokerage", balance: 200000 },
      { id: "hsa", name: "HSA", type: "hsa", balance: 15000 },
      { id: "ret", name: "401k", type: "retirement", balance: 300000 }
    );
    const out = projectDaily(data, 35, TODAY);
    expect(out.startLiquid).toBeCloseTo(10000, 0);
  });

  it("protected reserve 存在时，短缺仍保持可见", () => {
    const data = baseData();
    data.accounts = [
      { id: "chk", name: "Checking", type: "checking", balance: 500, liquid: true },
      { id: "reserve", name: "Reserve", type: "savings", balance: 3000, liquid: false },
    ];
    data.cashFlows = [
      {
        id: "rent",
        name: "房租",
        type: "expense",
        frequency: "monthly",
        amount: 2200,
        dueDay: 1,
        essential: true,
      },
    ];
    data.goals = [
      {
        id: "g-protected",
        name: "应急金",
        metric: "liquid",
        target: 3000,
        current: 3000,
        reservePolicy: "protected_account",
      },
    ];
    const out = projectDaily(data, 35, TODAY);
    const breakdown = selectSafeToSpendBreakdown({
      outlook: out,
      assumptions: data.assumptions,
      goals: data.goals,
    });
    expect(breakdown.protectedReserveExcludedUpstream).toBe(3000);
    expect(out.recommendedTransfer).toBeGreaterThan(0);
  });

  it("ordinary purchase simulation 不应自动动用 protected reserve", () => {
    const data = baseData();
    data.accounts.push({
      id: "reserve",
      name: "Reserve",
      type: "savings",
      balance: 3000,
      liquid: false,
    });
    data.goals = [
      {
        id: "g-protected",
        name: "应急金",
        metric: "liquid",
        target: 3000,
        current: 3000,
        reservePolicy: "protected_account",
      },
    ];
    const base = projectMonthly({
      accounts: data.accounts,
      cashFlows: data.cashFlows,
      events: [],
      goals: data.goals,
      assumptions: data.assumptions,
      startDate: TODAY,
    });
    const ordinary = projectMonthly({
      accounts: data.accounts,
      cashFlows: data.cashFlows,
      events: [
        {
          id: "buy",
          name: "模拟消费",
          eventType: "one-time-purchase",
          enabled: true,
          monthOffset: 1,
          amount: 4000,
          fundingSource: "checking",
        },
      ],
      goals: data.goals,
      assumptions: data.assumptions,
      startDate: TODAY,
    });
    expect(ordinary[1].reserve).toBeCloseTo(base[1].reserve, 0);
  });

  it("explicit emergency fallback scenario can use reserve", () => {
    const data = baseData();
    data.accounts = [
      { id: "chk", name: "Checking", type: "checking", balance: 500, liquid: true },
      { id: "reserve", name: "Reserve", type: "savings", balance: 3000, liquid: false },
    ];
    data.cashFlows = [
      {
        id: "rent",
        name: "房租",
        type: "expense",
        frequency: "monthly",
        amount: 2200,
        dueDay: 1,
        essential: true,
      },
    ];
    const noFallback = projectMonthly({
      accounts: data.accounts,
      cashFlows: data.cashFlows,
      events: [],
      goals: [],
      assumptions: data.assumptions,
      startDate: TODAY,
      allowProtectedReserveFallback: false,
    });
    const fallback = projectMonthly({
      accounts: data.accounts,
      cashFlows: data.cashFlows,
      events: [],
      goals: [],
      assumptions: data.assumptions,
      startDate: TODAY,
      allowProtectedReserveFallback: true,
    });
    expect(noFallback[1].negativeCash).toBe(true);
    expect(fallback[1].negativeCash).toBe(false);
    expect(fallback[1].reserve).toBeLessThan(noFallback[1].reserve);
    const runwayNoFallback = noFallback[1].essentialExpenses
      ? noFallback[1].reserve / noFallback[1].essentialExpenses
      : 0;
    const runwayFallback = fallback[1].essentialExpenses
      ? fallback[1].reserve / fallback[1].essentialExpenses
      : 0;
    expect(runwayFallback).toBeLessThan(runwayNoFallback);
  });
});

describe("本月存钱能力 (selectMonthlySavingCapacity)", () => {
  function baseData(): FinanceData {
    const data = createEmptyData();
    data.accounts = [
      { id: "chk", name: "Checking", type: "checking", balance: 8000, liquid: true },
    ];
    data.cashFlows = [
      {
        id: "income",
        name: "工资",
        type: "income",
        frequency: "monthly",
        amount: 6000,
        payFrequency: "biweekly",
        anchorDate: "2026-06-05",
      },
      { id: "rent", name: "房租", type: "expense", frequency: "monthly", amount: 2200, dueDay: 1 },
    ];
    data.goals = [];
    return data;
  }

  it("可存金额按“最佳日到下月3日前”的最低余额约束计算", () => {
    const data = baseData();
    const out = projectDaily(data, 35, TODAY);
    const cap = selectMonthlySavingCapacity({
      outlook: out,
      assumptions: data.assumptions,
      goals: data.goals,
      today: TODAY,
    });
    const floor = out.buffer;
    const guardEndTs = new Date(
      TODAY.getFullYear(),
      TODAY.getMonth() + 1,
      4
    ).getTime();
    const guardSeries = out.dailyBalances.filter((d) => d.ts < guardEndTs);
    const bestTs = guardSeries.find((d) => d.date === cap.bestDay)?.ts;
    const suffixMin =
      bestTs == null
        ? null
        : Math.min(...guardSeries.filter((d) => d.ts >= bestTs).map((d) => d.balanceEnd));
    const expected = suffixMin == null ? 0 : Math.max(0, suffixMin - floor);
    expect(cap.capacity).toBeCloseTo(expected, 0);
  });

  it("有可存金额时，最佳存钱日落在本月剩余的发薪日上", () => {
    // 月初视角：本月剩余天数里仍有发薪日（双周锚点 6/5、6/19）。
    const MONTH_START = new Date(2026, 5, 2); // 2026-06-02
    const data = baseData();
    const out = projectDaily(data, 35, MONTH_START);
    const cap = selectMonthlySavingCapacity({
      outlook: out,
      assumptions: data.assumptions,
      goals: data.goals,
      today: MONTH_START,
    });
    expect(cap.capacity).toBeGreaterThan(0);
    expect(cap.rationale).toBe("after-payday");
    expect(cap.bestDay).not.toBeNull();
    const incomeDays = out.events
      .filter((e) => e.kind === "income")
      .map((e) => e.date);
    expect(incomeDays).toContain(cap.bestDay);
  });

  it("earmark 目标会同时拉低可存金额", () => {
    const data = baseData();
    const outBefore = projectDaily(data, 35, TODAY);
    const before = selectMonthlySavingCapacity({
      outlook: outBefore,
      assumptions: data.assumptions,
      goals: data.goals,
      today: TODAY,
    });
    data.goals = [
      {
        id: "g-earmark",
        name: "旅行",
        metric: "liquid",
        target: 5000,
        current: 1500,
        reservePolicy: "earmarked_operating_cash",
      },
    ];
    const out = projectDaily(data, 35, TODAY);
    const cap = selectMonthlySavingCapacity({
      outlook: out,
      assumptions: data.assumptions,
      goals: data.goals,
      today: TODAY,
    });
    expect(cap.earmarkedOperatingGoalCash).toBe(1500);
    expect(cap.capacity).toBeCloseTo(Math.max(0, before.capacity - 1500), 0);
  });

  it("现金不足以越过安全垫时，返回 none 且无最佳存钱日", () => {
    const data = baseData();
    data.accounts = [
      { id: "chk", name: "Checking", type: "checking", balance: 1500, liquid: true },
    ];
    const out = projectDaily(data, 35, TODAY);
    const cap = selectMonthlySavingCapacity({
      outlook: out,
      assumptions: data.assumptions,
      goals: data.goals,
      today: TODAY,
    });
    expect(cap.capacity).toBe(0);
    expect(cap.rationale).toBe("none");
    expect(cap.bestDay).toBeNull();
  });

  it("会预留到下月3日前的月初账单（房租）", () => {
    const data = createEmptyData();
    const midMonth = new Date(2026, 5, 20); // 2026-06-20
    data.accounts = [
      { id: "chk", name: "Checking", type: "checking", balance: 5000, liquid: true },
    ];
    data.cashFlows = [
      {
        id: "salary",
        name: "工资",
        type: "income",
        frequency: "monthly",
        amount: 3000,
        dueDay: 30,
      },
      {
        id: "rent",
        name: "房租",
        type: "expense",
        frequency: "monthly",
        amount: 7000,
        dueDay: 1,
      },
    ];
    const out = projectDaily(data, 35, midMonth);
    const cap = selectMonthlySavingCapacity({
      outlook: out,
      assumptions: data.assumptions,
      goals: data.goals,
      today: midMonth,
    });
    expect(cap.capacity).toBe(0);
    expect(cap.rationale).toBe("none");
  });

  it("Emergency 月度预留按计划上限执行，且不再在日历里重复扣减", () => {
    const data = createEmptyData();
    const monthStart = new Date(2026, 5, 2); // 2026-06-02
    data.accounts = [
      { id: "chk", name: "Checking", type: "checking", balance: 9000, liquid: true },
    ];
    data.cashFlows = [
      {
        id: "income",
        name: "工资",
        type: "income",
        frequency: "monthly",
        amount: 6000,
        dueDay: 15,
      },
      {
        id: "rent",
        name: "房租",
        type: "expense",
        frequency: "monthly",
        amount: 1800,
        dueDay: 1,
      },
    ];
    data.goals = [
      {
        id: "goal-emergency",
        name: "应急储备 Emergency",
        metric: "liquid",
        target: 12000,
        current: 0,
        reservePolicy: "earmarked_operating_cash",
        monthlyAllocation: 500,
      },
    ];
    const out = projectDaily(data, 35, monthStart);
    expect(
      out.events.some(
        (e) => e.kind === "transfer" && e.label.includes("应急储备 Emergency")
      )
    ).toBe(false);
    const cap = selectMonthlySavingCapacity({
      outlook: out,
      assumptions: data.assumptions,
      goals: data.goals,
      today: monthStart,
    });
    expect(cap.plannedCapacity).toBe(500);
    expect(cap.capacity).toBeLessThanOrEqual(500);
  });

  it("Emergency 已存满（current≥target）时不再预留", () => {
    const data = createEmptyData();
    const monthStart = new Date(2026, 5, 2);
    data.accounts = [
      { id: "chk", name: "Checking", type: "checking", balance: 9000, liquid: true },
    ];
    data.cashFlows = [
      { id: "income", name: "工资", type: "income", frequency: "monthly", amount: 6000, dueDay: 15 },
    ];
    data.goals = [
      {
        id: "goal-emergency",
        name: "应急储备 Emergency",
        metric: "liquid",
        target: 12000,
        current: 12000,
        reservePolicy: "earmarked_operating_cash",
        monthlyAllocation: 500,
      },
    ];
    const out = projectDaily(data, 35, monthStart);
    const cap = selectMonthlySavingCapacity({
      outlook: out,
      assumptions: data.assumptions,
      goals: data.goals,
      today: monthStart,
    });
    expect(cap.remainingToTarget).toBe(0);
    expect(cap.capacity).toBe(0);
    expect(cap.rationale).toBe("none");
  });

  it("非 earmark 策略的 Emergency 目标也走安全逻辑，不在 day1 一次性全额扣成负数", () => {
    // 复现负数 bug：protected_account 策略 + 固定月度预留，过去会在 1 号直接扣光现金。
    const today = new Date(2026, 5, 1); // 2026-06-01
    const data = createEmptyData();
    data.accounts = [
      { id: "chk", name: "Checking", type: "checking", balance: 2381, liquid: true },
    ];
    data.cashFlows = [
      { id: "avalon", name: "Avalon申请费用", type: "expense", frequency: "monthly", amount: 300, dueDay: 1 },
    ];
    data.events = [
      {
        id: "inv",
        name: "投资暂取",
        eventType: "windfall",
        enabled: true,
        monthOffset: 0,
        amount: 3000,
        date: "2026-06-02",
      },
    ];
    data.goals = [
      {
        id: "goal-emergency",
        name: "应急储备 Emergency",
        metric: "liquid",
        target: 12000,
        current: 0,
        reservePolicy: "protected_account",
        monthlyAllocation: 2600,
      },
    ];

    // 基础 outlook 不应再出现「应急储备」按固定日的一次性扣款。
    const base = projectDaily(data, 35, today);
    expect(
      base.events.some((e) => e.kind === "transfer" && e.label.includes("应急"))
    ).toBe(false);

    const cap = selectMonthlySavingCapacity({
      outlook: base,
      assumptions: data.assumptions,
      goals: data.goals,
      today,
    });
    // 注入最佳日后，约束窗口内任何一天都不应跌破 0。
    const augmented =
      cap.capacity > 0 && cap.bestDay
        ? projectDaily(data, 35, today, {
            extraTransfers: [
              { date: cap.bestDay, label: "应急储备 Emergency 月度预留", amount: cap.capacity },
            ],
          })
        : base;
    const minBal = Math.min(
      augmented.startLiquid,
      ...augmented.events.map((e) => e.balanceAfter)
    );
    expect(minBal).toBeGreaterThanOrEqual(0);
  });

  it("现金日历按最佳日注入 Emergency 月度预留（第二遍 outlook）", () => {
    const data = createEmptyData();
    const monthStart = new Date(2026, 5, 2);
    data.accounts = [
      { id: "chk", name: "Checking", type: "checking", balance: 9000, liquid: true },
    ];
    data.cashFlows = [
      { id: "income", name: "工资", type: "income", frequency: "monthly", amount: 6000, dueDay: 15 },
      { id: "rent", name: "房租", type: "expense", frequency: "monthly", amount: 1800, dueDay: 1 },
    ];
    data.goals = [
      {
        id: "goal-emergency",
        name: "应急储备 Emergency",
        metric: "liquid",
        target: 12000,
        current: 0,
        reservePolicy: "earmarked_operating_cash",
        monthlyAllocation: 500,
      },
    ];
    const base = projectDaily(data, 35, monthStart);
    const cap = selectMonthlySavingCapacity({
      outlook: base,
      assumptions: data.assumptions,
      goals: data.goals,
      today: monthStart,
    });
    expect(cap.capacity).toBeGreaterThan(0);

    const augmented = projectDaily(data, 35, monthStart, {
      extraTransfers: [
        { date: cap.bestDay as string, label: "应急储备 Emergency 月度预留", amount: cap.capacity },
      ],
    });
    const injected = augmented.events.filter(
      (e) => e.kind === "transfer" && e.label.includes("应急储备 Emergency")
    );
    expect(injected.length).toBe(1);
    expect(injected[0].date).toBe(cap.bestDay);
    expect(Math.abs(injected[0].amount)).toBeCloseTo(cap.capacity, 0);
    // 注入存钱后，约束窗口内最低余额相应被拉低。
    expect(augmented.lowestBalance).toBeLessThanOrEqual(base.lowestBalance);
  });
});

describe("net worth 无重复计算", () => {
  it("净资产 = 资产合计 − 负债，且不含汇总行", () => {
    const data = createEmptyData();
    data.accounts = [
      { id: "chk", name: "Checking", type: "checking", balance: 3000, liquid: true },
      { id: "sav", name: "Savings", type: "savings", balance: 2000, liquid: true },
      { id: "bro", name: "Brokerage", type: "brokerage", balance: 10000, liquid: false },
      { id: "cc", name: "Card", type: "credit-card", balance: 1200, statementBalance: 1200, dueDay: 12, creditMode: "paid-in-full" },
    ];
    const series = projectMonthly({
      accounts: data.accounts,
      cashFlows: data.cashFlows,
      events: data.events,
      assumptions: data.assumptions,
      startDate: TODAY,
    });
    const assets = data.accounts
      .filter((a) => ["checking", "savings", "brokerage", "retirement", "property"].includes(a.type))
      .reduce((s, a) => s + a.balance, 0);
    const liab = data.accounts
      .filter((a) => ["credit-card", "auto-loan", "mortgage"].includes(a.type))
      .reduce((s, a) => s + a.balance, 0);
    expect(series[0].netWorth).toBeCloseTo(assets - liab, 0);
  });
});

describe("对账重锚投影", () => {
  it("matched occurrence 不再扣减余额（取代 anchoredThrough）", () => {
    const data = createEmptyData();
    data.accounts = [{ id: "chk", name: "Checking", type: "checking", balance: 8000, liquid: true }];
    data.cashFlows = [
      { id: "rent", name: "房租", type: "expense", frequency: "monthly", amount: 2200, dueDay: 1 },
    ];
    const monthStart = new Date(2026, 5, 1);
    const occurrences = [
      {
        id: "occ_rent_jun",
        sourceType: "cashflow" as const,
        sourceId: "rent",
        label: "房租",
        date: "2026-06-01",
        expectedAmount: -2200,
        state: "matched" as const,
        matchedTxnId: "txn-1",
        actualAmount: -2200,
        actualDate: "2026-06-01",
      },
    ];
    const anchored = projectDaily(data, 20, monthStart, {
      startLiquid: 5800,
      occurrences,
      suppressTodayBurn: true,
    });
    const naive = projectDaily(data, 20, monthStart, { startLiquid: 5800 });
    expect(anchored.events.some((e) => e.label.includes("房租") && e.affectsBalance === false)).toBe(true);
    expect(naive.events.some((e) => e.label.includes("房租"))).toBe(true);
    expect(anchored.dailyBalances[0]?.balanceEnd).toBe(5800);
    expect(naive.dailyBalances[0]?.balanceEnd).toBe(3600);
  });
});

describe("action inbox", () => {
  it("现金会跌破缓冲时给出缓冲缺口建议", () => {
    const data = createEmptyData();
    data.accounts = [{ id: "chk", name: "Checking", type: "checking", balance: 1000, liquid: true }];
    data.cashFlows = [{ id: "rent", name: "房租", type: "expense", frequency: "monthly", amount: 2200, dueDay: 1 }];
    const out = projectDaily(data, 35, TODAY);
    const savingCapacity = selectMonthlySavingCapacity({
      outlook: out,
      assumptions: data.assumptions,
      goals: data.goals,
      today: TODAY,
    });
    const actions = buildActions(data, out, {
      safeToSpend: 0,
      emergencyFloor: data.assumptions.emergencyReserveTarget,
      liquidCash: 1000,
      savingCapacity,
    });
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.length).toBeLessThanOrEqual(3);
    expect(actions.some((a) => a.id === "buffer-shortfall")).toBe(true);
  });

  it("最佳存钱日临近时给出存钱提醒", () => {
    const data = createEmptyData();
    data.accounts = [
      { id: "chk", name: "Checking", type: "checking", balance: 9000, liquid: true },
    ];
    data.cashFlows = [
      {
        id: "income",
        name: "工资",
        type: "income",
        frequency: "monthly",
        amount: 6000,
        dueDay: 30,
      },
      {
        id: "rent",
        name: "房租",
        type: "expense",
        frequency: "monthly",
        amount: 1800,
        dueDay: 1,
      },
    ];
    const out = projectDaily(data, 35, TODAY);
    const savingCapacity = selectMonthlySavingCapacity({
      outlook: out,
      assumptions: data.assumptions,
      goals: data.goals,
      today: TODAY,
    });
    expect(savingCapacity.capacity).toBeGreaterThan(0);
    expect(savingCapacity.rationale).toBe("after-payday");

    const actions = buildActions(data, out, {
      safeToSpend: 0,
      emergencyFloor: data.assumptions.emergencyReserveTarget,
      liquidCash: 9000,
      savingCapacity,
    });
    expect(actions.some((a) => a.id === "save-on-payday")).toBe(true);
  });
});

describe("projectDaily 回归：逾期 pending 账单与 401k 供款", () => {
  it("逾期未确认（pending）的账单钳制到今天入账，压低最低余额", () => {
    const data = createEmptyData();
    data.accounts = [
      { id: "chk", name: "Checking", type: "checking", balance: 5000, liquid: true },
    ];
    const overdueRent = {
      id: "occ_rent",
      sourceType: "cashflow" as const,
      sourceId: "rent",
      label: "房租",
      date: "2026-05-25", // 早于 TODAY (2026-05-29)
      expectedAmount: -2200,
      state: "pending" as const,
    };
    const out = projectDaily(data, 35, TODAY, { occurrences: [overdueRent] });
    const rentEvent = out.events.find((e) => e.occurrenceId === "occ_rent");
    expect(rentEvent).toBeTruthy();
    expect(rentEvent?.date).toBe("2026-05-29");
    expect(out.lowestBalance).toBeCloseTo(2800, 0);
    expect(out.obligations30).toBeCloseTo(2200, 0);
  });

  it("逾期但已 matched/skipped 的条目不重复入账", () => {
    const data = createEmptyData();
    data.accounts = [
      { id: "chk", name: "Checking", type: "checking", balance: 5000, liquid: true },
    ];
    const matched = {
      id: "occ_done",
      sourceType: "cashflow" as const,
      sourceId: "rent",
      label: "房租",
      date: "2026-05-25",
      expectedAmount: -2200,
      state: "matched" as const,
      actualAmount: -2200,
    };
    const out = projectDaily(data, 35, TODAY, { occurrences: [matched] });
    expect(out.events.some((e) => e.occurrenceId === "occ_done")).toBe(false);
    expect(out.lowestBalance).toBeCloseTo(5000, 0);
  });

  it("lockbox-contribution（401k/HSA 税前供款）不计入日常开销 variableMonthly", () => {
    const data = createEmptyData();
    data.accounts = [
      { id: "chk", name: "Checking", type: "checking", balance: 5000, liquid: true },
    ];
    data.cashFlows = [
      { id: "food", name: "日常", type: "expense", frequency: "monthly", amount: 1500 },
      {
        id: "401k",
        name: "401k 供款",
        type: "expense",
        frequency: "monthly",
        amount: 900,
        category: "lockbox-contribution",
      },
    ];
    const out = projectDaily(data, 35, TODAY);
    expect(out.variableMonthly).toBeCloseTo(1500, 0);
  });
});
