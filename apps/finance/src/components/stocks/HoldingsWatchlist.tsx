import { useMemo } from "react";
import type { HoldingsSort, PositionRowView } from "../../engine/holdingsPortfolio";
import { money, signedMoney, depositDeltaClass } from "../../format";
import { useLocale } from "../../i18n/context";

function returnAmount(amount: number | undefined, privacy: boolean) {
  if (amount == null || !Number.isFinite(amount)) return "--";
  return signedMoney(amount, privacy);
}

export function HoldingsWatchlist({
  rows,
  privacy,
  sort,
  onSortChange,
  onSelect,
}: {
  rows: PositionRowView[];
  privacy: boolean;
  sort: HoldingsSort;
  onSortChange: (s: HoldingsSort) => void;
  onSelect: (row: PositionRowView) => void;
}) {
  const { t } = useLocale();
  const displayRows = useMemo(
    () =>
      rows.map((row) => {
        const p = row.position;
        const totalReturnClass = depositDeltaClass(p.totalReturnAmount ?? 0);
        const todayReturnClass = depositDeltaClass(p.todayReturnAmount ?? 0);
        return {
          id: p.id,
          row,
          ticker: p.ticker,
          securityName: p.securityName,
          assetType: p.assetType.toUpperCase(),
          weightLabel: `${row.weightPct.toFixed(1)}%`,
          liveValueLabel: money(row.liveValue, privacy),
          costLabel:
            p.averageCostPerShare != null ? money(p.averageCostPerShare, privacy) : "--",
          todayReturnLabel: returnAmount(p.todayReturnAmount, privacy),
          todayReturnClass,
          totalReturnLabel: returnAmount(p.totalReturnAmount, privacy),
          totalReturnClass,
        };
      }),
    [rows, privacy]
  );

  const totals = useMemo(() => {
    let marketValue = 0;
    let todayReturn = 0;
    let totalReturn = 0;
    let hasToday = false;
    let hasTotal = false;
    for (const row of rows) {
      marketValue += row.liveValue;
      if (row.position.todayReturnAmount != null && Number.isFinite(row.position.todayReturnAmount)) {
        todayReturn += row.position.todayReturnAmount;
        hasToday = true;
      }
      if (row.position.totalReturnAmount != null && Number.isFinite(row.position.totalReturnAmount)) {
        totalReturn += row.position.totalReturnAmount;
        hasTotal = true;
      }
    }
    return { marketValue, todayReturn, totalReturn, hasToday, hasTotal };
  }, [rows]);

  return (
    <div className="card">
      <div className="section-head">
        <h3 className="flush">{t("stocks.watchlist.title")}</h3>
        <div className="seg seg-scroll life-os-scroll-x life-os-scroll-x--snap life-os-scroll-x--fade-edge">
          <button className={sort === "weight" ? "active" : ""} onClick={() => onSortChange("weight")}>
            {t("stocks.watchlist.sortWeight")}
          </button>
          <button
            className={sort === "return-desc" ? "active" : ""}
            onClick={() => onSortChange("return-desc")}
          >
            {t("stocks.watchlist.sortReturnDesc")}
          </button>
          <button
            className={sort === "return-asc" ? "active" : ""}
            onClick={() => onSortChange("return-asc")}
          >
            {t("stocks.watchlist.sortReturnAsc")}
          </button>
          <button className={sort === "name" ? "active" : ""} onClick={() => onSortChange("name")}>
            {t("stocks.watchlist.sortName")}
          </button>
        </div>
      </div>

      <div className="holdings-watchlist-cards">
        {displayRows.map((item) => (
          <button
            key={item.id}
            type="button"
            className="holdings-position-card"
            onClick={() => onSelect(item.row)}
          >
            <div className="holdings-position-card-head">
              <span className="holdings-position-ticker">{item.ticker}</span>
              <span className="tag">{item.assetType}</span>
              <span className="holdings-position-weight">{item.weightLabel}</span>
            </div>
            <div className="holdings-position-card-meta">{item.securityName}</div>
            <div className="holdings-position-card-values">
              <span>{item.liveValueLabel}</span>
              <span className="text-secondary">
                {t("stocks.watchlist.costPrefix", { amount: item.costLabel })}
              </span>
            </div>
            <div className="holdings-position-card-sub">
              <span className={item.todayReturnClass}>
                {t("stocks.watchlist.todayPrefix", { amount: item.todayReturnLabel })}
              </span>
              <span className={item.totalReturnClass}>
                {t("stocks.watchlist.totalPrefix", { amount: item.totalReturnLabel })}
              </span>
            </div>
          </button>
        ))}
      </div>

      <div className="holdings-watchlist-table life-os-scroll-x mt-3">
        <table className="review-table holdings-table">
          <thead>
            <tr>
              <th>{t("stocks.watchlist.table.symbol")}</th>
              <th>{t("stocks.watchlist.table.weight")}</th>
              <th className="num">{t("stocks.watchlist.table.marketValue")}</th>
              <th className="num">{t("stocks.watchlist.table.avgCost")}</th>
              <th className="num">{t("stocks.watchlist.table.todayPnL")}</th>
              <th className="num">{t("stocks.watchlist.table.cumulativePnL")}</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((item) => (
              <tr key={item.id} onClick={() => onSelect(item.row)} className="clickable">
                <td className="holdings-table-symbol">{item.ticker}</td>
                <td>{item.weightLabel}</td>
                <td className="num">{item.liveValueLabel}</td>
                <td className="num">{item.costLabel}</td>
                <td className={`num ${item.todayReturnClass}`}>{item.todayReturnLabel}</td>
                <td className={`num ${item.totalReturnClass}`}>{item.totalReturnLabel}</td>
              </tr>
            ))}
            <tr className="review-table-total">
              <td>{t("stocks.watchlist.table.total")}</td>
              <td />
              <td className="num">{money(totals.marketValue, privacy)}</td>
              <td />
              <td className={`num ${depositDeltaClass(totals.todayReturn)}`}>
                {totals.hasToday ? signedMoney(totals.todayReturn, privacy) : "--"}
              </td>
              <td className={`num ${depositDeltaClass(totals.totalReturn)}`}>
                {totals.hasTotal ? signedMoney(totals.totalReturn, privacy) : "--"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
