import { describe, expect, it } from "vitest";
import { t } from "../i18n/translate.js";
import {
  buildPortfolioConfidence,
  buildBlendedAssetBreakdown,
  buildPortfolioStickySummary,
  buildRebalanceSuggestions,
  buildTargetFromReferenceModel,
  classifyPortfolio,
  compareToReferenceModel,
  computeAllocationDrift,
  computeThemeConcentration,
  REFERENCE_MODELS,
} from "./portfolioAllocation";
import type { AllocationMetrics } from "./holdingsPortfolio";
import type { Account, HoldingsSnapshot } from "../types.js";

const robinhoodLike: AllocationMetrics = {
  top1Ticker: "TSLA",
  top1Pct: 33.47,
  top3Pct: 73.53,
  stockValue: 114_000,
  etfValue: 22_000,
  stockPct: 83.84,
  etfPct: 16.16,
};

describe("portfolioAllocation", () => {
  it("classifies concentrated stock portfolio", () => {
    const c = classifyPortfolio(robinhoodLike);
    expect(c.label).toContain(t("stocks.classify.concentratedKeyword"));
    expect(c.coreSatelliteNote).toBeTruthy();
  });

  it("computes drift with unset targets", () => {
    const rows = computeAllocationDrift(robinhoodLike, {});
    expect(rows.every((r) => r.state === "unset")).toBe(true);
  });

  it("flags concentration when above max", () => {
    const rows = computeAllocationDrift(robinhoodLike, { top1MaxPct: 25, top3MaxPct: 50 });
    const top1 = rows.find((r) => r.key === "top1");
    expect(top1?.state).toBe("review");
    const top3 = rows.find((r) => r.key === "top3");
    expect(top3?.state).toBe("review");
  });

  it("flags stock drift when target set", () => {
    const rows = computeAllocationDrift(robinhoodLike, {
      stockPct: 50,
      driftThresholdPct: 5,
    });
    expect(rows.find((r) => r.key === "stock")?.state).toBe("review");
  });

  it("builds confidence report", () => {
    const snapshot: HoldingsSnapshot = {
      id: "hs1",
      asOfDate: "2026-06-01",
      importedAt: "2026-06-01",
      sourceType: "test",
      holdingsMarketValue: 1000,
      positionCount: 1,
      positions: [],
      accountLabel: "Robinhood",
    };
    const accounts: Account[] = [
      { id: "r", name: "RH", type: "brokerage", balance: 1000 },
      { id: "401", name: "401k", type: "retirement", balance: 50000 },
    ];
    const report = buildPortfolioConfidence(accounts, [snapshot], snapshot);
    expect(report.complete).toBe(true);
    expect(report.items.some((i) => i.id === "retirement" && !i.complete)).toBe(true);
  });

  it("marks retirement complete when fund allocations present", () => {
    const snapshot: HoldingsSnapshot = {
      id: "hs1",
      asOfDate: "2026-06-01",
      importedAt: "2026-06-01",
      sourceType: "test",
      holdingsMarketValue: 1000,
      positionCount: 1,
      positions: [],
      accountLabel: "Robinhood",
    };
    const accounts: Account[] = [
      {
        id: "401",
        name: "401k",
        type: "retirement",
        balance: 50000,
        fundAllocations: [
          { ticker: "OGSV", weightPct: 97, assetClass: "equity" },
          { ticker: "FDRXX", weightPct: 3, assetClass: "cash" },
        ],
      },
      { id: "hsa", name: "HSA", type: "hsa", balance: 1800 },
    ];
    const report = buildPortfolioConfidence(accounts, [snapshot], snapshot);
    const retirement = report.items.find((i) => i.id === "retirement");
    const bondCash = report.items.find((i) => i.id === "bond-cash");
    expect(retirement?.complete).toBe(true);
    expect(bondCash?.complete).toBe(true);
  });

  it("blends 401k OGSV/FDRXX into portfolio asset classes", () => {
    const blended = buildBlendedAssetBreakdown(136_000, [
      {
        id: "401",
        name: "401k",
        type: "retirement",
        balance: 56_605,
        fundAllocations: [
          { ticker: "OGSV", weightPct: 97, assetClass: "equity" },
          { ticker: "FDRXX", weightPct: 3, assetClass: "cash" },
        ],
      },
    ]);
    expect(blended.cashPct).toBeGreaterThan(0.5);
    expect(blended.cashPct).toBeLessThan(2);
    expect(blended.equityPct).toBeGreaterThan(95);
    expect(blended.retirementSummaries[0].funds).toHaveLength(2);
  });

  it("prefers Fidelity look-through over fund-level equity tags", () => {
    const blended = buildBlendedAssetBreakdown(136_000, [
      {
        id: "401",
        name: "401k",
        type: "retirement",
        balance: 56_605,
        fundAllocations: [
          { ticker: "OGSV", weightPct: 97, assetClass: "equity" },
          { ticker: "FDRXX", weightPct: 3, assetClass: "cash" },
        ],
        underlyingAllocation: [
          { id: "domestic", label: "Domestic Stock", weightPct: 57.58, assetClass: "equity" },
          { id: "foreign", label: "Foreign Stock", weightPct: 33.3, assetClass: "equity" },
          { id: "bonds", label: "Bonds", weightPct: 5.05, assetClass: "bond" },
          { id: "short", label: "Short Term", weightPct: 1.01, assetClass: "cash" },
          { id: "other", label: "Other", weightPct: 3.05, assetClass: "other" },
        ],
      },
    ]);
    expect(blended.bondPct).toBeGreaterThan(1);
    expect(blended.bondPct).toBeLessThan(3);
    expect(blended.cashPct).toBeGreaterThan(0.2);
    expect(blended.cashPct).toBeLessThan(1);
    expect(blended.retirementSummaries[0].underlying).toHaveLength(5);
    expect(blended.retirementSummaries[0].equityPct).toBeCloseTo(90.88, 1);
  });

  it("compares to 60/40 model", () => {
    const model = REFERENCE_MODELS.find((m) => m.id === "60-40")!;
    const rows = compareToReferenceModel(robinhoodLike, model);
    expect(rows[0].gap).toContain("+");
  });

  it("builds a one-click target from reference models", () => {
    const model = REFERENCE_MODELS.find((m) => m.id === "core-satellite")!;
    const target = buildTargetFromReferenceModel(model, { driftThresholdPct: 7 });
    expect(target).toEqual({
      stockPct: 35,
      etfPct: 50,
      top1MaxPct: 20,
      top3MaxPct: 45,
      driftThresholdPct: 7,
    });
  });

  it("does not build a target for the custom model", () => {
    const model = REFERENCE_MODELS.find((m) => m.id === "custom")!;
    expect(buildTargetFromReferenceModel(model)).toBeNull();
  });

  it("builds sticky summary for hub bar", () => {
    const snapshot: HoldingsSnapshot = {
      id: "hs1",
      asOfDate: "2026-06-01",
      importedAt: "2026-06-01",
      sourceType: "test",
      holdingsMarketValue: 1000,
      positionCount: 1,
      positions: [],
      accountLabel: "Robinhood",
    };
    const confidence = buildPortfolioConfidence([], [snapshot], snapshot);
    const classification = classifyPortfolio(robinhoodLike);
    const sticky = buildPortfolioStickySummary(
      robinhoodLike,
      classification,
      false,
      0,
      confidence,
      []
    );
    expect(sticky.targetLabel).toBe(t("stocks.stickySummary.targetNotSet"));
    expect(sticky.top3Pct).toBe(73.53);
    expect(sticky.needsAccounts).toBe(true);
  });

  it("puts contributions-first rebalance first", () => {
    const drift = computeAllocationDrift(robinhoodLike, { top1MaxPct: 20 });
    const suggestions = buildRebalanceSuggestions(drift, 48_000);
    expect(suggestions[0].method).toBe("contributions");
    expect(suggestions[2].collapsed).toBe(true);
  });
});

describe("computeThemeConcentration", () => {
  it("groups holdings by theme and flags dominant theme", () => {
    const result = computeThemeConcentration([
      { ticker: "TSLA", value: 45_000 },
      { ticker: "MSFT", value: 30_000 },
      { ticker: "NVDA", value: 5_000 },
      { ticker: "VOO", value: 20_000 },
    ]);
    const tech = result.groups.find((g) => g.theme === t("stocks.theme.techAi"));
    expect(tech?.pct).toBe(80);
    expect(tech?.tickers).toEqual(["TSLA", "MSFT", "NVDA"]);
    expect(result.topTheme?.theme).toBe(t("stocks.theme.techAi"));
    expect(result.note).toContain(t("stocks.theme.techAi"));
    expect(result.note).toContain("80%");
  });

  it("does not flag when top theme is below threshold or single holding", () => {
    const diversified = computeThemeConcentration([
      { ticker: "TSLA", value: 30 },
      { ticker: "VOO", value: 40 },
      { ticker: "BND", value: 30 },
    ]);
    expect(diversified.note).toBeNull();
    const single = computeThemeConcentration([
      { ticker: "TSLA", value: 100 },
      { ticker: "ZZZZ", value: 20 },
    ]);
    expect(single.note).toBeNull();
  });

  it("sends unknown tickers to 未分类 and ignores non-positive values", () => {
    const result = computeThemeConcentration([
      { ticker: "ZZZZ", value: 60 },
      { ticker: "voo", value: 40 },
      { ticker: "MSFT", value: 0 },
    ]);
    expect(result.groups.find((g) => g.theme === t("stocks.theme.unclassified"))?.pct).toBe(60);
    // 未分类不作为 topTheme
    expect(result.topTheme?.theme).toBe(t("stocks.theme.broadIndex"));
    expect(result.groups[0].theme).toBe(t("stocks.theme.unclassified"));
  });

  it("returns empty result for no valid holdings", () => {
    expect(computeThemeConcentration([])).toEqual({ groups: [], topTheme: null, note: null });
  });
});
