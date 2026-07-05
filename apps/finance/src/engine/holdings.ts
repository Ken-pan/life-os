import type { Account, HoldingAssetType, HoldingPosition, HoldingsSnapshot } from "../types";
import bundledSnapshotRaw from "../data/holdingsSnapshot_2026_06_01.json";
import {
  dedupeHoldingsByTicker,
  enrichHoldingPosition,
} from "./holdingsEnrich";

interface RawHolding {
  ticker?: unknown;
  securityName?: unknown;
  assetType?: unknown;
  shares?: unknown;
  marketPrice?: unknown;
  marketValue?: unknown;
  averageCostPerShare?: unknown;
  impliedCostBasis?: unknown;
  calculatedPortfolioWeightPct?: unknown;
  portfolioDiversityDisplayedPct?: unknown;
  todayReturnAmount?: unknown;
  todayReturnPct?: unknown;
  totalReturnAmount?: unknown;
  totalReturnPctDisplayed?: unknown;
  sourceCapturedAt?: unknown;
}

export interface RawSnapshotFile {
  importType?: unknown;
  asOfDate?: unknown;
  asOfTimeLocal?: unknown;
  timezone?: unknown;
  source?: {
    type?: unknown;
    description?: unknown;
    importantNote?: unknown;
  };
  accountMapping?: {
    institution?: unknown;
    accountLabel?: unknown;
    suggestedExistingAccountId?: unknown;
    needsUserConfirmation?: unknown;
  };
  holdings?: RawHolding[];
  derivedSummary?: {
    positionCount?: unknown;
    stockCount?: unknown;
    etfCount?: unknown;
    holdingsMarketValue?: unknown;
    impliedCostBasis?: unknown;
    unrealizedGain?: unknown;
    weightedTotalReturnPct?: unknown;
    todayReturnAmountApprox?: unknown;
    todayReturnPctApprox?: unknown;
  };
  reconciliation?: {
    accountTotalProvidedInThisScreenshotSet?: unknown;
  };
}

export interface ParsedHoldingsImport {
  snapshot: HoldingsSnapshot;
  warnings: string[];
}

function id(prefix: string): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rnd}`;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function asAssetType(v: unknown): HoldingAssetType {
  const t = str(v)?.toLowerCase();
  if (t === "stock" || t === "etf") return t;
  return "other";
}

export function parseHoldingsSnapshotJson(
  text: string,
  accounts: Account[]
): ParsedHoldingsImport {
  const warnings: string[] = [];
  let raw: RawSnapshotFile;
  try {
    raw = JSON.parse(text) as RawSnapshotFile;
  } catch {
    throw new Error("JSON 解析失败，请检查文件格式。");
  }
  return parseHoldingsSnapshotObject(raw, accounts, warnings);
}

export function parseHoldingsSnapshotObject(
  raw: RawSnapshotFile,
  accounts: Account[],
  presetWarnings: string[] = []
): ParsedHoldingsImport {
  const warnings = [...presetWarnings];

  if (raw.importType !== "holdings_snapshot") {
    throw new Error("导入文件不是 holdings_snapshot 类型。");
  }
  const holdings = Array.isArray(raw.holdings) ? raw.holdings : [];
  if (holdings.length === 0) {
    throw new Error("导入文件不包含任何持仓记录。");
  }

  const positions: HoldingPosition[] = dedupeHoldingsByTicker(
    holdings.map((h) => {
      const ticker = str(h.ticker) ?? "UNKNOWN";
      const shares = num(h.shares) ?? 0;
      const marketPrice = num(h.marketPrice) ?? 0;
      const marketValue = num(h.marketValue) ?? shares * marketPrice;
      if (!str(h.ticker)) warnings.push("存在缺少 ticker 的持仓，已标记为 UNKNOWN。");
      return enrichHoldingPosition({
        id: id("hpos"),
        ticker,
        securityName: str(h.securityName) ?? ticker,
        assetType: asAssetType(h.assetType),
        shares,
        marketPrice,
        marketValue,
        averageCostPerShare: num(h.averageCostPerShare),
        impliedCostBasis: num(h.impliedCostBasis),
        portfolioWeightPct: num(h.calculatedPortfolioWeightPct),
        portfolioDiversityDisplayedPct: num(h.portfolioDiversityDisplayedPct),
        todayReturnAmount: num(h.todayReturnAmount),
        todayReturnPct: num(h.todayReturnPct),
        totalReturnAmount: num(h.totalReturnAmount),
        totalReturnPctDisplayed: num(h.totalReturnPctDisplayed),
        sourceCapturedAt: str(h.sourceCapturedAt),
      });
    })
  );
  if (positions.length < holdings.length) {
    warnings.push(
      `检测到 ${holdings.length - positions.length} 条重复 ticker 持仓，已自动合并。`
    );
  }

  const summary = raw.derivedSummary;
  const map = raw.accountMapping;
  const account = findBrokerageAccountForSnapshot(accounts, map);
  const hintedAccountId = str(map?.suggestedExistingAccountId);
  if (hintedAccountId && !account) {
    warnings.push("建议账户 ID 在当前数据中未找到，导入后将保持未绑定状态。");
  }
  if (map?.needsUserConfirmation) {
    warnings.push("该文件要求用户确认账户映射，系统不会自动覆盖账户余额。");
  }
  const snapshot: HoldingsSnapshot = {
    id: id("hs"),
    accountId: account?.id,
    institution: str(map?.institution),
    accountLabel: str(map?.accountLabel) ?? account?.name ?? "Unmapped holdings snapshot",
    asOfDate: str(raw.asOfDate) ?? new Date().toISOString().slice(0, 10),
    asOfTimeLocal: str(raw.asOfTimeLocal),
    timezone: str(raw.timezone),
    importedAt: new Date().toISOString(),
    sourceType: str(raw.source?.type) ?? "manual_snapshot_import",
    sourceDescription: str(raw.source?.description),
    note: str(raw.source?.importantNote),
    needsUserConfirmation: Boolean(map?.needsUserConfirmation),
    reconciliationStatus: raw.reconciliation?.accountTotalProvidedInThisScreenshotSet ? "complete" : "incomplete",
    holdingsMarketValue:
      num(summary?.holdingsMarketValue) ??
      positions.reduce((acc, p) => acc + p.marketValue, 0),
    impliedCostBasis: num(summary?.impliedCostBasis),
    unrealizedGain: num(summary?.unrealizedGain),
    weightedTotalReturnPct: num(summary?.weightedTotalReturnPct),
    todayReturnAmountApprox: num(summary?.todayReturnAmountApprox),
    todayReturnPctApprox: num(summary?.todayReturnPctApprox),
    positionCount: num(summary?.positionCount) ?? positions.length,
    stockCount: num(summary?.stockCount),
    etfCount: num(summary?.etfCount),
    positions: positions.slice().sort((a, b) => b.marketValue - a.marketValue),
  };

  return { snapshot, warnings };
}

/** Robinhood 券商账户 ID 别名（快照 JSON / legacy 迁移 / 当前 Supabase）。 */
const ROBINHOOD_BROKERAGE_ALIASES: Record<string, string[]> = {
  "robinhood-individual-6853": ["acct-robinhood-6853", "robinhood-individual-6853"],
  "acct-robinhood-6853": ["acct-robinhood-6853", "robinhood-individual-6853"],
};

/** 解析持仓快照应绑定的 taxable brokerage 账户。 */
export function findBrokerageAccountForSnapshot(
  accounts: Account[],
  map?: RawSnapshotFile["accountMapping"]
): Account | undefined {
  const hinted = str(map?.suggestedExistingAccountId);
  const aliasIds = new Set<string>();
  if (hinted) {
    aliasIds.add(hinted);
    for (const id of ROBINHOOD_BROKERAGE_ALIASES[hinted] ?? []) aliasIds.add(id);
  }
  for (const id of aliasIds) {
    const found = accounts.find((a) => a.id === id);
    if (found) return found;
  }
  const institution = str(map?.institution)?.toLowerCase() ?? "";
  const label = str(map?.accountLabel)?.toLowerCase() ?? "";
  if (institution.includes("robinhood") || label.includes("robinhood")) {
    return accounts.find((a) => a.type === "brokerage" && /robinhood/i.test(a.name));
  }
  return undefined;
}

/** 解析快照对应的 brokerage 账户 ID（已绑定则校验，否则按机构/标签匹配）。 */
export function resolveSnapshotAccountId(
  snap: Pick<HoldingsSnapshot, "accountId" | "institution" | "accountLabel">,
  accounts: Account[]
): string | undefined {
  if (snap.accountId && accounts.some((a) => a.id === snap.accountId)) {
    return snap.accountId;
  }
  return findBrokerageAccountForSnapshot(accounts, {
    institution: snap.institution,
    accountLabel: snap.accountLabel,
    suggestedExistingAccountId: snap.accountId,
  })?.id;
}

/** 内置快照使用稳定 ID，避免重复自动加载时产生重复记录。 */
export const BUNDLED_SNAPSHOT_ID = "hs_bundled_2026_06_01";

export function createBundledRobinhoodSnapshot(accounts: Account[]): ParsedHoldingsImport {
  const parsed = parseHoldingsSnapshotObject(bundledSnapshotRaw as RawSnapshotFile, accounts);
  parsed.snapshot.id = BUNDLED_SNAPSHOT_ID;
  return parsed;
}
