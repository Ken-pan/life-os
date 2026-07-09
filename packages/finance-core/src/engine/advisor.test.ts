import { describe, expect, it } from "vitest";
import { setActiveLocale } from "../i18n/translate.js";
import {
  buildAdvice,
  computeSignal,
  rsi,
  sma,
  type AdvisorHolding,
  type DailyCandle,
  type TechnicalSignal,
} from "./advisor";

function candles(closes: number[]): DailyCandle[] {
  const start = new Date("2025-01-01T00:00:00");
  return closes.map((close, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { date: d.toISOString().slice(0, 10), close };
  });
}

describe("sma / rsi", () => {
  it("sma 计算窗口均值", () => {
    expect(sma([1, 2, 3, 4], 2)).toBe(3.5);
    expect(sma([1, 2, 3], 5)).toBeNull();
  });

  it("单边上涨时 RSI 接近 100，单边下跌时接近 0", () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    const down = Array.from({ length: 30 }, (_, i) => 100 - i);
    expect(rsi(up)!).toBeGreaterThan(95);
    expect(rsi(down)!).toBeLessThan(5);
    expect(rsi([1, 2, 3])).toBeNull();
  });
});

describe("computeSignal", () => {
  it("持续上涨 → 趋势向上且进入超买减仓区", () => {
    const closes = Array.from({ length: 260 }, (_, i) => 100 * Math.pow(1.004, i));
    const sig = computeSignal("UP", candles(closes))!;
    expect(sig.trend).toBe("up");
    expect(sig.zone).toBe("trim");
    expect(sig.rsi14!).toBeGreaterThan(70);
  });

  it("深度回撤 → 买入区并给出回撤理由", () => {
    const flat = Array.from({ length: 200 }, () => 100);
    const crash = Array.from({ length: 40 }, (_, i) => 100 - i * 0.8); // 跌到 ~68
    const sig = computeSignal("DIP", candles([...flat, ...crash]))!;
    expect(sig.zone).toBe("buy");
    expect(sig.drawdownPct!).toBeLessThan(-0.15);
  });

  it("数据为空返回 null；横盘为 neutral", () => {
    expect(computeSignal("X", [])).toBeNull();
    const wiggle = Array.from({ length: 260 }, (_, i) => 100 + (i % 2));
    const sig = computeSignal("FLAT", candles(wiggle))!;
    expect(sig.zone).toBe("neutral");
  });
});

const noSignals: Record<string, TechnicalSignal> = {};

describe("buildAdvice", () => {
  const holdings: AdvisorHolding[] = [
    { ticker: "TSLA", weightPct: 38, value: 38_000, assetType: "stock", totalReturnAmount: 9000 },
    { ticker: "VOO", weightPct: 20, value: 20_000, assetType: "etf" },
    { ticker: "AAPL", weightPct: 12, value: 12_000, assetType: "stock" },
  ];

  it("超过单一持仓上限 → 减仓建议，金额=超出部分，且新资金停买该标的", () => {
    const out = buildAdvice({
      holdings,
      totalValue: 100_000,
      target: { top1MaxPct: 25, etfPct: 40 },
      signals: noSignals,
      monthlyInvestable: 1200,
      bestDay: "2026-07-30",
    });
    const trim = out.advices.find((a) => a.action === "trim");
    expect(trim?.ticker).toBe("TSLA");
    expect(trim?.amount).toBe(13_000); // (38-25)% * 100k
    expect(trim?.detail).toContain("资本利得税");
    expect(out.plan.notes.join()).toContain("TSLA");
  });

  it("ETF 低于目标 → 新资金优先补足，时机挂在最佳存钱日", () => {
    const out = buildAdvice({
      holdings,
      totalValue: 100_000,
      target: { top1MaxPct: 25, etfPct: 40 },
      signals: noSignals,
      monthlyInvestable: 1200,
      bestDay: "2026-07-30",
    });
    const add = out.advices.find((a) => a.action === "add");
    expect(add?.amount).toBe(20_000); // (40-20)% * 100k
    expect(add?.timing).toContain("7/30");
  });

  it("可投金额为 0 时计划金额为 0 并提示先保安全垫", () => {
    const out = buildAdvice({
      holdings: [],
      totalValue: 0,
      target: null,
      signals: noSignals,
      monthlyInvestable: -50,
      bestDay: null,
    });
    expect(out.plan.amount).toBe(0);
    expect(out.plan.notes[0]).toContain("安全垫");
  });

  it("回调区持仓（未超限）→ 观察建议", () => {
    const sig = computeSignal(
      "AAPL",
      candles([...Array.from({ length: 200 }, () => 100), ...Array.from({ length: 40 }, (_, i) => 100 - i * 0.8)])
    )!;
    const out = buildAdvice({
      holdings,
      totalValue: 100_000,
      target: { top1MaxPct: 25 },
      signals: { AAPL: sig },
      monthlyInvestable: 900,
      bestDay: "2026-07-30",
    });
    const watch = out.advices.find((a) => a.action === "watch" && a.ticker === "AAPL");
    expect(watch).toBeTruthy();
  });

  it("en-US locale outputs English copy", () => {
    setActiveLocale("en-US");
    const out = buildAdvice({
      holdings,
      totalValue: 100_000,
      target: { top1MaxPct: 25, etfPct: 40 },
      signals: noSignals,
      monthlyInvestable: 1200,
      bestDay: "2026-07-30",
    });
    expect(out.plan.notes[0]).toMatch(/index core/i);
    expect(out.advices.find((a) => a.action === "trim")?.title).toMatch(/TSLA/);
    setActiveLocale("zh-CN");
  });
});
