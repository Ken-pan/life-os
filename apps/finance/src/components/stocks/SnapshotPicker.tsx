import type { HoldingsSnapshot } from "../../types";
import { money } from "../../format";
import { snapshotAsOfLabel } from "../../engine/holdingsPortfolio";
import { useLocale } from "../../i18n/context";

export function SnapshotPicker({
  snapshots,
  activeId,
  privacy,
  onSelect,
  onDelete,
}: {
  snapshots: HoldingsSnapshot[];
  activeId: string | null;
  privacy: boolean;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const { t } = useLocale();
  if (snapshots.length === 0) return null;
  const active = snapshots.find((s) => s.id === activeId) ?? snapshots[0];
  const canDelete = snapshots.length > 1;

  return (
    <div className="card">
      <div className="section-head">
        <h3 className="flush">{t("stocks.snapshot.historyTitle")}</h3>
        {onDelete && active && (
          <button
            className="btn ghost"
            disabled={!canDelete}
            title={canDelete ? t("stocks.snapshot.deleteTitle") : t("stocks.snapshot.keepOneTitle")}
            onClick={() => {
              if (!canDelete) return;
              const ok = window.confirm(t("stocks.snapshot.deleteConfirm"));
              if (!ok) return;
              onDelete(active.id);
            }}
          >
            {t("stocks.snapshot.deleteCurrent")}
          </button>
        )}
      </div>
      <div className="seg wrap">
        {snapshots.map((s) => (
          <button
            key={s.id}
            className={active?.id === s.id ? "active" : ""}
            onClick={() => onSelect(s.id)}
          >
            {snapshotAsOfLabel(s)}
          </button>
        ))}
      </div>
      {active && (
        <p className="muted-note mb-0">
          {active.accountLabel} · {money(active.holdingsMarketValue, privacy)} · {active.positionCount}
          {t("stocks.snapshot.positionsSuffix")} · {t("stocks.snapshot.readOnlyNote")}
        </p>
      )}
    </div>
  );
}
