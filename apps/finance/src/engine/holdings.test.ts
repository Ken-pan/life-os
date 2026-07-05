import { describe, expect, it } from "vitest";
import { createBundledRobinhoodSnapshot, parseHoldingsSnapshotJson } from "./holdings";

describe("parseHoldingsSnapshotJson", () => {
  it("parses robinhood snapshot import and keeps it read-only friendly", () => {
    const json = JSON.stringify({
      importType: "holdings_snapshot",
      asOfDate: "2026-06-01",
      accountMapping: {
        institution: "Robinhood",
        accountLabel: "Robinhood individual",
        suggestedExistingAccountId: "acct-rh",
        needsUserConfirmation: true,
      },
      holdings: [
        {
          ticker: "TSLA",
          securityName: "Tesla, Inc.",
          assetType: "stock",
          shares: 10,
          marketPrice: 100,
          marketValue: 1000,
        },
      ],
      derivedSummary: {
        holdingsMarketValue: 1000,
        positionCount: 1,
      },
      reconciliation: {
        accountTotalProvidedInThisScreenshotSet: false,
      },
    });
    const parsed = parseHoldingsSnapshotJson(json, [
      { id: "acct-rh", name: "Robinhood individual", type: "brokerage", balance: 1200 },
    ]);
    expect(parsed.snapshot.accountId).toBe("acct-rh");
    expect(parsed.snapshot.holdingsMarketValue).toBe(1000);
    expect(parsed.snapshot.reconciliationStatus).toBe("incomplete");
    expect(parsed.snapshot.positionCount).toBe(1);
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });

  it("throws for non-holdings payload", () => {
    expect(() => parseHoldingsSnapshotJson(JSON.stringify({ importType: "txn" }), [])).toThrow(
      "holdings_snapshot"
    );
  });

  it("loads bundled robinhood snapshot", () => {
    const parsed = createBundledRobinhoodSnapshot([]);
    expect(parsed.snapshot.positionCount).toBe(8);
    expect(parsed.snapshot.positions[0].ticker).toBeTruthy();
  });

  it("resolves Robinhood brokerage via ID alias", () => {
    const parsed = createBundledRobinhoodSnapshot([
      { id: "acct-robinhood-6853", name: "Robinhood individual (6853)", type: "brokerage", balance: 1 },
    ]);
    expect(parsed.snapshot.accountId).toBe("acct-robinhood-6853");
    expect(parsed.warnings.some((w) => w.includes("未找到"))).toBe(false);
  });
});
