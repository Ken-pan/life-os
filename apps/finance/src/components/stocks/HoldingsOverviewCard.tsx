import { useMemo } from "react";
import type { FinanceData } from "../../types";
import {
  buildPositionRows,
  sortPositionRows,
  sortedSnapshots,
  snapshotAsOfLabel,
} from "../../engine/holdingsPortfolio";
import { useHoldingsLive } from "../../hooks/useHoldingsLive";
import type { LiveTrackStatus } from "../../hooks/useHoldingsLive";
import { money, signedMoney, depositDeltaClass } from "../../format";
import { InstitutionLogo } from "../InstitutionLogo";
import { quoteSafeToSpend } from "../../copy/terminology";
import { useLocale } from "../../i18n/context";

function liveStatusShort(t: (key: string) => string, status: LiveTrackStatus): string {
  return t(`stocks.liveStatus.short.${status}`);
}

export function HoldingsOverviewCard({
  data,
  tabActive,
  onGoStocks,
}: {
  data: FinanceData;
  tabActive: boolean;
  onGoStocks: (snapshotId?: string) => void;
}) {
  const { t } = useLocale();
  const snapshots = sortedSnapshots(data.holdingsSnapshots);
  const latest = snapshots[0];
  const symbols = useMemo(
    () => latest?.positions.map((p) => p.ticker) ?? [],
    [latest?.id, latest?.positions]
  );

  const live = useHoldingsLive(symbols, Boolean(latest), tabActive);

  const liveTotal = useMemo(() => {
    if (!latest) return null;
    const rows = buildPositionRows(latest, live.quotes);
    return rows.reduce((sum, r) => sum + r.liveValue, 0);
  }, [latest, live.quotes]);

  const topReturners = useMemo(() => {
    if (!latest) return [];
    const rows = sortPositionRows(buildPositionRows(latest, live.quotes), "return-desc");
    return rows.filter((r) => (r.position.totalReturnAmount ?? 0) !== 0).slice(0, 3);
  }, [latest, live.quotes]);

  if (!latest) return null;

  return (
    <div className="card holdings-overview-card">
      <div className="section-head">
        <h3 className="flex-row">
          <InstitutionLogo name="Robinhood" size="sm" />
          {t("stocks.overview.title")}
        </h3>
        <button type="button" className="btn outline compact" onClick={() => onGoStocks(latest.id)}>
          {t("stocks.overview.openAllocation")}
        </button>
      </div>
      <p className="muted-note">
        {t("stocks.overview.marketValueNote", { safeToSpend: quoteSafeToSpend() })}
      </p>
      <div className="list">
        <div className="kv">
          <span className="k">{t("stocks.overview.portfolioMarketValue")}</span>
          <span>{money(liveTotal ?? latest.holdingsMarketValue, data.privacy)}</span>
        </div>
        {latest.impliedCostBasis != null && (
          <div className="kv">
            <span className="k">{t("stocks.overview.totalCost")}</span>
            <span>{money(latest.impliedCostBasis, data.privacy)}</span>
          </div>
        )}
        {latest.unrealizedGain != null && (
          <div className="kv">
            <span className="k">{t("stocks.overview.cumulativePnL")}</span>
            <span className={depositDeltaClass(latest.unrealizedGain)}>
              {signedMoney(latest.unrealizedGain, data.privacy)}
              {latest.weightedTotalReturnPct != null && (
                <span className="text-secondary inline-meta-tight">
                  {latest.weightedTotalReturnPct >= 0 ? "+" : ""}
                  {latest.weightedTotalReturnPct.toFixed(2)}%
                </span>
              )}
            </span>
          </div>
        )}
        {latest.todayReturnPctApprox != null && (
          <div className="kv">
            <span className="k">{t("stocks.overview.todayPnL")}</span>
            <span className={depositDeltaClass(latest.todayReturnPctApprox)}>
              {latest.todayReturnAmountApprox != null
                ? signedMoney(latest.todayReturnAmountApprox, data.privacy)
                : ""}
              {latest.todayReturnAmountApprox != null ? " · " : ""}
              {latest.todayReturnPctApprox >= 0 ? "+" : ""}
              {latest.todayReturnPctApprox.toFixed(2)}%
            </span>
          </div>
        )}
        <div className="kv">
          <span className="k">{t("stocks.overview.dataAsOf")}</span>
          <span>{snapshotAsOfLabel(latest)}</span>
        </div>
        <div className="kv">
          <span className="k">{t("stocks.overview.quoteStatus")}</span>
          <span className="holdings-overview-live-meta">
            <span className={`dot ${live.status === "live" ? "ok" : live.status === "error" ? "critical" : "warn"}`} />
            {liveStatusShort(t, live.status)}
            {tabActive ? "" : t("stocks.overview.pausedWhenInactive")}
          </span>
        </div>
        <div className="kv">
          <span className="k">{t("stocks.overview.positionCount")}</span>
          <span>{latest.positionCount}</span>
        </div>
      </div>
      {topReturners.length > 0 && (
        <div className="holdings-overview-movers">
          <span className="label">{t("stocks.overview.topReturners")}</span>
          <ul>
            {topReturners.map((row) => (
              <li key={row.position.id}>
                <span className="holdings-overview-mover-ticker">{row.position.ticker}</span>
                <span className={depositDeltaClass(row.position.totalReturnAmount ?? 0)}>
                  {signedMoney(row.position.totalReturnAmount ?? 0, data.privacy)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
