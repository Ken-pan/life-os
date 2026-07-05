import { useState } from "react";
import type { FinanceData, ForecastMetric } from "../types";
import type { Projection } from "../hooks/useProjection";
import type { LiquidCashAnchors } from "../engine/reconciliation";
import { goalReachMonth, metricValue } from "../engine/metrics";
import { ForecastChart } from "./ForecastChart";
import { ForecastSplitChart } from "./ForecastSplitChart";
import { SortBySelect } from "./SortBySelect";
import {
  adjustForDisplay,
  depositDeltaClass,
  money,
  monthOffsetToCalendarLabel,
  pct,
  signedMoney,
} from "../format";
import type { Tab } from "./AppShell";
import {
  accessibleLabel,
  getForecastMetricHints,
  getForecastMetricLabels,
  inTransitCashLabel,
  liquidCashLabel,
  lockedLabel,
} from "../copy/terminology";
import { useLocale } from "../i18n/context";

type ChartMode = "trajectory" | "composition";

/** 与上方时间/视图控件一致：同一套 seg 切换全部口径。 */
const FORECAST_METRICS: ForecastMetric[] = [
  "accessible",
  "liquid",
  "net-worth",
  "invested",
  "locked",
];

export function ForecastView({
  data,
  projection,
  displayLiquidCash,
  cashAnchors,
  onGoTab,
}: {
  data: FinanceData;
  projection: Projection;
  /** 与「今日」页一致：对账锚定后的运营流动现金。 */
  displayLiquidCash?: number;
  cashAnchors?: LiquidCashAnchors;
  onGoTab?: (t: Tab) => void;
}) {
  const { t } = useLocale();
  const maxYears = data.assumptions.horizonYears;
  const horizonOptions = [1, 5, 10, 20, 30].filter((y) => y <= maxYears);
  if (!horizonOptions.includes(maxYears)) horizonOptions.push(maxYears);

  const [years, setYears] = useState<number>(1);
  const [metric, setMetric] = useState<ForecastMetric>("accessible");
  const [chartMode, setChartMode] = useState<ChartMode>("trajectory");
  const [showMetricHint, setShowMetricHint] = useState(false);

  if (data.accounts.length === 0 && data.cashFlows.length === 0) {
    return <div className="empty">{t("forecast.empty")}</div>;
  }

  const read = metricValue(metric);
  const horizonMonths = years * 12;
  const a = data.assumptions;
  const metricLabels = getForecastMetricLabels();
  const metricHints = getForecastMetricHints();
  const accessible = accessibleLabel();
  const locked = lockedLabel();
  const liquidCash = liquidCashLabel();
  const inTransitCash = inTransitCashLabel();
  const privacy = data.privacy;
  const endIdx = Math.min(horizonMonths, projection.baseline.length - 1);
  const endSnap = projection.baseline[endIdx];
  const nowSnap = projection.baseline[0];

  const adj = (v: number, m: number) => adjustForDisplay(v, m, a.displayMode, a.inflation);

  const todayVal = adj(read(nowSnap), 0);
  const endVal = adj(read(endSnap), endIdx);
  const delta = endVal - todayVal;

  const liquidToday = displayLiquidCash ?? nowSnap.liquidCash;
  const capGainsRate = Math.min(1, Math.max(0, a.capitalGainsTaxRate ?? 0.15));
  const brokerageTax = {
    market: nowSnap.investedTaxable,
    basis: nowSnap.investedTaxableBasis,
    gain: nowSnap.unrealizedGainEstimate,
    tax: nowSnap.capitalGainsTaxEstimate,
    afterTax: nowSnap.investedTaxableAfterTax,
    basisKnown: nowSnap.taxBasisKnown,
  };

  const lowVal = adj(
    read(projection.conservative[endIdx]),
    endIdx
  );
  const highVal = adj(
    read(projection.aggressive[endIdx]),
    endIdx
  );

  const accessibleEnd = adj(endSnap.accessible, endIdx);
  const lockedEnd = adj(endSnap.locked, endIdx);
  const totalSplit = accessibleEnd + lockedEnd;
  const accessiblePct = totalSplit > 0 ? accessibleEnd / totalSplit : 0;

  const reaching = data.goals
    .filter((g) => g.metric === metric)
    .map((g) => ({ goal: g, month: goalReachMonth(projection.baseline, g) }))
    .filter((x) => x.month != null && (x.month as number) <= horizonMonths)
    .sort((a, b) => (a.month as number) - (b.month as number))
    .slice(0, 3);

  const displayModeNote =
    a.displayMode === "today" ? t("forecast.displayToday") : t("forecast.displayFuture");

  return (
    <div className="grid gap-4">
      <div className="card forecast-card">
        {onGoTab && (
          <div className="forecast-card-head">
            <button type="button" className="btn outline compact" onClick={() => onGoTab("settings")}>
              {t("forecast.editAssumptions")}
            </button>
          </div>
        )}

        <div className="forecast-controls-mobile chart-controls">
          <SortBySelect
            label={t("forecast.horizonLabel")}
            compact
            value={String(years)}
            onChange={(v) => setYears(Number(v))}
            options={horizonOptions.map((y) => ({ id: String(y), label: t("forecast.yearsShort", { y: String(y) }) }))}
          />
          <SortBySelect
            label={t("forecast.metricLabel")}
            compact
            value={metric}
            onChange={(v) => setMetric(v as ForecastMetric)}
            options={FORECAST_METRICS.map((m) => ({ id: m, label: metricLabels[m] }))}
          />
          <span className="seg seg-scroll life-os-scroll-x life-os-scroll-x--snap life-os-scroll-x--fade-edge forecast-chart-mode-seg">
            <button
              type="button"
              className={chartMode === "trajectory" ? "active" : ""}
              onClick={() => setChartMode("trajectory")}
            >
              {t("forecast.chartTrajectory")}
            </button>
            <button
              type="button"
              className={chartMode === "composition" ? "active" : ""}
              onClick={() => setChartMode("composition")}
            >
              {accessible} / {locked}
            </button>
          </span>
          <button
            type="button"
            className="icon-btn forecast-hint-btn"
            aria-expanded={showMetricHint}
            aria-label={t("forecast.metricHintAria", { metric: metricLabels[metric] })}
            title={t("forecast.metricHintTitle")}
            onClick={() => setShowMetricHint((v) => !v)}
          >
            ⓘ
          </button>
        </div>

        <div className="forecast-controls-desktop">
          <div className="chart-controls forecast-controls">
            <span className="seg seg-scroll life-os-scroll-x life-os-scroll-x--snap life-os-scroll-x--fade-edge">
              {horizonOptions.map((y) => (
                <button
                  key={y}
                  type="button"
                  className={years === y ? "active" : ""}
                  onClick={() => setYears(y)}
                >
                  {t("forecast.yearsShort", { y: String(y) })}
                </button>
              ))}
            </span>
            <span className="seg seg-scroll life-os-scroll-x life-os-scroll-x--snap life-os-scroll-x--fade-edge">
              <button
                type="button"
                className={chartMode === "trajectory" ? "active" : ""}
                onClick={() => setChartMode("trajectory")}
              >
                {t("forecast.chartTrajectory")}
              </button>
              <button
                type="button"
                className={chartMode === "composition" ? "active" : ""}
                onClick={() => setChartMode("composition")}
              >
                {accessible} / {locked}
              </button>
            </span>
          </div>

          <div className="chart-controls forecast-controls forecast-controls-metrics mt-2">
            <div className="forecast-controls-cluster">
              <span className="seg seg-scroll life-os-scroll-x life-os-scroll-x--snap life-os-scroll-x--fade-edge forecast-metric-seg" role="group" aria-label={t("forecast.metricLabel")}>
                {FORECAST_METRICS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={metric === m ? "active" : ""}
                    onClick={() => setMetric(m)}
                  >
                    {metricLabels[m]}
                  </button>
                ))}
              </span>
              <button
                type="button"
                className="icon-btn forecast-hint-btn"
                aria-expanded={showMetricHint}
                aria-label={t("forecast.metricHintAria", { metric: metricLabels[metric] })}
                title={t("forecast.metricHintTitle")}
                onClick={() => setShowMetricHint((v) => !v)}
              >
                ⓘ
              </button>
            </div>
            <div className="forecast-controls-cluster forecast-controls-cluster-end">
              <span className="text-muted forecast-display-mode">{displayModeNote}</span>
            </div>
          </div>
        </div>

        {showMetricHint && (
          <p className="muted-note forecast-metric-hint">
            {metricHints[metric]}
            <span className="text-muted"> · {displayModeNote}</span>
          </p>
        )}

        <div className="forecast-hero">
          <div className="forecast-hero-main">
            <span className="text-secondary">
              {t("forecast.metricRange", { metric: metricLabels[metric], years: String(years) })}
            </span>
            <div className="forecast-hero-values">
              <span className="forecast-hero-today">{money(todayVal, privacy)}</span>
              <span className="forecast-hero-arrow text-muted">→</span>
              <span className="pr-value">{money(endVal, privacy)}</span>
              <span className={`forecast-hero-delta ${depositDeltaClass(delta)}`}>
                {signedMoney(delta, privacy)}
              </span>
            </div>
            {metric === "accessible" && (
              <p className="forecast-hero-breakdown text-muted">
                {t("forecast.todayBreakdown")}
                {cashAnchors?.hasAnchoredAccounts ? inTransitCash : liquidCash}{" "}
                {money(liquidToday, privacy)}
                {nowSnap.reserve > 0 && (
                  <> {t("forecast.reservePart", { amount: money(nowSnap.reserve, privacy) })}</>
                )}
                {brokerageTax.market > 0 && (
                  <>
                    {" "}
                    {brokerageTax.basisKnown ? (
                      t("forecast.brokerageTaxFull", {
                        market: money(brokerageTax.market, privacy),
                        basis: money(brokerageTax.basis, privacy),
                        gain: money(brokerageTax.gain, privacy),
                        tax: money(brokerageTax.tax, privacy),
                        rate: pct(capGainsRate),
                        afterTax: money(brokerageTax.afterTax, privacy),
                      })
                    ) : (
                      t("forecast.brokerageNoBasis", {
                        market: money(brokerageTax.market, privacy),
                      })
                    )}
                  </>
                )}
                {nowSnap.property > 0 && (
                  <> {t("forecast.propertyPart", { amount: money(nowSnap.property, privacy) })}</>
                )}
                {nowSnap.liabilities > 0 && (
                  <> {t("forecast.liabilitiesPart", { amount: money(nowSnap.liabilities, privacy) })}</>
                )}
              </p>
            )}
            {metric === "liquid" && cashAnchors?.hasAnchoredAccounts && (
              <p className="forecast-hero-breakdown text-muted">
                {t("forecast.inTransitNote", { amount: money(cashAnchors.cacheLiquid, privacy) })}
              </p>
            )}
          </div>
          {chartMode === "trajectory" && (
            <p className="forecast-hero-range text-secondary">
              {t("forecast.rangeNote", {
                years: String(years),
                conservative: pct(a.conservativeReturn),
                baseline: pct(a.baselineReturn),
                aggressive: pct(a.aggressiveReturn),
                low: money(lowVal, privacy),
                high: money(highVal, privacy),
              })}
            </p>
          )}
          {chartMode === "composition" && (
            <p className="forecast-hero-range text-secondary">
              {t("forecast.endSplit", {
                years: String(years),
                accessible,
                locked,
                amount: money(accessibleEnd, privacy),
                pct: pct(accessiblePct),
                lockedAmount: money(lockedEnd, privacy),
              })}
            </p>
          )}
        </div>

        {chartMode === "trajectory" ? (
          <ForecastChart
            baseline={projection.baseline}
            low={projection.conservative}
            high={projection.aggressive}
            read={read}
            displayMode={a.displayMode}
            inflation={a.inflation}
            horizonMonths={horizonMonths}
            privacy={privacy}
          />
        ) : (
          <ForecastSplitChart
            baseline={projection.baseline}
            displayMode={a.displayMode}
            inflation={a.inflation}
            horizonMonths={horizonMonths}
            privacy={privacy}
          />
        )}

        {chartMode === "trajectory" && metric !== "locked" && (
          <p className="forecast-composition-strip text-secondary">
            {t("forecast.endComposition", {
              years: String(years),
              accessible,
              locked,
              amount: money(accessibleEnd, privacy),
              pct: pct(accessiblePct),
              lockedAmount: money(lockedEnd, privacy),
            })}
          </p>
        )}

        {reaching.length > 0 && (
          <div className="forecast-milestones">
            <span className="text-secondary">
              {t("forecast.goalsInWindow", { metric: metricLabels[metric] })}
            </span>
            <ul className="forecast-milestone-list">
              {reaching.map((r) => (
                <li key={r.goal.id}>
                  <div className="forecast-milestone-main">
                    <span className="forecast-milestone-name">{r.goal.name}</span>
                    <span className="forecast-milestone-meta">
                      {t("forecast.goalTarget", { amount: money(r.goal.target, privacy) })}
                    </span>
                  </div>
                  <span className="forecast-milestone-when text-muted">
                    {t("forecast.goalEta", { when: monthOffsetToCalendarLabel(r.month as number) })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {reaching.length === 0 && data.goals.some((g) => g.metric !== metric) && (
          <p className="muted-note">
            {t("forecast.noGoalsInWindow", { years: String(years) })}
            {onGoTab && (
              <>
                {" "}
                <button type="button" className="text-btn" onClick={() => onGoTab("overview")}>
                  {t("forecast.viewAllGoals")}
                </button>
              </>
            )}
          </p>
        )}

        <p className="muted-note forecast-disclaimer">
          {t("forecast.disclaimer")}
        </p>
      </div>
    </div>
  );
}
