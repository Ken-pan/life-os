import { describe, expect, it } from "vitest";
import {
  buildPositionRows,
  compareSnapshots,
  computeAllocation,
  computeAllocationTrend,
  computeInvestedScopeTotals,
  computeLiveTotals,
  sortPositionRows,
} from "./holdingsPortfolio";
import type { HoldingsSnapshot } from "../types.js";

const snapshot: HoldingsSnapshot = {
  id: "hs_test",
  accountLabel: "Robinhood",
  asOfDate: "2026-06-01",
  importedAt: "2026-06-01T12:00:00Z",
  sourceType: "test",
  holdingsMarketValue: 1000,
  positionCount: 2,
  positions: [
    {
      id: "p1",
      ticker: "AAA",
      securityName: "A",
      assetType: "stock",
      shares: 10,
      marketPrice: 50,
      marketValue: 500,
      portfolioWeightPct: 50,
      totalReturnAmount: 200,
    },
    {
      id: "p2",
      ticker: "BBB",
      securityName: "B",
      assetType: "etf",
      shares: 5,
      marketPrice: 100,
      marketValue: 500,
      portfolioWeightPct: 50,
      totalReturnAmount: 50,
    },
  ],
};

describe("holdingsPortfolio", () => {
  it("sorts by weight and return", () => {
    const rows = buildPositionRows(snapshot, { AAA: { symbol: "AAA", price: 55, date: "20260601", time: "120000" } });
    const byWeight = sortPositionRows(rows, "weight");
    expect(byWeight[0].position.ticker).toBe("AAA");
    const byReturn = sortPositionRows(rows, "return-desc");
    expect(byReturn[0].position.totalReturnAmount).toBeGreaterThanOrEqual(
      byReturn[1].position.totalReturnAmount ?? 0
    );
  });

  it("compares two snapshots by ticker", () => {
    const older: HoldingsSnapshot = {
      ...snapshot,
      id: "hs_old",
      asOfDate: "2026-05-01",
      holdingsMarketValue: 900,
      positions: [
        { ...snapshot.positions[0], marketValue: 400 },
        { ...snapshot.positions[1], marketValue: 500 },
      ],
    };
    const newer: HoldingsSnapshot = {
      ...snapshot,
      id: "hs_new",
      asOfDate: "2026-06-01",
      holdingsMarketValue: 1100,
      positions: [
        { ...snapshot.positions[0], marketValue: 600 },
        { ...snapshot.positions[1], marketValue: 500 },
      ],
    };
    const diff = compareSnapshots(older, newer);
    expect(diff.totalDelta).toBe(200);
    const aaa = diff.rows.find((r) => r.ticker === "AAA");
    expect(aaa?.valueDelta).toBe(200);
  });

  it("sums taxable snapshot and retirement balances", () => {
    const scope = computeInvestedScopeTotals(136_000, [
      { id: "401", name: "401k", type: "retirement", balance: 50_000 },
      { id: "hsa", name: "HSA", type: "hsa", balance: 5_000 },
    ]);
    expect(scope.totalInvested).toBe(191_000);
    expect(scope.retirementBalance).toBe(50_000);
    expect(scope.hsaBalance).toBe(5_000);
  });

  it("computes allocation and live totals", () => {
    const rows = buildPositionRows(snapshot, {});
    const alloc = computeAllocation(rows);
    expect(alloc.top1Pct).toBe(50);
    expect(alloc.top3Pct).toBe(100);
    expect(alloc.stockPct).toBe(50);
    const totals = computeLiveTotals(rows, snapshot.holdingsMarketValue);
    expect(totals.liveTotal).toBe(1000);
    expect(totals.totalDelta).toBe(0);
  });

  it("computes allocation trend across snapshots ascending by date", () => {
    const older: HoldingsSnapshot = {
      ...snapshot,
      id: "hs_old",
      asOfDate: "2026-05-01",
      positions: [
        { ...snapshot.positions[0], marketValue: 800 },
        { ...snapshot.positions[1], marketValue: 200 },
      ],
    };
    // 传入乱序（新在前），应按时间升序返回
    const trend = computeAllocationTrend([snapshot, older]);
    expect(trend.map((p) => p.snapshotId)).toEqual(["hs_old", "hs_test"]);
    expect(trend[0].stockPct).toBe(80);
    expect(trend[0].top1Pct).toBe(80);
    expect(trend[1].stockPct).toBe(50);
    expect(trend[1].etfPct).toBe(50);
    expect(trend[0].dateLabel).toBe("5/1");
  });

  it("skips snapshots with unparseable dates or zero value in trend", () => {
    const broken: HoldingsSnapshot = { ...snapshot, id: "hs_bad", asOfDate: "not-a-date" };
    const empty: HoldingsSnapshot = {
      ...snapshot,
      id: "hs_empty",
      asOfDate: "2026-04-01",
      positions: [],
    };
    const trend = computeAllocationTrend([broken, empty, snapshot]);
    expect(trend.map((p) => p.snapshotId)).toEqual(["hs_test"]);
  });

  it("merges snapshot/live trail into richer price path", () => {
    const rows = buildPositionRows(
      snapshot,
      { AAA: { symbol: "AAA", price: 57, date: "20260601", time: "120000" } },
      {
        AAA: [
          { ts: 1717000000000, price: 48, source: "snapshot" },
          { ts: 1718000000000, price: 51, source: "snapshot" },
          { ts: 1719000000000, price: 53, source: "live" },
        ],
      }
    );
    const aaa = rows.find((row) => row.position.ticker === "AAA");
    expect(aaa).toBeTruthy();
    expect(aaa?.pricePath.length).toBeGreaterThan(3);
    expect(aaa?.pathSampleCount).toBe(aaa?.pricePath.length);
    expect(aaa?.pathMax).toBeGreaterThanOrEqual(57);
  });

  it("dedupes duplicate tickers in snapshot rows", () => {
    const dupSnap: HoldingsSnapshot = {
      ...snapshot,
      positions: [...snapshot.positions, { ...snapshot.positions[0], id: "p1-dup" }],
    };
    const rows = buildPositionRows(dupSnap, {});
    expect(rows.filter((r) => r.position.ticker === "AAA")).toHaveLength(1);
  });

  it("derives today return from pct when amount missing", () => {
    const snap: HoldingsSnapshot = {
      ...snapshot,
      positions: [
        {
          id: "p3",
          ticker: "CCC",
          securityName: "C",
          assetType: "stock",
          shares: 1,
          marketPrice: 100,
          marketValue: 100,
          portfolioWeightPct: 100,
          todayReturnPct: 10,
        },
      ],
    };
    const rows = buildPositionRows(snap, {});
    expect(rows[0].position.todayReturnAmount).toBeCloseTo(9.09, 1);
  });
});
