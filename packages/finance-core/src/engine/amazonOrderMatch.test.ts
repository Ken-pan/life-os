import { describe, expect, it } from "vitest";
import {
  enrichmentFromOrder,
  isAmazonMerchant,
  matchAmazonOrdersToTxns,
  parseMoney,
  parseOrderDate,
} from "./amazonOrderMatch";

describe("amazonOrderMatch", () => {
  it("parses order dates and money", () => {
    expect(parseOrderDate("July 4, 2026")).toBe("2026-07-04");
    expect(parseMoney("$66.40")).toBe(66.4);
  });

  it("detects amazon merchants", () => {
    expect(isAmazonMerchant("Amazon Purchase")).toBe(true);
    expect(isAmazonMerchant("Whole Foods")).toBe(false);
  });

  it("matches txn to order by amount and nearby date", () => {
    const orders = [
      {
        orderId: "114-2839702-0661859",
        orderDate: "July 2, 2026",
        orderTotal: "$33.42",
        detailUrl: "https://www.amazon.com/gp/your-account/order-details?orderID=114-2839702-0661859",
        lineItems: [{ title: "Test Product", detailUrl: "https://www.amazon.com/dp/B001" }],
      },
    ];
    const txns = [
      { id: "txn-1", date: "2026-07-03", amount: 33.42, merchant: "Amazon Purchase" },
      { id: "txn-2", date: "2026-07-03", amount: 99.99, merchant: "Amazon Purchase" },
    ];
    const matches = matchAmazonOrdersToTxns(orders, txns);
    expect(matches).toHaveLength(1);
    expect(matches[0].txnId).toBe("txn-1");
    expect(matches[0].orderId).toBe("114-2839702-0661859");
    expect(matches[0].enrichment.lineItems?.[0]?.title).toBe("Test Product");
  });

  it("builds enrichment payload", () => {
    const e = enrichmentFromOrder(
      { orderId: "111", orderTotal: "$10.00", status: "Delivered" },
      "high"
    );
    expect(e.source).toBe("amazon");
    expect(e.orderTotal).toBe(10);
    expect(e.matchConfidence).toBe("high");
  });
});
