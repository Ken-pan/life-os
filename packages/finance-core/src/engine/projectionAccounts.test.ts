import { describe, it, expect } from "vitest";
import type { Account, HoldingsSnapshot } from "../types.js";
import { projectMonthly } from "./monthly";
import {
  accountsForProjection,
  applyOperatingLiquidOverride,
  costBasisFromSnapshot,
  syncBrokerageFromSnapshots,
} from "./projectionAccounts";

const checking: Account = {
  id: "chk",
  name: "Checking",
  type: "checking",
  balance: 9000,
  liquid: true,
};

const brokerage: Account = {
  id: "brk",
  name: "Robinhood",
  type: "brokerage",
  balance: 100000,
  basis: 80000,
};

describe("costBasisFromSnapshot", () => {
  it("sums per-position basis when summary missing", () => {
    const snap: HoldingsSnapshot = {
      id: "hs1",
      accountId: "brk",
      accountLabel: "Robinhood",
      asOfDate: "2026-06-01",
      importedAt: "2026-06-01T12:00:00Z",
      sourceType: "test",
      holdingsMarketValue: 1000,
      positionCount: 2,
      positions: [
        {
          id: "p1",
          ticker: "A",
          securityName: "A",
          assetType: "stock",
          shares: 1,
          marketPrice: 600,
          marketValue: 600,
          impliedCostBasis: 400,
        },
        {
          id: "p2",
          ticker: "B",
          securityName: "B",
          assetType: "stock",
          shares: 1,
          marketPrice: 400,
          marketValue: 400,
          impliedCostBasis: 300,
        },
      ],
    };
    expect(costBasisFromSnapshot(snap)).toBe(700);
  });
});

describe("syncBrokerageFromSnapshots", () => {
  it("overrides brokerage balance from latest linked snapshot", () => {
    const snap: HoldingsSnapshot = {
      id: "hs1",
      accountId: "brk",
      accountLabel: "Robinhood",
      asOfDate: "2026-06-01",
      importedAt: "2026-06-01T12:00:00Z",
      sourceType: "test",
      holdingsMarketValue: 136342.75,
      impliedCostBasis: 95000,
      positionCount: 5,
      positions: [],
    };
    const out = syncBrokerageFromSnapshots([brokerage], [snap]);
    expect(out[0].balance).toBe(136342.75);
    expect(out[0].basis).toBe(95000);
  });

  it("resolves cost from snapshot matched by label when accountId is missing", () => {
    const rh: Account = {
      id: "acct-robinhood-6853",
      name: "Robinhood individual (6853)",
      type: "brokerage",
      balance: 100000,
    };
    const snap: HoldingsSnapshot = {
      id: "hs1",
      institution: "Robinhood",
      accountLabel: "Robinhood individual",
      asOfDate: "2026-06-01",
      importedAt: "2026-06-01T12:00:00Z",
      sourceType: "test",
      holdingsMarketValue: 136342.75,
      impliedCostBasis: 88333.73,
      positionCount: 8,
      positions: [],
    };
    const out = syncBrokerageFromSnapshots([rh], [snap]);
    expect(out[0].balance).toBe(136342.75);
    expect(out[0].basis).toBeCloseTo(88333.73, 0);
  });

  it("fills basis from account when snapshot has balance but no cost summary", () => {
    const rh: Account = {
      id: "brk",
      name: "Robinhood",
      type: "brokerage",
      balance: 100000,
    };
    const snap: HoldingsSnapshot = {
      id: "hs1",
      accountId: "brk",
      accountLabel: "Robinhood",
      asOfDate: "2026-06-01",
      importedAt: "2026-06-01T12:00:00Z",
      sourceType: "test",
      holdingsMarketValue: 120000,
      positionCount: 2,
      positions: [
        {
          id: "p1",
          ticker: "A",
          securityName: "A",
          assetType: "stock",
          shares: 1,
          marketPrice: 800,
          marketValue: 800,
          impliedCostBasis: 500,
        },
        {
          id: "p2",
          ticker: "B",
          securityName: "B",
          assetType: "stock",
          shares: 1,
          marketPrice: 400,
          marketValue: 400,
          impliedCostBasis: 300,
        },
      ],
    };
    const out = syncBrokerageFromSnapshots([rh], [snap]);
    expect(out[0].basis).toBe(800);
  });
});

describe("applyOperatingLiquidOverride", () => {
  it("adjusts checking to match anchored operating liquid", () => {
    const state = { checking: 9000, savings: 0 };
    applyOperatingLiquidOverride(state, 3148);
    expect(state.checking + state.savings).toBeCloseTo(3148, 2);
  });
});

describe("accountsForProjection", () => {
  it("combines snapshot sync for monthly engine input", () => {
    const snap: HoldingsSnapshot = {
      id: "hs1",
      accountId: "brk",
      accountLabel: "Robinhood",
      asOfDate: "2026-06-01",
      importedAt: "2026-06-01T12:00:00Z",
      sourceType: "test",
      holdingsMarketValue: 120000,
      positionCount: 1,
      positions: [],
    };
    const out = accountsForProjection([checking, brokerage], {
      holdingsSnapshots: [snap],
    });
    expect(out.find((a) => a.id === "brk")?.balance).toBe(120000);
    expect(out.find((a) => a.id === "chk")?.balance).toBe(9000);
  });
});

describe("projectMonthly tax basis from snapshots", () => {
  const assumptions = {
    conservativeReturn: 0.04,
    baselineReturn: 0.06,
    aggressiveReturn: 0.08,
    inflation: 0,
    cashYield: 0,
    salaryGrowth: 0,
    emergencyReserveTarget: 0,
    horizonYears: 1,
    displayMode: "today" as const,
    checkingBuffer: 0,
    investRatio: 1,
    capitalGainsTaxRate: 0.15,
  };

  it("knows taxable basis when snapshot matches Robinhood by label only", () => {
    const accounts: Account[] = [
      {
        id: "acct-robinhood-6853",
        name: "Robinhood individual (6853)",
        type: "brokerage",
        balance: 133050,
      },
    ];
    const snap: HoldingsSnapshot = {
      id: "hs1",
      institution: "Robinhood",
      accountLabel: "Robinhood individual",
      asOfDate: "2026-06-01",
      importedAt: "2026-06-01T12:00:00Z",
      sourceType: "test",
      holdingsMarketValue: 136342.75,
      impliedCostBasis: 88333.73,
      positionCount: 8,
      positions: [],
    };
    const series = projectMonthly({
      accounts,
      cashFlows: [],
      events: [],
      assumptions,
      projectionAccounts: { holdingsSnapshots: [snap] },
    });
    expect(series[0].taxBasisKnown).toBe(true);
    expect(series[0].investedTaxableBasis).toBeCloseTo(88333.73, 0);
    expect(series[0].capitalGainsTaxEstimate).toBeGreaterThan(0);
  });
});
