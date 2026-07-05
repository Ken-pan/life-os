import { useEffect, useMemo, useState } from "react";
import type { BalanceAssertion, FinanceData } from "../types";
import { money, signedMoney, depositDeltaClass } from "../format";
import { useTransactions } from "../store/transactions";
import { useFinance } from "../store/store";
import {
  computeReconciliationPreview,
  isReconcilableCashAccount,
  reconciliationAdjustmentAmount,
} from "../engine/reconciliation";
import {
  finalizeAccountReconciliation,
  loadBalanceAssertions,
  type FinalizeReconciliationResult,
} from "../lib/repo";
import { useTimeline } from "../store/timeline";
import { useLocale } from "../i18n/context";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  if (e && typeof e === "object" && "message" in e) {
    const msg = (e as { message: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
}

function lastAssertionForAccount(
  assertions: BalanceAssertion[],
  accountId: string
): BalanceAssertion | null {
  return assertions.find((a) => a.accountId === accountId) ?? null;
}

export function AccountReconcileView({ data }: { data: FinanceData }) {
  const { t } = useLocale();
  const privacy = data.privacy;
  const { txns, reload: reloadTxns } = useTransactions();
  const store = useFinance();
  const timeline = useTimeline();
  const accounts = useMemo(
    () => data.accounts.filter(isReconcilableCashAccount),
    [data.accounts]
  );

  const [assertions, setAssertions] = useState<BalanceAssertion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [statedBalance, setStatedBalance] = useState("");
  const [assertionDate, setAssertionDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FinalizeReconciliationResult | null>(null);

  const selected = accounts.find((a) => a.id === selectedId) ?? accounts[0] ?? null;

  useEffect(() => {
    if (!selectedId && accounts[0]) setSelectedId(accounts[0].id);
  }, [accounts, selectedId]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await loadBalanceAssertions();
      setAssertions(rows);
    } catch (e) {
      setError(errorMessage(e, t("reconcile.loadFailed")));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const preview = useMemo(() => {
    if (!selected) return null;
    const parsed = Number(statedBalance);
    if (!Number.isFinite(parsed)) return null;
    const last = lastAssertionForAccount(assertions, selected.id);
    return computeReconciliationPreview({
      account: selected,
      assertionDate,
      statedBalance: parsed,
      txns,
      lastAssertion: last ? { date: last.date, amount: last.amount } : null,
    });
  }, [selected, statedBalance, assertionDate, txns, assertions]);

  const onReconcile = async (withAdjustment: boolean) => {
    if (!selected || !preview) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await finalizeAccountReconciliation({
        account: selected,
        assertionDate,
        statedBalance: preview.statedBalance,
        note: note.trim() || undefined,
        adjustmentAmount: reconciliationAdjustmentAmount(preview.difference),
        createAdjustment: withAdjustment && !preview.isBalanced,
      });
      await store.upsertAccount({
        ...selected,
        balance: preview.statedBalance,
        updatedAt: new Date().toISOString(),
      });
      setResult(res);
      setAssertions((prev) => [res.assertion, ...prev]);
      await reloadTxns();
      await timeline.reload();
      setStatedBalance("");
      setNote("");
    } catch (e) {
      setError(errorMessage(e, t("reconcile.reconcileFailed")));
    } finally {
      setBusy(false);
    }
  };

  if (accounts.length === 0) {
    return (
      <div className="card">
        <h3>{t("reconcile.title")}</h3>
        <p className="muted-note">{t("reconcile.noAccounts")}</p>
      </div>
    );
  }

  const lastForSelected = selected ? lastAssertionForAccount(assertions, selected.id) : null;

  return (
    <div className="grid gap-4">
      <div className="card">
        <div className="card-head">
          <h3>{t("reconcile.title")}</h3>
          <button className="btn ghost" onClick={() => void load()} disabled={loading}>
            {t("reconcile.refresh")}
          </button>
        </div>
        <p className="muted-note">{t("reconcile.intro")}</p>
        {error && <div className="banner">{error}</div>}

        <div className="grid cols-2 gap-3 mt-3">
          <label className="field">
            <span>{t("reconcile.account")}</span>
            <select
              className="input"
              value={selected?.id ?? ""}
              onChange={(e) => {
                setSelectedId(e.target.value);
                setResult(null);
              }}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {t("reconcile.accountOption", { name: a.name, balance: money(a.balance, privacy) })}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t("reconcile.assertionDate")}</span>
            <input
              className="input"
              type="date"
              value={assertionDate}
              onChange={(e) => setAssertionDate(e.target.value)}
            />
          </label>
          <label className="field">
            <span>{t("reconcile.bankBalance")}</span>
            <input
              className="input"
              type="number"
              step="0.01"
              placeholder={t("reconcile.bankBalancePlaceholder")}
              value={statedBalance}
              onChange={(e) => setStatedBalance(e.target.value)}
            />
          </label>
          <label className="field">
            <span>{t("reconcile.noteOptional")}</span>
            <input
              className="input"
              placeholder={t("reconcile.notePlaceholder")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>

        {lastForSelected && (
          <p className="muted-note mt-2-5">
            {t("reconcile.lastAssertion", {
              date: lastForSelected.date,
              amount: money(lastForSelected.amount, privacy),
            })}
          </p>
        )}

        {preview && (
          <div className="card card-compact mt-3">
            <h3>{t("reconcile.previewTitle")}</h3>
            {preview.isOpeningAssertion ? (
              <p className="muted-note">
                {t("reconcile.firstAssertion", {
                  balance: money(preview.expectedBalance, privacy),
                })}
              </p>
            ) : (
              <div className="grid kpi-row-4">
                <Stat label={t("reconcile.lastAssertionStat")} value={money(preview.lastAssertionAmount ?? 0, privacy)} />
                <Stat
                  label={t("reconcile.txnNet")}
                  value={signedMoney(preview.txnNetSinceLast, privacy)}
                  sub={t("reconcile.txnCount", { count: preview.txnCount })}
                />
                <Stat label={t("reconcile.expectedBalance")} value={money(preview.expectedBalance, privacy)} />
                <Stat
                  label={t("reconcile.difference")}
                  value={signedMoney(preview.difference, privacy)}
                  valueClass={depositDeltaClass(-preview.difference)}
                />
              </div>
            )}
            {!preview.isOpeningAssertion && Math.abs(preview.difference) >= 0.005 && (
              <p className="muted-note mt-2">
                {t("reconcile.diffHint", { count: preview.txnCount })}
              </p>
            )}
            <div className="row mt-3">
              {preview.isBalanced ? (
                <button className="btn" disabled={busy} onClick={() => void onReconcile(false)}>
                  {busy ? t("reconcile.processing") : t("reconcile.confirmMatch")}
                </button>
              ) : (
                <>
                  <button className="btn" disabled={busy} onClick={() => void onReconcile(false)}>
                    {busy ? t("reconcile.processing") : t("reconcile.confirmWithoutAdj")}
                  </button>
                  <button className="btn ghost" disabled={busy} onClick={() => void onReconcile(true)}>
                    {t("reconcile.confirmWithAdj")}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {result && (
          <div className="banner positive mt-3">
            {t("reconcile.done", {
              date: result.assertion.date,
              amount: money(result.assertion.amount, privacy),
            })}
            {result.adjustmentTxn
              ? t("reconcile.doneWithAdj", {
                  amount: signedMoney(result.adjustmentTxn.amount, privacy),
                })
              : t("reconcile.doneNoAdj")}
          </div>
        )}
      </div>

      <div className="card">
        <h3>{t("reconcile.historyTitle")}</h3>
        {loading ? (
          <p className="muted-note">{t("reconcile.loading")}</p>
        ) : assertions.length === 0 ? (
          <p className="muted-note">{t("reconcile.noHistory")}</p>
        ) : (
          <div className="life-os-scroll-x">
            <table className="review-table">
              <thead>
                <tr>
                  <th>{t("reconcile.colDate")}</th>
                  <th>{t("reconcile.colAccount")}</th>
                  <th>{t("reconcile.colBalance")}</th>
                  <th>{t("reconcile.colNote")}</th>
                </tr>
              </thead>
              <tbody>
                {assertions.slice(0, 20).map((a) => {
                  const acct = data.accounts.find((x) => x.id === a.accountId);
                  return (
                    <tr key={a.id}>
                      <td>{a.date}</td>
                      <td>{acct?.name ?? a.accountId}</td>
                      <td>{money(a.amount, privacy)}</td>
                      <td>{a.note ?? (a.adjustmentTxnId ? t("reconcile.noteWithAdj") : t("common.emDash"))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="item">
      <div className="grow">
        <div className="meta">{label}</div>
        <div className={`name${valueClass ? ` ${valueClass}` : ""}`}>{value}</div>
        {sub && <div className="meta">{sub}</div>}
      </div>
    </div>
  );
}
