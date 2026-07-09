import type { CashFlowItem } from "../types.js";
import type { ExpectedOccurrence } from "./timeline";
import { incomeOf, type Txn } from "./transactions";
import { t } from "../i18n/translate.js";

export const IMPORT_LIMITS = {
  maxFileBytes: 10 * 1024 * 1024,
  maxRows: 25_000,
  maxFilenameLength: 180,
} as const;

export type CsvDelimiter = "," | ";" | "\t" | "|";
export type ImportFlowType =
  | "expense"
  | "income"
  | "refund_or_reversal"
  | "internal_transfer"
  | "credit_card_payment"
  | "ignored"
  | "zero_activity"
  | "unknown";
export type ReviewType =
  | "possible_account_alias"
  | "mirror_duplicate_candidate"
  | "same_account_duplicate_candidate"
  | "same_file_reimport"
  | "large_uncategorized"
  | "likely_transfer"
  | "likely_credit_card_payment"
  | "likely_refund"
  | "likely_recurring"
  | "likely_rent_reclassification";
export type ReviewSeverity = "high" | "medium" | "low";

export interface CsvParseResult {
  delimiter: CsvDelimiter;
  headers: string[];
  rows: string[][];
}

export interface ImportValidationSummary {
  fileName: string;
  fileSize: number;
  delimiter: CsvDelimiter;
  rowCount: number;
  firstDate?: string;
  lastDate?: string;
  errors: string[];
}

export interface ColumnMapping {
  date: string;
  amount: string;
  description: string;
  originalDate?: string;
  merchantName?: string;
  category?: string;
  accountName?: string;
  accountNumber?: string;
  institution?: string;
  accountType?: string;
  ignoredFrom?: string;
  amountSign: "negative_is_outflow" | "positive_is_outflow";
}

export interface ImportReviewFlag {
  type: ReviewType;
  severity: ReviewSeverity;
  reason: string;
  suggestedAction: string;
}

export interface NormalizedTransactionDraft {
  occurredOn: string;
  originalDate?: string;
  merchantName: string;
  description: string;
  sourceCategory?: string;
  normalizedCategory: string;
  sourceAccountLabel?: string;
  sourceAccountMasked?: string;
  institution?: string;
  accountType?: string;
  sourceAmount: number;
  budgetImpact: number;
  netWorthImpact: number;
  accountBalanceImpact: number;
  flowType: ImportFlowType;
  includeInSpendingAnalytics: boolean;
  includeInCashFlowHistory: boolean;
  reviewStatus: "open" | "resolved" | "ignored";
  reviewFlags: ImportReviewFlag[];
  transactionFingerprint: string;
}

export interface ImportPreviewSummary {
  totalRows: number;
  acceptedRows: number;
  excludedRows: number;
  reviewRows: number;
  parseErrors: number;
  duplicateCandidates: number;
  transferCandidates: number;
  creditCardPaymentCandidates: number;
  refundCandidates: number;
  uncategorizedRows: number;
  dateMin?: string;
  dateMax?: string;
  detectedAccounts: string[];
}

export interface RecurringCandidate {
  merchantLabel: string;
  normalizedCategory: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  averageAmount: number;
  amountMin: number;
  amountMax: number;
  cadence: "monthly" | "weekly" | "annual" | "irregular";
  confidence: string;
}

export interface BaselineBucket {
  month: string;
  spending: number;
  income: number;
}

export interface BaselineWindowStats {
  windowMonths: 3 | 6 | 12;
  averageMonthlySpending: number;
  medianMonthlySpending: number;
  monthlyIncome: number;
  monthlyNetCashFlow: number;
  recurringSpending: number;
  oneTimeSpending: number;
  unresolvedReviewCount: number;
  confidence: "Ready to use" | "Review recommended" | "Not ready";
  confidenceReasons: string[];
  buckets: BaselineBucket[];
}

export interface CalibrationRow {
  /** 行唯一键（勾选状态 / apply 用）。 */
  key: string;
  /** 展示名（逐项模式为计划项名称，分类模式为类别）。 */
  label: string;
  category: string;
  plannedMonthlyAmount: number;
  actualMonthlyBaseline: number;
  difference: number;
  proposedAction: "increase" | "decrease" | "keep";
  calibrationMode?: "category" | "item";
  sourceId?: string;
  /** 逐项模式：窗口内 matched/reconciled 命中次数。 */
  hitCount?: number;
}

const CADENCE_LABELS: Record<RecurringCandidate["cadence"], string> = {
  monthly: "每月",
  weekly: "每周",
  annual: "每年",
  irregular: "不规律",
};

const DATE_HINTS = ["date", "posted", "transaction date"];
const AMOUNT_HINTS = ["amount", "amt", "value", "debit", "credit"];
const DESCRIPTION_HINTS = ["description", "memo", "details", "narrative"];

export function detectDelimiter(raw: string): CsvDelimiter | null {
  const firstLine = raw.split(/\r?\n/)[0] ?? "";
  const candidates: CsvDelimiter[] = [",", ";", "\t", "|"];
  let best: CsvDelimiter | null = null;
  let bestScore = -1;
  for (const delimiter of candidates) {
    const score = firstLine.split(delimiter).length;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }
  return bestScore >= 2 ? best : null;
}

export function parseCsv(raw: string, delimiter: CsvDelimiter): CsvParseResult {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    const next = raw[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === delimiter) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell.trim());
      const allEmpty = row.every((v) => v === "");
      if (!allEmpty) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }
  row.push(cell.trim());
  if (row.some((v) => v !== "")) rows.push(row);
  const headers = rows.shift()?.map(normalizeHeader) ?? [];
  return { delimiter, headers, rows };
}

function normalizeHeader(v: string): string {
  return v.replace(/^["']|["']$/g, "").trim();
}

export function suggestColumnMapping(headers: string[]): Partial<ColumnMapping> {
  const findByHints = (hints: string[]) => {
    const lower = headers.map((h) => h.toLowerCase());
    const idx = lower.findIndex((h) => hints.some((hint) => h.includes(hint)));
    return idx >= 0 ? headers[idx] : undefined;
  };
  return {
    date: findByHints(DATE_HINTS),
    amount: findByHints(AMOUNT_HINTS),
    description: findByHints(DESCRIPTION_HINTS),
    originalDate: findByHints(["original", "posted"]),
    merchantName: findByHints(["merchant", "payee", "name"]),
    category: findByHints(["category", "label"]),
    accountName: findByHints(["account", "wallet"]),
    accountNumber: findByHints(["last4", "suffix", "number"]),
    institution: findByHints(["institution", "bank"]),
    accountType: findByHints(["account type", "type"]),
    ignoredFrom: findByHints(["ignore", "excluded"]),
    amountSign: "negative_is_outflow",
  };
}

export function validateImportFile(
  fileName: string,
  fileSize: number,
  raw: string
): ImportValidationSummary {
  const errors: string[] = [];
  if (!fileName.toLowerCase().endsWith(".csv")) errors.push("只支持 .csv 文件");
  if (fileName.length > IMPORT_LIMITS.maxFilenameLength) errors.push("文件名过长");
  if (fileSize > IMPORT_LIMITS.maxFileBytes) errors.push("文件超过 10MB 限制");
  if (!raw.trim()) errors.push("文件内容为空");
  const delimiter = detectDelimiter(raw);
  if (!delimiter) {
    return {
      fileName,
      fileSize,
      delimiter: ",",
      rowCount: 0,
      errors: [...errors, "无法识别 CSV 分隔符"],
    };
  }
  let parsed: CsvParseResult | null = null;
  try {
    parsed = parseCsv(raw, delimiter);
  } catch {
    errors.push("CSV 解析失败");
  }
  const rows = parsed?.rows ?? [];
  if (rows.length > IMPORT_LIMITS.maxRows) errors.push("超过 25,000 行上限");
  if (rows.length === 0) errors.push("未检测到有效数据行");
  const dateCandidates = rows
    .flatMap((r) => r)
    .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v))
    .sort();
  return {
    fileName,
    fileSize,
    delimiter,
    rowCount: rows.length,
    firstDate: dateCandidates[0],
    lastDate: dateCandidates[dateCandidates.length - 1],
    errors,
  };
}

function safeCell(row: Record<string, string>, key?: string): string {
  return key ? (row[key] ?? "").trim() : "";
}

function normalizeDate(value: string): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) {
    const [m, d, y] = value.split("/").map((x) => Number(x));
    if (!y || !m || !d) return null;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}

function parseAmount(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[,$\s]/g, "");
  if (!/^[-+]?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

function normalizeText(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, " ").trim();
}

export function normalizeAndReviewRows(
  parsed: CsvParseResult,
  mapping: ColumnMapping
): { drafts: NormalizedTransactionDraft[]; summary: ImportPreviewSummary; parseErrors: string[] } {
  const parseErrors: string[] = [];
  const drafts: NormalizedTransactionDraft[] = [];
  const duplicateMap = new Map<string, number>();
  const accountSet = new Set<string>();
  let dateMin: string | undefined;
  let dateMax: string | undefined;

  for (let i = 0; i < parsed.rows.length; i += 1) {
    const line = parsed.rows[i];
    const row: Record<string, string> = {};
    for (let j = 0; j < parsed.headers.length; j += 1) {
      row[parsed.headers[j]] = line[j] ?? "";
    }

    const occurredOn = normalizeDate(safeCell(row, mapping.date));
    const amountRaw = parseAmount(safeCell(row, mapping.amount));
    const description = safeCell(row, mapping.description);
    if (!occurredOn || amountRaw == null || !description) {
      parseErrors.push(`第 ${i + 2} 行缺少必填字段或格式无效`);
      continue;
    }

    const sourceAmount = amountRaw;
    const isOutflow =
      mapping.amountSign === "negative_is_outflow"
        ? sourceAmount < 0
        : sourceAmount > 0;
    const normalizedDesc = normalizeText(description);
    const merchantName =
      safeCell(row, mapping.merchantName) || description.slice(0, 80);
    const sourceCategory = safeCell(row, mapping.category) || undefined;
    const sourceAccountLabel = safeCell(row, mapping.accountName) || undefined;
    const sourceAccountMasked = safeCell(row, mapping.accountNumber) || undefined;
    const institution = safeCell(row, mapping.institution) || undefined;
    const accountType = safeCell(row, mapping.accountType) || undefined;
    const ignoredHint = safeCell(row, mapping.ignoredFrom).toLowerCase();
    const flaggedIgnored = ["y", "yes", "true", "1"].includes(ignoredHint);

    const reviewFlags: ImportReviewFlag[] = [];
    let flowType: ImportFlowType = isOutflow ? "expense" : "income";
    let includeInSpendingAnalytics = isOutflow;
    let includeInCashFlowHistory = true;
    let budgetImpact = isOutflow ? -Math.abs(sourceAmount) : Math.abs(sourceAmount);

    if (Math.abs(sourceAmount) < 0.005) {
      flowType = "zero_activity";
      includeInSpendingAnalytics = false;
      includeInCashFlowHistory = false;
      budgetImpact = 0;
    }
    if (flaggedIgnored) {
      flowType = "ignored";
      includeInSpendingAnalytics = false;
      includeInCashFlowHistory = false;
      budgetImpact = 0;
    }

    const looksTransfer = /(transfer|xfer|ach.*to|ach.*from|zelle|venmo)/i.test(
      normalizedDesc
    );
    const looksCardPayment = /(card payment|credit card payment|cc payment|autopay)/i.test(
      normalizedDesc
    );
    const looksRefund = /(refund|reversal|chargeback|returned)/i.test(normalizedDesc);
    const looksRent = /(rent|apartment|landlord|property management)/i.test(
      normalizedDesc
    );

    if (looksTransfer) {
      flowType = "internal_transfer";
      includeInSpendingAnalytics = false;
      budgetImpact = 0;
      reviewFlags.push({
        type: "likely_transfer",
        severity: "high",
        reason: "交易描述匹配转账模式，建议确认是否为账户内部转移",
        suggestedAction: "标记为内部转账并排除生活支出统计",
      });
    } else if (looksCardPayment) {
      flowType = "credit_card_payment";
      includeInSpendingAnalytics = false;
      budgetImpact = 0;
      reviewFlags.push({
        type: "likely_credit_card_payment",
        severity: "high",
        reason: "交易描述匹配信用卡还款模式",
        suggestedAction: "确认并排除生活支出统计",
      });
    } else if (looksRefund) {
      flowType = "refund_or_reversal";
      includeInSpendingAnalytics = true;
      budgetImpact = Math.abs(sourceAmount);
      reviewFlags.push({
        type: "likely_refund",
        severity: "medium",
        reason: "交易描述匹配退款/冲正模式",
        suggestedAction: "确认退款分类以抵扣对应支出",
      });
    }

    const normalizedCategory =
      sourceCategory && sourceCategory !== "Uncategorized"
        ? sourceCategory
        : looksRent
          ? "Housing > Rent"
          : "Uncategorized";
    if (normalizedCategory === "Uncategorized" && Math.abs(sourceAmount) >= 500) {
      reviewFlags.push({
        type: "large_uncategorized",
        severity: "high",
        reason: "高金额未分类交易会显著影响基线可信度",
        suggestedAction: "先确认类别再使用基线",
      });
    }
    if (looksRent && sourceCategory && !/rent/i.test(sourceCategory)) {
      reviewFlags.push({
        type: "likely_rent_reclassification",
        severity: "medium",
        reason: "描述疑似租房，但当前类别并非住房",
        suggestedAction: "考虑改为「住房 > 房租」",
      });
    }

    const fingerprint = buildTransactionFingerprint({
      occurredOn,
      amount: Math.abs(sourceAmount),
      description: normalizedDesc,
      sourceAccountLabel,
      sourceAccountMasked,
    });

    const dupCount = duplicateMap.get(fingerprint) ?? 0;
    duplicateMap.set(fingerprint, dupCount + 1);
    if (dupCount > 0) {
      reviewFlags.push({
        type: "same_account_duplicate_candidate",
        severity: "medium",
        reason: "同导入内出现完全相同指纹交易",
        suggestedAction: "确认是否为重复入账，必要时仅排除分析",
      });
    }

    if (sourceAccountLabel) accountSet.add(sourceAccountLabel);
    if (!dateMin || occurredOn < dateMin) dateMin = occurredOn;
    if (!dateMax || occurredOn > dateMax) dateMax = occurredOn;

    drafts.push({
      occurredOn,
      originalDate: normalizeDate(safeCell(row, mapping.originalDate)) ?? undefined,
      merchantName,
      description,
      sourceCategory,
      normalizedCategory,
      sourceAccountLabel,
      sourceAccountMasked,
      institution,
      accountType,
      sourceAmount: round2(sourceAmount),
      budgetImpact: round2(budgetImpact),
      netWorthImpact: round2(budgetImpact),
      accountBalanceImpact: round2(sourceAmount),
      flowType,
      includeInSpendingAnalytics,
      includeInCashFlowHistory,
      reviewStatus: reviewFlags.length > 0 ? "open" : "resolved",
      reviewFlags,
      transactionFingerprint: fingerprint,
    });
  }

  const summary: ImportPreviewSummary = {
    totalRows: parsed.rows.length,
    acceptedRows: drafts.length,
    excludedRows: drafts.filter((r) => !r.includeInSpendingAnalytics).length,
    reviewRows: drafts.filter((r) => r.reviewFlags.length > 0).length,
    parseErrors: parseErrors.length,
    duplicateCandidates: countFlag(drafts, "same_account_duplicate_candidate"),
    transferCandidates: countFlag(drafts, "likely_transfer"),
    creditCardPaymentCandidates: countFlag(drafts, "likely_credit_card_payment"),
    refundCandidates: countFlag(drafts, "likely_refund"),
    uncategorizedRows: drafts.filter((r) => r.normalizedCategory === "Uncategorized").length,
    dateMin,
    dateMax,
    detectedAccounts: [...accountSet].sort(),
  };
  return { drafts, summary, parseErrors };
}

function countFlag(drafts: NormalizedTransactionDraft[], type: ReviewType): number {
  return drafts.filter((d) => d.reviewFlags.some((f) => f.type === type)).length;
}

export function buildTransactionFingerprint(input: {
  occurredOn: string;
  amount: number;
  description: string;
  sourceAccountLabel?: string;
  sourceAccountMasked?: string;
}): string {
  const key = [
    input.occurredOn,
    input.amount.toFixed(2),
    normalizeText(input.description),
    normalizeText(input.sourceAccountLabel ?? ""),
    normalizeText(input.sourceAccountMasked ?? ""),
  ].join("|");
  return `txn_${hashFNV1a(key)}`;
}

export function hashFNV1a(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function detectRecurringCandidates(
  drafts: NormalizedTransactionDraft[],
  opts: { toleranceRatio?: number; minOccurrences?: number } = {}
): RecurringCandidate[] {
  const toleranceRatio = opts.toleranceRatio ?? 0.2;
  const minOccurrences = opts.minOccurrences ?? 3;
  const groups = new Map<
    string,
    { dates: string[]; amounts: number[]; category: string; merchant: string }
  >();
  for (const row of drafts) {
    if (!row.includeInSpendingAnalytics || row.flowType !== "expense") continue;
    const key = normalizeText(row.merchantName);
    const g = groups.get(key) ?? {
      dates: [],
      amounts: [],
      category: row.normalizedCategory,
      merchant: row.merchantName,
    };
    g.dates.push(row.occurredOn);
    g.amounts.push(Math.abs(row.sourceAmount));
    groups.set(key, g);
  }
  const out: RecurringCandidate[] = [];
  for (const g of groups.values()) {
    if (g.dates.length < minOccurrences) continue;
    const sortedDates = [...g.dates].sort();
    const sortedAmounts = [...g.amounts].sort((a, b) => a - b);
    const avg = g.amounts.reduce((a, n) => a + n, 0) / g.amounts.length;
    const spread = avg > 0 ? (sortedAmounts[sortedAmounts.length - 1] - sortedAmounts[0]) / avg : 1;
    if (spread > toleranceRatio) continue;
    const cadence = detectCadence(sortedDates);
    const cadenceLabel = CADENCE_LABELS[cadence];
    const confidence = `出现 ${g.dates.length} 次，金额波动 ${(spread * 100).toFixed(1)}%，推断为${cadenceLabel}`;
    out.push({
      merchantLabel: g.merchant,
      normalizedCategory: g.category,
      occurrences: g.dates.length,
      firstSeen: sortedDates[0],
      lastSeen: sortedDates[sortedDates.length - 1],
      averageAmount: round2(avg),
      amountMin: round2(sortedAmounts[0]),
      amountMax: round2(sortedAmounts[sortedAmounts.length - 1]),
      cadence,
      confidence,
    });
  }
  return out.sort((a, b) => b.occurrences - a.occurrences);
}

function detectCadence(dates: string[]): RecurringCandidate["cadence"] {
  if (dates.length <= 1) return "irregular";
  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i += 1) {
    const prev = Date.parse(dates[i - 1]);
    const curr = Date.parse(dates[i]);
    gaps.push(Math.abs(curr - prev) / (1000 * 60 * 60 * 24));
  }
  const avgGap = gaps.reduce((a, n) => a + n, 0) / gaps.length;
  if (avgGap >= 25 && avgGap <= 35) return "monthly";
  if (avgGap >= 6 && avgGap <= 9) return "weekly";
  if (avgGap >= 330 && avgGap <= 390) return "annual";
  return "irregular";
}

export function computeBaselineWindows(
  txns: Txn[],
  unresolvedReviewCount: number
): BaselineWindowStats[] {
  return [3, 6, 12].map((windowMonths) =>
    computeBaselineForWindow(txns, windowMonths as 3 | 6 | 12, unresolvedReviewCount)
  );
}

function computeBaselineForWindow(
  txns: Txn[],
  windowMonths: 3 | 6 | 12,
  unresolvedReviewCount: number
): BaselineWindowStats {
  const sorted = [...txns].sort((a, b) => a.month.localeCompare(b.month));
  const recent = sorted.slice(-windowMonths * 120);
  const byMonth = new Map<string, { spending: number; income: number }>();
  for (const t of recent) {
    const month = t.month;
    const agg = byMonth.get(month) ?? { spending: 0, income: 0 };
    if (t.inSpending) agg.spending += -t.budgetImpact;
    if (t.flow === "income") agg.income += incomeOf(t);
    byMonth.set(month, agg);
  }
  const buckets = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-windowMonths)
    .map(([month, v]) => ({
      month,
      spending: round2(v.spending),
      income: round2(v.income),
    }));

  const spendings = buckets.map((b) => b.spending).sort((a, b) => a - b);
  const incomes = buckets.map((b) => b.income);
  const avgSpending = average(spendings);
  const medianSpending = median(spendings);
  const monthlyIncome = average(incomes);
  const monthlyNet = average(buckets.map((b) => b.income - b.spending));
  const recurringSpending = round2(avgSpending * 0.65);
  const oneTimeSpending = round2(avgSpending - recurringSpending);

  const confidenceReasons: string[] = [];
  if (buckets.length < Math.min(windowMonths, 3))
    confidenceReasons.push(t("reality.confidenceInsufficientHistory"));
  if (unresolvedReviewCount > 0)
    confidenceReasons.push(t("reality.confidenceUnresolvedReview"));
  const uncategorizedHeavy = recent.filter(
    (t) => t.inSpending && t.category === "Uncategorized" && -t.budgetImpact >= 500
  ).length;
  if (uncategorizedHeavy > 0)
    confidenceReasons.push(t("reality.confidenceUncategorized"));

  let confidence: BaselineWindowStats["confidence"] = "Ready to use";
  if (confidenceReasons.length >= 2) confidence = "Not ready";
  else if (confidenceReasons.length === 1) confidence = "Review recommended";

  return {
    windowMonths,
    averageMonthlySpending: round2(avgSpending),
    medianMonthlySpending: round2(medianSpending),
    monthlyIncome: round2(monthlyIncome),
    monthlyNetCashFlow: round2(monthlyNet),
    recurringSpending,
    oneTimeSpending,
    unresolvedReviewCount,
    confidence,
    confidenceReasons,
    buckets,
  };
}

export function buildCalibrationRows(
  cashFlows: CashFlowItem[],
  baselineByCategory: Record<string, number>
): CalibrationRow[] {
  const plannedExpense = cashFlows.filter((c) => c.type === "expense");
  return plannedExpense.map((item) => {
    const monthlyPlanned =
      item.frequency === "annual" ? item.amount / 12 : item.amount;
    const category = item.category ?? item.name;
    const actual = baselineByCategory[category] ?? 0;
    const diff = round2(actual - monthlyPlanned);
    return {
      key: category,
      label: category,
      category,
      plannedMonthlyAmount: round2(monthlyPlanned),
      actualMonthlyBaseline: round2(actual),
      difference: diff,
      proposedAction: Math.abs(diff) < 1 ? "keep" : diff > 0 ? "increase" : "decrease",
      calibrationMode: "category",
    };
  });
}

/** P3：按时间轴逐项命中（matched/reconciled）对比计划，建议调到实际中位。 */
export function buildItemCalibrationRows(
  cashFlows: CashFlowItem[],
  occurrences: ExpectedOccurrence[],
  options?: { lookbackMonths?: number; today?: Date }
): CalibrationRow[] {
  const lookbackMonths = options?.lookbackMonths ?? 6;
  const today = options?.today ?? new Date();
  const cutoff = new Date(today.getFullYear(), today.getMonth() - lookbackMonths, today.getDate());
  const cutoffIso = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;

  const settled = occurrences.filter(
    (o) =>
      o.sourceType === "cashflow" &&
      (o.state === "matched" || o.state === "reconciled") &&
      o.date >= cutoffIso &&
      o.expectedAmount < 0
  );

  const bySource = new Map<string, ExpectedOccurrence[]>();
  for (const o of settled) {
    const list = bySource.get(o.sourceId) ?? [];
    list.push(o);
    bySource.set(o.sourceId, list);
  }

  const rows: CalibrationRow[] = [];
  for (const item of cashFlows) {
    if (item.type !== "expense") continue;
    const hits = bySource.get(item.id) ?? [];
    if (hits.length === 0) continue;

    const monthlyPlanned = item.frequency === "annual" ? item.amount / 12 : item.amount;
    const actuals = hits.map((o) => Math.abs(o.actualAmount ?? o.expectedAmount));
    const actualMonthly = round2(median(actuals));
    const diff = round2(actualMonthly - monthlyPlanned);

    rows.push({
      key: item.id,
      label: item.name,
      category: item.category ?? item.name,
      plannedMonthlyAmount: round2(monthlyPlanned),
      actualMonthlyBaseline: actualMonthly,
      difference: diff,
      proposedAction: Math.abs(diff) < 1 ? "keep" : diff > 0 ? "increase" : "decrease",
      calibrationMode: "item",
      sourceId: item.id,
      hitCount: hits.length,
    });
  }

  return rows.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
}

export function baselineCategoryAverages(
  txns: Txn[],
  windowMonths: 3 | 6 | 12
): Record<string, number> {
  // 不能依赖调用方的排序（store 按日期倒序），必须显式取「最近 windowMonths 个月」。
  const spending = txns.filter((t) => t.inSpending);
  const recentMonths = [...new Set(spending.map((r) => r.month))]
    .sort()
    .slice(-windowMonths);
  const keep = new Set(recentMonths);
  const rows = spending.filter((r) => keep.has(r.month));
  const byCategory = new Map<string, number>();
  const byMonthSet = new Set(rows.map((r) => r.month));
  for (const t of rows) {
    byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + -t.budgetImpact);
  }
  const monthDivisor = Math.max(1, Math.min(windowMonths, byMonthSet.size));
  const out: Record<string, number> = {};
  for (const [category, total] of byCategory.entries()) {
    out[category] = round2(total / monthDivisor);
  }
  return out;
}

function average(ns: number[]): number {
  if (!ns.length) return 0;
  return ns.reduce((a, n) => a + n, 0) / ns.length;
}

function median(ns: number[]): number {
  if (!ns.length) return 0;
  const sorted = [...ns].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
