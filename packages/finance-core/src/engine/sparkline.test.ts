import { describe, expect, it } from "vitest";
import { normalizeSparkline, pricePathPoints } from "./sparkline";
import type { PositionRowView } from "./holdingsPortfolio";

const row: PositionRowView = {
  position: {
    id: "p1",
    ticker: "AAA",
    securityName: "A",
    assetType: "stock",
    shares: 1,
    marketPrice: 100,
    marketValue: 100,
    averageCostPerShare: 90,
  },
  weightPct: 100,
  snapshotValue: 100,
  livePrice: 105,
  liveValue: 105,
  valueDelta: 5,
  priceDelta: 5,
  hasLiveQuote: true,
  pricePath: [90, 100, 105],
  pathSampleCount: 3,
  pathMin: 90,
  pathMax: 105,
  pathSpanPct: (15 / 90) * 100,
  pathStartPrice: 90,
  pathEndPrice: 105,
};

describe("sparkline", () => {
  it("builds three price path points", () => {
    expect(pricePathPoints(row)).toEqual([90, 100, 105]);
  });

  it("normalizes points for svg", () => {
    const { points, w, h } = normalizeSparkline([90, 100, 105]);
    expect(points.split(" ").length).toBe(3);
    expect(w).toBe(48);
    expect(h).toBe(18);
  });
});
