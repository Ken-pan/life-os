import { describe, expect, it } from "vitest";
import {
  enrichmentFromOrder,
  isBestBuyMerchant,
  matchBestBuyOrdersToTxns,
} from "./bestbuyOrderMatch";

describe("bestbuyOrderMatch", () => {
  it("detects best buy merchants", () => {
    expect(isBestBuyMerchant("Best Buy")).toBe(true);
    expect(isBestBuyMerchant("BESTBUY.COM")).toBe(true);
    expect(isBestBuyMerchant("Target")).toBe(false);
  });

  it("matches txn to order by amount and nearby date", () => {
    const orders = [
      {
        orderId: "BBY01-807200460563",
        orderDate: "June 20, 2026",
        orderTotal: "$119.87",
        status: "Delivered",
        lineItems: [{ title: "USB Hub" }],
      },
    ];
    const txns = [
      { id: "txn-1", date: "2026-06-21", amount: 119.87, merchant: "Best Buy" },
      { id: "txn-2", date: "2026-06-21", amount: 50, merchant: "Best Buy" },
    ];
    const matches = matchBestBuyOrdersToTxns(orders, txns);
    expect(matches).toHaveLength(1);
    expect(matches[0].txnId).toBe("txn-1");
    expect(matches[0].orderId).toBe("BBY01-807200460563");
    expect(matches[0].enrichment.source).toBe("bestbuy");
  });

  it("builds enrichment payload", () => {
    const e = enrichmentFromOrder(
      { orderId: "BBY01-1", orderTotal: "$10.00", status: "Delivered" },
      "high",
    );
    expect(e.source).toBe("bestbuy");
    expect(e.orderTotal).toBe(10);
    expect(e.matchConfidence).toBe("high");
  });
});
