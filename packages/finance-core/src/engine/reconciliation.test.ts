import { describe, expect, it } from "vitest";
import type { Account } from "../types.js";
import type { Txn } from "./transactions";
import {
  accountBalanceDelta,
  accountsNeedingReanchor,
  computeLiquidCashAnchors,
  resolveCashPositionUiState,
  computeReconciliationPreview,
  isReconcilableCashAccount,
  planCashReanchorTargets,
  reconciliationAdjustmentAmount,
  shouldAutoHealCashDrift,
  sumBalanceDelta,
  txnsForAccountInRange,
} from "./reconciliation";

const checking: Account = {
  id: "chk-1",
  name: "Checking",
  type: "checking",
  balance: 5000,
};

const savings: Account = {
  id: "sav-1",
  name: "Emergency",
  type: "savings",
  balance: 10000,
  liquid: false,
};

const card: Account = {
  id: "cc-1",
  name: "Visa",
  type: "credit-card",
  balance: 800,
};

function txn(partial: Partial<Txn> & Pick<Txn, "date" | "account" | "flow" | "amount">): Txn {
  return {
    month: partial.date.slice(0, 7),
    merchant: partial.merchant ?? "Test",
    category: partial.category ?? "Uncategorized",
    budgetImpact: partial.budgetImpact ?? 0,
    inSpending: partial.inSpending ?? false,
    inCashFlow: partial.inCashFlow ?? true,
    ...partial,
  };
}

describe("isReconcilableCashAccount", () => {
  it("includes checking and liquid savings", () => {
    expect(isReconcilableCashAccount(checking)).toBe(true);
    expect(isReconcilableCashAccount({ ...savings, liquid: true })).toBe(true);
  });

  it("excludes protected savings and credit cards", () => {
    expect(isReconcilableCashAccount(savings)).toBe(false);
    expect(isReconcilableCashAccount(card)).toBe(false);
  });
});

describe("accountBalanceDelta", () => {
  it("normalizes import-style signed amounts", () => {
    expect(accountBalanceDelta(txn({ date: "2026-05-01", account: "Checking", flow: "expense", amount: -120 }))).toBe(-120);
    expect(accountBalanceDelta(txn({ date: "2026-05-02", account: "Checking", flow: "income", amount: 2500 }))).toBe(2500);
  });

  it("normalizes manual-style positive expense amounts", () => {
    expect(accountBalanceDelta(txn({ date: "2026-05-03", account: "Checking", flow: "expense", amount: 45 }))).toBe(-45);
  });

  it("passes reconcile_adjustment through signed", () => {
    expect(
      accountBalanceDelta(
        txn({ date: "2026-05-10", account: "Checking", flow: "reconcile_adjustment", amount: 12.34 })
      )
    ).toBe(12.34);
  });
});

describe("computeReconciliationPreview", () => {
  const txns: Txn[] = [
    txn({ date: "2026-05-05", account: "Checking", flow: "expense", amount: -200 }),
    txn({ date: "2026-05-08", account: "Checking", flow: "income", amount: 3000 }),
    txn({ date: "2026-05-09", account: "Savings", flow: "expense", amount: -50 }),
  ];

  it("opening assertion compares to account.balance cache", () => {
    const preview = computeReconciliationPreview({
      account: checking,
      assertionDate: "2026-05-10",
      statedBalance: 5100,
      txns,
      lastAssertion: null,
    });
    expect(preview.isOpeningAssertion).toBe(true);
    expect(preview.expectedBalance).toBe(5000);
    expect(preview.difference).toBe(100);
    expect(preview.isBalanced).toBe(false);
  });

  it("subsequent assertion uses last anchor + txns", () => {
    const preview = computeReconciliationPreview({
      account: checking,
      assertionDate: "2026-05-10",
      statedBalance: 7800,
      txns,
      lastAssertion: { date: "2026-05-01", amount: 5000 },
    });
    expect(preview.txnCount).toBe(2);
    expect(preview.txnNetSinceLast).toBe(2800);
    expect(preview.expectedBalance).toBe(7800);
    expect(preview.difference).toBe(0);
    expect(preview.isBalanced).toBe(true);
  });

  it("excludes txns on or before last assertion date", () => {
    const inRange = txnsForAccountInRange(txns, "Checking", "2026-05-08", "2026-05-10");
    expect(inRange).toHaveLength(0);
    expect(sumBalanceDelta(inRange)).toBe(0);
  });
});

describe("reconciliationAdjustmentAmount", () => {
  it("returns signed difference", () => {
    expect(reconciliationAdjustmentAmount(-15.5)).toBe(-15.5);
    expect(reconciliationAdjustmentAmount(3)).toBe(3);
  });
});

describe("computeLiquidCashAnchors", () => {
  it("without assertions uses account.balance for cleared and working", () => {
    const petty: Account = { id: "oth-1", name: "Petty", type: "other", balance: 200 };
    const anchors = computeLiquidCashAnchors({
      accounts: [checking, petty],
      assertions: [],
      txns: [],
    });
    expect(anchors.hasAnchoredAccounts).toBe(false);
    expect(anchors.clearedLiquid).toBe(5000);
    expect(anchors.workingLiquid).toBe(5000);
    expect(anchors.otherLiquid).toBe(200);
    expect(anchors.totalStartLiquid).toBe(5200);
    expect(anchors.cacheLiquid).toBe(5200);
    expect(anchors.driftFromCache).toBe(0);
  });

  it("with assertion adds post-anchor txns to working only", () => {
    const txns: Txn[] = [
      txn({ date: "2026-05-12", account: "Checking", flow: "expense", amount: -150 }),
      txn({ date: "2026-05-14", account: "Checking", flow: "income", amount: 800 }),
    ];
    const anchors = computeLiquidCashAnchors({
      accounts: [checking],
      assertions: [{ id: "a1", accountId: "chk-1", date: "2026-05-10", amount: 4800 }],
      txns,
      today: new Date("2026-05-15"),
    });
    expect(anchors.hasAnchoredAccounts).toBe(true);
    expect(anchors.clearedLiquid).toBe(4800);
    expect(anchors.workingLiquid).toBe(5450);
    expect(anchors.totalStartLiquid).toBe(5450);
    expect(anchors.driftFromCache).toBe(-450);
  });

  it("tracks pending outflow for display", () => {
    const anchors = computeLiquidCashAnchors({
      accounts: [checking],
      assertions: [],
      txns: [],
      pendingOutflowTotal: 320.5,
    });
    expect(anchors.pendingOutflowTotal).toBe(320.5);
  });
});

describe("resolveCashPositionUiState", () => {
  it("hides when all liquid buckets are zero", () => {
    const ui = resolveCashPositionUiState({
      clearedLiquid: 0,
      workingLiquid: 0,
      otherLiquid: 0,
      totalStartLiquid: 0,
      cacheLiquid: 0,
      driftFromCache: 0,
      hasAnchoredAccounts: false,
      anchoredAccountCount: 0,
      pendingOutflowTotal: 0,
    });
    expect(ui.visible).toBe(false);
  });

  it("shows onboarding when balances exist but no anchor", () => {
    const anchors = computeLiquidCashAnchors({
      accounts: [checking],
      assertions: [],
      txns: [],
    });
    const ui = resolveCashPositionUiState(anchors);
    expect(ui.visible).toBe(true);
    expect(ui.variant).toBe("onboarding");
  });

  it("hides steady state when anchored, in sync, no post-anchor txns", () => {
    const anchors = computeLiquidCashAnchors({
      accounts: [checking],
      assertions: [{ id: "a1", accountId: "chk-1", date: "2026-05-10", amount: 5000 }],
      txns: [],
      today: new Date("2026-05-15"),
    });
    const ui = resolveCashPositionUiState(anchors);
    expect(ui.visible).toBe(false);
    expect(ui.showUnclearedHint).toBe(false);
    expect(ui.showDriftWarning).toBe(false);
  });

  it("does not surface strip when only post-anchor txns move working", () => {
    const anchors = computeLiquidCashAnchors({
      accounts: [{ ...checking, balance: 4650 }],
      assertions: [{ id: "a1", accountId: "chk-1", date: "2026-05-10", amount: 4800 }],
      txns: [txn({ date: "2026-05-12", account: "Checking", flow: "expense", amount: -150 })],
      today: new Date("2026-05-15"),
    });
    const ui = resolveCashPositionUiState(anchors);
    expect(ui.visible).toBe(false);
    expect(ui.showDriftWarning).toBe(false);
    expect(ui.txnDelta).toBe(-150);
  });

  it("shows attention when manual cache drifts from working", () => {
    const anchors = computeLiquidCashAnchors({
      accounts: [{ ...checking, balance: 5450 }],
      assertions: [{ id: "a1", accountId: "chk-1", date: "2026-05-10", amount: 4800 }],
      txns: [txn({ date: "2026-05-12", account: "Checking", flow: "expense", amount: -150 })],
      today: new Date("2026-05-15"),
    });
    const ui = resolveCashPositionUiState(anchors);
    expect(ui.visible).toBe(true);
    expect(ui.showDriftWarning).toBe(true);
  });
});

describe("planCashReanchorTargets", () => {
  it("targets reconcilable accounts with current balance", () => {
    const targets = planCashReanchorTargets({
      accounts: [checking, savings, card],
      assertionDate: "2026-05-15",
    });
    expect(targets).toEqual([
      { accountId: "chk-1", accountName: "Checking", amount: 5000, date: "2026-05-15" },
    ]);
  });

  it("filters by accountIds when provided", () => {
    const targets = planCashReanchorTargets({
      accounts: [{ ...checking, id: "a" }, { ...checking, id: "b", name: "Savings", type: "savings" }],
      accountIds: new Set(["b"]),
      assertionDate: "2026-05-15",
    });
    expect(targets).toHaveLength(1);
    expect(targets[0]?.accountId).toBe("b");
  });
});

describe("shouldAutoHealCashDrift", () => {
  it("returns true when balance updated after assertion and drift exists", () => {
    const freshUpdatedAt = new Date(Date.now() - 2 * 86400000).toISOString();
    const accounts = [{ ...checking, balance: 5450, updatedAt: freshUpdatedAt }];
    const assertions = [
      {
        id: "a1",
        accountId: "chk-1",
        date: "2026-05-10",
        amount: 4800,
        createdAt: "2026-05-10T08:00:00.000Z",
      },
    ];
    const anchors = computeLiquidCashAnchors({
      accounts,
      assertions,
      txns: [txn({ date: "2026-05-12", account: "Checking", flow: "expense", amount: -150 })],
      today: new Date("2026-05-15"),
    });
    expect(shouldAutoHealCashDrift({ anchors, accounts, assertions })).toBe(true);
    expect(accountsNeedingReanchor({ accounts, assertions }).has("chk-1")).toBe(true);
  });

  it("returns false when drift is within tolerance", () => {
    const accounts = [checking];
    const assertions = [{ id: "a1", accountId: "chk-1", date: "2026-05-10", amount: 5000 }];
    const anchors = computeLiquidCashAnchors({
      accounts,
      assertions,
      txns: [],
      today: new Date("2026-05-15"),
    });
    expect(shouldAutoHealCashDrift({ anchors, accounts, assertions })).toBe(false);
  });
});
