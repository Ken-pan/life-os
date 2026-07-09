import { describe, expect, it } from "vitest";
import {
  ledgerAccountColumn,
  ledgerMetaParts,
  ledgerTitle,
  merchantMatchesCategory,
  resolveCaptureAccount,
  resolveCaptureMerchant,
  statementToMerchant,
} from "./ledgerDisplay";
import type { Txn } from "./transactions";

const baseTxn = (patch: Partial<Txn>): Txn => ({
  date: "2026-06-01",
  month: "2026-06",
  merchant: "Starbucks",
  category: "Dining & Drinks",
  account: "Chase ••1234",
  flow: "expense",
  amount: 5.5,
  budgetImpact: -5.5,
  inSpending: true,
  inCashFlow: true,
  ...patch,
});

describe("resolveCaptureMerchant", () => {
  it("uses statement when merchant equals category", () => {
    expect(
      resolveCaptureMerchant({
        merchant: "Shopping",
        category: "Shopping",
        statement: "AMAZON.COM AMZN.COM/BILL WA",
      }),
    ).toBe("AMAZON.COM AMZN.COM/BILL WA");
  });

  it("keeps distinct merchant name", () => {
    expect(
      resolveCaptureMerchant({
        merchant: "Paris Baguette",
        category: "Dining & Drinks",
        statement: "PARIS BAGUETTE #123",
      }),
    ).toBe("Paris Baguette");
  });
});

describe("resolveCaptureAccount", () => {
  it("never stores import pipeline label as account", () => {
    expect(resolveCaptureAccount({ account: "Rocket Money" })).toBe("Unknown");
    expect(resolveCaptureAccount({ account: "Chase ••4242" })).toBe("Chase ••4242");
    expect(resolveCaptureAccount({})).toBe("Unknown");
  });
});

describe("ledgerTitle", () => {
  it("shortens Amazon Purchase merchant label", () => {
    expect(ledgerTitle(baseTxn({ merchant: "Amazon Purchase", category: "Shopping" }))).toBe(
      "Amazon",
    );
  });

  it("shows merchant not category", () => {
    expect(ledgerTitle(baseTxn({ merchant: "Target", category: "Shopping" }))).toBe("Target");
  });

  it("shows dash when merchant equals category without enrichment", () => {
    expect(
      ledgerTitle(baseTxn({ merchant: "Shopping", category: "Shopping" })),
    ).toBe("—");
  });

  it("uses Amazon label when merchant equals category but enriched", () => {
    expect(
      ledgerTitle(
        baseTxn({
          merchant: "Shopping",
          category: "Shopping",
          purchaseEnrichment: {
            source: "amazon",
            lineItems: [{ title: "USB-C Hub", asin: "B001" }],
          },
        }),
      ),
    ).toBe("Amazon");
  });

  it("uses Best Buy label when enriched", () => {
    expect(
      ledgerTitle(
        baseTxn({
          merchant: "Shopping",
          category: "Shopping",
          purchaseEnrichment: {
            source: "bestbuy",
            lineItems: [{ title: "TV Mount" }],
          },
        }),
      ),
    ).toBe("Best Buy");
  });

  it("uses Target label when enriched", () => {
    expect(
      ledgerTitle(
        baseTxn({
          merchant: "Shopping",
          category: "Shopping",
          purchaseEnrichment: {
            source: "target",
            lineItems: [{ title: "Paper Towels" }],
          },
        }),
      ),
    ).toBe("Target");
  });
});

describe("ledgerMetaParts", () => {
  it("moves Rocket Money from account to importSource", () => {
    const parts = ledgerMetaParts(baseTxn({ account: "Rocket Money" }));
    expect(parts.account).toBeNull();
    expect(parts.importSource).toBe("Rocket Money");
    expect(parts.category).toBe("Dining & Drinks");
  });

  it("ledgerAccountColumn hides import pipeline account", () => {
    expect(ledgerAccountColumn(baseTxn({ account: "Rocket Money" }))).toBeNull();
    expect(ledgerAccountColumn(baseTxn({ account: "Chase ••1234" }))).toBe("Chase ••1234");
  });
});

describe("statementToMerchant", () => {
  it("takes first segment", () => {
    expect(statementToMerchant("WHOLEFDS MKT #123 | GROCERY")).toBe("WHOLEFDS MKT #123");
  });
});

describe("merchantMatchesCategory", () => {
  it("detects identical strings", () => {
    expect(merchantMatchesCategory("Shopping", "Shopping")).toBe(true);
    expect(merchantMatchesCategory("Target", "Shopping")).toBe(false);
  });
});
