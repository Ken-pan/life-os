import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Trash2, MoreHorizontal } from "lucide-react";
import type { FinanceData } from "../types";
import { useLocale } from "../i18n/context";
import { t } from "../i18n/translate";
import { money, signedMoney, signedMoneyPrecise, moneyPrecise, depositDeltaClass } from "../format";
import { SpendingTrendChart } from "./SpendingTrendChart";
import { BudgetPulseCard } from "./BudgetPulseCard";
import { toTxnPayload } from "./txnPayload";
import {
  accountNamesOf,
  categoriesOf,
  computeRecurring,
  computeStatistics,
  categoryBreakdown,
  monthlySeries,
  searchTxns,
  spendingSummary,
  topMerchants,
  type FlowType,
  type Txn,
} from "../engine/transactions";
import { useTransactions } from "../store/transactions";
import { PurchaseEnrichmentBlock } from "./PurchaseEnrichmentBlock";
import { LedgerProductStrip } from "./LedgerProductStrip";
import { MerchantOrderCatalogSection } from "./MerchantOrderCatalogSection";
import { hasPurchaseEnrichment } from "../engine/purchaseEnrichment";
import {
  ledgerAccountColumn,
  ledgerMetaLine,
  ledgerTitle,
} from "../engine/ledgerDisplay";

type Window = "month" | "3m" | "12m" | "all";

/** 把 asOf 日期回退 n 个月，返回 "YYYY-MM-DD"。 */
function monthsBeforeAsOf(asOf: string, n: number): string {
  const [y, m, d] = asOf.split("-").map(Number);
  const total = y * 12 + (m - 1) - n;
  const yy = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return `${yy}-${String(mm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function windowRange(asOf: string, w: Window): { from?: string; to?: string; label: string } {
  const to = asOf;
  switch (w) {
    case "month":
      return { from: `${asOf.slice(0, 7)}-01`, to, label: t("history.windowMonthLong") };
    case "3m":
      return { from: monthsBeforeAsOf(asOf, 3), to, label: t("history.window3mLong") };
    case "12m":
      return { from: monthsBeforeAsOf(asOf, 12), to, label: t("history.window12mLong") };
    case "all":
    default:
      return { label: t("history.windowAllLong") };
  }
}

export function HistoryView({
  data,
  initialLedgerSearch,
  onLedgerSearchConsumed,
  onQuickAdd,
}: {
  data: FinanceData;
  initialLedgerSearch?: string;
  onLedgerSearchConsumed?: () => void;
  onQuickAdd?: () => void;
}) {
  const { t: tl } = useLocale();
  const privacy = data.privacy;
  const { txns, meta, loading, error, editTxn, removeTxn } = useTransactions();
  const series = useMemo(() => monthlySeries(txns), [txns]);
  const summary = useMemo(() => spendingSummary(series), [series]);
  const recurring = useMemo(() => computeRecurring(txns, { limit: 12 }), [txns]);
  const txnStatistics = useMemo(() => computeStatistics(txns), [txns]);
  const categoryList = useMemo(() => categoriesOf(txns), [txns]);
  const accountList = useMemo(() => accountNamesOf(txns), [txns]);

  const [trendWindow, setTrendWindow] = useState<Window>("month");
  const [catWindow, setCatWindow] = useState<Window>("month");
  const [showInsights, setShowInsights] = useState(false);

  const trendSeries = useMemo(() => {
    if (trendWindow === "all") return series;
    const n = trendWindow === "month" ? 1 : trendWindow === "3m" ? 3 : 12;
    return series.slice(-n - (trendWindow === "month" ? 0 : 1));
  }, [series, trendWindow]);

  const catRange = windowRange(meta.asOf, catWindow);
  const categories = useMemo(
    () => categoryBreakdown(txns, { from: catRange.from, to: catRange.to }),
    [txns, catRange.from, catRange.to]
  );
  const merchants = useMemo(
    () => topMerchants(txns, { from: catRange.from, to: catRange.to, limit: 12 }),
    [txns, catRange.from, catRange.to]
  );
  const maxCat = categories[0]?.amount ?? 1;
  const categoryLimit = catWindow === "month" ? 8 : 14;
  const merchantLimit = catWindow === "month" ? 8 : 12;
  const latest = summary.latestMonth;
  const thisMonthSpending = latest?.spending ?? 0;
  const enrichedBySource = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of txns) {
      if (!hasPurchaseEnrichment(t)) continue;
      const source = t.purchaseEnrichment.source;
      counts.set(source, (counts.get(source) ?? 0) + 1);
    }
    return counts;
  }, [txns]);
  const enrichmentSourceOrder = ["amazon", "bestbuy", "target"] as const;
  const sortedEnrichmentSources = useMemo(
    () =>
      [...enrichedBySource.entries()].sort(([a], [b]) => {
        const ai = enrichmentSourceOrder.indexOf(a as (typeof enrichmentSourceOrder)[number]);
        const bi = enrichmentSourceOrder.indexOf(b as (typeof enrichmentSourceOrder)[number]);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      }),
    [enrichedBySource],
  );
  const enrichmentSearchBySource: Record<string, string> = {
    amazon: "Amazon",
    bestbuy: "Best Buy",
    target: "Target",
  };
  const ledgerRef = useRef<HTMLDivElement>(null);
  const [jumpLedgerSearch, setJumpLedgerSearch] = useState<string | undefined>();

  if (loading) return <div className="card">{tl("history.loading")}</div>;
  if (error) return <div className="card">{tl("history.loadFailed", { error })}</div>;

  return (
    <div className="history-view">
      <details className="history-intro-details">
        <summary className="history-intro-summary">
          {tl("history.introSummary", {
            start: meta.dateRange.start,
            end: meta.dateRange.end,
            count: meta.rowCount.toLocaleString(),
          })}
        </summary>
        <p className="muted-note history-intro mb-0 mt-1">
          {tl("history.intro", {
            start: meta.dateRange.start,
            end: meta.dateRange.end,
            count: meta.rowCount.toLocaleString(),
          })}
        </p>
      </details>

      <section className="history-summary">
        {sortedEnrichmentSources.map(([source, count]) => {
          const sourceLabel = purchaseSourceLabel(source, tl);
          return (
          <div className="card purchase-enrichment-banner" key={source}>
            <div className="purchase-enrichment-banner-text">
              <strong>{tl("history.purchaseBannerTitle", { source: sourceLabel, count })}</strong>
              <p className="muted-note text-sm mb-0">{tl("history.purchaseBannerHint")}</p>
            </div>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setJumpLedgerSearch(enrichmentSearchBySource[source] ?? source);
                ledgerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              {tl("history.purchaseBannerAction", { source: sourceLabel })}
            </button>
          </div>
          );
        })}

        <MerchantOrderCatalogSection
          catalog={data.merchantOrderCatalog}
          privacy={privacy}
        />

        <BudgetPulseCard data={data} onQuickAdd={onQuickAdd} compact />
      </section>

      {/* 账本 — 主任务优先 */}
      <div ref={ledgerRef} id="history-ledger">
        <Ledger
          privacy={privacy}
          txns={txns}
          categoryList={categoryList}
          accountList={accountList}
          onEdit={editTxn}
          onDelete={removeTxn}
          initialSearch={jumpLedgerSearch ?? initialLedgerSearch}
          onInitialSearchConsumed={() => {
            setJumpLedgerSearch(undefined);
            onLedgerSearchConsumed?.();
          }}
        />
      </div>

      <div className="history-insights-toggle">
        <button
          className="btn ghost"
          onClick={() => setShowInsights((v) => !v)}
          aria-expanded={showInsights}
        >
          {showInsights ? tl("history.collapseInsights") : tl("history.expandInsights")}
        </button>
      </div>

      <div className={`history-insights${showInsights ? " open" : ""}`}>
        {showInsights && (
        <>
        <div className="card history-kpi-card">
          <h3>{tl("history.extendedKpiTitle")}</h3>
          <div className="grid history-kpi-grid mt-2-5">
            <Kpi
              label={tl("history.kpiAvgSpending")}
              value={summary.avgMonthlySpending}
              sub={
                summary.monthsCounted === 1
                  ? tl("history.kpiAvgSpendingSubOne")
                  : tl("history.kpiAvgSpendingSub", { months: summary.monthsCounted })
              }
              privacy={privacy}
            />
            <Kpi
              label={tl("history.kpiAvgIncome")}
              value={summary.avgMonthlyIncome}
              sub={tl("history.kpiAvgIncomeSub")}
              privacy={privacy}
            />
            <Kpi
              label={tl("history.kpiThisMonth", { month: latest?.month ?? "—" })}
              value={latest?.spending ?? 0}
              sub={
                latest
                  ? tl("history.kpiNetSub", { amount: signedMoney(latest.net, privacy) })
                  : tl("history.kpiNoData")
              }
              privacy={privacy}
            />
            <Kpi
              label={tl("history.kpiTrailing12")}
              value={summary.trailing12mSpending}
              sub={tl("history.kpiHighestMonth", {
                amount: money(summary.highestMonth?.spending ?? 0, privacy),
              })}
              privacy={privacy}
            />
          </div>
        </div>

        <PlanReality data={data} actualMonthly={thisMonthSpending} thisMonth />

        {/* 月度趋势 */}
        <div className="card">
          <div className="card-head">
            <h3>{tl("history.trendTitle")}</h3>
            <WindowSeg value={trendWindow} onChange={setTrendWindow} />
          </div>
          <SpendingTrendChart series={trendSeries} privacy={privacy} />
          <p className="muted-note mt-2">{tl("history.trendNote")}</p>
        </div>

        <div className="grid cols-2">
          {/* 类别构成 */}
          <div className="card">
            <div className="card-head">
              <h3>{tl("history.categoriesTitle", { range: catRange.label })}</h3>
              <WindowSeg value={catWindow} onChange={setCatWindow} />
            </div>
            {categories.length === 0 ? (
              <p className="muted-note">{tl("history.noSpendingInRange")}</p>
            ) : (
              <div className="cat-list">
                {categories.slice(0, categoryLimit).map((c) => (
                  <div className="cat-row" key={c.category}>
                    <div className="cat-top">
                      <span className="cat-name">{c.category}</span>
                      <span className="cat-amt">{money(c.amount, privacy)}</span>
                    </div>
                    <div className="cat-bar">
                      <div
                        className="cat-bar-fill"
                        style={{ width: `${Math.max(2, (c.amount / maxCat) * 100)}%` }}
                      />
                    </div>
                    <div className="cat-meta">
                      {c.count === 1
                        ? tl("history.categoryMetaOne", { pct: (c.pct * 100).toFixed(1) })
                        : tl("history.categoryMeta", {
                            pct: (c.pct * 100).toFixed(1),
                            count: c.count,
                          })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 周期账单 */}
          <div className="card">
            <h3>{tl("history.recurringTitle")}</h3>
            <p className="muted-note mb-2-5">{tl("history.recurringNote")}</p>
            <div className="list recurring-list">
              {recurring.map((r) => (
                <div className="item" key={r.merchant}>
                  <div className="grow">
                    <div className="name">{r.merchant}</div>
                    <div className="meta">
                      {tl("history.recurringMeta", {
                        months: r.distinctMonths,
                        count: r.transactionCount,
                        lastSeen: r.lastSeen,
                      })}
                    </div>
                  </div>
                  <div className="amount text-secondary">
                    {money(r.averageAmount, privacy)}
                    {tl("history.perOccurrence")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top 商户 */}
        <div className="card">
          <h3>{tl("history.topMerchantsTitle", { range: catRange.label })}</h3>
          {merchants.length === 0 ? (
            <p className="muted-note">{tl("history.noSpendingInRange")}</p>
          ) : (
            <div className="grid merchant-grid">
              {merchants.slice(0, merchantLimit).map((m, i) => (
                <div className="merchant-cell" key={m.merchant}>
                  <span className="merchant-rank">{i + 1}</span>
                  <div className="grow">
                    <div className="name">{m.merchant}</div>
                    <div className="meta">{tl("history.merchantMeta", { count: m.count })}</div>
                  </div>
                  <span className="amount">{money(m.amount, privacy)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        </>
        )}
      </div>

      <p className="muted-note">
        {tl("history.footnote", {
          ccPayments: txnStatistics.creditCardPaymentRows,
          transfers: txnStatistics.internalTransferRows,
          mirrors: txnStatistics.mirrorDuplicateRowsExcludedFromAnalytics,
        })}
      </p>
    </div>
  );
}

function purchaseSourceLabel(
  source: string,
  tl: (key: string) => string,
): string {
  if (source === "amazon") return tl("history.purchaseSourceAmazon");
  if (source === "bestbuy") return tl("history.purchaseSourceBestbuy");
  if (source === "target") return tl("history.purchaseSourceTarget");
  return source;
}

/** 月度等额化某条现金流（年度→/12）。 */
function toMonthly(amount: number, frequency: "monthly" | "annual"): number {
  return frequency === "annual" ? amount / 12 : amount;
}

/** 把「预测里假设的月度支出」与「历史真实月均花销」并排对照。 */
function PlanReality({
  data,
  actualMonthly,
  thisMonth = false,
}: {
  data: FinanceData;
  actualMonthly: number;
  thisMonth?: boolean;
}) {
  const { t: tl } = useLocale();
  const privacy = data.privacy;
  const plannedMonthly = data.cashFlows
    .filter((c) => c.type === "expense")
    .reduce((a, c) => a + toMonthly(c.amount, c.frequency), 0);
  if (plannedMonthly <= 0 || actualMonthly <= 0) return null;

  const diff = actualMonthly - plannedMonthly;
  const overspend = diff > 0;
  const ratio = plannedMonthly > 0 ? diff / plannedMonthly : 0;
  const meaningful = Math.abs(ratio) >= 0.05;
  const actualLabel = thisMonth ? tl("history.actualThisMonth") : tl("history.actualMonthly");

  return (
    <div className="card">
      <h3>{tl("history.planRealityTitle")}</h3>
      <div className="grid plan-reality-grid gap-3">
        <div className="kv-stack">
          <span className="text-secondary">{tl("history.plannedMonthly")}</span>
          <span className="pr-value records-metric">{money(plannedMonthly, privacy)}</span>
        </div>
        <div className="kv-stack">
          <span className="text-secondary">{actualLabel}</span>
          <span className="pr-value records-metric">{money(actualMonthly, privacy)}</span>
        </div>
        <div className="kv-stack">
          <span className="text-secondary">{tl("history.diff")}</span>
          <span className={`pr-value records-metric ${depositDeltaClass(-diff)}`}>
            {signedMoney(diff, privacy)}
          </span>
        </div>
      </div>
      <p className="muted-note mt-2-5">
        {!meaningful
          ? tl("history.planMatch")
          : overspend
            ? tl("history.planOverspend", { pct: (ratio * 100).toFixed(0) })
            : tl("history.planUnderspend", { pct: (Math.abs(ratio) * 100).toFixed(0) })}
      </p>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  privacy,
}: {
  label: string;
  value: number;
  sub?: string;
  privacy: boolean;
}) {
  return (
    <div className="history-kpi-cell">
      <span className="label">{label}</span>
      <span className="value records-metric">{money(value, privacy)}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

function WindowSeg({ value, onChange }: { value: Window; onChange: (w: Window) => void }) {
  const { t: tl } = useLocale();
  const labels: { id: Window; label: string }[] = [
    { id: "month", label: tl("history.windowMonth") },
    { id: "3m", label: tl("history.window3m") },
    { id: "12m", label: tl("history.window12m") },
    { id: "all", label: tl("history.windowAll") },
  ];
  return (
    <div className="seg">
      {labels.map((w) => (
        <button
          key={w.id}
          className={value === w.id ? "active" : ""}
          onClick={() => onChange(w.id)}
        >
          {w.label}
        </button>
      ))}
    </div>
  );
}

const PAGE_SIZE = 40;

function flowOptions(tl: (key: string) => string): { id: FlowType | "all"; label: string }[] {
  return [
    { id: "all", label: tl("history.flowAll") },
    { id: "expense", label: tl("history.flowExpense") },
    { id: "income", label: tl("history.flowIncome") },
    { id: "credit_card_payment", label: tl("history.flowCcPayment") },
    { id: "internal_transfer", label: tl("history.flowTransfer") },
    { id: "refund_or_reversal", label: tl("history.flowRefund") },
    { id: "reconcile_adjustment", label: tl("history.flowReconcile") },
  ];
}

function Ledger({
  privacy,
  txns,
  categoryList,
  accountList,
  onEdit,
  onDelete,
  initialSearch,
  onInitialSearchConsumed,
}: {
  privacy: boolean;
  txns: Txn[];
  categoryList: string[];
  accountList: string[];
  onEdit: (t: Txn) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  initialSearch?: string;
  onInitialSearchConsumed?: () => void;
}) {
  const { t: tl } = useLocale();
  const flowOpts = useMemo(() => flowOptions(tl), [tl]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [account, setAccount] = useState("");
  const [flow, setFlow] = useState<FlowType | "all">("all");
  const [spendingOnly, setSpendingOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!initialSearch) return;
    setSearch(initialSearch);
    setShowFilters(true);
    onInitialSearchConsumed?.();
  }, [initialSearch, onInitialSearchConsumed]);

  const results = useMemo(() => {
    return searchTxns(txns, {
      search: search || undefined,
      category: category || undefined,
      account: account || undefined,
      flow,
      spendingOnly,
    });
  }, [txns, search, category, account, flow, spendingOnly]);

  const totalSpending = useMemo(
    () => results.reduce((a, t) => a + (t.inSpending ? -t.budgetImpact : 0), 0),
    [results]
  );

  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const shown = results.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const reset = (fn: () => void) => {
    fn();
    setPage(0);
  };

  return (
    <div className="card ledger-card">
      <div className="card-head">
        <h3>{tl("history.ledgerTitle", { count: results.length.toLocaleString() })}</h3>
        <div className="section-head-actions">
          <span className="text-muted text-sm">
            {tl("history.ledgerSpendingTotal", { amount: moneyPrecise(totalSpending, privacy) })}
          </span>
          <button className="icon-btn ledger-filter-toggle" onClick={() => setShowFilters((v) => !v)}>
            {showFilters ? tl("history.hideFilters") : tl("history.showFilters")}
          </button>
        </div>
      </div>

      {showFilters && <div className="ledger-filter-backdrop" onClick={() => setShowFilters(false)} />}
      <div className={`ledger-filter-panel${showFilters ? " open" : ""}`}>
        <div className="ledger-filters">
          <input
            className="input"
            placeholder={tl("history.searchPlaceholder")}
            value={search}
            onChange={(e) => reset(() => setSearch(e.target.value))}
          />
          <select className="input" value={category} onChange={(e) => reset(() => setCategory(e.target.value))}>
            <option value="">{tl("history.allCategories")}</option>
            {categoryList.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select className="input" value={account} onChange={(e) => reset(() => setAccount(e.target.value))}>
            <option value="">{tl("history.allAccounts")}</option>
            {accountList.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={flow}
            onChange={(e) => reset(() => setFlow(e.target.value as FlowType | "all"))}
          >
            {flowOpts.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <label className="ledger-check">
            <input
              type="checkbox"
              checked={spendingOnly}
              onChange={(e) => reset(() => setSpendingOnly(e.target.checked))}
            />
            {tl("history.expensesOnly")}
          </label>
        </div>
        <div className="ledger-filter-actions">
          <button className="btn ghost" onClick={() => setShowFilters(false)}>
            {tl("history.done")}
          </button>
        </div>
      </div>

      <div className="ledger" role="list">
        {shown.map((t, i) => (
          <LedgerRow
            key={t.id ?? `${t.date}-${i}-${t.merchant}`}
            t={t}
            privacy={privacy}
            editing={editingId === t.id}
            busy={busyId === t.id}
            onStartEdit={() => setEditingId(t.id ?? null)}
            onCancelEdit={() => setEditingId(null)}
            onSaveEdit={async (next) => {
              if (!t.id) return;
              setBusyId(t.id);
              try {
                await onEdit(next);
                setEditingId(null);
              } finally {
                setBusyId(null);
              }
            }}
            onDelete={async () => {
              if (!t.id) return;
              setBusyId(t.id);
              try {
                await onDelete(t.id);
              } finally {
                setBusyId(null);
              }
            }}
          />
        ))}
        {shown.length === 0 && <p className="muted-note mt-3 mb-3">{tl("history.noMatches")}</p>}
      </div>

      {pageCount > 1 && (
        <div className="pager">
          <button className="btn ghost" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
            {tl("history.prevPage")}
          </button>
          <span className="text-muted">
            {tl("history.pageOf", { page: safePage + 1, total: pageCount })}
          </span>
          <button
            className="btn ghost"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
          >
            {tl("history.nextPage")}
          </button>
        </div>
      )}
    </div>
  );
}

function LedgerRow({
  t,
  privacy,
  editing,
  busy,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: {
  t: Txn;
  privacy: boolean;
  editing: boolean;
  busy: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (t: Txn) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { t: tl } = useLocale();
  const flowOpts = useMemo(() => flowOptions(tl).filter((o) => o.id !== "all"), [tl]);
  const [merchant, setMerchant] = useState(t.merchant);
  const [category, setCategory] = useState(t.category);
  const [account, setAccount] = useState(t.account);
  const [flow, setFlow] = useState<FlowType>(t.flow);
  const [amount, setAmount] = useState(String(Math.abs(t.amount)));
  const [date, setDate] = useState(t.date);
  const [enrichmentOpen, setEnrichmentOpen] = useState(false);
  const actionSheetRef = useRef<HTMLDialogElement>(null);

  const spend = t.inSpending ? -t.budgetImpact : 0;
  // 收入符号容错：无论导入源用什么符号约定，收入一律显示为绿色正数。
  const income = t.flow === "income" ? Math.abs(t.amount) : 0;
  const signed = income !== 0 ? income : -spend;
  const dim = !t.inSpending && t.flow !== "income";
  const enriched = hasPurchaseEnrichment(t);
  const title = ledgerTitle(t);
  const metaLine = ledgerMetaLine(t, {
    viaImport: (source) => tl("history.ledgerViaImport", { source }),
  });
  const accountCol = ledgerAccountColumn(t);
  const submitEdit = async () => {
    const payload = toTxnPayload({
      date,
      merchant: merchant.trim() || t.merchant,
      category: category.trim() || "Uncategorized",
      account: account.trim() || "Manual",
      flow,
      amount: Number(amount) || 0,
    });
    await onSaveEdit({
      ...t,
      ...payload,
      month: payload.date.slice(0, 7),
    });
  };
  return (
    <div className={`ledger-row${dim ? " is-dim" : ""}${enriched ? " has-enrichment" : ""}`} role="listitem">
      {editing ? (
        <div className="ledger-row-edit">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input className="input" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
          <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} />
          <input className="input" value={account} onChange={(e) => setAccount(e.target.value)} />
          <select className="input" value={flow} onChange={(e) => setFlow(e.target.value as FlowType)}>
            {flowOpts.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <input className="input" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <div className="flex-row-tight">
            <button className="btn ghost" disabled={busy} onClick={() => void submitEdit()}>
              {tl("history.save")}
            </button>
            <button className="btn ghost" disabled={busy} onClick={onCancelEdit}>
              {tl("history.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <>
          <span className="lr-date">{t.date.slice(5)}</span>
          <div className="lr-main">
            <div className="lr-main-head">
              <span className="lr-title">{title}</span>
              <span className={`lr-amt lr-amt--inline ${depositDeltaClass(signed)}`}>
                {signed === 0 ? "—" : signedMoneyPrecise(signed, privacy)}
              </span>
            </div>
            {metaLine && <span className="lr-meta">{metaLine}</span>}
            {enriched && (
              <>
                {!enrichmentOpen && (
                  <LedgerProductStrip enrichment={t.purchaseEnrichment} privacy={privacy} />
                )}
                <PurchaseEnrichmentBlock
                  enrichment={t.purchaseEnrichment}
                  privacy={privacy}
                  chargeDate={t.date}
                  compact
                  showLineItemsInBody={false}
                  onOpenChange={setEnrichmentOpen}
                />
              </>
            )}
          </div>
          {accountCol && <span className="lr-acct text-muted">{accountCol}</span>}
          {!accountCol && <span className="lr-acct lr-acct--empty" aria-hidden />}
          <div className="lr-right">
            <span className={`lr-amt lr-amt--stacked ${depositDeltaClass(signed)}`}>
              {signed === 0 ? "—" : signedMoneyPrecise(signed, privacy)}
            </span>
            {t.id && (
              <>
                <span className="lr-actions lr-actions--desktop">
                  <button
                    type="button"
                    className="icon-btn ledger-icon-btn"
                    disabled={busy}
                    onClick={onStartEdit}
                    aria-label={tl("history.edit")}
                  >
                    <Pencil size={15} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="icon-btn ledger-icon-btn ledger-icon-btn--danger"
                    disabled={busy}
                    onClick={() => void onDelete()}
                    aria-label={tl("history.delete")}
                  >
                    <Trash2 size={15} aria-hidden />
                  </button>
                </span>
                <button
                  type="button"
                  className="icon-btn ledger-icon-btn lr-actions-trigger"
                  disabled={busy}
                  aria-label={tl("history.rowActions")}
                  aria-haspopup="dialog"
                  onClick={() => actionSheetRef.current?.showModal()}
                >
                  <MoreHorizontal size={18} aria-hidden />
                </button>
                <dialog
                  ref={actionSheetRef}
                  className="ledger-action-sheet"
                  onClick={(e) => {
                    if (e.target === actionSheetRef.current) actionSheetRef.current.close();
                  }}
                >
                  <div className="ledger-action-sheet-panel" role="document">
                    <button
                      type="button"
                      className="ledger-action-sheet-item"
                      disabled={busy}
                      onClick={() => {
                        actionSheetRef.current?.close();
                        onStartEdit();
                      }}
                    >
                      {tl("history.edit")}
                    </button>
                    <button
                      type="button"
                      className="ledger-action-sheet-item ledger-action-sheet-item--danger"
                      disabled={busy}
                      onClick={() => {
                        actionSheetRef.current?.close();
                        void onDelete();
                      }}
                    >
                      {tl("history.delete")}
                    </button>
                    <button
                      type="button"
                      className="ledger-action-sheet-item ledger-action-sheet-item--cancel"
                      onClick={() => actionSheetRef.current?.close()}
                    >
                      {tl("history.cancel")}
                    </button>
                  </div>
                </dialog>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
