import type { PortfolioAllocationTarget } from "../types.js";

export function sanitizePortfolioAllocationTarget(
  t: PortfolioAllocationTarget | null | undefined
): PortfolioAllocationTarget {
  if (!t || typeof t !== "object") return {};
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : undefined;
  const drift = num(t.driftThresholdPct);
  return {
    stockPct: num(t.stockPct),
    etfPct: num(t.etfPct),
    top1MaxPct: num(t.top1MaxPct),
    top3MaxPct: num(t.top3MaxPct),
    driftThresholdPct: drift != null ? Math.min(25, Math.max(1, drift)) : undefined,
  };
}
