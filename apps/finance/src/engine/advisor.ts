// 投资建议引擎 —— 纯函数集合。
// 输入：日线收盘序列（来自 Stooq 历史行情）+ 当前持仓权重 + 目标配置 + 现金日历（最佳操作日）。
// 输出：每只标的的技术信号（趋势 / RSI / 距 52 周高点回撤）与规则化的仓位调整建议。
//
// 设计原则：
// 1. 全部是透明可解释的规则（均线、RSI、集中度上限），不做黑盒预测；
// 2. 建议永远带理由（reasons）与时机（timing），并与「最佳存钱日」联动；
// 3. 输出仅供参考，UI 侧必须展示免责声明。

import { t } from "../i18n/translate";
import type { PortfolioAllocationTarget } from "../types";

export interface DailyCandle {
  date: string; // YYYY-MM-DD
  close: number;
}

export type TrendState = "up" | "down" | "flat";
export type SignalZone = "buy" | "neutral" | "trim";

export interface TechnicalSignal {
  symbol: string;
  lastClose: number;
  lastDate: string;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  high52w: number | null;
  low52w: number | null;
  /** 距 52 周高点的回撤（≤0，-0.18 = 回撤 18%）。 */
  drawdownPct: number | null;
  trend: TrendState;
  zone: SignalZone;
  reasons: string[];
}

/** 简单移动平均；数据不足返回 null。 */
export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

/** Wilder RSI(14)；数据不足返回 null。 */
export function rsi(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * 从日线序列计算单只标的的技术信号。
 * candles 需按日期升序；少于 30 根时只输出价格，不给趋势结论。
 */
export function computeSignal(symbol: string, candles: DailyCandle[]): TechnicalSignal | null {
  const clean = candles
    .filter((c) => Number.isFinite(c.close) && c.close > 0)
    .slice(-320);
  if (clean.length === 0) return null;
  const closes = clean.map((c) => c.close);
  const last = clean[clean.length - 1];
  const year = closes.slice(-252);
  const high52w = year.length >= 30 ? Math.max(...year) : null;
  const low52w = year.length >= 30 ? Math.min(...year) : null;
  const sig: TechnicalSignal = {
    symbol,
    lastClose: last.close,
    lastDate: last.date,
    sma20: sma(closes, 20),
    sma50: sma(closes, 50),
    sma200: sma(closes, 200),
    rsi14: rsi(closes, 14),
    high52w,
    low52w,
    drawdownPct: high52w ? last.close / high52w - 1 : null,
    trend: "flat",
    zone: "neutral",
    reasons: [],
  };

  if (sig.sma50 != null) {
    const above50 = last.close >= sig.sma50;
    const bull200 = sig.sma200 == null || sig.sma50 >= sig.sma200;
    if (above50 && bull200) sig.trend = "up";
    else if (!above50 && !bull200) sig.trend = "down";
    else sig.trend = "flat";
  }

  const reasons: string[] = [];
  const r = sig.rsi14;
  const dd = sig.drawdownPct;

  if (r != null && r <= 32) {
    sig.zone = "buy";
    reasons.push(t("stocks.advisor.signal.rsiOversold", { rsi: r.toFixed(0) }));
  } else if (dd != null && dd <= -0.15 && (r == null || r <= 45)) {
    sig.zone = "buy";
    reasons.push(
      t("stocks.advisor.signal.drawdownFromHigh", { pct: Math.abs(dd * 100).toFixed(0) })
    );
  }

  if (sig.zone === "neutral") {
    const hot50 = sig.sma50 != null && last.close / sig.sma50 - 1 >= 0.15;
    if (r != null && r >= 70) {
      sig.zone = "trim";
      reasons.push(t("stocks.advisor.signal.rsiOverbought", { rsi: r.toFixed(0) }));
    } else if (hot50) {
      sig.zone = "trim";
      reasons.push(
        t("stocks.advisor.signal.aboveSma50", {
          pct: (((last.close / sig.sma50!) - 1) * 100).toFixed(0),
        })
      );
    }
  }

  if (sig.trend === "up") reasons.push(t("stocks.advisor.signal.trendUp"));
  else if (sig.trend === "down") reasons.push(t("stocks.advisor.signal.trendDown"));

  sig.reasons = reasons;
  return sig;
}

// ---------------------------------------------------------------------------
// 仓位建议
// ---------------------------------------------------------------------------

export interface AdvisorHolding {
  ticker: string;
  /** 组合权重（0-100）。 */
  weightPct: number;
  /** 当前市值。 */
  value: number;
  assetType: string; // "stock" | "etf" | ...
  /** 累计浮盈（正=有未实现收益，卖出有税务影响）。 */
  totalReturnAmount?: number;
}

export type AdviceAction = "trim" | "add" | "watch" | "hold";

export interface PositionAdvice {
  ticker: string | null; // null = 组合级建议
  action: AdviceAction;
  title: string;
  detail: string;
  /** 什么时候做。 */
  timing: string;
  amount?: number;
  urgency: "high" | "medium" | "low";
}

export interface MonthlyInvestPlan {
  /** 本月建议投入总额（≥0）。 */
  amount: number;
  /** 建议执行日（= 最佳存钱日，发薪后）。 */
  day: string | null;
  /** 拆分：指数核心优先。 */
  corePct: number;
  notes: string[];
}

export interface AdvisorInput {
  holdings: AdvisorHolding[];
  totalValue: number;
  target?: PortfolioAllocationTarget | null;
  signals: Record<string, TechnicalSignal>;
  /** 本月可用于投资的金额（可存金额 × 投资比例）。 */
  monthlyInvestable: number;
  /** 最佳操作日（发薪后现金最充裕的一天）。 */
  bestDay: string | null;
}

export interface AdvisorOutput {
  plan: MonthlyInvestPlan;
  advices: PositionAdvice[];
}

const DEFAULT_TOP1_CAP = 25;

function fmtDay(iso: string | null): string {
  if (!iso) return t("stocks.advisor.rules.nextPayday");
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[2])}/${Number(m[3])}`;
}

function fmtMoney(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** 组合层面的月度投入计划 + 按持仓的调仓建议。 */
export function buildAdvice(input: AdvisorInput): AdvisorOutput {
  const { holdings, totalValue, target, signals, monthlyInvestable, bestDay } = input;
  const advices: PositionAdvice[] = [];
  const top1Cap = target?.top1MaxPct ?? DEFAULT_TOP1_CAP;
  const etfPct = holdings
    .filter((h) => h.assetType.toLowerCase() === "etf")
    .reduce((s, h) => s + h.weightPct, 0);
  const etfTarget = target?.etfPct ?? null;
  const dayLabel = fmtDay(bestDay);

  const over = holdings
    .filter((h) => h.weightPct > top1Cap + 1)
    .sort((a, b) => b.weightPct - a.weightPct);
  for (const h of over) {
    const excess = ((h.weightPct - top1Cap) / 100) * totalValue;
    const sig = signals[h.ticker];
    const fallbackReason = t("stocks.advisor.rules.momentumStrong");
    let timing: string;
    if (sig?.zone === "trim") {
      timing = t("stocks.advisor.rules.trimTimingHot", {
        ticker: h.ticker,
        reason: sig.reasons[0] ?? fallbackReason,
      });
    } else if (sig?.zone === "buy") {
      timing = t("stocks.advisor.rules.trimTimingPullback", { ticker: h.ticker });
    } else {
      timing = t("stocks.advisor.rules.trimTimingNeutral", { day: dayLabel });
    }
    const taxNote =
      (h.totalReturnAmount ?? 0) > 0 ? t("stocks.advisor.rules.trimTaxNote") : "";
    advices.push({
      ticker: h.ticker,
      action: "trim",
      title: t("stocks.advisor.rules.trimTitle", {
        ticker: h.ticker,
        pct: h.weightPct.toFixed(1),
        cap: top1Cap,
      }),
      detail: t("stocks.advisor.rules.trimDetail", {
        amount: fmtMoney(excess),
        taxNote,
      }),
      timing,
      amount: Math.round(excess),
      urgency: h.weightPct > top1Cap + 10 ? "high" : "medium",
    });
  }

  if (etfTarget != null && etfPct < etfTarget - 2) {
    const gap = ((etfTarget - etfPct) / 100) * totalValue;
    advices.push({
      ticker: null,
      action: "add",
      title: t("stocks.advisor.rules.etfLowTitle", {
        current: etfPct.toFixed(0),
        target: etfTarget,
      }),
      detail: t("stocks.advisor.rules.etfLowDetail", { gap: fmtMoney(gap) }),
      timing: t("stocks.advisor.rules.etfLowTiming", { day: dayLabel }),
      amount: Math.round(gap),
      urgency: "medium",
    });
  } else if (etfTarget == null && etfPct < 30 && holdings.length > 0) {
    advices.push({
      ticker: null,
      action: "add",
      title: t("stocks.advisor.rules.etfDefaultTitle", { current: etfPct.toFixed(0) }),
      detail: t("stocks.advisor.rules.etfDefaultDetail"),
      timing: t("stocks.advisor.rules.etfDefaultTiming", { day: dayLabel }),
      urgency: "medium",
    });
  }

  for (const h of holdings) {
    if (h.weightPct > top1Cap + 1) continue;
    const sig = signals[h.ticker];
    if (!sig) continue;
    if (sig.zone === "buy") {
      advices.push({
        ticker: h.ticker,
        action: "watch",
        title: t("stocks.advisor.rules.watchBuyTitle", {
          ticker: h.ticker,
          reason: sig.reasons[0] ?? t("stocks.advisor.rules.oversold"),
        }),
        detail: t("stocks.advisor.rules.watchBuyDetail"),
        timing: t("stocks.advisor.rules.watchBuyTiming", { day: dayLabel }),
        urgency: "low",
      });
    } else if (sig.zone === "trim" && h.weightPct >= top1Cap * 0.7) {
      advices.push({
        ticker: h.ticker,
        action: "watch",
        title: t("stocks.advisor.rules.watchTrimTitle", {
          ticker: h.ticker,
          reason: sig.reasons[0] ?? t("stocks.advisor.rules.overbought"),
        }),
        detail: t("stocks.advisor.rules.watchTrimDetail"),
        timing: t("stocks.advisor.rules.watchTrimTiming"),
        urgency: "low",
      });
    }
  }

  const amount = Math.max(0, Math.round(monthlyInvestable));
  const corePct = etfTarget != null ? Math.min(100, Math.max(50, Math.round(etfTarget))) : 70;
  const notes: string[] = [];
  if (amount > 0) {
    notes.push(t("stocks.advisor.rules.planNoteInvest", { corePct }));
  } else {
    notes.push(t("stocks.advisor.rules.planNoteNoInvest"));
  }
  if (over.length > 0) {
    notes.push(
      t("stocks.advisor.rules.planNotePauseOverweight", {
        tickers: over.map((h) => h.ticker).join(t("stocks.advisor.rules.tickerSeparator")),
      })
    );
  }

  const order: Record<AdviceAction, number> = { trim: 0, add: 1, watch: 2, hold: 3 };
  const urgencyOrder = { high: 0, medium: 1, low: 2 } as const;
  advices.sort(
    (a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency] || order[a.action] - order[b.action]
  );

  return {
    plan: { amount, day: bestDay, corePct, notes },
    advices,
  };
}
