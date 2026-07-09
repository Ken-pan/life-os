import type { Account, HoldingPosition, HoldingsSnapshot } from "../types.js";
import type { LiveQuote } from "../quotes/types.js";
import { dedupeHoldingsByTicker, enrichHoldingPosition } from "./holdingsEnrich";

export type HoldingsSort = "weight" | "return-desc" | "return-asc" | "name";

export interface PositionRowView {
  position: HoldingPosition;
  weightPct: number;
  snapshotValue: number;
  livePrice: number;
  liveValue: number;
  valueDelta: number;
  priceDelta: number;
  hasLiveQuote: boolean;
  pricePath: number[];
  pathSampleCount: number;
  pathMin: number;
  pathMax: number;
  pathSpanPct: number;
  pathStartPrice: number;
  pathEndPrice: number;
}

export interface PriceTrailPoint {
  ts: number;
  price: number;
  source: "snapshot" | "live";
}

export interface AllocationMetrics {
  top1Ticker: string;
  top1Pct: number;
  top3Pct: number;
  stockValue: number;
  etfValue: number;
  stockPct: number;
  etfPct: number;
}

export interface LivePortfolioTotals {
  liveTotal: number;
  snapshotTotal: number;
  totalDelta: number;
}

export function sortedSnapshots(snapshots: HoldingsSnapshot[]): HoldingsSnapshot[] {
  return snapshots
    .slice()
    .sort((a, b) =>
      `${b.asOfDate}T${b.asOfTimeLocal ?? "00:00"}`.localeCompare(
        `${a.asOfDate}T${a.asOfTimeLocal ?? "00:00"}`
      )
    );
}

export function buildPositionRows(
  snapshot: HoldingsSnapshot,
  quotes: Record<string, LiveQuote>,
  pathsBySymbol?: Record<string, PriceTrailPoint[]>
): PositionRowView[] {
  const base = Math.max(snapshot.holdingsMarketValue, 1);
  const positions = dedupeHoldingsByTicker(snapshot.positions);
  return positions.map((position) => {
    const quote = quotes[position.ticker];
    const livePrice = quote?.price ?? position.marketPrice;
    const liveValue = position.shares * livePrice;
    const enriched = enrichHoldingPosition({
      ...position,
      marketPrice: livePrice,
      marketValue: liveValue,
    });
    const snapshotValue = position.marketValue;
    const weightPct =
      position.portfolioWeightPct ??
      position.portfolioDiversityDisplayedPct ??
      (snapshotValue / base) * 100;
    const rawPath = pathsBySymbol?.[position.ticker] ?? [];
    const mergedPath = buildMergedPricePath(position, livePrice, rawPath);
    const pathMin = Math.min(...mergedPath);
    const pathMax = Math.max(...mergedPath);
    const pathStartPrice = mergedPath[0];
    const pathEndPrice = mergedPath[mergedPath.length - 1];
    const baseForPct = pathStartPrice > 0 ? pathStartPrice : 1;
    const pathSpanPct = ((pathMax - pathMin) / baseForPct) * 100;
    return {
      position: enriched,
      weightPct,
      snapshotValue,
      livePrice,
      liveValue,
      valueDelta: liveValue - snapshotValue,
      priceDelta: livePrice - position.marketPrice,
      hasLiveQuote: Boolean(quote),
      pricePath: mergedPath,
      pathSampleCount: mergedPath.length,
      pathMin,
      pathMax,
      pathSpanPct,
      pathStartPrice,
      pathEndPrice,
    };
  });
}

function buildMergedPricePath(
  position: HoldingPosition,
  livePrice: number,
  trail: PriceTrailPoint[]
): number[] {
  const cost = position.averageCostPerShare ?? position.marketPrice * 0.92;
  const normalizedTrail = trail
    .filter((point) => Number.isFinite(point.price) && point.price > 0 && Number.isFinite(point.ts))
    .slice()
    .sort((a, b) => a.ts - b.ts);
  const sequence = [
    cost,
    ...normalizedTrail.map((point) => point.price),
    position.marketPrice,
    livePrice,
  ].filter((value) => Number.isFinite(value) && value > 0);
  // 去重相邻重复值，降低无意义平线噪音。
  const deduped: number[] = [];
  for (const value of sequence) {
    const prev = deduped[deduped.length - 1];
    if (prev == null || Math.abs(prev - value) > 1e-8) deduped.push(value);
  }
  return deduped.length > 1 ? deduped : [position.marketPrice, livePrice].filter((x) => x > 0);
}

export function sortPositionRows(rows: PositionRowView[], sort: HoldingsSort): PositionRowView[] {
  const next = rows.slice();
  if (sort === "weight") {
    next.sort((a, b) => b.weightPct - a.weightPct || a.position.ticker.localeCompare(b.position.ticker));
  } else if (sort === "return-desc") {
    next.sort(
      (a, b) =>
        (b.position.totalReturnAmount ?? -Infinity) - (a.position.totalReturnAmount ?? -Infinity) ||
        b.weightPct - a.weightPct
    );
  } else if (sort === "return-asc") {
    next.sort(
      (a, b) =>
        (a.position.totalReturnAmount ?? Infinity) - (b.position.totalReturnAmount ?? Infinity) ||
        b.weightPct - a.weightPct
    );
  } else {
    next.sort((a, b) => a.position.ticker.localeCompare(b.position.ticker, "en"));
  }
  return next;
}

export function computeAllocation(rows: PositionRowView[]): AllocationMetrics {
  const total = rows.reduce((sum, r) => sum + r.snapshotValue, 0) || 1;
  const sorted = rows.slice().sort((a, b) => b.snapshotValue - a.snapshotValue);
  const top1 = sorted[0];
  const top3Value = sorted.slice(0, 3).reduce((sum, r) => sum + r.snapshotValue, 0);
  const stockValue = rows
    .filter((r) => r.position.assetType === "stock")
    .reduce((sum, r) => sum + r.snapshotValue, 0);
  const etfValue = rows
    .filter((r) => r.position.assetType === "etf")
    .reduce((sum, r) => sum + r.snapshotValue, 0);
  return {
    top1Ticker: top1?.position.ticker ?? "--",
    top1Pct: ((top1?.snapshotValue ?? 0) / total) * 100,
    top3Pct: (top3Value / total) * 100,
    stockValue,
    etfValue,
    stockPct: (stockValue / total) * 100,
    etfPct: (etfValue / total) * 100,
  };
}

/** 单份快照上的配置切面，用于跨快照趋势。 */
export interface AllocationTrendPoint {
  snapshotId: string;
  ts: number;
  dateLabel: string;
  stockPct: number;
  etfPct: number;
  top1Pct: number;
  top3Pct: number;
}

/**
 * 跨快照配置趋势：每份快照的个股/ETF 占比与集中度，按时间升序。
 * 回答「我的配置在改善还是恶化」，只有 1 份快照时由调用方渲染空状态。
 */
export function computeAllocationTrend(snapshots: HoldingsSnapshot[]): AllocationTrendPoint[] {
  const points: AllocationTrendPoint[] = [];
  for (const snapshot of snapshots) {
    const ts = Date.parse(snapshot.asOfDate);
    if (!Number.isFinite(ts)) continue;
    const values = snapshot.positions
      .map((p) => ({ value: Math.max(0, p.marketValue), assetType: p.assetType }))
      .filter((p) => p.value > 0);
    const total = values.reduce((sum, p) => sum + p.value, 0);
    if (total <= 0) continue;
    const sorted = values.slice().sort((a, b) => b.value - a.value);
    const top3Value = sorted.slice(0, 3).reduce((sum, p) => sum + p.value, 0);
    const stockValue = values
      .filter((p) => p.assetType === "stock")
      .reduce((sum, p) => sum + p.value, 0);
    const etfValue = values
      .filter((p) => p.assetType === "etf")
      .reduce((sum, p) => sum + p.value, 0);
    const [, month, day] = snapshot.asOfDate.split("-");
    points.push({
      snapshotId: snapshot.id,
      ts,
      dateLabel: month && day ? `${Number(month)}/${Number(day)}` : snapshot.asOfDate,
      stockPct: (stockValue / total) * 100,
      etfPct: (etfValue / total) * 100,
      top1Pct: ((sorted[0]?.value ?? 0) / total) * 100,
      top3Pct: (top3Value / total) * 100,
    });
  }
  return points.sort((a, b) => a.ts - b.ts);
}

export function computeLiveTotals(
  rows: PositionRowView[],
  snapshotTotal: number
): LivePortfolioTotals {
  const liveTotal = rows.reduce((sum, r) => sum + r.liveValue, 0);
  return {
    liveTotal,
    snapshotTotal,
    totalDelta: liveTotal - snapshotTotal,
  };
}

/** 投资资产口径：应税证券快照 + 设置里录入的 401(k)/HSA 等账户余额。 */
export interface InvestedScopeTotals {
  taxableSecurities: number;
  taxableCostBasis?: number;
  retirementBalance: number;
  hsaBalance: number;
  lockedBalance: number;
  totalInvested: number;
}

export function computeInvestedScopeTotals(
  taxableSecurities: number,
  accounts: Account[],
  taxableCostBasis?: number
): InvestedScopeTotals {
  let retirementBalance = 0;
  let hsaBalance = 0;
  for (const a of accounts) {
    const bal = Math.max(0, Number(a.balance) || 0);
    if (a.type === "retirement") retirementBalance += bal;
    else if (a.type === "hsa") hsaBalance += bal;
  }
  const lockedBalance = retirementBalance + hsaBalance;
  return {
    taxableSecurities,
    taxableCostBasis,
    retirementBalance,
    hsaBalance,
    lockedBalance,
    totalInvested: taxableSecurities + lockedBalance,
  };
}

export function snapshotAsOfLabel(snapshot: HoldingsSnapshot): string {
  const date = snapshot.asOfDate;
  const time = snapshot.asOfTimeLocal?.trim();
  return time ? `${date} · ${time} ET` : date;
}

export interface SnapshotDiffRow {
  ticker: string;
  securityName: string;
  olderValue: number;
  newerValue: number;
  valueDelta: number;
  status: "both" | "new-only" | "removed";
}

export interface SnapshotCompareResult {
  olderLabel: string;
  newerLabel: string;
  olderTotal: number;
  newerTotal: number;
  totalDelta: number;
  rows: SnapshotDiffRow[];
}

export function compareSnapshots(
  older: HoldingsSnapshot,
  newer: HoldingsSnapshot
): SnapshotCompareResult {
  const olderByTicker = new Map(older.positions.map((p) => [p.ticker, p]));
  const newerByTicker = new Map(newer.positions.map((p) => [p.ticker, p]));
  const tickers = [...new Set([...olderByTicker.keys(), ...newerByTicker.keys()])].sort((a, b) =>
    a.localeCompare(b, "en")
  );

  const rows: SnapshotDiffRow[] = tickers.map((ticker) => {
    const o = olderByTicker.get(ticker);
    const n = newerByTicker.get(ticker);
    const olderValue = o?.marketValue ?? 0;
    const newerValue = n?.marketValue ?? 0;
    let status: SnapshotDiffRow["status"] = "both";
    if (!o) status = "new-only";
    else if (!n) status = "removed";
    return {
      ticker,
      securityName: n?.securityName ?? o?.securityName ?? ticker,
      olderValue,
      newerValue,
      valueDelta: newerValue - olderValue,
      status,
    };
  });

  rows.sort((a, b) => Math.abs(b.valueDelta) - Math.abs(a.valueDelta));

  const olderTotal = older.holdingsMarketValue;
  const newerTotal = newer.holdingsMarketValue;
  return {
    olderLabel: snapshotAsOfLabel(older),
    newerLabel: snapshotAsOfLabel(newer),
    olderTotal,
    newerTotal,
    totalDelta: newerTotal - olderTotal,
    rows,
  };
}
