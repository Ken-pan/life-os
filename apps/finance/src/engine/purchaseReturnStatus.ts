/** Normalized return / refund state from merchant order pages. */

export type PurchaseReturnStatus =
  | "none"
  | "cancelled"
  | "return_in_progress"
  | "returned"
  | "refunded";

export interface PurchaseReturnInfo {
  status: PurchaseReturnStatus;
  /** Raw merchant status line (e.g. Best Buy "Returned"). */
  label?: string;
  /** Return/refund/cancel event date when known. */
  eventDate?: string;
  /** Expected or actual refund amount in dollars. */
  refundAmount?: number;
  /** Refund credit txn ↔ original order id. */
  relatedOrderId?: string;
  /** Refund credit txn ↔ original purchase txn id. */
  relatedTxnId?: string;
  /** Set on card refund rows matched to an order return. */
  isRefundCredit?: boolean;
}

const RETURN_WINDOW_RE = /return window closed|return or replace|start a return/i;
const RETURN_DONE_RE =
  /return complete|return received|\breturned\b|refund issued|refund credited|refund total/i;
const RETURN_PROGRESS_RE =
  /return initiated|drop off|return started|return in progress/i;

export function parseMoney(value: string | number | undefined | null): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const n = parseFloat(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function parseMerchantDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

/**
 * Classify merchant order status + optional detail text.
 * Ignores "Return window closed" (eligibility, not a return event).
 */
export function parseReturnInfoFromMerchantStatus(
  status: string | undefined,
  options: {
    statusDate?: string;
    orderTotal?: string | number | null;
    detailText?: string;
  } = {}
): PurchaseReturnInfo | undefined {
  const label = status?.trim() || "";
  const blob = `${label} ${options.detailText || ""}`.trim();
  if (!label && !options.detailText) return undefined;

  if (RETURN_WINDOW_RE.test(blob) && !RETURN_DONE_RE.test(blob)) {
    return undefined;
  }

  let parsed: PurchaseReturnStatus | null = null;

  if (/^refund issued$|^refund credited$|^refunded$/i.test(label)) {
    parsed = "refunded";
  } else if (RETURN_DONE_RE.test(blob) || /^returned$/i.test(label)) {
    parsed = /refund/i.test(blob) ? "refunded" : "returned";
  } else if (RETURN_PROGRESS_RE.test(blob)) {
    parsed = "return_in_progress";
  } else if (/^cancelled$|^canceled$/i.test(label)) {
    parsed = "cancelled";
  } else if (/^returned$/i.test(label)) {
    parsed = "returned";
  }

  if (!parsed) {
    const refundAmt = options.detailText?.match(
      /Refund(?:\s+Total)?:?\s*(\$[\d,]+\.\d{2})/i
    )?.[1];
    if (refundAmt) parsed = "refunded";
  }

  if (!parsed) return undefined;

  const refundAmount =
    parsed === "cancelled"
      ? undefined
      : parseMoney(
          options.detailText?.match(/Refund(?:\s+Total)?:?\s*(\$[\d,]+\.\d{2})/i)?.[1] ??
            options.orderTotal
        ) ?? undefined;

  return {
    status: parsed,
    label: label || undefined,
    eventDate: parseMerchantDate(options.statusDate),
    refundAmount,
  };
}

export function isReturnLikeEnrichment(
  info: PurchaseReturnInfo | undefined
): boolean {
  return (
    info != null &&
    info.status !== "none" &&
    info.status !== "return_in_progress"
  );
}

export function isRefundCreditTxn(txn: {
  flow?: string;
  amount: number;
  merchant?: string;
}): boolean {
  if (txn.flow === "refund_or_reversal") return true;
  const m = txn.merchant ?? "";
  if (!/amazon|best\s*buy|bestbuy|target/i.test(m)) return false;
  return txn.amount < 0;
}

export function returnStatusLabelKey(status: PurchaseReturnStatus): string {
  switch (status) {
    case "cancelled":
      return "history.purchaseCancelled";
    case "returned":
      return "history.purchaseReturned";
    case "refunded":
      return "history.purchaseRefunded";
    case "return_in_progress":
      return "history.purchaseReturnInProgress";
    default:
      return "history.purchaseReturn";
  }
}
