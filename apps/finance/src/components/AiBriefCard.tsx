import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { quoteSafeToSpend } from "../copy/terminology";
import { useLocale } from "../i18n/context";
import { RefreshCw, Sparkles } from "lucide-react";
import type { FinanceData } from "../types";
import type { Dashboard } from "../hooks/useDashboard";
import { useTransactions } from "../store/transactions";
import { useTimeline } from "../store/timeline";
import { spendingOf } from "../engine/transactions";
import { budgetProgress, plannedMonthlyBudget } from "../engine/budget";
import { buildTodayBriefPrompt, type TodayBriefFacts } from "../lib/aiBrief";
import {
  ensureAiText,
  getCachedAiText,
  isAiDisabled,
  parseBriefSections,
  type AiText,
  type BriefSections,
} from "../lib/aiClient";

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

const SECTION_KEYS: Array<{ key: keyof BriefSections; labelKey: string }> = [
  { key: "risk", labelKey: "aiBrief.sectionRisk" },
  { key: "suggest", labelKey: "aiBrief.sectionSuggest" },
  { key: "anomaly", labelKey: "aiBrief.sectionAnomaly" },
];

/**
 * AI 今日简报：后台生成的当日风险 / 建议 / 异常摘要。
 * 有缓存先展示缓存（stale-while-revalidate），生成过程不阻塞任何交互。
 */
export function AiBriefCard({ data, dashboard }: { data: FinanceData; dashboard: Dashboard }) {
  const { t, locale } = useLocale();
  const { txns } = useTransactions();
  const timeline = useTimeline();
  const today = localToday();

  const generatedAgo = (ts: number): string => {
    const mins = Math.round((Date.now() - ts) / 60000);
    if (mins < 2) return t("aiBrief.justNow");
    if (mins < 60) return t("aiBrief.minutesAgo", { mins });
    const hours = Math.round(mins / 60);
    if (hours < 24) return t("aiBrief.hoursAgo", { hours });
    return t("aiBrief.daysAgo", { days: Math.round(hours / 24) });
  };

  const facts = useMemo<TodayBriefFacts>(() => {
    const budget = plannedMonthlyBudget(data.cashFlows);
    const progress = budgetProgress(txns, budget, today);

    const horizon = new Date(`${today}T00:00:00`);
    horizon.setDate(horizon.getDate() + 14);
    const horizonTs = horizon.getTime();
    const upcomingBills = dashboard.outlook.events
      .filter((e) => e.amount < 0 && e.ts <= horizonTs && e.affectsBalance !== false)
      .slice(0, 6)
      .map((e) => ({ date: e.date, label: e.label, amount: e.amount }));

    const month = today.slice(0, 7);
    const byCat = new Map<string, number>();
    for (const txn of txns) {
      if (txn.month !== month || txn.date > today) continue;
      const s = spendingOf(txn);
      if (s <= 0) continue;
      byCat.set(txn.category, (byCat.get(txn.category) ?? 0) + s);
    }
    const topCategories = [...byCat.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category, amount]) => ({ category, amount }));

    return {
      date: today,
      safeToSpend: dashboard.derived.safeToSpend,
      savingCapacity: dashboard.derived.savingCapacity.capacity,
      savingBestDay: dashboard.derived.savingCapacity.bestDay,
      budget: {
        budget: progress.budget,
        spent: progress.spent,
        todaySpend: progress.todaySpend,
        dailyAllowance: progress.dailyAllowance,
        daysLeft: progress.daysLeft,
        pace: progress.pace,
      },
      upcomingBills,
      pendingCount: timeline.actionable.length,
      topCategories,
    };
  }, [data.cashFlows, txns, today, dashboard.outlook.events, dashboard.derived, timeline.actionable.length]);

  const [brief, setBrief] = useState<AiText | null>(() => getCachedAiText("today"));
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hidden, setHidden] = useState(() => isAiDisabled());
  const factsRef = useRef(facts);
  useEffect(() => {
    factsRef.current = facts;
  }, [facts]);

  const runGenerate = useCallback((force: boolean) => {
    if (data.privacy) return;
    const prompt = buildTodayBriefPrompt(factsRef.current, locale);
    setRefreshing(true);
    void ensureAiText({ kind: "today", ...prompt, force }).then((result) => {
      setRefreshing(false);
      if (isAiDisabled()) {
        setHidden(true);
        return;
      }
      if (result) {
        setBrief(result);
        setFailed(false);
      } else {
        setFailed(true);
      }
    });
  }, [data.privacy, locale]);

  useEffect(() => {
    setBrief(null);
    setFailed(false);
  }, [locale]);

  useEffect(() => {
    if (data.privacy) return;
    if (hidden) return;
    const timer = setTimeout(() => runGenerate(false), 3000);
    return () => clearTimeout(timer);
  }, [data.privacy, hidden, locale, runGenerate]);

  if (data.privacy) return null;
  if (hidden) return null;
  if (!brief && !refreshing && !failed) return null;

  const sections = brief ? parseBriefSections(brief.text) : null;
  const visibleSections = sections
    ? SECTION_KEYS.filter(({ key }) => sections[key]?.trim())
    : [];

  return (
    <div className="card ai-brief">
      <div className="card-head">
        <h3 className="ai-brief-title">
          <Sparkles size={15} aria-hidden="true" />
          {t("aiBrief.title")}
        </h3>
        <div className="ai-brief-meta">
          {brief && <span className="text-muted">{generatedAgo(brief.generatedAt)}</span>}
          <button
            className="icon-btn ai-brief-refresh"
            onClick={() => runGenerate(true)}
            disabled={refreshing}
            aria-label={refreshing ? t("aiBrief.generating") : t("aiBrief.regenerate")}
            title={refreshing ? t("aiBrief.generating") : t("aiBrief.refresh")}
          >
            <RefreshCw size={14} className={refreshing ? "ai-brief-spin" : undefined} />
          </button>
        </div>
      </div>

      {visibleSections.length > 0 ? (
        <div className="ai-brief-sections">
          {visibleSections.map(({ key, labelKey }) => (
            <div key={key} className="ai-brief-section">
              <span className="ai-brief-section-label">{t(labelKey)}</span>
              <p className="ai-brief-section-body">{sections![key]}</p>
            </div>
          ))}
        </div>
      ) : refreshing ? (
        <div className="ai-brief-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ) : (
        <p className="muted-note">{t("aiBrief.failed")}</p>
      )}

      <p className="ai-brief-foot text-muted">
        {t("aiBrief.footnote", { safeToSpend: quoteSafeToSpend() })}
      </p>
    </div>
  );
}
