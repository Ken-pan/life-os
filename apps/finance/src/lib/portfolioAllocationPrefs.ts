import type { FinanceData, PortfolioAllocationTarget } from "../types";
import { PORTFOLIO_ALLOCATION_STORAGE_KEY } from "./localDataKeys";

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

function hasTargetValues(t: PortfolioAllocationTarget): boolean {
  return Object.values(t).some((v) => v != null && Number.isFinite(v));
}

/** 本机缓存（离线 / 首屏回退）。 */
export function loadPortfolioAllocationTargetLocal(): PortfolioAllocationTarget {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PORTFOLIO_ALLOCATION_STORAGE_KEY);
    if (!raw) return {};
    return sanitizePortfolioAllocationTarget(JSON.parse(raw) as PortfolioAllocationTarget);
  } catch {
    return {};
  }
}

export function savePortfolioAllocationTargetLocal(target: PortfolioAllocationTarget): void {
  if (typeof window === "undefined") return;
  try {
    const sanitized = sanitizePortfolioAllocationTarget(target);
    window.localStorage.setItem(PORTFOLIO_ALLOCATION_STORAGE_KEY, JSON.stringify(sanitized));
  } catch {
    // 忽略配额等错误
  }
}

/**
 * 登录加载后：云端优先；若云端为空且本机有旧数据则合并并标记需上传。
 */
export function hydratePortfolioAllocationTarget(data: FinanceData): {
  data: FinanceData;
  shouldUploadLocal: boolean;
} {
  const remote = sanitizePortfolioAllocationTarget(data.portfolioAllocationTarget);
  if (hasTargetValues(remote)) {
    savePortfolioAllocationTargetLocal(remote);
    return { data: { ...data, portfolioAllocationTarget: remote }, shouldUploadLocal: false };
  }
  const local = loadPortfolioAllocationTargetLocal();
  if (hasTargetValues(local)) {
    return {
      data: { ...data, portfolioAllocationTarget: local },
      shouldUploadLocal: true,
    };
  }
  return { data: { ...data, portfolioAllocationTarget: {} }, shouldUploadLocal: false };
}
