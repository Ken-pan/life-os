import type { PurchaseEnrichment, PurchaseLineItem } from "./purchaseEnrichment.ts";
import { uniqueLineItems } from "./purchaseEnrichment.ts";

export interface AmazonOrderRecord {
  orderId?: string;
  orderDate?: string;
  orderTotal?: string | number;
  status?: string;
  detailUrl?: string;
  lineItems?: Array<{ title?: string; price?: string | number; quantity?: number; detailUrl?: string }>;
}

export interface AmazonMatchTxn {
  id: string;
  date: string;
  amount: number;
  merchant?: string;
  purchaseEnrichment?: PurchaseEnrichment | null;
}

export interface AmazonMatchOptions {
  /** Max calendar days between order date and card charge. */
  maxDayDiff?: number;
  /** Max absolute amount difference in dollars. */
  maxAmountDiff?: number;
}

export interface AmazonMatchResult {
  txnId: string;
  orderId: string;
  confidence: "high" | "medium" | "low";
  dayDiff: number;
  amountDiff: number;
  enrichment: PurchaseEnrichment;
}

const AMAZON_MERCHANT_RE = /amazon/i;

export function isAmazonMerchant(merchant: string | undefined): boolean {
  return AMAZON_MERCHANT_RE.test(merchant ?? "");
}

export function parseMoney(value: string | number | undefined | null): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const n = parseFloat(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function parseOrderDate(value: string | undefined): string | null {
  if (!value) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  if (iso) return iso;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function dayDiff(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
}

function confidenceFor(dayDiff: number, amountDiff: number): "high" | "medium" | "low" {
  if (dayDiff <= 2 && amountDiff < 0.005) return "high";
  if (dayDiff <= 5 && amountDiff < 0.02) return "medium";
  return "low";
}

export function enrichmentFromOrder(
  order: AmazonOrderRecord,
  confidence: AmazonMatchResult["confidence"]
): PurchaseEnrichment {
  const lineItems: PurchaseLineItem[] = uniqueLineItems(
    (order.lineItems ?? [])
      .filter((li) => li.title && li.title.length > 2)
      .map((li) => ({
        title: String(li.title).slice(0, 300),
        price: parseMoney(li.price) ?? undefined,
        quantity: li.quantity,
        detailUrl: li.detailUrl,
      }))
  );

  return {
    source: "amazon",
    orderId: order.orderId,
    orderDate: parseOrderDate(order.orderDate) ?? undefined,
    orderTotal: parseMoney(order.orderTotal) ?? undefined,
    status: order.status,
    detailUrl: order.detailUrl,
    lineItems,
    matchConfidence: confidence,
    matchedAt: new Date().toISOString(),
  };
}

/** Greedy one-to-one match: each txn ↔ at most one order. */
export function matchAmazonOrdersToTxns(
  orders: AmazonOrderRecord[],
  txns: AmazonMatchTxn[],
  options: AmazonMatchOptions = {}
): AmazonMatchResult[] {
  const maxDayDiff = options.maxDayDiff ?? 7;
  const maxAmountDiff = options.maxAmountDiff ?? 0.02;

  const prepared = orders
    .map((o) => ({
      order: o,
      orderId: o.orderId ?? "",
      orderDate: parseOrderDate(o.orderDate),
      orderTotal: parseMoney(o.orderTotal),
    }))
    .filter((o) => o.orderId && o.orderDate && o.orderTotal != null);

  const candidates: Array<{
    txnId: string;
    orderId: string;
    score: number;
    dayDiff: number;
    amountDiff: number;
    order: AmazonOrderRecord;
  }> = [];

  for (const txn of txns) {
    if (!txn.id || !isAmazonMerchant(txn.merchant)) continue;
    const amt = Math.abs(txn.amount);
    for (const o of prepared) {
      const amountDiff = Math.abs(o.orderTotal! - amt);
      if (amountDiff > maxAmountDiff) continue;
      const dd = dayDiff(txn.date, o.orderDate!);
      if (dd > maxDayDiff) continue;
      candidates.push({
        txnId: txn.id,
        orderId: o.orderId,
        score: dd * 10 + amountDiff,
        dayDiff: dd,
        amountDiff,
        order: o.order,
      });
    }
  }

  candidates.sort((a, b) => a.score - b.score);

  const usedTxn = new Set<string>();
  const usedOrder = new Set<string>();
  const results: AmazonMatchResult[] = [];

  for (const c of candidates) {
    if (usedTxn.has(c.txnId) || usedOrder.has(c.orderId)) continue;
    usedTxn.add(c.txnId);
    usedOrder.add(c.orderId);
    const confidence = confidenceFor(c.dayDiff, c.amountDiff);
    results.push({
      txnId: c.txnId,
      orderId: c.orderId,
      confidence,
      dayDiff: c.dayDiff,
      amountDiff: c.amountDiff,
      enrichment: enrichmentFromOrder(c.order, confidence),
    });
  }

  return results;
}
