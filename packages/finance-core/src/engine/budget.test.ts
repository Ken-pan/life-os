import { describe, expect, it } from "vitest";
import {
  budgetProgress,
  dailySpendSeries,
  discretionaryMonthlyBudget,
  plannedMonthlyBudget,
} from "./budget";
import type { CashFlowItem } from "../types.js";
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
  it("缺日补 0，按日期升序，退款不冲抵（outflow 口径,与记录页每日柱图一致）", () => {
    const txns = [
      txn({ date: "2026-07-01", budgetImpact: -30 }),
      txn({ date: "2026-07-01", budgetImpact: -20 }),
      // 退款:不是「花掉负数」,那天没花钱就是 0
      txn({ date: "2026-07-02", budgetImpact: 10, flow: "refund_or_reversal", amount: -10 }),
    ];
    const series = dailySpendSeries(txns, "2026-07-03", 3);
    expect(series.map((d) => d.date)).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"]);
    expect(series[0].amount).toBe(50);
    expect(series[1].amount).toBe(0);
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

  it("只统计本月截至今天的花销，含今日已花", () => {
    const p = budgetProgress(txns, 3000, "2026-07-10");
    expect(p.spent).toBe(1000);
    expect(p.todaySpend).toBe(100);
    expect(p.remaining).toBe(2000);
    expect(p.daysLeft).toBe(21);
    expect(p.dailyAllowance).toBeCloseTo(2000 / 21, 2);
  });

  it("退款不冲抵本月已花（与记录页 KPI 同口径）", () => {
    const withRefund = [
      ...txns,
      // 实测坑:7 月三笔 Amazon 退货共 $961 把「本月已花」压掉近一半,
      // 与同页 KPI 花销合计对不上。
      txn({
        date: "2026-07-05",
        budgetImpact: 300,
        flow: "refund_or_reversal",
        amount: -300,
      }),
    ];
    expect(budgetProgress(withRefund, 3000, "2026-07-10").spent).toBe(1000);
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

describe("discretionaryMonthlyBudget", () => {
  /** @param over 覆盖字段 */
  const flow = (over: Partial<CashFlowItem> & Pick<CashFlowItem, "name" | "amount">): CashFlowItem => ({
    id: over.name,
    type: "expense",
    frequency: "monthly",
    ...over,
  });

  it("剔除 401(k)/房租，保留水电/订阅等走流水的固定小额项", () => {
    const flows: CashFlowItem[] = [
      flow({ name: "401(k) 员工税前供款", amount: 1392.61 }),
      flow({ name: "401(k) 雇主 match", amount: 348.68 }),
      flow({ name: "房租 (一个人住)", amount: 2200 }),
      flow({ name: "外食 / 娱乐 (dining & fun)", amount: 800 }),
      flow({ name: "买菜 / 日用 (groceries)", amount: 600 }),
      flow({ name: "偶尔购物 / 杂项", amount: 500 }),
      flow({ name: "水电网 + 手机话费 (utilities)", amount: 300 }),
      flow({ name: "交通 (无车通勤/打车)", amount: 200 }),
      flow({ name: "订阅 (subscriptions)", amount: 100 }),
      flow({ name: "税后到手工资", amount: 7600, type: "income" }),
    ];
    const b = discretionaryMonthlyBudget(flows);
    expect(b.monthly).toBe(2500);
    expect(b.excludedMonthly).toBeCloseTo(3941.29, 2);
    expect(b.excluded.map((e) => e.name)).toEqual([
      "401(k) 员工税前供款",
      "401(k) 雇主 match",
      "房租 (一个人住)",
    ]);
  });

  it("lockbox-contribution 类别不看名字直接剔除；年度项折成月", () => {
    const flows: CashFlowItem[] = [
      flow({ name: "Payroll deduction", amount: 500, category: "lockbox-contribution" }),
      flow({ name: "Mortgage", amount: 3000 }),
      flow({ name: "Car insurance", amount: 1200, frequency: "annual" }),
    ];
    const b = discretionaryMonthlyBudget(flows);
    // 保险不是住房/供款，保留；1200/年 → 100/月。
    expect(b.monthly).toBe(100);
    expect(b.excludedMonthly).toBe(3500);
  });

  it("Rent 关键词按词边界匹配——parent 不是房租", () => {
    const flows: CashFlowItem[] = [
      flow({ name: "Parents allowance", amount: 200 }),
      flow({ name: "Parent gift", amount: 100 }),
      flow({ name: "Rent", amount: 1800 }),
    ];
    const b = discretionaryMonthlyBudget(flows);
    expect(b.monthly).toBe(300);
    expect(b.excluded.map((e) => e.name)).toEqual(["Rent"]);
  });
});
