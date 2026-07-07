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

const RETURN_WINDOW_RE =
  /return window closed|return or replace|eligible for return|start a return|view return\/refund status|buy it again/i;
const EXPLICIT_RETURN_EVIDENCE_RE =
  /(?:refund issued|refund credited|refund total|replacement sent|return complete|return received|\breturned\b|\brefunded\b)/i;
const EXPLICIT_RETURN_STATUS_LABEL_RE =
  /^(?:Return complete|Refund issued|Refunded|Returned|Cancelled|Canceled)$/i;
const ACTIVE_DELIVERY_STATUS_RE =
  /^(?:Arriving|Delivered|Shipped|Out for delivery|Estimated delivery|Payment|Pending|Purchased)/i;
const RETURN_PROGRESS_RE =
  /return initiated|drop off|return started|return in progress/i;

function hasExplicitReturnEvidence(text: string | undefined, statusLabel: string): boolean {
  const label = statusLabel.trim();
  const blob = `${label} ${text || ""}`.trim();
  if (!blob) return false;
  if (RETURN_WINDOW_RE.test(blob) && !EXPLICIT_RETURN_EVIDENCE_RE.test(blob)) {
    return false;
  }
  if (EXPLICIT_RETURN_STATUS_LABEL_RE.test(label)) return true;
  if (/^returned$/i.test(label)) return true;
  if (/Refund(?:\s+Total)?:?\s*(\$[\d,]+\.\d{2})/i.test(blob)) return true;
  if (EXPLICIT_RETURN_EVIDENCE_RE.test(blob)) return true;
  if (RETURN_PROGRESS_RE.test(blob)) return true;
  return false;
}

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
  const evidence = (options.detailText || "").trim();
  const blob = `${label} ${evidence}`.trim();
  if (!label && !evidence) return undefined;

  if (
    RETURN_WINDOW_RE.test(blob) &&
    !EXPLICIT_RETURN_EVIDENCE_RE.test(blob) &&
    !EXPLICIT_RETURN_STATUS_LABEL_RE.test(label)
  ) {
    return undefined;
  }

  let parsed: PurchaseReturnStatus | null = null;

  if (/^refund issued$|^refund credited$|^refunded$/i.test(label)) {
    parsed = "refunded";
  } else if (/^return complete$/i.test(label) || /^returned$/i.test(label)) {
    parsed = /refund/i.test(blob) ? "refunded" : "returned";
  } else if (/^cancelled$|^canceled$/i.test(label)) {
    parsed = "cancelled";
  } else if (RETURN_PROGRESS_RE.test(blob)) {
    parsed = "return_in_progress";
  } else if (EXPLICIT_RETURN_EVIDENCE_RE.test(evidence)) {
    if (/refund issued|refund credited|refund total|\brefunded\b/i.test(evidence)) {
      parsed = "refunded";
    } else if (
      /return complete|return received|\breturned\b|replacement sent/i.test(evidence)
    ) {
      parsed = /refund/i.test(evidence) ? "refunded" : "returned";
    }
  }

  const refundLine = evidence.match(/Refund(?:\s+Total)?:?\s*(\$[\d,]+\.\d{2})/i);
  if (!parsed && refundLine) parsed = "refunded";

  if (!parsed) return undefined;

  if (!hasExplicitReturnEvidence(evidence, label)) return undefined;

  if (
    ACTIVE_DELIVERY_STATUS_RE.test(label) &&
    !EXPLICIT_RETURN_STATUS_LABEL_RE.test(label) &&
    !refundLine
  ) {
    return undefined;
  }

  const refundAmount =
    parsed === "cancelled"
      ? undefined
      : parseMoney(refundLine?.[1]) ??
        (EXPLICIT_RETURN_STATUS_LABEL_RE.test(label)
          ? parseMoney(options.orderTotal)
          : null) ??
        undefined;

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
