import { useMemo, useState } from "react";
import type { CashFlowItem, CashFlowType, Frequency, PayFrequency } from "../types";
import { useFinance, uid } from "../store/store";
import { money, depositDeltaClass } from "../format";
import { DateField, NumberField, SelectField, TextField } from "./fields";
import { SortBySelect } from "./SortBySelect";
import { useLocale } from "../i18n/context";

function payFrequencyOptions(t: (key: string) => string): { value: PayFrequency; label: string }[] {
  return [
    { value: "monthly", label: t("cashFlows.freqMonthly") },
    { value: "semimonthly", label: t("cashFlows.freqSemimonthly") },
    { value: "biweekly", label: t("cashFlows.freqBiweekly") },
    { value: "weekly", label: t("cashFlows.freqWeekly") },
  ];
}

type CashFlowSort = "logic" | "amount-desc" | "amount-asc" | "name";

function CashFlowRow({
  c,
  privacy,
  bulkOpenVersion,
  bulkOpenValue,
}: {
  c: CashFlowItem;
  privacy: boolean;
  bulkOpenVersion: number;
  bulkOpenValue: boolean;
}) {
  const { t } = useLocale();
  const payFreqOptions = useMemo(() => payFrequencyOptions(t), [t]);
  const store = useFinance();
  const [open, setOpen] = useState(
    bulkOpenVersion > 0 ? bulkOpenValue : !c.name
  );
  const set = (patch: Partial<CashFlowItem>) => store.upsertCashFlow({ ...c, ...patch });
  const isIncome = c.type === "income";
  const payFreq = c.payFrequency ?? "monthly";
  const needsAnchor = isIncome && (payFreq === "biweekly" || payFreq === "weekly");
  return (
    <div className="flow-row">
      <button className="flow-head" onClick={() => setOpen((v) => !v)}>
        <span className={`dot ${isIncome ? "ok" : "warning"}`} />
        <span className="grow">
          <span className="name">
            {c.name || t("cashFlows.unnamed")}
            <span className="tag inline-meta">
              {isIncome ? t("cashFlows.income") : t("cashFlows.expense")}
            </span>
            <span className="tag inline-meta">
              {c.frequency === "monthly" ? t("cashFlows.freqMonthlyShort") : t("cashFlows.freqAnnualShort")}
            </span>
          </span>
          <span className="meta">
            {isIncome ? t("cashFlows.afterTax") : c.essential ? t("cashFlows.essential") : t("cashFlows.nonEssential")}
            {c.category ? <span className="inline-meta">· {c.category}</span> : null}
          </span>
        </span>
        <span className={`amount ${depositDeltaClass(isIncome ? c.amount : -c.amount)}`}>
          {isIncome ? money(c.amount, privacy) : `-${money(c.amount, privacy)}`}
        </span>
        <span className={`chev${open ? " open" : ""}`}>⌄</span>
      </button>

      {open && (
        <div className="flow-body">
          <div className="row">
            <TextField label={t("cashFlows.name")} value={c.name} onChange={(v) => set({ name: v })} placeholder={t("cashFlows.namePlaceholder")} />
            <SelectField<CashFlowType>
              label={t("cashFlows.type")}
              value={c.type}
              options={[
                { value: "income", label: t("cashFlows.typeIncome") },
                { value: "expense", label: t("cashFlows.typeExpense") },
              ]}
              onChange={(v) => set({ type: v })}
            />
            <SelectField<Frequency>
              label={t("cashFlows.frequency")}
              value={c.frequency}
              options={[
                { value: "monthly", label: t("cashFlows.freqMonthlyShort") },
                { value: "annual", label: t("cashFlows.freqAnnualShort") },
              ]}
              onChange={(v) => set({ frequency: v })}
            />
            <NumberField
              label={
                isIncome && payFreq !== "monthly" && payFreq !== "semimonthly"
                  ? t("cashFlows.amountMonthly")
                  : t("cashFlows.amount")
              }
              value={c.amount}
              onChange={(v) => set({ amount: v })}
              step={50}
            />
          </div>
          <div className="row middle">
            {isIncome && (
              <SelectField<PayFrequency>
                label={t("cashFlows.payFrequency")}
                value={payFreq}
                options={payFreqOptions}
                onChange={(v) => set({ payFrequency: v })}
              />
            )}
            {needsAnchor && (
              <DateField
                label={t("cashFlows.nextPayday")}
                value={c.anchorDate}
                onChange={(v) => set({ anchorDate: v })}
              />
            )}
            {c.type === "expense" && (
              <label className="field-inline-check">
                <input
                  type="checkbox"
                  checked={c.essential ?? false}
                  onChange={(e) => set({ essential: e.target.checked })}
                />
                {t("cashFlows.essentialHint")}
              </label>
            )}
            <TextField label={t("cashFlows.categoryOptional")} value={c.category ?? ""} onChange={(v) => set({ category: v })} placeholder={t("cashFlows.categoryPlaceholder")} />
            <div className="field field-actions">
              <label>&nbsp;</label>
              <button className="btn danger" onClick={() => store.removeCashFlow(c.id)}>
                {t("cashFlows.delete")}
              </button>
            </div>
          </div>
          {needsAnchor && (
            <span className="meta">{t("cashFlows.incomeSplitNote")}</span>
          )}
        </div>
      )}
    </div>
  );
}

export function CashFlowsView() {
  const { t } = useLocale();
  const store = useFinance();
  const { cashFlows, privacy } = store.data;
  const [flowQuery, setFlowQuery] = useState("");
  const [flowFilter, setFlowFilter] = useState<"all" | "income" | "expense">("all");
  const [flowSort, setFlowSort] = useState<CashFlowSort>("logic");
  const [addFlowOpen, setAddFlowOpen] = useState(false);
  const flowBulkOpenVersion = 0;
  const flowBulkOpenValue = false;

  const addCashFlow = (type: CashFlowType) => {
    store.upsertCashFlow({
      id: uid("cf"),
      name: "",
      type,
      frequency: "monthly",
      amount: 0,
      essential: type === "expense",
    });
    setAddFlowOpen(false);
  };

  const flowQ = flowQuery.trim().toLowerCase();
  const filteredFlows = cashFlows
    .filter((c) => {
      const qOk =
        !flowQ ||
        (c.name || "").toLowerCase().includes(flowQ) ||
        (c.category || "").toLowerCase().includes(flowQ);
      if (!qOk) return false;
      if (flowFilter === "income") return c.type === "income";
      if (flowFilter === "expense") return c.type === "expense";
      return true;
    })
    .slice()
    .sort((a, b) => {
      if (flowSort === "amount-desc") {
        const delta = b.amount - a.amount;
        if (delta !== 0) return delta;
        return (a.name || "").localeCompare(b.name || "", "zh-CN");
      }
      if (flowSort === "amount-asc") {
        const delta = a.amount - b.amount;
        if (delta !== 0) return delta;
        return (a.name || "").localeCompare(b.name || "", "zh-CN");
      }
      if (flowSort === "name") {
        return (a.name || "").localeCompare(b.name || "", "zh-CN");
      }
      const typeDelta = a.type === b.type ? 0 : a.type === "income" ? -1 : 1;
      if (typeDelta !== 0) return typeDelta;
      if (a.frequency !== b.frequency) return a.frequency === "monthly" ? -1 : 1;
      const amountDelta = b.amount - a.amount;
      if (amountDelta !== 0) return amountDelta;
      return (a.name || "").localeCompare(b.name || "", "zh-CN");
    });

  return (
    <div className="accounts-section">
      <div className="section-head">
        <h2 className="section-title">{t("cashFlows.sectionTitle")}</h2>
        <button className="icon-btn" onClick={() => setAddFlowOpen((v) => !v)}>
          {addFlowOpen ? t("cashFlows.addToggleOpen") : t("cashFlows.addToggleClosed")}
        </button>
      </div>
      <p className="muted-note">{t("cashFlows.intro")}</p>
      <div className="filter-bar">
        <div className="field filter-bar-search">
          <label>{t("cashFlows.searchLabel")}</label>
          <input
            className="input"
            value={flowQuery}
            onChange={(e) => setFlowQuery(e.target.value)}
            placeholder={t("cashFlows.searchPlaceholder")}
          />
        </div>
        <div className="field filter-bar-filters">
          <label>{t("cashFlows.filterLabel")}</label>
          <div className="seg">
            <button className={flowFilter === "all" ? "active" : ""} onClick={() => setFlowFilter("all")}>
              {t("cashFlows.filterAll")}
            </button>
            <button className={flowFilter === "income" ? "active" : ""} onClick={() => setFlowFilter("income")}>
              {t("cashFlows.filterIncome")}
            </button>
            <button className={flowFilter === "expense" ? "active" : ""} onClick={() => setFlowFilter("expense")}>
              {t("cashFlows.filterExpense")}
            </button>
          </div>
        </div>
        <SortBySelect
          label={t("cashFlows.sortLabel")}
          value={flowSort}
          onChange={setFlowSort}
          options={[
            { id: "logic", label: t("cashFlows.sortLogic") },
            { id: "amount-desc", label: t("cashFlows.sortAmountDesc") },
            { id: "amount-asc", label: t("cashFlows.sortAmountAsc") },
            { id: "name", label: t("cashFlows.sortName") },
          ]}
        />
      </div>
      {addFlowOpen && (
        <div className="chart-controls mt-2">
          <button className="icon-btn" onClick={() => addCashFlow("income")}>
            {t("cashFlows.addIncome")}
          </button>
          <button className="icon-btn" onClick={() => addCashFlow("expense")}>
            {t("cashFlows.addExpense")}
          </button>
        </div>
      )}
      <div className="grid gap-3">
        {cashFlows.length === 0 && <div className="empty">{t("cashFlows.empty")}</div>}
        {cashFlows.length > 0 && filteredFlows.length === 0 && (
          <div className="empty">{t("cashFlows.emptyFilter")}</div>
        )}
        {filteredFlows.map((c) => (
          <CashFlowRow
            key={`${c.id}-${flowBulkOpenVersion}`}
            c={c}
            privacy={privacy}
            bulkOpenVersion={flowBulkOpenVersion}
            bulkOpenValue={flowBulkOpenValue}
          />
        ))}
      </div>
    </div>
  );
}
