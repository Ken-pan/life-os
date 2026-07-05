import type { AllocationMetrics } from "../../engine/holdingsPortfolio";
import { money } from "../../format";
import { useLocale } from "../../i18n/context";

export function AllocationSummary({
  allocation,
  privacy,
}: {
  allocation: AllocationMetrics;
  privacy: boolean;
}) {
  const { t } = useLocale();
  const concentrationHint =
    allocation.top1Pct >= 25
      ? t("stocks.allocationSummary.hintHigh")
      : allocation.top1Pct >= 15
        ? t("stocks.allocationSummary.hintModerate")
        : t("stocks.allocationSummary.hintLow");

  const metrics = [
    {
      label: t("stocks.allocationSummary.top1"),
      value: t("stocks.allocationSummary.top1Value", {
        ticker: allocation.top1Ticker,
        pct: allocation.top1Pct.toFixed(1),
      }),
    },
    {
      label: t("stocks.allocationSummary.top3"),
      value: t("stocks.allocationSummary.top3Value", { pct: allocation.top3Pct.toFixed(1) }),
    },
    {
      label: t("stocks.allocationSummary.stock"),
      value: t("stocks.allocationSummary.stockValue", {
        pct: allocation.stockPct.toFixed(1),
        amount: money(allocation.stockValue, privacy),
      }),
    },
    {
      label: t("stocks.allocationSummary.etf"),
      value: t("stocks.allocationSummary.etfValue", {
        pct: allocation.etfPct.toFixed(1),
        amount: money(allocation.etfValue, privacy),
      }),
    },
  ];

  return (
    <div className="card allocation-summary">
      <h3>{t("stocks.allocationSummary.title")}</h3>
      <div className="allocation-stats-bar">
        {metrics.map((metric) => (
          <div key={metric.label} className="allocation-stat">
            <span className="allocation-stat-label">{metric.label}</span>
            <span className="allocation-stat-value">{metric.value}</span>
          </div>
        ))}
      </div>
      <p className="allocation-hint muted-note">{concentrationHint}</p>
      <div className="allocation-bars" aria-hidden={privacy}>
        <div
          className="allocation-bar allocation-bar-stock"
          style={{ width: `${Math.max(allocation.stockPct, 0)}%` }}
          title={t("stocks.allocationSummary.stockTitle", { pct: allocation.stockPct.toFixed(1) })}
        />
        <div
          className="allocation-bar allocation-bar-etf"
          style={{ width: `${Math.max(allocation.etfPct, 0)}%` }}
          title={t("stocks.allocationSummary.etfTitle", { pct: allocation.etfPct.toFixed(1) })}
        />
      </div>
    </div>
  );
}
