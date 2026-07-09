import { describe, expect, it } from "vitest";
import {
  calcMonthlyPayment,
  estimateCapitalGainsTax,
  futureCostMonthly,
  futureCostOneTime,
  monthlyRate,
  realReturn,
  stepLoanMonth,
} from "./finance";

// 回归基准：设计文档第 3 节复利差额表 (年化 6%，按月复利，不计税与通胀)
describe("机会成本闭式公式 = 文档第3节表格", () => {
  const r = 0.06;
  it("一次性消费 5/10/20 年差额", () => {
    expect(Math.round(futureCostOneTime(1000, r, 5))).toBe(1338);
    expect(Math.round(futureCostOneTime(1000, r, 10))).toBe(1791);
    expect(Math.round(futureCostOneTime(1000, r, 20))).toBe(3207);
    expect(Math.round(futureCostOneTime(5000, r, 5))).toBe(6691);
    expect(Math.round(futureCostOneTime(5000, r, 10))).toBe(8954);
    expect(Math.round(futureCostOneTime(5000, r, 20))).toBe(16036);
    expect(Math.round(futureCostOneTime(10000, r, 5))).toBe(13382);
    expect(Math.round(futureCostOneTime(10000, r, 10))).toBe(17908);
    expect(Math.round(futureCostOneTime(10000, r, 20))).toBe(32071);
  });

  it("每月持续多花 5/10/20 年差额", () => {
    expect(Math.round(futureCostMonthly(100, r, 5))).toBe(6949);
    expect(Math.round(futureCostMonthly(100, r, 10))).toBe(16247);
    expect(Math.round(futureCostMonthly(100, r, 20))).toBe(45344);
    expect(Math.round(futureCostMonthly(500, r, 5))).toBe(34743);
    expect(Math.round(futureCostMonthly(500, r, 10))).toBe(81237);
    expect(Math.round(futureCostMonthly(500, r, 20))).toBe(226719);
    expect(Math.round(futureCostMonthly(1000, r, 5))).toBe(69486);
    expect(Math.round(futureCostMonthly(1000, r, 10))).toBe(162473);
    expect(Math.round(futureCostMonthly(1000, r, 20))).toBe(453439);
  });
});

describe("基础原语", () => {
  it("等额本息月供：30 年 $400k @ 6.37%", () => {
    const pay = calcMonthlyPayment(400000, 0.0637, 360);
    expect(Math.round(pay)).toBe(2494);
  });

  it("零利率月供 = 本金 / 期数", () => {
    expect(calcMonthlyPayment(1200, 0, 12)).toBeCloseTo(100, 6);
  });

  it("贷款单月计息还款", () => {
    const step = stepLoanMonth(10000, 0.12, 200);
    expect(step.interest).toBeCloseTo(100, 6);
    expect(step.principalPaid).toBeCloseTo(100, 6);
    expect(step.balance).toBeCloseTo(9900, 6);
  });

  it("还款超过余额不会变负", () => {
    const step = stepLoanMonth(50, 0.12, 200);
    expect(step.balance).toBe(0);
  });

  it("实际回报 = 名义剔除通胀", () => {
    expect(realReturn(0.06, 0.025)).toBeCloseTo((1.06 / 1.025) - 1, 9);
  });

  it("有效月利率复利一年 = 年利率", () => {
    expect(Math.pow(1 + monthlyRate(0.06), 12) - 1).toBeCloseTo(0.06, 9);
  });
});

describe("estimateCapitalGainsTax", () => {
  it("对未实现盈利按税率扣税（Robinhood 快照样例）", () => {
    const est = estimateCapitalGainsTax({
      marketValue: 136342.75,
      costBasis: 88333.73,
      rate: 0.15,
    });
    expect(est.unrealizedGain).toBeCloseTo(48009.02, 0);
    expect(est.tax).toBeCloseTo(7201.35, 0);
    expect(est.afterTax).toBeCloseTo(129141.4, 0);
    expect(est.basisKnown).toBe(true);
  });

  it("缺少成本时不估税", () => {
    const est = estimateCapitalGainsTax({
      marketValue: 50000,
      costBasis: null,
      rate: 0.15,
    });
    expect(est.tax).toBe(0);
    expect(est.afterTax).toBe(50000);
    expect(est.basisKnown).toBe(false);
  });

  it("亏损不退税", () => {
    const est = estimateCapitalGainsTax({
      marketValue: 80000,
      costBasis: 100000,
      rate: 0.15,
    });
    expect(est.unrealizedGain).toBe(0);
    expect(est.tax).toBe(0);
    expect(est.afterTax).toBe(80000);
  });
});
