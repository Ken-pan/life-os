import { useMemo, useState } from "react";
import type { FinanceData } from "../types";
import { useTransactions } from "../store/transactions";
import { budgetProgress, dailySpendSeries, plannedMonthlyBudget } from "../engine/budget";
import { useLocale } from "../i18n/context";
import { money } from "../format";

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/**
 * 预算脉搏：本月预算进度 + 今日已花 + 近 7 日每日花销。
 * 预算基准 = 「记录 → 固定收支」里的月度支出计划（年度项 /12）。
 */
export function BudgetPulseCard({
  data,
  onQuickAdd,
  compact = false,
}: {
  data: FinanceData;
  onQuickAdd?: () => void;
  /** 默认收起近 7 日柱图，首屏只保留本月/今日指标。 */
  compact?: boolean;
}) {
  const { t } = useLocale();
  const privacy = data.privacy;
  const { txns } = useTransactions();
  const today = localToday();
  const [showWeekChart, setShowWeekChart] = useState(!compact);

  const budget = useMemo(() => plannedMonthlyBudget(data.cashFlows), [data.cashFlows]);
  const progress = useMemo(() => budgetProgress(txns, budget, today), [txns, budget, today]);
  const days = useMemo(() => dailySpendSeries(txns, today, 7), [txns, today]);
  const maxDay = Math.max(1, ...days.map((d) => Math.abs(d.amount)));

  const paceKey = progress.pace;
  const paceLabel =
    paceKey === "under"
      ? t("budget.paceUnder")
      : paceKey === "on"
        ? t("budget.paceOn")
        : t("budget.paceOver");
  const paceCls =
    paceKey === "under"
      ? "budget-pace-under"
      : paceKey === "on"
        ? "budget-pace-on"
        : "budget-pace-over";
  const pctWidth = Math.min(100, Math.max(0, progress.spentRatio * 100));

  return (
    <div className="card budget-pulse">
      <div className="card-head">
        <h3>{t("budget.title")}</h3>
        {onQuickAdd && (
          <button className="icon-btn primary budget-pulse-log-btn" onClick={onQuickAdd}>
            {t("budget.logTxn")}
          </button>
        )}
      </div>

      <div className="budget-pulse-top">
        <div className="budget-pulse-spent">
          <span className="label">{t("budget.spentMonth")}</span>
          <span className="value records-metric">{money(progress.spent, privacy)}</span>
          {budget > 0 && (
            <span className="sub">
              {t("budget.budgetLine", { amount: money(budget, privacy), pace: paceLabel })}
            </span>
          )}
        </div>
        <div className="budget-pulse-today">
          <span className="label">{t("budget.todaySpent")}</span>
          <span className="value records-metric">{money(progress.todaySpend, privacy)}</span>
          {budget > 0 && progress.daysLeft > 0 && (
            <span className="sub">
              {t("budget.daysLeftDaily", {
                days: progress.daysLeft,
                amount: money(progress.dailyAllowance, privacy),
              })}
            </span>
          )}
        </div>
      </div>

      {budget > 0 ? (
        <div
          className="budget-pulse-bar"
          role="progressbar"
          aria-valuenow={Math.round(progress.spentRatio * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className={`budget-pulse-fill ${paceCls}`} style={{ width: `${pctWidth}%` }} />
          <div
            className="budget-pulse-timeline"
            style={{ left: `${Math.min(100, progress.timeRatio * 100)}%` }}
            title={t("budget.timeProgressTitle", {
              pct: (progress.timeRatio * 100).toFixed(0),
            })}
          />
        </div>
      ) : (
        <p className="muted-note mt-1">{t("budget.emptyHint")}</p>
      )}

      {showWeekChart ? (
        <>
          <div className="budget-pulse-days" aria-label={t("budget.last7DaysAria")}>
            {days.map((d) => {
              const h = Math.max(3, (Math.abs(d.amount) / maxDay) * 40);
              const isToday = d.date === today;
              return (
                <div key={d.date} className="budget-pulse-day">
                  <span className="budget-pulse-day-amt">
                    {d.amount !== 0 ? money(d.amount, privacy) : ""}
                  </span>
                  <div
                    className={`budget-pulse-day-bar${isToday ? " today" : ""}${d.amount < 0 ? " refund" : ""}`}
                    style={{ height: h }}
                  />
                  <span className="budget-pulse-day-label">
                    {isToday ? t("budget.today") : d.date.slice(8)}
                  </span>
                </div>
              );
            })}
          </div>
          {compact && (
            <button
              type="button"
              className="btn ghost budget-pulse-week-toggle"
              onClick={() => setShowWeekChart(false)}
            >
              {t("budget.hideLast7Days")}
            </button>
          )}
        </>
      ) : (
        compact && (
          <button
            type="button"
            className="btn ghost budget-pulse-week-toggle"
            onClick={() => setShowWeekChart(true)}
          >
            {t("budget.showLast7Days")}
          </button>
        )
      )}
    </div>
  );
}
