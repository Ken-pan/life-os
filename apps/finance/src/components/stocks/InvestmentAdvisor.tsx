import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import type { FinanceData } from "../../types";
import type { PositionRowView } from "../../engine/holdingsPortfolio";
import type { MonthlySavingCapacity } from "../../engine/metrics";
import {
  buildAdvice,
  computeSignal,
  type TechnicalSignal,
} from "../../engine/advisor";
import { fetchDailyHistories } from "../../lib/priceHistory";
import { fetchNewsForSymbols, newsSearchUrl, type NewsItem } from "../../lib/marketNews";
import { sanitizePortfolioAllocationTarget } from "../../lib/portfolioAllocationPrefs";
import { buildAdvisorBriefPrompt } from "../../lib/aiBrief";
import {
  ensureAiText,
  getCachedAiText,
  isAiDisabled,
  parseAdvisorBriefData,
  type AiText,
} from "../../lib/aiClient";
import { money, isoToCalendarLabel, redactMoneyText } from "../../format";
import { useLocale } from "../../i18n/context";

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** 模型返回的可信度可能是 0–1 或 0–100，统一成 0–100 的整数；非法值返回 null。 */
function normalizeConfidence(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const pct = raw > 0 && raw <= 1 ? raw * 100 : raw;
  return Math.min(100, Math.max(0, Math.round(pct)));
}

function timeAgo(ts: number, t: (key: string, params?: Record<string, string | number>) => string): string {
  if (!ts) return "";
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 60) return t("stocks.advisor.timeAgo.minutes", { count: Math.max(mins, 1) });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t("stocks.advisor.timeAgo.hours", { count: hours });
  return t("stocks.advisor.timeAgo.days", { count: Math.round(hours / 24) });
}

/** 简报是否已超过 24 小时未更新。 */
function isBriefStale(brief: AiText | null): boolean {
  return brief != null && Date.now() - brief.generatedAt > 24 * 60 * 60 * 1000;
}

function signalChipClass(
  signal: string,
  t: (key: string) => string
): "negative" | "warn" | "positive" | "neutral" {
  if (signal.includes(t("stocks.advisor.ai.signalNegative"))) return "negative";
  if (
    signal.includes(t("stocks.advisor.ai.signalCautious")) ||
    signal.includes(t("stocks.advisor.ai.signalStrong"))
  ) {
    return "warn";
  }
  if (signal.includes(t("stocks.advisor.ai.signalPositive"))) return "positive";
  return "neutral";
}

/**
 * 投资建议 · 规则化引擎：
 * 日线技术信号（趋势/RSI/回撤）× 目标配置偏离 × 现金日历（最佳买入日）→ 时机 + 仓位建议 + 相关新闻。
 */
export function InvestmentAdvisor({
  data,
  rows,
  totalValue,
  savingCapacity,
  tabActive,
}: {
  data: FinanceData;
  rows: PositionRowView[];
  totalValue: number;
  savingCapacity?: MonthlySavingCapacity;
  tabActive: boolean;
}) {
  const { t, locale } = useLocale();
  const privacy = data.privacy;
  const symbols = useMemo(
    () => rows.map((r) => r.position.ticker.toUpperCase()),
    [rows]
  );
  const topSymbols = useMemo(
    () =>
      rows
        .slice()
        .sort((a, b) => b.weightPct - a.weightPct)
        .slice(0, 5)
        .map((r) => r.position.ticker.toUpperCase()),
    [rows]
  );

  const [signals, setSignals] = useState<Record<string, TechnicalSignal>>({});
  const [signalsReady, setSignalsReady] = useState(false);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsReady, setNewsReady] = useState(false);
  const [newsRefreshing, setNewsRefreshing] = useState(false);
  const startedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!tabActive || symbols.length === 0) return;
    const key = symbols.join(",");
    if (startedForRef.current === key) return;
    startedForRef.current = key;
    let cancelled = false;
    void fetchDailyHistories(symbols).then((histories) => {
      if (cancelled) return;
      const next: Record<string, TechnicalSignal> = {};
      for (const [symbol, candles] of Object.entries(histories)) {
        const sig = computeSignal(symbol, candles);
        if (sig) next[symbol] = sig;
      }
      setSignals(next);
      setSignalsReady(true);
    });
    void fetchNewsForSymbols(topSymbols).then((items) => {
      if (cancelled) return;
      setNews(items);
      setNewsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [tabActive, symbols, topSymbols]);

  const signalsLoading = symbols.length > 0 && !signalsReady;
  const newsLoading = (topSymbols.length > 0 && !newsReady) || newsRefreshing;

  const refreshNews = () => {
    setNewsRefreshing(true);
    try {
      for (const s of topSymbols) localStorage.removeItem(`finance_os_market_news_v1:${s}`);
    } catch {
      /* ignore */
    }
    void fetchNewsForSymbols(topSymbols).then((items) => {
      setNews(items);
      setNewsReady(true);
      setNewsRefreshing(false);
    });
  };

  const target = useMemo(() => {
    const tgt = sanitizePortfolioAllocationTarget(data.portfolioAllocationTarget);
    return Object.values(tgt).some((v) => v != null) ? tgt : null;
  }, [data.portfolioAllocationTarget]);
  const monthlyInvestable = Math.max(
    0,
    (savingCapacity?.capacity ?? 0) * (data.assumptions.investRatio ?? 0.5)
  );

  const output = useMemo(
    () =>
      buildAdvice({
        holdings: rows.map((r) => ({
          ticker: r.position.ticker.toUpperCase(),
          weightPct: r.weightPct,
          value: r.liveValue,
          assetType: r.position.assetType,
          totalReturnAmount: r.position.totalReturnAmount,
        })),
        totalValue,
        target,
        signals,
        monthlyInvestable,
        bestDay: savingCapacity?.bestDay ?? null,
      }),
    [rows, totalValue, target, signals, monthlyInvestable, savingCapacity?.bestDay, locale]
  );

  useEffect(() => {
    setAiBrief(null);
    setAiFailed(false);
    aiStartedForRef.current = null;
  }, [locale]);

  const sortedSignals = useMemo(
    () =>
      rows
        .slice()
        .sort((a, b) => b.weightPct - a.weightPct)
        .map((r) => ({ row: r, sig: signals[r.position.ticker.toUpperCase()] }))
        .filter((x) => x.sig),
    [rows, signals]
  );

  const [aiBrief, setAiBrief] = useState<AiText | null>(() => getCachedAiText("advisor"));
  const [aiRefreshing, setAiRefreshing] = useState(false);
  const [aiFailed, setAiFailed] = useState(false);
  const [aiHidden, setAiHidden] = useState(() => isAiDisabled());
  const [isAiExpanded, setIsAiExpanded] = useState(false);
  const aiStartedForRef = useRef<string | null>(null);
  const adviceCardRef = useRef<HTMLDivElement | null>(null);

  const runAiBrief = (force: boolean) => {
    if (privacy) return;
    const prompt = buildAdvisorBriefPrompt({
      date: localToday(),
      planAmount: output.plan.amount,
      planCorePct: output.plan.corePct,
      bestDay: savingCapacity?.bestDay ?? null,
      holdings: rows
        .slice()
        .sort((a, b) => b.weightPct - a.weightPct)
        .slice(0, 8)
        .map((r) => {
          const sig = signals[r.position.ticker.toUpperCase()];
          return {
            ticker: r.position.ticker.toUpperCase(),
            weightPct: r.weightPct,
            zone: sig?.zone,
            trend: sig?.trend,
            rsi: sig?.rsi14,
          };
        }),
      advices: output.advices.map((a) => ({
        action: t(`stocks.advisor.action.${a.action}`),
        title: a.title,
      })),
      newsTitles: news.slice(0, 8).map((n) => ({ symbol: n.symbol, title: n.title })),
    }, locale);
    setAiRefreshing(true);
    void ensureAiText({ kind: "advisor", ...prompt, force }).then((result) => {
      setAiRefreshing(false);
      if (isAiDisabled()) {
        setAiHidden(true);
        return;
      }
      if (result) {
        setAiBrief(result);
        setAiFailed(false);
      } else {
        setAiFailed(true);
      }
    });
  };
  const aiReady = signalsReady && newsReady;
  const aiKey = symbols.join(",");
  useEffect(() => {
    if (privacy) return;
    if (aiHidden || !aiReady || aiStartedForRef.current === aiKey) return;
    aiStartedForRef.current = aiKey;
    const timer = setTimeout(() => runAiBrief(false), 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [privacy, aiHidden, aiReady, aiKey, locale]);

  const briefData = aiBrief ? parseAdvisorBriefData(aiBrief.text) : null;
  const confidence = normalizeConfidence(briefData?.confidenceScore);
  const isStale = isBriefStale(aiBrief);

  if (rows.length === 0) return null;

  return (
    <section className="grid gap-3">
      <h2 className="portfolio-layer-title">{t("stocks.advisor.layerTitle")}</h2>

      <div className="card advisor-plan">
        <div className="card-head">
          <h3>{t("stocks.advisor.plan.title")}</h3>
          {savingCapacity?.bestDay && (
            <span className="tag">
              {t("stocks.advisor.plan.bestBuyDay", {
                date: isoToCalendarLabel(savingCapacity.bestDay),
              })}
            </span>
          )}
        </div>
        <div className="advisor-plan-row">
          <div className="advisor-plan-amount">
            <span className="label">{t("stocks.advisor.plan.monthlyInvestable")}</span>
            <span className="value">{money(output.plan.amount, privacy)}</span>
          </div>
          <div className="advisor-plan-split">
            <span className="label">{t("stocks.advisor.plan.suggestedSplit")}</span>
            <span className="value">
              {t("stocks.advisor.plan.splitTemplate", {
                corePct: output.plan.corePct,
                flexPct: 100 - output.plan.corePct,
              })}
            </span>
          </div>
        </div>
        {output.plan.notes.map((n, i) => (
          <p key={i} className={`muted-note ${i === 0 ? "mt-2" : "mt-1"}`}>
            {n}
          </p>
        ))}
      </div>

      {!privacy && !aiHidden && (aiBrief || aiRefreshing || aiFailed) && (
        <div className="card ai-signal-brief">
          <div className="ai-header">
            <div className="ai-header-left">
              <div className="ai-icon-container">
                <Sparkles size={14} aria-hidden="true" />
              </div>
              <span className="ai-title">{t("stocks.advisor.ai.title")}</span>
              <div className="ai-meta">
                {aiBrief && (
                  <span>
                    {t("stocks.advisor.ai.updatedAgo", { time: timeAgo(aiBrief.generatedAt, t) })}
                  </span>
                )}
                {confidence != null && (
                  <span className="ai-confidence">
                    {t("stocks.advisor.ai.confidence", { pct: confidence })}
                  </span>
                )}
                {isStale && <span className="ai-confidence is-stale">{t("stocks.advisor.ai.stale")}</span>}
              </div>
            </div>
            <div className="ai-header-actions">
              <button
                className="ai-btn-icon"
                onClick={() => setIsAiExpanded(!isAiExpanded)}
                aria-label={t("stocks.advisor.ai.explainAria")}
                title={t("stocks.advisor.ai.explainTitle")}
              >
                {t("stocks.advisor.ai.explain")}
              </button>
              <button
                className="ai-btn-icon"
                onClick={() => runAiBrief(true)}
                disabled={aiRefreshing}
                aria-label={t("stocks.advisor.ai.refreshAria")}
                title={t("stocks.advisor.ai.refreshTitle")}
              >
                <RefreshCw size={13} className={aiRefreshing ? "ai-brief-spin" : undefined} />
              </button>
            </div>
          </div>

          {isAiExpanded && (
            <div className="ai-explain">
              <span className="ai-hero-eyebrow">{t("stocks.advisor.ai.mechanismEyebrow")}</span>
              <span className="ai-explain-body">
                {t("stocks.advisor.ai.mechanismBody")
                  .split("\n")
                  .map((line, i, lines) => (
                    <span key={i}>
                      {line}
                      {i < lines.length - 1 ? <br /> : null}
                    </span>
                  ))}
              </span>
            </div>
          )}

          {!briefData && aiRefreshing ? (
            <div className="ai-signals">
              <div className="ai-signal-row ai-loading-row"></div>
              <div className="ai-signal-row ai-loading-row" style={{ animationDelay: "200ms" }}></div>
              <div className="ai-signal-row ai-loading-row" style={{ animationDelay: "400ms" }}></div>
            </div>
          ) : briefData ? (
            <>
              {briefData.heroConclusion && (
                <div className="ai-hero">
                  <span className="ai-hero-eyebrow">{t("stocks.advisor.ai.todayJudgment")}</span>
                  <span className="ai-hero-title">{briefData.heroConclusion.title}</span>
                  <span className="ai-hero-reason">{briefData.heroConclusion.reason}</span>
                </div>
              )}

              {briefData.signals && briefData.signals.length > 0 && (
                <div className="ai-signals">
                  {briefData.signals.map((sig, i) => {
                    const color = signalChipClass(sig.signal, t);
                    return (
                      <div className="ai-signal-row" key={i}>
                        <span className="ai-ticker">{sig.ticker}</span>
                        <div>
                          <span className={`ai-signal-chip ${color}`}>{sig.signal}</span>
                        </div>
                        <span className="ai-signal-reason">{sig.reason}</span>
                        <span className="ai-signal-action">{sig.action}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {briefData.suggestedActions && briefData.suggestedActions.length > 0 && (
                <div className="ai-actions">
                  {briefData.suggestedActions.map((action, i) => (
                    <div className="ai-action-item" key={i}>
                      <strong>[{action.type}]</strong> {action.text}
                    </div>
                  ))}
                  <div className="ai-buttons">
                    {output.advices.length > 0 && (
                      <button
                        className="btn outline compact"
                        onClick={() =>
                          adviceCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                        }
                      >
                        {t("stocks.advisor.ai.viewAdjustments")}
                      </button>
                    )}
                    <button className="btn ghost compact" onClick={() => setIsAiExpanded(!isAiExpanded)}>
                      {isAiExpanded
                        ? t("stocks.advisor.ai.collapseExplain")
                        : t("stocks.advisor.ai.expandExplain")}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="ai-hero">
              <span className="ai-hero-reason text-muted">{t("stocks.advisor.ai.fallback")}</span>
            </div>
          )}

          <div className="ai-footer">
            {t("stocks.advisor.ai.footer")
              .split("\n")
              .map((line, i, lines) => (
                <span key={i}>
                  {line}
                  {i < lines.length - 1 ? <br /> : null}
                </span>
              ))}
          </div>
        </div>
      )}

      {output.advices.length > 0 && (
        <div className="card" ref={adviceCardRef}>
          <h3 className="mb-2-5">{t("stocks.advisor.adjustments.title")}</h3>
          <div className="advisor-advice-list">
            {output.advices.map((a, i) => (
              <div key={i} className={`advisor-advice advisor-${a.action}`}>
                <div className="advisor-advice-head">
                  <span className={`tag advisor-tag-${a.action}`}>
                    {t(`stocks.advisor.action.${a.action}`)}
                  </span>
                  <span className="advisor-advice-title">{a.title}</span>
                </div>
                <p className="advisor-advice-detail">{redactMoneyText(a.detail, privacy)}</p>
                <p className="advisor-advice-timing">
                  <strong>{t("stocks.advisor.adjustments.timing")}</strong>
                  {a.timing}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <details className="card stocks-secondary-tools">
        <summary>
          {t("stocks.advisor.signals.title")}
          <span className="tag inline-meta">
            {signalsLoading ? t("stocks.advisor.signals.computing") : t("stocks.advisor.signals.reference")}
          </span>
        </summary>
        {sortedSignals.length === 0 && !signalsLoading ? (
          <p className="muted-note">{t("stocks.advisor.signals.unavailable")}</p>
        ) : (
          <div className="advisor-signal-list">
            {sortedSignals.map(({ row, sig }) => (
              <div key={row.position.id} className="advisor-signal">
                <div className="advisor-signal-main">
                  <span className="advisor-signal-ticker">{row.position.ticker}</span>
                  <span className={`tag advisor-zone-${sig!.zone}`}>
                    {t(`stocks.advisor.zone.${sig!.zone}`)}
                  </span>
                  <span className={`advisor-trend advisor-trend-${sig!.trend}`}>
                    {t(`stocks.advisor.trend.${sig!.trend}`)}
                  </span>
                </div>
                <div className="advisor-signal-metrics">
                  {sig!.rsi14 != null && (
                    <span>{t("stocks.advisor.signals.rsi", { value: sig!.rsi14.toFixed(0) })}</span>
                  )}
                  {sig!.drawdownPct != null && (
                    <span>
                      {t("stocks.advisor.signals.drawdownFromHigh", {
                        pct: (sig!.drawdownPct * 100).toFixed(0),
                      })}
                    </span>
                  )}
                  <span className="text-muted">{sig!.reasons[0] ?? t("stocks.advisor.signals.noSignal")}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="muted-note mt-2-5">{t("stocks.advisor.signals.footnote")}</p>
      </details>

      <details className="card stocks-secondary-tools">
        <summary>
          {t("stocks.advisor.news.title")}
          <span className="tag inline-meta">
            {news.length > 0
              ? t("stocks.advisor.news.count", { count: news.length })
              : t("stocks.advisor.news.reference")}
          </span>
        </summary>
        <div className="stocks-refresh-actions mt-2">
          <button
            className="icon-btn"
            onClick={refreshNews}
            disabled={newsLoading}
            aria-label={t("stocks.advisor.news.refreshAria")}
          >
            <RefreshCw size={14} strokeWidth={2} />
            {newsLoading ? t("stocks.advisor.news.refreshing") : t("stocks.advisor.news.refresh")}
          </button>
        </div>
        {news.length === 0 ? (
          <div>
            <p className="muted-note mb-2">
              {newsLoading ? t("stocks.advisor.news.loading") : t("stocks.advisor.news.unavailable")}
            </p>
            {!newsLoading && (
              <div className="advisor-news-fallback">
                {topSymbols.map((s) => (
                  <a key={s} className="tag" href={newsSearchUrl(s)} target="_blank" rel="noreferrer">
                    {t("stocks.advisor.news.searchLink", { symbol: s })}
                  </a>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="advisor-news-list">
            {news.slice(0, 10).map((n) => (
              <a
                key={n.link}
                className="advisor-news-item"
                href={n.link}
                target="_blank"
                rel="noreferrer"
              >
                <span className="advisor-news-symbol tag">{n.symbol}</span>
                <span className="advisor-news-title">{n.title}</span>
                <span className="advisor-news-meta text-muted">
                  {[n.source, timeAgo(n.publishedTs, t)].filter(Boolean).join(" · ")}
                </span>
              </a>
            ))}
          </div>
        )}
      </details>

      <p className="muted-note">{t("stocks.advisor.disclaimer")}</p>
    </section>
  );
}
