import { useEffect, useMemo, useState } from "react";
import { getBaselineConfidenceLabels, quoteSafeToSpend } from "../copy/terminology";
import { useLocale } from "../i18n/context";
import { t } from "../i18n/translate";
import type { FinanceData } from "../types";
import { money, signedMoney } from "../format";
import { useTransactions } from "../store/transactions";
import { useFinance } from "../store/store";
import {
  baselineCategoryAverages,
  buildCalibrationRows,
  buildItemCalibrationRows,
  computeBaselineWindows,
  detectRecurringCandidates,
  normalizeAndReviewRows,
  parseCsv,
  suggestColumnMapping,
  validateImportFile,
  type ColumnMapping,
  type CsvParseResult,
  type NormalizedTransactionDraft,
  type ReviewType,
} from "../engine/realityLoop";
import {
  finalizeTransactionImport,
  loadReviewItems,
  updateReviewItemStatus,
  type ImportFinalizePayload,
  type ReviewItemRecord,
} from "../lib/repo";
import { AccountReconcileView } from "./AccountReconcileView";
import { HorizontalTabs, TabPanel } from "./HorizontalTabs";
import { useTimeline } from "../store/timeline";

export type ReviewTab = "import" | "queue" | "baseline" | "calibrate" | "reconcile";
type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

type ReviewFilterId = (typeof REVIEW_FILTER_IDS)[number];

const REVIEW_FILTER_IDS = [
  "all",
  "high",
  "duplicates",
  "transfer",
  "uncategorized",
  "recurring",
  "resolved",
] as const;

function reviewFilters(t: (key: string) => string): { id: ReviewFilterId; label: string }[] {
  return [
    { id: "all", label: t("review.filterAll") },
    { id: "high", label: t("review.filterHigh") },
    { id: "duplicates", label: t("review.filterDuplicates") },
    { id: "transfer", label: t("review.filterTransfer") },
    { id: "uncategorized", label: t("review.filterUncategorized") },
    { id: "recurring", label: t("review.filterRecurring") },
    { id: "resolved", label: t("review.filterResolved") },
  ];
}

function proposedActionLabels(t: (key: string) => string): Record<"increase" | "decrease" | "keep", string> {
  return {
    increase: t("review.actionIncrease"),
    decrease: t("review.actionDecrease"),
    keep: t("review.actionKeep"),
  };
}

export function ReviewView({
  data,
  active,
  onChange,
}: {
  data: FinanceData;
  active?: ReviewTab;
  onChange?: (tab: ReviewTab) => void;
}) {
  const { t } = useLocale();
  const [internalTab, setInternalTab] = useState<ReviewTab>("import");
  const tab = active ?? internalTab;
  const setTab = (next: ReviewTab) => {
    onChange?.(next);
    if (!onChange) setInternalTab(next);
  };
  const { txns, reload } = useTransactions();
  const store = useFinance();
  const [openReviewCount, setOpenReviewCount] = useState(0);
  const windows = useMemo(
    () => computeBaselineWindows(txns, openReviewCount),
    [txns, openReviewCount]
  );
  const sections = useMemo(
    () =>
      [
        { id: "import" as const, label: t("review.tabImport") },
        { id: "queue" as const, label: t("review.tabQueue") },
        { id: "baseline" as const, label: t("review.tabBaseline") },
        { id: "calibrate" as const, label: t("review.tabCalibrate") },
        { id: "reconcile" as const, label: t("review.tabReconcile") },
      ] satisfies { id: ReviewTab; label: string }[],
    [t]
  );

  return (
    <div className="grid gap-4">
      <HorizontalTabs
        items={sections}
        activeId={tab}
        onChange={setTab}
        ariaLabel={t("review.sectionAria")}
      >
        <TabPanel tabId="import" active={tab === "import"}>
          <ImportWizard
            privacy={data.privacy}
            onImported={async () => {
              await reload();
              setTab("baseline");
            }}
          />
        </TabPanel>
        <TabPanel tabId="queue" active={tab === "queue"}>
          <ReviewQueue onOpenCountChange={setOpenReviewCount} />
        </TabPanel>
        <TabPanel tabId="baseline" active={tab === "baseline"}>
          <BaselineView
            privacy={data.privacy}
            windows={windows}
            openReviewCount={openReviewCount}
            onOpenCalibrate={() => setTab("calibrate")}
          />
        </TabPanel>
        <TabPanel tabId="calibrate" active={tab === "calibrate"}>
          <CalibrationView
            privacy={data.privacy}
            data={store.data}
            windows={windows}
            txns={txns}
            onApplied={() => setTab("baseline")}
          />
        </TabPanel>
        <TabPanel tabId="reconcile" active={tab === "reconcile"}>
          <AccountReconcileView data={data} />
        </TabPanel>
      </HorizontalTabs>
    </div>
  );
}

function ImportWizard({
  privacy,
  onImported,
}: {
  privacy: boolean;
  onImported: () => Promise<void>;
}) {
  const { t } = useLocale();
  const { reload } = useTransactions();
  const [step, setStep] = useState<WizardStep>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<ReturnType<typeof validateImportFile> | null>(null);
  const [parsed, setParsed] = useState<CsvParseResult | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [drafts, setDrafts] = useState<NormalizedTransactionDraft[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [completion, setCompletion] = useState<{
    accepted: number;
    excluded: number;
    review: number;
  } | null>(null);
  const recurring = useMemo(() => detectRecurringCandidates(drafts), [drafts]);
  const summary = useMemo(
    () => ({
      totalRows: drafts.length + parseErrors.length,
      acceptedRows: drafts.length,
      excludedRows: drafts.filter((r) => !r.includeInSpendingAnalytics).length,
      reviewRows: drafts.filter((r) => r.reviewFlags.length > 0).length,
    }),
    [drafts, parseErrors.length]
  );

  const selectedRules = useMemo(() => {
    return recurring.slice(0, 8).map((r) => ({
      match_type: "exact" as const,
      match_value: r.merchantLabel,
      normalized_category: r.normalizedCategory,
      flow_type_override: "expense",
      include_in_spending_analytics_override: true,
    }));
  }, [recurring]);

  const onChooseFile = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setCompletion(null);
    const raw = await file.text();
    const nextValidation = validateImportFile(file.name, file.size, raw);
    setValidation(nextValidation);
    if (nextValidation.errors.length > 0) {
      setParsed(null);
      return;
    }
    const parsedCsv = parseCsv(raw, nextValidation.delimiter);
    setParsed(parsedCsv);
    const suggested = suggestColumnMapping(parsedCsv.headers);
    setMapping({
      date: suggested.date ?? "",
      amount: suggested.amount ?? "",
      description: suggested.description ?? "",
      originalDate: suggested.originalDate,
      merchantName: suggested.merchantName,
      category: suggested.category,
      accountName: suggested.accountName,
      accountNumber: suggested.accountNumber,
      institution: suggested.institution,
      accountType: suggested.accountType,
      ignoredFrom: suggested.ignoredFrom,
      amountSign: "negative_is_outflow",
    });
    setStep(2);
  };

  const canPreview = mapping?.date && mapping?.amount && mapping?.description;

  const runPreview = () => {
    if (!parsed || !mapping || !canPreview) return;
    const normalized = normalizeAndReviewRows(parsed, mapping);
    setDrafts(normalized.drafts);
    setParseErrors(normalized.parseErrors);
    setStep(3);
  };

  const finalize = async () => {
    if (!validation || !mapping) return;
    setBusy(true);
    setError(null);
    try {
      const payload: ImportFinalizePayload = {
        sourceFileNameMasked: maskFileName(validation.fileName),
        sourceFileHash: `csv_${hashSimple(validation.fileName + validation.fileSize + validation.rowCount)}`,
        schemaVersion: 1,
        rawRowCount: validation.rowCount,
        acceptedRows: drafts.map((r) => ({
          occurred_on: r.occurredOn,
          original_date: r.originalDate,
          source_account_label: r.sourceAccountLabel,
          source_account_masked: r.sourceAccountMasked,
          institution: r.institution,
          account_type: r.accountType,
          merchant_name: r.merchantName,
          description: r.description,
          source_category: r.sourceCategory,
          normalized_category: r.normalizedCategory,
          source_amount: r.sourceAmount,
          budget_impact: r.budgetImpact,
          net_worth_impact: r.netWorthImpact,
          account_balance_impact: r.accountBalanceImpact,
          flow_type: r.flowType,
          include_in_spending_analytics: r.includeInSpendingAnalytics,
          include_in_cash_flow_history: r.includeInCashFlowHistory,
          review_status: r.reviewStatus,
          review_flags: r.reviewFlags,
          transaction_fingerprint: r.transactionFingerprint,
        })),
        reviewItems: flattenReviewItems(drafts),
        merchantRules: selectedRules,
      };
      const result = await finalizeTransactionImport(payload);
      setCompletion({
        accepted: result.acceptedRowCount,
        excluded: result.excludedRowCount,
        review: result.reviewRowCount,
      });
      await reload();
      await onImported();
      setStep(6);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("review.importFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <h3>{t("review.importTitle")}</h3>
        <span className="text-muted">{t("review.stepOf", { step })}</span>
      </div>
      <p className="muted-note">{t("review.importPrivacyNote")}</p>
      {error && <div className="banner">{error}</div>}

      {step === 1 && (
        <div className="grid gap-3">
          <label className="field">
            <span>{t("review.selectCsv")}</span>
            <input
              className="input"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                void onChooseFile(file);
              }}
            />
          </label>
          {validation && (
            <div className="grid kpi-row-4">
              <StatChip label={t("review.statFileName")} value={maskFileName(validation.fileName)} />
              <StatChip label={t("review.statSize")} value={`${(validation.fileSize / 1024).toFixed(1)} KB`} />
              <StatChip label={t("review.statDelimiter")} value={showDelimiter(validation.delimiter)} />
              <StatChip label={t("review.statRowCount")} value={validation.rowCount.toLocaleString()} />
            </div>
          )}
          {validation?.errors.length ? (
            <ul className="muted-note">
              {validation.errors.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      {step === 2 && parsed && mapping && (
        <div className="grid gap-3">
          <p className="muted-note">
            {t("review.mappingRequired", {
              signRule:
                mapping.amountSign === "negative_is_outflow"
                  ? t("review.signNegativeOutflow")
                  : t("review.signPositiveOutflow"),
            })}
          </p>
          <div className="grid cols-2">
            <MappingSelect label={t("review.mapDate")} value={mapping.date} headers={parsed.headers} onChange={(v) => setMapping({ ...mapping, date: v })} />
            <MappingSelect label={t("review.mapAmount")} value={mapping.amount} headers={parsed.headers} onChange={(v) => setMapping({ ...mapping, amount: v })} />
            <MappingSelect label={t("review.mapDescription")} value={mapping.description} headers={parsed.headers} onChange={(v) => setMapping({ ...mapping, description: v })} />
            <MappingSelect label={t("review.mapMerchant")} value={mapping.merchantName ?? ""} headers={parsed.headers} onChange={(v) => setMapping({ ...mapping, merchantName: v || undefined })} />
            <MappingSelect label={t("review.mapCategory")} value={mapping.category ?? ""} headers={parsed.headers} onChange={(v) => setMapping({ ...mapping, category: v || undefined })} />
            <MappingSelect label={t("review.mapAccount")} value={mapping.accountName ?? ""} headers={parsed.headers} onChange={(v) => setMapping({ ...mapping, accountName: v || undefined })} />
          </div>
          <div className="row">
            <label className="field">
              <span>{t("review.amountSign")}</span>
              <select
                className="input"
                value={mapping.amountSign}
                onChange={(e) =>
                  setMapping({
                    ...mapping,
                    amountSign: e.target.value as ColumnMapping["amountSign"],
                  })
                }
              >
                <option value="negative_is_outflow">{t("review.signOptionNegative")}</option>
                <option value="positive_is_outflow">{t("review.signOptionPositive")}</option>
              </select>
            </label>
          </div>
          <div className="card card-compact">
            <h3>{t("review.previewTitle")}</h3>
            <div className="life-os-scroll-x">
              <table className="review-table">
                <thead>
                  <tr>
                    {parsed.headers.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 10).map((r, i) => (
                    <tr key={i}>
                      {parsed.headers.map((h, j) => (
                        <td key={`${h}-${j}`}>{r[j] ?? ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="row">
            <button className="btn ghost" onClick={() => setStep(1)}>
              {t("review.prev")}
            </button>
            <button className="btn" disabled={!canPreview} onClick={runPreview}>
              {t("review.continuePreview")}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="grid gap-3">
          <div className="grid kpi-row-4">
            <StatChip label={t("review.statTotalRows")} value={summary.totalRows.toLocaleString()} />
            <StatChip label={t("review.statAcceptedRows")} value={summary.acceptedRows.toLocaleString()} />
            <StatChip label={t("review.statExcludedRows")} value={summary.excludedRows.toLocaleString()} />
            <StatChip label={t("review.statReviewRows")} value={summary.reviewRows.toLocaleString()} />
          </div>
          <div className="grid cols-2">
            <BucketCard title={t("review.bucketHighImpact")} lines={buildImpactLines(drafts)} />
            <BucketCard
              title={t("review.bucketRecurring")}
              lines={recurring.slice(0, 5).map((r) =>
                t("review.recurringLine", {
                  merchant: r.merchantLabel,
                  count: r.occurrences,
                  amount: money(r.averageAmount, privacy),
                })
              )}
            />
          </div>
          <p className="muted-note">
            {t("review.importNoBalanceNote", { safeToSpend: quoteSafeToSpend() })}
          </p>
          <div className="row">
            <button className="btn ghost" onClick={() => setStep(2)}>
              {t("review.prev")}
            </button>
            <button className="btn" onClick={() => setStep(4)}>
              {t("review.reviewHighValue")}
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="grid gap-3">
          <IssueList
            title={t("review.issueMirror")}
            rows={pickByFlag(drafts, "mirror_duplicate_candidate")}
            privacy={privacy}
          />
          <IssueList
            title={t("review.issueTransfer")}
            rows={pickByFlag(drafts, "likely_transfer", "likely_credit_card_payment")}
            privacy={privacy}
          />
          <IssueList
            title={t("review.issueUncategorized")}
            rows={pickByFlag(drafts, "large_uncategorized")}
            privacy={privacy}
          />
          <IssueList
            title={t("review.issueRecurring")}
            rows={pickByFlag(drafts, "likely_recurring")}
            privacy={privacy}
          />
          <div className="row">
            <button className="btn ghost" onClick={() => setStep(3)}>
              {t("review.prev")}
            </button>
            <button className="btn" onClick={() => setStep(5)}>
              {t("review.continueConfirm")}
            </button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="grid gap-3">
          <div className="grid kpi-row-4">
            <StatChip label={t("review.statToWrite")} value={drafts.length.toLocaleString()} />
            <StatChip label={t("review.statExcludedAnalytics")} value={drafts.filter((r) => !r.includeInSpendingAnalytics).length.toLocaleString()} />
            <StatChip label={t("review.statOpenReview")} value={flattenReviewItems(drafts).filter((i) => i.status === "open").length.toLocaleString()} />
            <StatChip label={t("review.statRecurringSuggestions")} value={recurring.length.toLocaleString()} />
          </div>
          <p className="muted-note">
            {t("review.importConfirmNote", { safeToSpend: quoteSafeToSpend() })}
          </p>
          <div className="row">
            <button className="btn ghost" onClick={() => setStep(4)}>
              {t("review.prev")}
            </button>
            <button className="btn ghost" onClick={() => setStep(1)}>
              {t("common.cancel")}
            </button>
            <button className="btn" disabled={busy} onClick={() => void finalize()}>
              {busy ? t("review.importing") : t("review.importAccepted")}
            </button>
          </div>
        </div>
      )}

      {step === 6 && completion && (
        <div className="grid gap-3">
          <div className="grid kpi-row-4">
            <StatChip label={t("review.statAcceptedTxns")} value={completion.accepted.toLocaleString()} />
            <StatChip label={t("review.statExcludedTxns")} value={completion.excluded.toLocaleString()} />
            <StatChip label={t("review.statRemainingReview")} value={completion.review.toLocaleString()} />
            <StatChip
              label={t("review.statBaselineStatus")}
              value={completion.accepted > 0 ? t("review.baselineAvailable") : t("review.baselineEmpty")}
            />
          </div>
          <div className="row">
            <button className="btn ghost" onClick={() => setStep(1)}>
              {t("review.continueImport")}
            </button>
            <button className="btn" onClick={() => onImported()}>
              {t("review.viewBaseline")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MappingSelect({
  label,
  value,
  headers,
  onChange,
}: {
  label: string;
  value: string;
  headers: string[];
  onChange: (v: string) => void;
}) {
  const { t } = useLocale();
  return (
    <label className="field">
      <span>{label}</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t("review.unmapped")}</option>
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </label>
  );
}

function ReviewQueue({
  onOpenCountChange,
}: {
  onOpenCountChange: (n: number) => void;
}) {
  const { t } = useLocale();
  const filters = useMemo(() => reviewFilters(t), [t]);
  const [rows, setRows] = useState<ReviewItemRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<ReviewFilterId>("all");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const status = filter === "resolved" ? "resolved" : "open";
      const data = await loadReviewItems(status);
      setRows(data);
      onOpenCountChange(data.filter((r) => r.status === "open").length);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("review.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      await load();
    })();
    // load 依赖 filter，按筛选切换重新拉取
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const filtered = useMemo(() => rows.filter((r) => matchReviewFilter(r, filter)), [rows, filter]);

  const applyStatus = async (row: ReviewItemRecord, status: "resolved" | "ignored") => {
    await updateReviewItemStatus(row.id, status, status === "resolved" ? "user-confirmed" : "user-ignored");
    await load();
  };

  return (
    <div className="card">
      <div className="card-head">
        <h3>{t("review.queueTitle")}</h3>
        <button className="btn ghost" onClick={() => void load()}>
          {t("review.refresh")}
        </button>
      </div>
      {error && <div className="banner">{error}</div>}
      <div className="seg wrap">
        {filters.map((f) => (
          <button
            key={f.id}
            className={filter === f.id ? "active" : ""}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="muted-note">{t("review.loadingQueue")}</p>
      ) : (
        <div className="life-os-scroll-x mt-3">
          <table className="review-table">
            <thead>
              <tr>
                <th>{t("review.colDate")}</th>
                <th>{t("review.colReason")}</th>
                <th>{t("review.colSeverity")}</th>
                <th>{t("review.colSuggested")}</th>
                <th>{t("review.colStatus")}</th>
                <th>{t("review.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>{r.createdAt.slice(0, 10)}</td>
                  <td>{truncate(r.reason, 64)}</td>
                  <td>
                    {r.severity === "high"
                      ? t("review.severityHigh")
                      : r.severity === "medium"
                        ? t("review.severityMedium")
                        : t("review.severityLow")}
                  </td>
                  <td>{truncate(r.suggestedAction, 54)}</td>
                  <td>
                    {r.status === "open"
                      ? t("review.statusOpen")
                      : r.status === "resolved"
                        ? t("review.statusResolved")
                        : t("review.statusIgnored")}
                  </td>
                  <td>
                    <div className="flex-row-tight">
                      <button className="btn ghost" onClick={() => void applyStatus(r, "resolved")}>
                        {t("review.confirm")}
                      </button>
                      <button className="btn ghost" onClick={() => void applyStatus(r, "ignored")}>
                        {t("review.ignore")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="muted-note">{t("review.noItemsInFilter")}</p>}
        </div>
      )}
      <p className="muted-note">{t("review.queueFootnote")}</p>
    </div>
  );
}

function BaselineWindowCard({
  w,
  privacy,
}: {
  w: ReturnType<typeof computeBaselineWindows>[number];
  privacy: boolean;
}) {
  const { t } = useLocale();
  return (
    <>
      <div className="grid kpi-row-4">
        <StatChip label={t("review.baselineAvgSpending")} value={money(w.averageMonthlySpending, privacy)} />
        <StatChip label={t("review.baselineMedianSpending")} value={money(w.medianMonthlySpending, privacy)} />
        <StatChip label={t("review.baselineMonthlyIncome")} value={money(Math.abs(w.monthlyIncome), privacy)} />
        <StatChip label={t("review.baselineMonthlyNet")} value={signedMoney(w.monthlyNetCashFlow, privacy)} />
      </div>
      <div className="grid baseline-kpi-pair">
        <StatChip label={t("review.baselineRecurring")} value={money(w.recurringSpending, privacy)} />
        <StatChip label={t("review.baselineOneTime")} value={money(w.oneTimeSpending, privacy)} />
      </div>
      {w.confidenceReasons.length > 0 && (
        <ul className="muted-note mt-2">
          {w.confidenceReasons.map((msg) => (
            <li key={msg}>{msg}</li>
          ))}
        </ul>
      )}
    </>
  );
}

function BaselineView({
  privacy,
  windows,
  openReviewCount,
  onOpenCalibrate,
}: {
  privacy: boolean;
  windows: ReturnType<typeof computeBaselineWindows>;
  openReviewCount: number;
  onOpenCalibrate: () => void;
}) {
  const { t } = useLocale();
  const allNotReady = windows.every((w) => w.confidence === "Not ready");
  const sample = windows[windows.length - 1] ?? windows[0];

  return (
    <div className="grid gap-3">
      {allNotReady && sample ? (
        <div className="card">
          <div className="card-head">
            <h3>{t("review.baselineInsufficientTitle")}</h3>
            <span className="tag warn">{getBaselineConfidenceLabels()["Not ready"]}</span>
          </div>
          <p className="muted-note mb-2">{t("review.baselineInsufficientNote")}</p>
          <BaselineWindowCard w={sample} privacy={privacy} />
        </div>
      ) : (
        windows.map((w) => (
          <div className="card" key={w.windowMonths}>
            <div className="card-head">
              <h3>{t("review.baselineWindowTitle", { months: w.windowMonths })}</h3>
              <span className={`tag${w.confidence === "Not ready" ? " warn" : ""}`}>
                {getBaselineConfidenceLabels()[w.confidence]}
              </span>
            </div>
            <BaselineWindowCard w={w} privacy={privacy} />
          </div>
        ))
      )}
      <div className="card">
        <h3>{t("review.baselineTrustTitle")}</h3>
        <p className="muted-note">
          {t("review.baselineOpenReviewNote", { count: openReviewCount })}
        </p>
        <button className="btn" onClick={onOpenCalibrate}>
          {t("review.baselineUpdatePlan")}
        </button>
      </div>
    </div>
  );
}

function CalibrationView({
  privacy,
  data,
  windows,
  txns,
  onApplied,
}: {
  privacy: boolean;
  data: FinanceData;
  windows: ReturnType<typeof computeBaselineWindows>;
  txns: ReturnType<typeof useTransactions>["txns"];
  onApplied: () => void;
}) {
  const { t } = useLocale();
  const actionLabels = useMemo(() => proposedActionLabels(t), [t]);
  const store = useFinance();
  const { occurrences } = useTimeline();
  const defaultWindow =
    windows.find((w) => w.windowMonths === 6)?.confidence !== "Not ready"
      ? 6
      : (windows.find((w) => w.confidence !== "Not ready")?.windowMonths ?? 3);
  const [windowMonths, setWindowMonths] = useState<3 | 6 | 12>(defaultWindow as 3 | 6 | 12);
  const [calibrationMode, setCalibrationMode] = useState<"item" | "category">("item");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const baselineByCategory = useMemo(
    () => baselineCategoryAverages(txns, windowMonths),
    [txns, windowMonths]
  );
  const itemRows = useMemo(
    () => buildItemCalibrationRows(data.cashFlows, occurrences, { lookbackMonths: windowMonths }),
    [data.cashFlows, occurrences, windowMonths]
  );
  const categoryRows = useMemo(
    () => buildCalibrationRows(data.cashFlows, baselineByCategory),
    [data.cashFlows, baselineByCategory]
  );
  const rows = calibrationMode === "item" && itemRows.length > 0 ? itemRows : categoryRows;
  const activeMode = calibrationMode === "item" && itemRows.length > 0 ? "item" : "category";
  const chosen = rows.filter((r) => selected[r.key]);
  const monthlyDelta = chosen.reduce((a, r) => a + r.difference, 0);
  const yearlyDelta = monthlyDelta * 12;

  const applySelected = () => {
    for (const row of chosen) {
      const target =
        row.sourceId != null
          ? data.cashFlows.find((c) => c.id === row.sourceId)
          : data.cashFlows.find(
              (c) => c.type === "expense" && (c.category ?? c.name) === row.category
            );
      if (!target) continue;
      store.upsertCashFlow({
        ...target,
        amount: row.actualMonthlyBaseline,
        frequency: "monthly",
      });
    }
    onApplied();
  };

  return (
    <div className="card">
      <div className="card-head">
        <h3>{t("review.calibrateTitle")}</h3>
      </div>
      <p className="muted-note">
        {activeMode === "item" ? t("review.calibrateModeItem") : t("review.calibrateModeCategory")}
        {t("review.calibrateApplyNote")}
      </p>
      <div className="row">
        <label className="field">
          <span>{t("review.calibrateWindow")}</span>
          <select
            className="input"
            value={windowMonths}
            onChange={(e) => setWindowMonths(Number(e.target.value) as 3 | 6 | 12)}
          >
            <option value={3}>{t("review.calibrateWindow3")}</option>
            <option value={6}>{t("review.calibrateWindow6")}</option>
            <option value={12}>{t("review.calibrateWindow12")}</option>
          </select>
        </label>
        {itemRows.length > 0 && (
          <label className="field">
            <span>{t("review.calibrateCompareMode")}</span>
            <select
              className="input"
              value={activeMode}
              onChange={(e) => setCalibrationMode(e.target.value as "item" | "category")}
            >
              <option value="item">{t("review.calibrateModeItemOption", { count: itemRows.length })}</option>
              <option value="category">{t("review.calibrateModeCategoryOption")}</option>
            </select>
          </label>
        )}
      </div>
      <div className="life-os-scroll-x mt-2">
        <table className="review-table">
          <thead>
            <tr>
              <th>{t("review.colApply")}</th>
              <th>{activeMode === "item" ? t("review.colPlanItem") : t("review.colPlanCategory")}</th>
              {activeMode === "item" && <th>{t("review.colHits")}</th>}
              <th>{t("review.colPlannedMonthly")}</th>
              <th>{activeMode === "item" ? t("review.colActualMedian") : t("review.colActualBaseline")}</th>
              <th>{t("review.colDifference")}</th>
              <th>{t("review.colSuggestedAction")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>
                  <input
                    type="checkbox"
                    checked={Boolean(selected[r.key])}
                    onChange={(e) =>
                      setSelected({ ...selected, [r.key]: e.target.checked })
                    }
                  />
                </td>
                <td>
                  {r.label}
                  {activeMode === "item" && r.category !== r.label && (
                    <span className="text-secondary text-sm inline-meta-tight">
                      {r.category}
                    </span>
                  )}
                </td>
                {activeMode === "item" && <td>{r.hitCount ?? 0}</td>}
                <td>{money(r.plannedMonthlyAmount, privacy)}</td>
                <td>{money(r.actualMonthlyBaseline, privacy)}</td>
                <td>{signedMoney(r.difference, privacy)}</td>
                <td>{actionLabels[r.proposedAction]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid kpi-row-4 mt-3">
        <StatChip label={t("review.calibrateMonthlyDelta")} value={signedMoney(-monthlyDelta, privacy)} />
        <StatChip label={t("review.calibrateInvestableDelta")} value={signedMoney(-monthlyDelta, privacy)} />
        <StatChip label={t("review.calibrateDelta1y")} value={signedMoney(-yearlyDelta, privacy)} />
        <StatChip label={t("review.calibrateDelta5y")} value={signedMoney(-(yearlyDelta * 5), privacy)} />
      </div>
      <div className="grid cols-2 mt-2">
        <StatChip label={t("review.calibrateDelta10y")} value={signedMoney(-(yearlyDelta * 10), privacy)} />
        <StatChip
          label={t("review.calibrateStsPreview", { safeToSpend: quoteSafeToSpend() })}
          value={signedMoney(-monthlyDelta * 0.8, privacy)}
        />
      </div>
      <p className="muted-note mt-2-5">{t("review.calibrateFootnote")}</p>
      <div className="row">
        <button className="btn ghost" onClick={onApplied}>
          {t("common.cancel")}
        </button>
        <button className="btn" onClick={applySelected} disabled={chosen.length === 0}>
          {t("review.calibrateApplySelected")}
        </button>
      </div>
    </div>
  );
}

function flattenReviewItems(
  drafts: NormalizedTransactionDraft[]
): ImportFinalizePayload["reviewItems"] {
  const rows: ImportFinalizePayload["reviewItems"] = [];
  for (const row of drafts) {
    for (const flag of row.reviewFlags) {
      rows.push({
        transaction_fingerprint: row.transactionFingerprint,
        review_type: flag.type,
        severity: flag.severity,
        reason: flag.reason,
        suggested_action: flag.suggestedAction,
        status: "open",
      });
    }
  }
  return rows;
}

function pickByFlag(
  drafts: NormalizedTransactionDraft[],
  ...types: ReviewType[]
): NormalizedTransactionDraft[] {
  return drafts
    .filter((r) => r.reviewFlags.some((f) => types.includes(f.type)))
    .slice(0, 8);
}

function buildImpactLines(drafts: NormalizedTransactionDraft[]): string[] {
  const flagCount = (type: ReviewType) =>
    drafts.filter((r) => r.reviewFlags.some((f) => f.type === type)).length;
  return [
    t("review.impactMirror", { count: flagCount("mirror_duplicate_candidate") }),
    t("review.impactSameFileDup", { count: flagCount("same_account_duplicate_candidate") }),
    t("review.impactTransfer", { count: flagCount("likely_transfer") }),
    t("review.impactCcPayment", { count: flagCount("likely_credit_card_payment") }),
    t("review.impactUncategorized", { count: flagCount("large_uncategorized") }),
  ];
}

function matchReviewFilter(item: ReviewItemRecord, filter: ReviewFilterId): boolean {
  if (filter === "all") return item.status === "open";
  if (filter === "resolved") return item.status !== "open";
  if (filter === "high") return item.severity === "high";
  if (filter === "duplicates") {
    return (
      item.reviewType.includes("duplicate") || item.reviewType.includes("reimport")
    );
  }
  if (filter === "transfer") {
    return (
      item.reviewType.includes("transfer") ||
      item.reviewType.includes("credit_card_payment")
    );
  }
  if (filter === "uncategorized") return item.reviewType.includes("uncategorized");
  if (filter === "recurring") return item.reviewType.includes("recurring");
  return true;
}

function IssueList({
  title,
  rows,
  privacy,
}: {
  title: string;
  rows: NormalizedTransactionDraft[];
  privacy: boolean;
}) {
  const { t: tl } = useLocale();
  return (
    <div className="card card-compact">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="muted-note">{tl("review.bucketNone")}</p>
      ) : (
        <div className="list">
          {rows.map((r) => (
            <div className="item" key={r.transactionFingerprint}>
              <div className="grow">
                <div className="name">{truncate(r.merchantName, 28)}</div>
                <div className="meta">{r.occurredOn} · {r.normalizedCategory}</div>
              </div>
              <div className="amount">{signedMoney(-r.budgetImpact, privacy)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BucketCard({ title, lines }: { title: string; lines: string[] }) {
  const { t: tl } = useLocale();
  return (
    <div className="card card-compact">
      <h3>{title}</h3>
      {lines.length === 0 ? (
        <p className="muted-note">{tl("review.bucketEmpty")}</p>
      ) : (
        <ul className="muted-note">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="item">
      <div className="grow">
        <div className="meta">{label}</div>
        <div className="name">{value}</div>
      </div>
    </div>
  );
}

function showDelimiter(v: string): string {
  if (v === "\t") return "TAB";
  return v;
}

function truncate(v: string, len: number): string {
  return v.length > len ? `${v.slice(0, len - 1)}…` : v;
}

function maskFileName(name: string): string {
  const idx = name.lastIndexOf(".");
  const base = idx >= 0 ? name.slice(0, idx) : name;
  const ext = idx >= 0 ? name.slice(idx) : "";
  const visible = base.slice(0, 3);
  return `${visible}${"*".repeat(Math.max(0, base.length - 3))}${ext}`;
}

function hashSimple(input: string): string {
  let out = 0;
  for (let i = 0; i < input.length; i += 1) {
    out = (out * 31 + input.charCodeAt(i)) >>> 0;
  }
  return out.toString(16);
}
