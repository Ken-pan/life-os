import { describe, expect, it } from "vitest";
import {
  dedupeHoldingsByTicker,
  deriveTodayReturnAmount,
  deriveTotalReturnAmount,
  enrichHoldingPosition,
} from "./holdingsEnrich";
import type { HoldingPosition } from "../types";

describe("deriveTodayReturnAmount", () => {
  it("由涨跌幅反推当日盈亏", () => {
    expect(deriveTodayReturnAmount(10_000, 10)).toBeCloseTo(909.09, 1);
    expect(deriveTodayReturnAmount(10_000, -5)).toBeCloseTo(-526.32, 1);
  });
});

describe("deriveTotalReturnAmount", () => {
  it("由均价估算累计盈亏", () => {
    expect(
      deriveTotalReturnAmount({ shares: 10, marketPrice: 150, averageCostPerShare: 100 })
    ).toBe(500);
  });
});

describe("dedupeHoldingsByTicker", () => {
  it("合并重复 ticker 并保留更完整的字段", () => {
    const a: HoldingPosition = {
      id: "1",
      ticker: "TSLA",
      securityName: "Tesla",
      assetType: "stock",
      shares: 10,
      marketPrice: 400,
      marketValue: 4000,
    };
    const b: HoldingPosition = {
      ...a,
      id: "2",
      averageCostPerShare: 217.84,
      todayReturnPct: -1.44,
    };
    const merged = dedupeHoldingsByTicker([a, b]);
    expect(merged).toHaveLength(1);
    expect(merged[0].averageCostPerShare).toBe(217.84);
  });
});

describe("enrichHoldingPosition", () => {
  it("补齐缺失的盈亏金额", () => {
    const enriched = enrichHoldingPosition({
      id: "1",
      ticker: "GOOGL",
      securityName: "Alphabet",
      assetType: "stock",
      shares: 10,
      marketPrice: 180,
      marketValue: 1800,
      todayReturnPct: 2,
      averageCostPerShare: 150,
    });
    expect(enriched.todayReturnAmount).toBeCloseTo(35.29, 1);
    expect(enriched.totalReturnAmount).toBe(300);
    expect(enriched.impliedCostBasis).toBe(1500);
  });
});
