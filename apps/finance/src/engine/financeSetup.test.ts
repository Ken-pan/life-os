import { describe, expect, it } from "vitest";
import type { Account, FinanceData } from "../types";
import { createEmptyData } from "../store/defaults";
import { BUNDLED_SNAPSHOT_ID } from "./holdings";
import { ensureFinanceSetup } from "./financeSetup";

const robinhoodBrokerage: Account = {
  id: "acct-robinhood-6853",
  name: "Robinhood individual (6853)",
  type: "brokerage",
  balance: 133050.43,
};

const robinhoodCash: Account = {
  id: "acct-robinhood-cash",
  name: "Robinhood Saving",
  type: "savings",
  balance: 2115.78,
  liquid: true,
};

const fidelity401k: Account = {
  id: "acct-401k-fidelity-0576",
  name: "INGRAM MICRO 401(k) (Fidelity 0576)",
  type: "retirement",
  balance: 56349,
};

const fidelityHsa: Account = {
  id: "acct-hsa-fidelity-1152",
  name: "Health Savings Account (Fidelity 1152)",
  type: "retirement",
  balance: 1841,
};

const checking: Account = {
  id: "acct-checking-aggregate",
  name: "Chase Checking",
  type: "checking",
  balance: 227.08,
  liquid: true,
};

function baseData(): FinanceData {
  return {
    ...createEmptyData(),
    accounts: [checking, robinhoodCash, robinhoodBrokerage],
  };
}

describe("ensureFinanceSetup", () => {
  it("loads bundled snapshot, binds Robinhood, syncs market/cost basis, fixes cash reserve", () => {
    const out = ensureFinanceSetup(baseData());
    expect(out.changed).toBe(true);
    expect(out.data.holdingsSnapshots.some((s) => s.id === BUNDLED_SNAPSHOT_ID)).toBe(true);

    const snap = out.data.holdingsSnapshots.find((s) => s.id === BUNDLED_SNAPSHOT_ID);
    expect(snap?.accountId).toBe("acct-robinhood-6853");
    expect(snap?.impliedCostBasis).toBeCloseTo(88333.73, 0);

    const rh = out.data.accounts.find((a) => a.id === "acct-robinhood-6853");
    expect(rh?.balance).toBeCloseTo(136342.75, 0);
    expect(rh?.basis).toBeCloseTo(88333.73, 0);

    const cash = out.data.accounts.find((a) => a.id === "acct-robinhood-cash");
    expect(cash?.liquid).toBe(false);

    expect(out.data.assumptions.capitalGainsTaxRate).toBe(0.15);
  });

  it("is idempotent on second run", () => {
    const first = ensureFinanceSetup(baseData());
    const second = ensureFinanceSetup(first.data);
    expect(second.changed).toBe(false);
  });

  it("skips Robinhood snapshot sync when balanceManual is set", () => {
    const manual = ensureFinanceSetup(baseData());
    const rhId = "acct-robinhood-6853";
    const withManual: FinanceData = {
      ...manual.data,
      accounts: manual.data.accounts.map((a) =>
        a.id === rhId
          ? { ...a, balance: 99999, balanceManual: true, basis: 12345 }
          : a
      ),
    };
    const out = ensureFinanceSetup(withManual);
    const rh = out.data.accounts.find((a) => a.id === rhId);
    expect(rh?.balance).toBe(99999);
    expect(rh?.basis).toBe(12345);
    expect(out.changed).toBe(false);
  });

  it("normalizes Fidelity 401(k)/HSA and adds lockbox payroll contributions", () => {
    const out = ensureFinanceSetup({
      ...baseData(),
      accounts: [...baseData().accounts, fidelity401k, fidelityHsa],
      cashFlows: [
        {
          id: "cf-salary",
          name: "工资",
          type: "income",
          frequency: "monthly",
          amount: 7600,
          payFrequency: "biweekly",
          anchorDate: "2026-06-05",
        },
      ],
    });
    expect(out.changed).toBe(true);

    const k401 = out.data.accounts.find((a) => a.id === "acct-401k-fidelity-0576");
    expect(k401?.balance).toBeCloseTo(56605.49, 0);
    expect(k401?.basis).toBeCloseTo(42996.39, 0);
    expect(k401?.note).toContain("OGSV 97%");
    expect(k401?.fundAllocations?.find((f) => f.ticker === "OGSV")?.weightPct).toBe(97);
    expect(k401?.fundAllocations?.find((f) => f.ticker === "FDRXX")?.assetClass).toBe("cash");
    expect(k401?.underlyingAllocation?.find((s) => s.id === "domestic-stock")?.weightPct).toBe(57.58);
    expect(k401?.underlyingAllocation?.find((s) => s.id === "foreign-stock")?.weightPct).toBe(33.3);

    const hsa = out.data.accounts.find((a) => a.id === "acct-hsa-fidelity-1152");
    expect(hsa?.type).toBe("hsa");
    expect(hsa?.balance).toBeCloseTo(1846.5, 0);

    const employee = out.data.cashFlows.find((c) => c.id === "cf-401k-employee");
    expect(employee?.category).toBe("lockbox-contribution");
    expect(employee?.amount).toBeCloseTo((642.74 * 26) / 12, 1);
    expect(out.data.cashFlows.some((c) => c.id === "cf-401k-employer-match")).toBe(true);
  });
});
