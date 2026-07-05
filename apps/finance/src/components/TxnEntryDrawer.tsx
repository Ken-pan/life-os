import { useMemo, useRef, useState } from "react";
import type { FlowType } from "../engine/transactions";
import type { NewTxn } from "../store/transactions";
import { useTransactions } from "../store/transactions";
import { toTxnPayload } from "./txnPayload";
import { categoryDisplayLabel, DEFAULT_CATEGORY_KEYS } from "../copy/categories";
import { money, formatDateLocalized } from "../format";
import { useLocale } from "../i18n/context";

function localToday(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function TxnEntryDrawer({
  onAdd,
  onClose,
  privacy,
}: {
  onAdd: (input: NewTxn) => Promise<void>;
  onClose: () => void;
  privacy: boolean;
}) {
  const { t, locale } = useLocale();
  const { txns } = useTransactions();
  const today = localToday();
  const yesterday = localToday(-1);

  const [amountText, setAmountText] = useState("");
  const [flow, setFlow] = useState<FlowType>("expense");
  const [category, setCategory] = useState("");
  const [merchant, setMerchant] = useState("");
  const [account, setAccount] = useState("");
  const [date, setDate] = useState(today);
  const [showMore, setShowMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    const catCount = new Map<string, number>();
    const merchants: string[] = [];
    const accounts: string[] = [];
    for (const txn of txns.slice(0, 400)) {
      if (txn.inSpending && txn.category && txn.category !== "Uncategorized") {
        catCount.set(txn.category, (catCount.get(txn.category) ?? 0) + 1);
      }
      if (txn.merchant && txn.merchant !== "Manual" && !merchants.includes(txn.merchant)) {
        merchants.push(txn.merchant);
      }
      if (txn.account && txn.account !== "Manual" && !accounts.includes(txn.account)) {
        accounts.push(txn.account);
      }
    }
    const recentCats = [...catCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c);
    const merged = [...new Set([...recentCats, ...DEFAULT_CATEGORY_KEYS])];
    const seenLabels = new Set<string>();
    const categories = merged.filter((c) => {
      const label = categoryDisplayLabel(c);
      if (seenLabels.has(label)) return false;
      seenLabels.add(label);
      return true;
    }).slice(0, 10);
    return { categories, merchants: merchants.slice(0, 12), accounts: accounts.slice(0, 6) };
  }, [txns, locale]);

  const amount = Number(amountText);
  const valid = Number.isFinite(amount) && amount > 0;

  const save = async (keepOpen: boolean) => {
    if (!valid || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await onAdd(
        toTxnPayload({
          date,
          merchant: merchant.trim() || "Manual",
          category: category.trim() || "Uncategorized",
          account: account.trim() || "Manual",
          flow,
          amount,
        })
      );
      if (keepOpen) {
        setSavedCount((n) => n + 1);
        setLastSaved(
          `${category.trim() ? categoryDisplayLabel(category.trim()) : t("txn.uncategorized")} ${money(amount, privacy)}`
        );
        setAmountText("");
        setMerchant("");
        amountRef.current?.focus();
      } else {
        onClose();
      }
    } catch (error) {
      setErr(error instanceof Error ? error.message : t("txn.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer quick-txn">
        <div className="drawer-head">
          <h2>
            {t("txn.title")}
            {savedCount > 0 && (
              <span className="tag inline-meta">{t("txn.savedCount", { count: savedCount })}</span>
            )}
          </h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save(false);
          }}
        >
          <div className="seg quick-txn-flow" role="radiogroup" aria-label={t("txn.flowType")}>
            <button
              type="button"
              className={flow === "expense" ? "active" : ""}
              onClick={() => setFlow("expense")}
            >
              {t("txn.expense")}
            </button>
            <button
              type="button"
              className={flow === "income" ? "active" : ""}
              onClick={() => setFlow("income")}
            >
              {t("txn.income")}
            </button>
            <button
              type="button"
              className={flow === "refund_or_reversal" ? "active" : ""}
              onClick={() => setFlow("refund_or_reversal")}
            >
              {t("txn.refund")}
            </button>
          </div>

          <div className="quick-txn-amount">
            <span className="quick-txn-currency">$</span>
            <input
              ref={amountRef}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              autoFocus
              aria-label={t("txn.amount")}
            />
          </div>

          <div className="quick-txn-section">
            <span className="quick-txn-label">{t("txn.category")}</span>
            <div className="quick-txn-chips">
              {suggestions.categories.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={`chip${category === c ? " active" : ""}`}
                  onClick={() => setCategory(category === c ? "" : c)}
                >
                  {categoryDisplayLabel(c)}
                </button>
              ))}
            </div>
            <input
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={t("txn.categoryPlaceholder")}
            />
          </div>

          <div className="quick-txn-section">
            <span className="quick-txn-label">{t("txn.date")}</span>
            <div className="quick-txn-chips">
              <button
                type="button"
                className={`chip${date === today ? " active" : ""}`}
                onClick={() => setDate(today)}
              >
                {t("txn.today")}
              </button>
              <button
                type="button"
                className={`chip${date === yesterday ? " active" : ""}`}
                onClick={() => setDate(yesterday)}
              >
                {t("txn.yesterday")}
              </button>
              <input
                type="date"
                className="input quick-txn-date"
                lang={locale}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label={t("txn.pickDate")}
              />
              <span className="muted-note quick-txn-date-zh">{formatDateLocalized(date)}</span>
            </div>
          </div>

          <button
            type="button"
            className="quick-txn-more-toggle"
            onClick={() => setShowMore((v) => !v)}
            aria-expanded={showMore}
          >
            {showMore ? t("txn.merchantAccountToggleHide") : t("txn.merchantAccountToggleShow")}
          </button>
          {showMore && (
            <div className="quick-txn-section">
              <input
                className="input"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                placeholder={t("txn.merchantPlaceholder")}
                list="quick-txn-merchants"
              />
              <datalist id="quick-txn-merchants">
                {suggestions.merchants.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              {suggestions.accounts.length > 0 && (
                <div className="quick-txn-chips mt-2">
                  {suggestions.accounts.map((a) => (
                    <button
                      type="button"
                      key={a}
                      className={`chip${account === a ? " active" : ""}`}
                      onClick={() => setAccount(account === a ? "" : a)}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              )}
              <input
                className="input mt-2"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder={t("txn.accountPlaceholder")}
              />
            </div>
          )}

          {lastSaved && (
            <p className="muted-note quick-txn-saved">{t("txn.lastSaved", { detail: lastSaved })}</p>
          )}
          {err && <p className="text-critical mt-2">{err}</p>}

          <div className="quick-txn-actions">
            <button
              type="button"
              className="btn ghost"
              disabled={!valid || busy}
              onClick={() => void save(true)}
            >
              {t("common.saveAndContinue")}
            </button>
            <button className="btn" type="submit" disabled={!valid || busy}>
              {busy ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}
