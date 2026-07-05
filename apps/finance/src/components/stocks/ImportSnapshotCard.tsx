import { useState } from "react";
import type { Account, HoldingsSnapshot } from "../../types";
import { useFinance } from "../../store/store";
import { money, signedMoney } from "../../format";
import { parseHoldingsSnapshotJson } from "../../engine/holdings";
import { quoteSafeToSpend } from "../../copy/terminology";
import { useLocale } from "../../i18n/context";

export function ImportSnapshotCard({
  accounts,
  privacy,
  brokerageAccounts,
  onImported,
  compact = false,
}: {
  accounts: Account[];
  privacy: boolean;
  brokerageAccounts: Account[];
  onImported?: (snapshot: HoldingsSnapshot) => void;
  compact?: boolean;
}) {
  const { t } = useLocale();
  const store = useFinance();
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [preview, setPreview] = useState<HoldingsSnapshot | null>(null);

  const importFile = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setWarnings([]);
    setPreview(null);
    try {
      const parsed = parseHoldingsSnapshotJson(await file.text(), accounts);
      setPreview(parsed.snapshot);
      setWarnings(parsed.warnings);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("stocks.import.parseError"));
    }
  };

  const confirm = () => {
    if (!preview) return;
    const linked = brokerageAccounts.find((a) => a.id === preview.accountId);
    const snapshot = {
      ...preview,
      accountId: linked?.id ?? preview.accountId,
      accountLabel: linked?.name ?? preview.accountLabel,
      needsUserConfirmation: false,
    };
    store.upsertHoldingsSnapshot(snapshot);
    onImported?.(snapshot);
    setPreview(null);
  };

  return (
    <div className={`card${compact ? " card-compact" : ""}`}>
      {!compact && <h3>{t("stocks.import.title")}</h3>}
      <p className={compact ? "muted-note" : "muted-note mt-1-5"}>
        {t("stocks.import.note", { safeToSpend: quoteSafeToSpend() })}
      </p>
      <label className="field">
        <span>{t("stocks.import.selectJson")}</span>
        <input
          className="input"
          type="file"
          accept=".json,application/json"
          onChange={(e) => void importFile(e.target.files?.[0] ?? null)}
        />
      </label>
      {error && <div className="banner">{error}</div>}
      {preview && (
        <div className="grid gap-3 mt-3">
          <div className="grid kpi-row-4">
            <div className="item">
              <div className="grow">
                <div className="meta">{t("stocks.import.preview.marketValue")}</div>
                <div className="name">{money(preview.holdingsMarketValue, privacy)}</div>
              </div>
            </div>
            <div className="item">
              <div className="grow">
                <div className="meta">{t("stocks.import.preview.positionCount")}</div>
                <div className="name">{preview.positionCount}</div>
              </div>
            </div>
            <div className="item">
              <div className="grow">
                <div className="meta">{t("stocks.import.preview.unrealizedGain")}</div>
                <div className="name">{signedMoney(preview.unrealizedGain ?? 0, privacy)}</div>
              </div>
            </div>
            <div className="item">
              <div className="grow">
                <div className="meta">{t("stocks.import.preview.asOf")}</div>
                <div className="name">
                  {preview.asOfDate}
                  {preview.asOfTimeLocal
                    ? `${t("stocks.import.preview.asOfTimeSeparator")}${preview.asOfTimeLocal}`
                    : ""}
                </div>
              </div>
            </div>
          </div>
          <label className="field">
            <span>{t("stocks.import.linkAccount")}</span>
            <select
              className="input"
              value={preview.accountId ?? ""}
              onChange={(e) =>
                setPreview({
                  ...preview,
                  accountId: e.target.value || undefined,
                })
              }
            >
              <option value="">{t("stocks.import.notLinked")}</option>
              {brokerageAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          {warnings.length > 0 && (
            <ul className="muted-note">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <div className="row">
            <button className="btn ghost" onClick={() => setPreview(null)}>
              {t("stocks.import.cancel")}
            </button>
            <button className="btn" onClick={confirm}>
              {t("stocks.import.confirm")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
