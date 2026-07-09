import { t } from "../i18n/translate.js";
import type {
  Account,
  AccountFundAllocation,
  AccountUnderlyingSlice,
  HoldingsSnapshot,
  PortfolioAllocationTarget,
} from "../types.js";
import type { AllocationMetrics } from "./holdingsPortfolio";

export function refModelText(id: string, field: string): string {
  return t(`stocks.refModel.${id}.${field}`);
}

export type MaintenanceTier = "veryLow" | "low" | "medium" | "high";
export type VolatilityTierKey = "high" | "mediumHigh" | "medium" | "low";

export function refModelMaintenanceTier(tier: MaintenanceTier): string {
  return t(`stocks.refModelTier.maintenance.${tier}`);
}

export function refModelVolatilityTier(tier: VolatilityTierKey): string {
  return t(`stocks.refModelTier.volatility.${tier}`);
}

export type { PortfolioAllocationTarget };

export function sanitizeFundAllocations(
  raw: AccountFundAllocation[] | null | undefined
): AccountFundAllocation[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: AccountFundAllocation[] = [];
  for (const row of raw) {
    const ticker = String(row.ticker ?? "")
      .trim()
      .toUpperCase();
    const weightPct = Number(row.weightPct);
    if (!ticker || !Number.isFinite(weightPct) || weightPct <= 0) continue;
    const assetClass = row.assetClass;
    const cls: AccountFundAllocation["assetClass"] =
      assetClass === "bond" || assetClass === "cash" || assetClass === "other"
        ? assetClass
        : "equity";
    out.push({
      ticker,
      securityName: row.securityName?.trim() || undefined,
      weightPct: Math.min(100, weightPct),
      assetClass: cls,
      asOfDate: row.asOfDate?.trim() || undefined,
    });
  }
  return out.length > 0 ? out : undefined;
}

export function sanitizeUnderlyingAllocation(
  raw: AccountUnderlyingSlice[] | null | undefined
): AccountUnderlyingSlice[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: AccountUnderlyingSlice[] = [];
  for (const row of raw) {
    const weightPct = Number(row.weightPct);
    if (!Number.isFinite(weightPct) || weightPct <= 0) continue;
    const assetClass = row.assetClass;
    const cls: AccountUnderlyingSlice["assetClass"] =
      assetClass === "bond" || assetClass === "cash" || assetClass === "other"
        ? assetClass
        : "equity";
    out.push({
      id: String(row.id ?? row.label ?? "slice").trim() || `slice-${out.length}`,
      label: String(row.label ?? row.id ?? "—").trim(),
      weightPct: Math.min(100, weightPct),
      assetClass: cls,
      sourceTicker: row.sourceTicker?.trim().toUpperCase() || undefined,
      valueUsd: Number.isFinite(Number(row.valueUsd)) ? Number(row.valueUsd) : undefined,
    });
  }
  return out.length > 0 ? out : undefined;
}

function rollupAllocationWeights(
  slices: { weightPct: number; assetClass: AccountUnderlyingSlice["assetClass"] }[]
): { equityPct: number; bondPct: number; cashPct: number; otherPct: number } {
  let equityPct = 0;
  let bondPct = 0;
  let cashPct = 0;
  let otherPct = 0;
  for (const s of slices) {
    if (s.assetClass === "bond") bondPct += s.weightPct;
    else if (s.assetClass === "cash") cashPct += s.weightPct;
    else if (s.assetClass === "other") otherPct += s.weightPct;
    else equityPct += s.weightPct;
  }
  return { equityPct, bondPct, cashPct, otherPct };
}

function dollarsFromWeights(balance: number, w: ReturnType<typeof rollupAllocationWeights>) {
  return {
    equity: (balance * w.equityPct) / 100,
    bond: (balance * w.bondPct) / 100,
    cash: (balance * w.cashPct) / 100,
    other: (balance * w.otherPct) / 100,
  };
}

export interface RetirementFundSummary {
  accountId: string;
  accountName: string;
  balance: number;
  funds: AccountFundAllocation[];
  underlying: AccountUnderlyingSlice[];
  equityPct: number;
  bondPct: number;
  cashPct: number;
  otherPct: number;
}

export interface BlendedAssetBreakdown {
  totalInvested: number;
  equityPct: number;
  bondPct: number;
  cashPct: number;
  taxableValue: number;
  lockedValue: number;
  retirementSummaries: RetirementFundSummary[];
}

export function buildBlendedAssetBreakdown(
  taxableSecurities: number,
  accounts: Account[]
): BlendedAssetBreakdown {
  const retirementSummaries: RetirementFundSummary[] = [];
  let lockedValue = 0;
  let equityDollars = taxableSecurities;
  let bondDollars = 0;
  let cashDollars = 0;

  for (const account of accounts) {
    if (account.type !== "retirement" && account.type !== "hsa") continue;
    const balance = Math.max(0, Number(account.balance) || 0);
    if (balance <= 0) continue;
    lockedValue += balance;
    const funds = account.fundAllocations ?? [];
    const underlying = account.underlyingAllocation;

    let weights: ReturnType<typeof rollupAllocationWeights>;
    if (underlying?.length) {
      weights = rollupAllocationWeights(underlying);
    } else if (funds.length) {
      weights = rollupAllocationWeights(funds);
    } else {
      equityDollars += balance;
      retirementSummaries.push({
        accountId: account.id,
        accountName: account.name,
        balance,
        funds,
        underlying: [],
        equityPct: 100,
        bondPct: 0,
        cashPct: 0,
        otherPct: 0,
      });
      continue;
    }

    const dollars = dollarsFromWeights(balance, weights);
    equityDollars += dollars.equity + dollars.other;
    bondDollars += dollars.bond;
    cashDollars += dollars.cash;

    retirementSummaries.push({
      accountId: account.id,
      accountName: account.name,
      balance,
      funds,
      underlying: underlying ?? [],
      equityPct: weights.equityPct,
      bondPct: weights.bondPct,
      cashPct: weights.cashPct,
      otherPct: weights.otherPct,
    });
  }

  const totalInvested = taxableSecurities + lockedValue;
  const denom = totalInvested > 0 ? totalInvested : 1;
  return {
    totalInvested,
    equityPct: (equityDollars / denom) * 100,
    bondPct: (bondDollars / denom) * 100,
    cashPct: (cashDollars / denom) * 100,
    taxableValue: taxableSecurities,
    lockedValue,
    retirementSummaries,
  };
}

export type DriftReviewState = "ok" | "review" | "unset";

export interface AllocationDriftRow {
  key: string;
  label: string;
  currentPct: number;
  targetPct: number | null;
  driftPct: number | null;
  state: DriftReviewState;
  hint?: string;
}

export interface PortfolioClassification {
  label: string;
  detail: string;
  coreSatelliteNote?: string;
}

export interface PortfolioConfidenceItem {
  id: string;
  label: string;
  complete: boolean;
}

export interface PortfolioConfidenceReport {
  complete: boolean;
  items: PortfolioConfidenceItem[];
  summary: string;
}

export type ReferenceModelTier = "core" | "advanced";

export interface ReferenceModelAllocation {
  equityPct: number;
  bondPct: number;
  cashPct: number;
}

export interface ReferenceModel {
  id: string;
  tier: ReferenceModelTier;
  typical: ReferenceModelAllocation;
  maintenance: MaintenanceTier;
  volatility: VolatilityTierKey;
  /** When true, `refModelText(id, "typicalNotes")` supplies model-specific allocation notes. */
  hasTypicalNotes?: boolean;
}

export interface ModelComparisonRow {
  metric: string;
  yours: string;
  model: string;
  gap: string;
}

const DEFAULT_DRIFT_THRESHOLD = 5;

export const REFERENCE_MODELS: ReferenceModel[] = [
  {
    id: "custom",
    tier: "core",
    typical: { equityPct: 0, bondPct: 0, cashPct: 0 },
    maintenance: "low",
    volatility: "medium",
    hasTypicalNotes: true,
  },
  {
    id: "100-equity",
    tier: "core",
    typical: { equityPct: 100, bondPct: 0, cashPct: 0 },
    maintenance: "low",
    volatility: "high",
  },
  {
    id: "80-20",
    tier: "core",
    typical: { equityPct: 80, bondPct: 20, cashPct: 0 },
    maintenance: "low",
    volatility: "mediumHigh",
  },
  {
    id: "60-40",
    tier: "core",
    typical: { equityPct: 60, bondPct: 40, cashPct: 0 },
    maintenance: "low",
    volatility: "medium",
  },
  {
    id: "three-fund",
    tier: "core",
    typical: { equityPct: 80, bondPct: 20, cashPct: 0 },
    maintenance: "low",
    volatility: "mediumHigh",
    hasTypicalNotes: true,
  },
  {
    id: "couch-potato",
    tier: "core",
    typical: { equityPct: 50, bondPct: 50, cashPct: 0 },
    maintenance: "veryLow",
    volatility: "medium",
  },
  {
    id: "core-satellite",
    tier: "core",
    typical: { equityPct: 70, bondPct: 20, cashPct: 10 },
    maintenance: "low",
    volatility: "mediumHigh",
    hasTypicalNotes: true,
  },
  {
    id: "target-date",
    tier: "advanced",
    typical: { equityPct: 70, bondPct: 25, cashPct: 5 },
    maintenance: "veryLow",
    volatility: "medium",
    hasTypicalNotes: true,
  },
  {
    id: "all-weather",
    tier: "advanced",
    typical: { equityPct: 30, bondPct: 55, cashPct: 15 },
    maintenance: "high",
    volatility: "medium",
    hasTypicalNotes: true,
  },
  {
    id: "permanent",
    tier: "advanced",
    typical: { equityPct: 25, bondPct: 25, cashPct: 25 },
    maintenance: "low",
    volatility: "low",
    hasTypicalNotes: true,
  },
  {
    id: "factor-tilt",
    tier: "advanced",
    typical: { equityPct: 85, bondPct: 15, cashPct: 0 },
    maintenance: "medium",
    volatility: "mediumHigh",
  },
];

export const CORE_REFERENCE_MODELS = REFERENCE_MODELS.filter((m) => m.tier === "core");
export const ADVANCED_REFERENCE_MODELS = REFERENCE_MODELS.filter((m) => m.tier === "advanced");

export function classifyPortfolio(allocation: AllocationMetrics): PortfolioClassification {
  const { stockPct, etfPct, top1Pct, top1Ticker } = allocation;
  if (etfPct >= 40 && top1Pct < 15) {
    return {
      label: t("stocks.classify.indexCore.label"),
      detail: t("stocks.classify.indexCore.detail"),
    };
  }
  if (stockPct >= 70 && top1Pct >= 25) {
    return {
      label: t("stocks.classify.concentratedStock.label"),
      detail: t("stocks.classify.concentratedStock.detail"),
      coreSatelliteNote:
        etfPct > 0
          ? t("stocks.classify.concentratedStock.coreSatelliteNote", {
              stockPct: stockPct.toFixed(0),
              etfPct: etfPct.toFixed(0),
            })
          : undefined,
    };
  }
  if (stockPct >= 50 && etfPct >= 10) {
    return {
      label: t("stocks.classify.hybrid.label"),
      detail: t("stocks.classify.hybrid.detail"),
      coreSatelliteNote: t("stocks.classify.hybrid.coreSatelliteNote", {
        ticker: top1Ticker,
        pct: top1Pct.toFixed(1),
      }),
    };
  }
  return {
    label: t("stocks.classify.insufficientData.label"),
    detail: t("stocks.classify.insufficientData.detail"),
  };
}

function driftStateForTarget(
  current: number,
  target: number,
  threshold: number,
  mode: "match" | "max"
): DriftReviewState {
  if (mode === "max") return current > target ? "review" : "ok";
  return Math.abs(current - target) >= threshold ? "review" : "ok";
}

export function computeAllocationDrift(
  allocation: AllocationMetrics,
  target: PortfolioAllocationTarget
): AllocationDriftRow[] {
  const threshold = target.driftThresholdPct ?? DEFAULT_DRIFT_THRESHOLD;

  const rows: AllocationDriftRow[] = [];

  const push = (
    key: string,
    label: string,
    currentPct: number,
    targetPct: number | undefined,
    mode: "match" | "max",
    hint?: string
  ) => {
    const hasTarget = targetPct != null && Number.isFinite(targetPct);
    const driftPct = hasTarget ? (mode === "max" ? currentPct - targetPct! : currentPct - targetPct!) : null;
    let state: DriftReviewState = "unset";
    if (hasTarget) {
      if (mode === "max") {
        state = currentPct > targetPct! ? "review" : "ok";
      } else {
        state = driftStateForTarget(currentPct, targetPct, threshold, "match");
      }
    }
    rows.push({
      key,
      label,
      currentPct,
      targetPct: hasTarget ? targetPct! : null,
      driftPct,
      state,
      hint,
    });
  };

  push("stock", t("stocks.drift.stock"), allocation.stockPct, target.stockPct, "match");
  push("etf", t("stocks.drift.etf"), allocation.etfPct, target.etfPct, "match");
  push(
    "top1",
    t("stocks.drift.top1", { ticker: allocation.top1Ticker }),
    allocation.top1Pct,
    target.top1MaxPct,
    "max",
    t("stocks.drift.top1Hint")
  );
  push("top3", t("stocks.drift.top3"), allocation.top3Pct, target.top3MaxPct, "max");

  return rows;
}

function hasRetirementFundData(account: Account): boolean {
  return (
    (account.underlyingAllocation?.length ?? 0) > 0 ||
    (account.fundAllocations?.length ?? 0) > 0 ||
    /allocation-import:\s*yes/i.test(account.note ?? "")
  );
}

export function buildPortfolioConfidence(
  accounts: Account[],
  snapshots: HoldingsSnapshot[],
  activeSnapshot: HoldingsSnapshot | null
): PortfolioConfidenceReport {
  const hasBrokerageSnapshot = snapshots.length > 0 && Boolean(activeSnapshot);
  const retirementAccounts = accounts.filter((a) => a.type === "retirement");
  const hsaAccounts = accounts.filter((a) => a.type === "hsa");
  const hasRetirementHoldings = retirementAccounts.some((a) => (a.balance ?? 0) > 0);
  const hasHsaHoldings = hsaAccounts.some((a) => (a.balance ?? 0) > 0);

  const hasRetirementAllocation =
    hasRetirementHoldings && retirementAccounts.some(hasRetirementFundData);

  const items: PortfolioConfidenceItem[] = [
    {
      id: "brokerage",
      label: hasBrokerageSnapshot
        ? t("stocks.confidence.brokerageAvailable", {
            broker: activeSnapshot?.accountLabel ?? t("stocks.confidence.brokerageDefault"),
          })
        : t("stocks.confidence.brokerageMissing"),
      complete: hasBrokerageSnapshot,
    },
    {
      id: "retirement",
      label: hasRetirementAllocation
        ? t("stocks.confidence.retirementImported")
        : hasRetirementHoldings
          ? t("stocks.confidence.retirementBalanceOnly")
          : t("stocks.confidence.retirementMissing"),
      complete: hasRetirementAllocation,
    },
    {
      id: "hsa",
      label: hasHsaHoldings
        ? t("stocks.confidence.hsaRecorded")
        : t("stocks.confidence.hsaMissing"),
      complete: hasHsaHoldings,
    },
    {
      id: "bond-cash",
      label:
        retirementAccounts.some((a) => (a.fundAllocations?.length ?? 0) > 0) ||
        hsaAccounts.some((a) => (a.fundAllocations?.length ?? 0) > 0)
          ? t("stocks.confidence.bondCashPartial")
          : t("stocks.confidence.bondCashMissing"),
      complete: retirementAccounts.some((a) => {
        const u = a.underlyingAllocation ?? [];
        if (u.length) return u.some((s) => s.assetClass === "bond" || s.assetClass === "cash");
        return (a.fundAllocations ?? []).some((f) => f.assetClass === "bond" || f.assetClass === "cash");
      }),
    },
  ];

  const complete = hasBrokerageSnapshot;
  const missing = items.filter((i) => !i.complete).length;
  const summary = complete
    ? missing > 0
      ? t("stocks.confidence.summaryIncomplete", { missing })
      : hasRetirementAllocation
        ? t("stocks.confidence.summaryCompleteWithRetirement")
        : t("stocks.confidence.summaryCompleteWithoutRetirement")
    : t("stocks.confidence.summaryNoSnapshot");

  return { complete, items, summary };
}

export function compareToReferenceModel(
  allocation: AllocationMetrics,
  model: ReferenceModel
): ModelComparisonRow[] {
  const equityExposure = allocation.stockPct + allocation.etfPct;
  const { typical } = model;
  if (model.id === "custom") {
    return [
      {
        metric: t("stocks.compare.equityExposureCustom"),
        yours: `${equityExposure.toFixed(1)}%`,
        model: t("stocks.compare.setByYou"),
        gap: t("stocks.compare.emDash"),
      },
      {
        metric: t("stocks.compare.top1Custom"),
        yours: `${allocation.top1Pct.toFixed(1)}%`,
        model: t("stocks.compare.setByYou"),
        gap: t("stocks.compare.emDash"),
      },
    ];
  }
  const equityGap = equityExposure - typical.equityPct;
  const rows: ModelComparisonRow[] = [
    {
      metric: t("stocks.compare.equityExposureSnapshot"),
      yours: `${equityExposure.toFixed(1)}%`,
      model: t("stocks.compare.equityModelAbout", { pct: typical.equityPct }),
      gap: t("stocks.compare.gapSigned", {
        sign: equityGap >= 0 ? "+" : "",
        pct: equityGap.toFixed(1),
      }),
    },
    {
      metric: t("stocks.compare.bondsNotInSnapshot"),
      yours: t("stocks.compare.bondsYoursNotImported"),
      model: t("stocks.compare.bondsModelAbout", { pct: typical.bondPct }),
      gap: typical.bondPct > 0 ? t("stocks.compare.bondsGapNeedsAccounts") : t("stocks.compare.emDash"),
    },
    {
      metric: t("stocks.compare.top1Holdings"),
      yours: t("stocks.compare.yoursTop1", {
        ticker: allocation.top1Ticker,
        pct: allocation.top1Pct.toFixed(1),
      }),
      model:
        model.id === "core-satellite"
          ? t("stocks.compare.modelSatelliteCap")
          : t("stocks.compare.modelBroadDiversified"),
      gap:
        allocation.top1Pct > 20
          ? t("stocks.compare.gapAboveTypical")
          : allocation.top1Pct <= 15
            ? t("stocks.compare.gapNearTypical")
            : t("stocks.compare.gapModerate"),
    },
  ];
  if (model.hasTypicalNotes) {
    rows.push({
      metric: t("stocks.compare.notesMetric"),
      yours: t("stocks.compare.emDash"),
      model: refModelText(model.id, "typicalNotes"),
      gap: t("stocks.compare.emDash"),
    });
  }
  return rows;
}

export function buildTargetFromReferenceModel(
  model: ReferenceModel,
  current: PortfolioAllocationTarget = {}
): PortfolioAllocationTarget | null {
  if (model.id === "custom") return null;
  const next: PortfolioAllocationTarget = {
    ...current,
    top1MaxPct: current.top1MaxPct ?? 20,
    top3MaxPct: current.top3MaxPct ?? 45,
    driftThresholdPct: current.driftThresholdPct ?? DEFAULT_DRIFT_THRESHOLD,
  };
  if (model.id === "core-satellite") {
    next.etfPct = 50;
    next.stockPct = 35;
  } else if (model.typical.equityPct > 0) {
    next.etfPct = Math.round(model.typical.equityPct * 0.55);
    next.stockPct = Math.round(model.typical.equityPct * 0.45);
  }
  return next;
}

export interface RebalanceSuggestion {
  method: "contributions" | "cash" | "sell";
  title: string;
  description: string;
  priority: number;
  collapsed?: boolean;
}

export interface PortfolioStickySummary {
  stanceLabel: string;
  top3Pct: number;
  targetLabel: string;
  coverageLabel: string;
  needsAccounts: boolean;
}

export function buildPortfolioStickySummary(
  allocation: AllocationMetrics,
  classification: PortfolioClassification,
  hasAnyTarget: boolean,
  reviewCount: number,
  confidence: PortfolioConfidenceReport,
  accounts: Account[]
): PortfolioStickySummary {
  const hasRetirement = accounts.some((a) => a.type === "retirement");
  const hasHsa = accounts.some((a) => a.type === "hsa");
  const missingRetirement =
    !hasRetirement ||
    !hasHsa ||
    confidence.items.some((i) => (i.id === "retirement" || i.id === "hsa") && !i.complete);
  let targetLabel = t("stocks.stickySummary.targetNotSet");
  if (hasAnyTarget) {
    targetLabel =
      reviewCount > 0
        ? t("stocks.stickySummary.targetDriftCount", { count: reviewCount })
        : t("stocks.stickySummary.targetInRange");
  }
  const coverageLabel = confidence.complete
    ? missingRetirement
      ? t("stocks.stickySummary.coveragePendingAccounts")
      : t("stocks.stickySummary.coverageRobinhood")
    : t("stocks.stickySummary.coverageIncomplete");
  return {
    stanceLabel: classification.label,
    top3Pct: allocation.top3Pct,
    targetLabel,
    coverageLabel,
    needsAccounts: missingRetirement,
  };
}

export function buildRebalanceSuggestions(
  driftRows: AllocationDriftRow[],
  unrealizedGain?: number
): RebalanceSuggestion[] {
  const needsReview = driftRows.filter((r) => r.state === "review");
  const hasTargets = driftRows.some((r) => r.targetPct != null);
  const reviewHint =
    needsReview.length > 0
      ? t("stocks.rebalance.reviewHint", { count: needsReview.length })
      : hasTargets
        ? t("stocks.rebalance.reviewHintInRange")
        : t("stocks.rebalance.reviewHintNoTarget");

  const taxNote =
    unrealizedGain != null && unrealizedGain > 1000
      ? t("stocks.rebalance.taxNote", {
          amount: Math.round(unrealizedGain).toLocaleString("en-US"),
        })
      : undefined;

  return [
    {
      method: "contributions",
      title: t("stocks.rebalance.contributions.title"),
      description: t("stocks.rebalance.contributions.description", { reviewHint }),
      priority: 1,
    },
    {
      method: "cash",
      title: t("stocks.rebalance.cash.title"),
      description: t("stocks.rebalance.cash.description"),
      priority: 2,
    },
    {
      method: "sell",
      title: t("stocks.rebalance.sell.title"),
      description: t("stocks.rebalance.sell.description", {
        taxNote: taxNote ?? t("stocks.rebalance.taxNotModeled"),
      }),
      priority: 3,
      collapsed: true,
    },
  ];
}

/* ===== 主题/行业集中度 =====
 * ticker 层集中度会低估真实风险：TSLA + NVDA + MSFT 本质是同一个科技/AI 主题。
 * 静态映射覆盖常见持仓；未覆盖的归「未分类」，宁可少归类也不猜。 */

const THEME_TECH_AI = "techAi";
const THEME_BROAD_INDEX = "broadIndex";
const THEME_BOND_CASH = "bondCash";
const THEME_UNCLASSIFIED = "unclassified";

function themeLabel(themeKey: string): string {
  return t(`stocks.theme.${themeKey}`);
}

const TICKER_THEMES: Record<string, string> = {
  // 大型科技 / AI / 半导体
  TSLA: THEME_TECH_AI,
  MSFT: THEME_TECH_AI,
  GOOGL: THEME_TECH_AI,
  GOOG: THEME_TECH_AI,
  AAPL: THEME_TECH_AI,
  AMZN: THEME_TECH_AI,
  META: THEME_TECH_AI,
  NVDA: THEME_TECH_AI,
  AMD: THEME_TECH_AI,
  ORCL: THEME_TECH_AI,
  AVGO: THEME_TECH_AI,
  TSM: THEME_TECH_AI,
  CRM: THEME_TECH_AI,
  NFLX: THEME_TECH_AI,
  PLTR: THEME_TECH_AI,
  QQQ: THEME_TECH_AI,
  // 宽基指数
  VOO: THEME_BROAD_INDEX,
  VTI: THEME_BROAD_INDEX,
  SPY: THEME_BROAD_INDEX,
  IVV: THEME_BROAD_INDEX,
  VT: THEME_BROAD_INDEX,
  VXUS: THEME_BROAD_INDEX,
  SCHB: THEME_BROAD_INDEX,
  ITOT: THEME_BROAD_INDEX,
  // 债券 / 现金等价
  BND: THEME_BOND_CASH,
  AGG: THEME_BOND_CASH,
  SGOV: THEME_BOND_CASH,
  BIL: THEME_BOND_CASH,
  SHV: THEME_BOND_CASH,
  VGIT: THEME_BOND_CASH,
  FDRXX: THEME_BOND_CASH,
};

function isNamedTheme(themeKey: string): boolean {
  return themeKey !== THEME_UNCLASSIFIED;
}

export interface ThemeHoldingInput {
  ticker: string;
  value: number;
}

export interface ThemeGroup {
  theme: string;
  pct: number;
  tickers: string[];
}

export interface ThemeConcentration {
  groups: ThemeGroup[];
  /** 占比最大的具名主题（不含「未分类」）。 */
  topTheme: ThemeGroup | null;
  /** 主题集中度显著高于单一持仓口径时的提示文案。 */
  note: string | null;
}

export function computeThemeConcentration(holdings: ThemeHoldingInput[]): ThemeConcentration {
  const byTheme = new Map<string, { value: number; tickers: string[] }>();
  let total = 0;
  for (const h of holdings) {
    const value = Math.max(0, h.value);
    if (value <= 0) continue;
    const ticker = h.ticker.trim().toUpperCase();
    const theme = TICKER_THEMES[ticker] ?? THEME_UNCLASSIFIED;
    total += value;
    const entry = byTheme.get(theme) ?? { value: 0, tickers: [] };
    entry.value += value;
    entry.tickers.push(ticker);
    byTheme.set(theme, entry);
  }
  if (total <= 0) return { groups: [], topTheme: null, note: null };

  const sortedEntries = [...byTheme.entries()]
    .map(([themeKey, entry]) => ({
      themeKey,
      theme: themeLabel(themeKey),
      pct: (entry.value / total) * 100,
      tickers: entry.tickers,
    }))
    .sort((a, b) => b.pct - a.pct);

  const groups: ThemeGroup[] = sortedEntries.map(({ theme, pct, tickers }) => ({
    theme,
    pct,
    tickers,
  }));

  const topEntry = sortedEntries.find((e) => isNamedTheme(e.themeKey)) ?? null;
  const topTheme = topEntry
    ? { theme: topEntry.theme, pct: topEntry.pct, tickers: topEntry.tickers }
    : null;

  let note: string | null = null;
  if (topTheme && topTheme.tickers.length >= 2 && topTheme.pct >= 50) {
    const listed = topTheme.tickers
      .slice(0, 3)
      .join(t("stocks.theme.noteTickersSeparator"));
    const suffix =
      topTheme.tickers.length > 3
        ? t("stocks.theme.noteSuffix", { count: topTheme.tickers.length })
        : "";
    note = t("stocks.theme.note", {
      tickers: listed,
      suffix,
      theme: topTheme.theme,
      pct: topTheme.pct.toFixed(0),
    });
  }

  return { groups, topTheme, note };
}
