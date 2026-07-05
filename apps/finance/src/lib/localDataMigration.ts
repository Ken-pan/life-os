import type { FinanceData } from "../types";
import { normalizeData } from "../store/persistence";
import {
  LEGACY_FINANCE_STORAGE_KEY,
  LIVE_PRICE_HISTORY_STORAGE_KEY,
  PORTFOLIO_ALLOCATION_STORAGE_KEY,
} from "./localDataKeys";
import {
  loadFinanceData,
  seedFinanceData,
  upsertHoldingsSnapshot,
  savePortfolioAllocationTarget,
  upsertHoldingPriceTrailPoints,
} from "./repo";
import {
  loadPortfolioAllocationTargetLocal,
  savePortfolioAllocationTargetLocal,
} from "./portfolioAllocationPrefs";

export interface LegacyLocalSummary {
  accounts: number;
  cashFlows: number;
  events: number;
  goals: number;
  holdingsSnapshots: number;
  version: number;
  updatedAt: string;
}

export interface MigrateLegacyResult {
  migrated: boolean;
  reason?: string;
  summary?: LegacyLocalSummary;
}

interface LiveHistoryPoint {
  ts: number;
  price: number;
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** 读取本机遗留的 finance_os_v1 整包（无则 null）。 */
export function readLegacyLocalFinance(): FinanceData | null {
  const ls = safeLocalStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(LEGACY_FINANCE_STORAGE_KEY);
    if (!raw) return null;
    return normalizeData(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function summarizeLegacyLocalFinance(data: FinanceData): LegacyLocalSummary {
  return {
    accounts: data.accounts.length,
    cashFlows: data.cashFlows.length,
    events: data.events.length,
    goals: data.goals.length,
    holdingsSnapshots: data.holdingsSnapshots?.length ?? 0,
    version: data.version,
    updatedAt: data.updatedAt,
  };
}

/** 迁移成功后清除本机遗留财务键（不碰主题/会话）。 */
export function clearLegacyLocalFinanceKeys(): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.removeItem(LEGACY_FINANCE_STORAGE_KEY);
    ls.removeItem(PORTFOLIO_ALLOCATION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * 将 finance_os_v1 写入 Supabase。仅应在云端尚无 user_settings 时自动调用；
 * 设置页「强制导入」需由用户确认后调用。
 */
export async function migrateLegacyLocalFinanceToCloud(
  legacy: FinanceData
): Promise<MigrateLegacyResult> {
  const summary = summarizeLegacyLocalFinance(legacy);
  await seedFinanceData(legacy);
  for (const snapshot of legacy.holdingsSnapshots ?? []) {
    await upsertHoldingsSnapshot(snapshot);
  }
  const target =
    legacy.portfolioAllocationTarget &&
    Object.values(legacy.portfolioAllocationTarget).some((v) => v != null)
      ? legacy.portfolioAllocationTarget
      : loadPortfolioAllocationTargetLocal();
  if (target && Object.values(target).some((v) => v != null)) {
    await savePortfolioAllocationTarget(target);
    savePortfolioAllocationTargetLocal(target);
  }
  clearLegacyLocalFinanceKeys();
  return { migrated: true, summary };
}

/**
 * 登录时：若云端为空且本机有遗留包，则上传并清键。
 */
export async function migrateLegacyIfCloudEmpty(): Promise<MigrateLegacyResult> {
  const legacy = readLegacyLocalFinance();
  if (!legacy) return { migrated: false, reason: "no_legacy_blob" };
  const cloud = await loadFinanceData();
  if (cloud) return { migrated: false, reason: "cloud_already_initialized" };
  return migrateLegacyLocalFinanceToCloud(legacy);
}

function loadLivePriceHistoryLocal(): Record<string, LiveHistoryPoint[]> {
  const ls = safeLocalStorage();
  if (!ls) return {};
  try {
    const raw = ls.getItem(LIVE_PRICE_HISTORY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, LiveHistoryPoint[]>;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

/** 将本机实时价轨迹尽力同步到 holding_price_trails（失败不抛，供登录后静默调用）。 */
export async function syncLivePriceHistoryToCloud(): Promise<{ pointCount: number }> {
  const history = loadLivePriceHistoryLocal();
  const pending = Object.entries(history).flatMap(([symbol, list]) =>
    (list ?? [])
      .filter((p) => Number.isFinite(p?.ts) && Number.isFinite(p?.price) && p.price > 0)
      .map((p) => ({
        symbol: symbol.trim().toUpperCase(),
        ts: p.ts,
        price: p.price,
        sourceType: "live" as const,
      }))
  );
  if (pending.length === 0) return { pointCount: 0 };
  const trimmed = pending.slice(-1200);
  await upsertHoldingPriceTrailPoints(trimmed);
  return { pointCount: trimmed.length };
}
