import type { HoldingPosition } from "../types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 由当日涨跌幅反推当日盈亏金额：gain = V × p / (100 + p)。 */
export function deriveTodayReturnAmount(
  marketValue: number,
  todayReturnPct: number | undefined
): number | undefined {
  if (
    todayReturnPct == null ||
    !Number.isFinite(todayReturnPct) ||
    !Number.isFinite(marketValue) ||
    marketValue <= 0
  ) {
    return undefined;
  }
  return round2((marketValue * todayReturnPct) / (100 + todayReturnPct));
}

/** 由均价与现价估算累计浮动盈亏。 */
export function deriveTotalReturnAmount(position: {
  shares: number;
  marketPrice: number;
  averageCostPerShare?: number;
}): number | undefined {
  const cost = position.averageCostPerShare;
  if (cost == null || !Number.isFinite(cost) || cost <= 0) return undefined;
  if (!Number.isFinite(position.shares) || !Number.isFinite(position.marketPrice)) return undefined;
  return round2((position.marketPrice - cost) * position.shares);
}

function positionFieldScore(p: HoldingPosition): number {
  let score = 0;
  if (p.averageCostPerShare != null) score += 4;
  if (p.totalReturnAmount != null) score += 2;
  if (p.todayReturnAmount != null) score += 2;
  if (p.todayReturnPct != null) score += 1;
  if (p.impliedCostBasis != null) score += 1;
  return score;
}

function mergeHoldingPair(a: HoldingPosition, b: HoldingPosition): HoldingPosition {
  const primary = positionFieldScore(b) > positionFieldScore(a) ? b : a;
  const secondary = primary === a ? b : a;
  return {
    ...primary,
    securityName: primary.securityName || secondary.securityName,
    shares: primary.shares > 0 ? primary.shares : secondary.shares,
    marketPrice: primary.marketPrice > 0 ? primary.marketPrice : secondary.marketPrice,
    marketValue: primary.marketValue > 0 ? primary.marketValue : secondary.marketValue,
    averageCostPerShare: primary.averageCostPerShare ?? secondary.averageCostPerShare,
    impliedCostBasis: primary.impliedCostBasis ?? secondary.impliedCostBasis,
    portfolioWeightPct: primary.portfolioWeightPct ?? secondary.portfolioWeightPct,
    portfolioDiversityDisplayedPct:
      primary.portfolioDiversityDisplayedPct ?? secondary.portfolioDiversityDisplayedPct,
    todayReturnAmount: primary.todayReturnAmount ?? secondary.todayReturnAmount,
    todayReturnPct: primary.todayReturnPct ?? secondary.todayReturnPct,
    totalReturnAmount: primary.totalReturnAmount ?? secondary.totalReturnAmount,
    totalReturnPctDisplayed:
      primary.totalReturnPctDisplayed ?? secondary.totalReturnPctDisplayed,
    sourceCapturedAt: primary.sourceCapturedAt ?? secondary.sourceCapturedAt,
  };
}

/** 同 ticker 重复持仓合并（扩展双 DOM / 历史脏数据）。 */
export function dedupeHoldingsByTicker(positions: HoldingPosition[]): HoldingPosition[] {
  const byTicker = new Map<string, HoldingPosition>();
  for (const position of positions) {
    const key = position.ticker.trim().toUpperCase();
    if (!key) continue;
    const prev = byTicker.get(key);
    byTicker.set(key, prev ? mergeHoldingPair(prev, position) : position);
  }
  return [...byTicker.values()];
}

/** 补齐可由其它字段推导的盈亏金额。 */
export function enrichHoldingPosition(position: HoldingPosition): HoldingPosition {
  const todayReturnAmount =
    position.todayReturnAmount ??
    deriveTodayReturnAmount(position.marketValue, position.todayReturnPct);
  const totalReturnAmount =
    position.totalReturnAmount ?? deriveTotalReturnAmount(position);
  const impliedCostBasis =
    position.impliedCostBasis ??
    (position.averageCostPerShare != null
      ? round2(position.averageCostPerShare * position.shares)
      : undefined);
  return {
    ...position,
    todayReturnAmount,
    totalReturnAmount,
    impliedCostBasis,
  };
}
