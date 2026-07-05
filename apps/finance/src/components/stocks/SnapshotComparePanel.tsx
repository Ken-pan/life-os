import type { HoldingsSnapshot } from "../../types";
import {
  compareSnapshots,
  snapshotAsOfLabel,
  type SnapshotCompareResult,
} from "../../engine/holdingsPortfolio";
import { money, signedMoney, depositDeltaClass } from "../../format";
import { quoteSafeToSpend } from "../../copy/terminology";
import {
  downloadTextFile,
  snapshotCompareFilename,
  snapshotCompareToCsv,
} from "../../engine/holdingsExport";
import { useLocale } from "../../i18n/context";

export function SnapshotComparePanel({
  snapshots,
  olderId,
  newerId,
  privacy,
  onOlderChange,
  onNewerChange,
}: {
  snapshots: HoldingsSnapshot[];
  olderId: string | null;
  newerId: string | null;
  privacy: boolean;
  onOlderChange: (id: string) => void;
  onNewerChange: (id: string) => void;
}) {
  const { t } = useLocale();
  if (snapshots.length < 2) return null;

  const older = snapshots.find((s) => s.id === olderId) ?? snapshots[1];
  const newer = snapshots.find((s) => s.id === newerId) ?? snapshots[0];
  const diff: SnapshotCompareResult = compareSnapshots(older, newer);

  return (
    <div className="card">
      <div className="section-head">
        <h3 className="flush">{t("stocks.snapshot.compare.title")}</h3>
        <div className="flex-row-tight">
          <span className="tag">{t("stocks.snapshot.compare.tag")}</span>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              const csv = snapshotCompareToCsv(diff, privacy);
              downloadTextFile(snapshotCompareFilename(diff), csv);
            }}
          >
            {t("stocks.snapshot.compare.exportCsv")}
          </button>
        </div>
      </div>
      <p className="muted-note">
        {t("stocks.snapshot.compare.note", { safeToSpend: quoteSafeToSpend() })}
      </p>
      <div className="grid cols-2 gap-3 mb-3">
        <label className="field">
          <span className="label">{t("stocks.snapshot.compare.olderLabel")}</span>
          <select
            value={older.id}
            onChange={(e) => onOlderChange(e.target.value)}
            aria-label={t("stocks.snapshot.compare.selectOlderAria")}
          >
            {snapshots.map((s) => (
              <option key={s.id} value={s.id}>
                {snapshotAsOfLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label">{t("stocks.snapshot.compare.newerLabel")}</span>
          <select
            value={newer.id}
            onChange={(e) => onNewerChange(e.target.value)}
            aria-label={t("stocks.snapshot.compare.selectNewerAria")}
          >
            {snapshots.map((s) => (
              <option key={s.id} value={s.id}>
                {snapshotAsOfLabel(s)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="list mb-3">
        <div className="kv">
          <span className="k">{diff.olderLabel}</span>
          <span>{money(diff.olderTotal, privacy)}</span>
        </div>
        <div className="kv">
          <span className="k">{diff.newerLabel}</span>
          <span>{money(diff.newerTotal, privacy)}</span>
        </div>
        <div className="kv">
          <span className="k">{t("stocks.snapshot.compare.marketValueChange")}</span>
          <span className={depositDeltaClass(diff.totalDelta)}>
            {signedMoney(diff.totalDelta, privacy)}
          </span>
        </div>
      </div>
      <div className="holdings-watchlist-table life-os-scroll-x">
        <table className="review-table">
          <thead>
            <tr>
              <th>{t("stocks.snapshot.compare.table.symbol")}</th>
              <th>{t("stocks.snapshot.compare.table.older")}</th>
              <th>{t("stocks.snapshot.compare.table.newer")}</th>
              <th>{t("stocks.snapshot.compare.table.delta")}</th>
            </tr>
          </thead>
          <tbody>
            {diff.rows.map((row) => (
              <tr key={row.ticker}>
                <td>
                  {row.ticker}
                  {row.status !== "both" && (
                    <span className="tag warn inline-meta-tight">
                      {row.status === "new-only"
                        ? t("stocks.snapshot.compare.table.newOnly")
                        : t("stocks.snapshot.compare.table.exited")}
                    </span>
                  )}
                </td>
                <td>{money(row.olderValue, privacy)}</td>
                <td>{money(row.newerValue, privacy)}</td>
                <td className={depositDeltaClass(row.valueDelta)}>
                  {signedMoney(row.valueDelta, privacy)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
