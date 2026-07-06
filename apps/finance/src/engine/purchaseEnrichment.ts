/** External purchase context attached to a bank/card transaction (e.g. Amazon order). */

export interface PurchaseLineItem {
  title: string;
  price?: number;
  quantity?: number;
  detailUrl?: string;
}

export interface PurchaseEnrichment {
  source: "amazon" | string;
  orderId?: string;
  orderDate?: string;
  orderTotal?: number;
  status?: string;
  detailUrl?: string;
  lineItems?: PurchaseLineItem[];
  matchConfidence?: "high" | "medium" | "low";
  matchedAt?: string;
}

export function hasPurchaseEnrichment(
  t: { purchaseEnrichment?: PurchaseEnrichment | null }
): t is { purchaseEnrichment: PurchaseEnrichment } {
  return Boolean(t.purchaseEnrichment?.source);
}

export function purchaseEnrichmentFromRow(raw: unknown): PurchaseEnrichment | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (typeof o.source !== "string" || !o.source) return undefined;
  return raw as PurchaseEnrichment;
}

export function uniqueLineItems(items: PurchaseLineItem[] | undefined): PurchaseLineItem[] {
  if (!items?.length) return [];
  const seen = new Set<string>();
  const out: PurchaseLineItem[] = [];
  for (const item of items) {
    const key = item.detailUrl || item.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.slice(0, 20);
}
