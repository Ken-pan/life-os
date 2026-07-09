import type { FinanceData, PortfolioAllocationTarget } from "../types";
import { PORTFOLIO_ALLOCATION_STORAGE_KEY } from "./localDataKeys";
export { sanitizePortfolioAllocationTarget } from "@life-os/finance-core/repo";
import { sanitizePortfolioAllocationTarget } from "@life-os/finance-core/repo";

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
