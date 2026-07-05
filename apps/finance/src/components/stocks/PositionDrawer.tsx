import type { PositionRowView } from "../../engine/holdingsPortfolio";
import { pricePathPoints } from "../../engine/sparkline";
import { money, signedMoney, depositDeltaClass, pct } from "../../format";
import { DayReturnBar, SparklinePath } from "./MiniPricePath";
import { useLocale } from "../../i18n/context";

export function PositionDrawer({
  row,
  privacy,
  onClose,
}: {
  row: PositionRowView;
  privacy: boolean;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const p = row.position;
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} role="presentation" />
      <aside className="drawer" role="dialog" aria-label={t("stocks.position.ariaLabel", { ticker: p.ticker })}>
        <div className="drawer-head">
          <h3 className="flush">
            {p.ticker} · {p.securityName}
          </h3>
          <button className="icon-btn" onClick={onClose}>
            {t("stocks.position.close")}
          </button>
        </div>
        <p className="muted-note">{t("stocks.position.readOnlyNote")}</p>
        <div className="list">
          {p.averageCostPerShare != null && (
            <div className="kv">
              <span className="k">{t("stocks.position.avgCost")}</span>
              <span>{money(p.averageCostPerShare, privacy)}</span>
            </div>
          )}
          {p.totalReturnAmount != null && (
            <div className="kv">
              <span className="k">{t("stocks.position.cumulativePnL")}</span>
              <span className={depositDeltaClass(p.totalReturnAmount)}>
                {signedMoney(p.totalReturnAmount, privacy)}
                {p.totalReturnPctDisplayed != null && (
                  <span className="text-secondary inline-meta">
                    {p.totalReturnPctDisplayed >= 0 ? "+" : ""}
                    {pct(p.totalReturnPctDisplayed / 100, 2)}
                  </span>
                )}
              </span>
            </div>
          )}
          {p.todayReturnPct != null && (
            <div className="kv">
              <span className="k">{t("stocks.position.todayPnL")}</span>
              <span className={depositDeltaClass(p.todayReturnAmount ?? p.todayReturnPct)}>
                {p.todayReturnAmount != null ? signedMoney(p.todayReturnAmount, privacy) : ""}
                {p.todayReturnAmount != null && p.todayReturnPct != null ? " · " : ""}
                {p.todayReturnPct >= 0 ? "+" : ""}
                {pct(p.todayReturnPct / 100, 2)}
              </span>
            </div>
          )}
          <div className="kv">
            <span className="k">{t("stocks.position.shares")}</span>
            <span>{privacy ? "••••" : p.shares.toFixed(4)}</span>
          </div>
          <div className="kv">
            <span className="k">{t("stocks.position.portfolioWeight")}</span>
            <span>{row.weightPct.toFixed(2)}%</span>
          </div>
          <div className="kv">
            <span className="k">{t("stocks.position.marketValue")}</span>
            <span>{money(row.liveValue, privacy)}</span>
          </div>
          <div className="kv">
            <span className="k">{t("stocks.position.currentPrice")}</span>
            <span>
              {money(row.livePrice, privacy)}
              {!row.hasLiveQuote && (
                <span className="text-secondary">{t("stocks.position.staleQuote")}</span>
              )}
            </span>
          </div>
        </div>
        {pricePathPoints(row).length >= 2 && (
          <div className="position-drawer-spark mt-4">
            <span className="label">{t("stocks.position.pricePath")}</span>
            <SparklinePath
              values={pricePathPoints(row)}
              up={(p.totalReturnAmount ?? 0) >= 0}
              width={120}
              height={36}
            />
            <div className="muted-note mt-1">
              {t("stocks.position.pathSample", {
                count: row.pathSampleCount,
                min: money(row.pathMin, privacy),
                max: money(row.pathMax, privacy),
                spanPct: row.pathSpanPct.toFixed(2),
              })}
            </div>
          </div>
        )}
        {row.position.todayReturnPct != null && (
          <div className="mt-3">
            <DayReturnBar pct={row.position.todayReturnPct} />
          </div>
        )}
      </aside>
    </>
  );
}
