// 数据访问层：把 FinanceData 拆分映射到 Supabase 的关系表，并提供定点的
// upsert / delete，以及真实交易流水的加载 / 记账 / 编辑 / 删除。
//
// 设计要点：对外仍以 FinanceData / Txn 这样的内存模型工作，DB 行 (snake_case)
// 与内存对象 (camelCase) 的双向映射全部封装在这里，使上层零感知。

import type {
  Account,
  AssumptionSet,
  BalanceAssertion,
  CashFlowItem,
  DecisionRecord,
  FinanceData,
  Goal,
  HoldingPosition,
  HoldingsSnapshot,
  PortfolioAllocationTarget,
  AccountFundAllocation,
  Scenario,
  ScenarioEvent,
} from "../types";
import { isAppLocale, type AppLocale } from "../i18n/types";
import { sanitizePortfolioAllocationTarget } from "./portfolioAllocationPrefs";
import {
  sanitizeFundAllocations,
  sanitizeUnderlyingAllocation,
} from "../engine/portfolioAllocation";
import {
  BASELINE_SCENARIO_ID,
  DATA_VERSION,
  defaultAssumptions,
} from "../store/defaults";
import type { FlowType, Txn } from "../engine/transactions";
import type { ExpectedOccurrence, OccurrenceState } from "../engine/timeline";
import { supabase } from "./supabase";
import { SB } from "./supabaseTables";

type Row = Record<string, unknown>;
type HoldingPositionRow = HoldingPosition & { snapshotId: string };

function baselineScenario(): Scenario {
  return {
    id: BASELINE_SCENARIO_ID,
    name: "基准",
    scenarioType: "custom",
    status: "saved",
  };
}

function isScenariosTableMissing(error: { message?: string } | null | undefined): boolean {
  return Boolean(error?.message?.includes("public.finance_scenarios"));
}

function isHoldingsTableMissing(error: { message?: string } | null | undefined): boolean {
  const msg = error?.message ?? "";
  return msg.includes("public.finance_holdings_snapshots") || msg.includes("public.finance_holding_positions");
}

function isPortfolioTargetColumnMissing(error: { message?: string } | null | undefined): boolean {
  return (error?.message ?? "").includes("portfolio_allocation_target");
}

function isFundAllocationsColumnMissing(error: { message?: string } | null | undefined): boolean {
  return (error?.message ?? "").includes("fund_allocations");
}

function isUnderlyingAllocationColumnMissing(error: { message?: string } | null | undefined): boolean {
  return (error?.message ?? "").includes("underlying_allocation");
}

function isHoldingPriceTrailTableMissing(
  error: { message?: string } | null | undefined
): boolean {
  const msg = error?.message ?? "";
  return msg.includes("public.holding_price_trails");
}

function isHoldingDailyCandleTableMissing(
  error: { message?: string } | null | undefined
): boolean {
  const msg = error?.message ?? "";
  return msg.includes("public.holding_daily_candles");
}

function scenarioFromRow(r: Row): Scenario {
  return prune({
    id: str(r.id),
    name: str(r.name),
    description: ostr(r.description),
    scenarioType: (ostr(r.scenario_type) as Scenario["scenarioType"]) ?? "custom",
    status: (ostr(r.status) as Scenario["status"]) ?? "draft",
    comparisonColorToken: ostr(r.comparison_color_token),
    createdAt: ostr(r.created_at),
    updatedAt: ostr(r.updated_at),
    archivedAt: ostr(r.archived_at),
  }) as Scenario;
}

function scenarioToRow(userId: string, s: Scenario): Row {
  return {
    user_id: userId,
    id: s.id,
    name: s.name,
    description: s.description ?? null,
    scenario_type: s.scenarioType ?? "custom",
    status: s.status ?? "draft",
    comparison_color_token: s.comparisonColorToken ?? null,
    created_at: s.createdAt ?? new Date().toISOString(),
    updated_at: s.updatedAt ?? new Date().toISOString(),
    archived_at: s.archivedAt ?? null,
  };
}

function decisionRecordFromRow(r: Row): DecisionRecord {
  return prune({
    id: str(r.id),
    scenarioId: str(r.scenario_id),
    decisionStatus: str(r.decision_status) as DecisionRecord["decisionStatus"],
    decisionSummary: str(r.decision_summary),
    reason: ostr(r.reason),
    expectedOutcomeJson: (r.expected_outcome_json as Record<string, unknown>) ?? undefined,
    actualOutcomeJson: (r.actual_outcome_json as Record<string, unknown>) ?? undefined,
    decidedAt: ostr(r.decided_at),
    reviewOn: ostr(r.review_on),
    reviewedAt: ostr(r.reviewed_at),
    createdAt: ostr(r.created_at),
    updatedAt: ostr(r.updated_at),
  }) as DecisionRecord;
}

function decisionRecordToRow(userId: string, d: DecisionRecord): Row {
  return {
    user_id: userId,
    id: d.id,
    scenario_id: d.scenarioId,
    decision_status: d.decisionStatus,
    decision_summary: d.decisionSummary,
    reason: d.reason ?? null,
    expected_outcome_json: d.expectedOutcomeJson ?? null,
    actual_outcome_json: d.actualOutcomeJson ?? null,
    decided_at: d.decidedAt ?? null,
    review_on: d.reviewOn ?? null,
    reviewed_at: d.reviewedAt ?? null,
    created_at: d.createdAt ?? new Date().toISOString(),
    updated_at: d.updatedAt ?? new Date().toISOString(),
  };
}

export const BACKUP_SCHEMA_VERSION = 2;
export interface FinancialBackupPayload {
  schemaVersion: number;
  exportedAt: string;
  dataVersion: number;
  assumptions: AssumptionSet;
  privacy: boolean;
  locale?: AppLocale;
  activeScenarioId?: string;
  portfolioAllocationTarget?: PortfolioAllocationTarget;
  accounts: Account[];
  cashFlows: CashFlowItem[];
  events: ScenarioEvent[];
  goals: Goal[];
  transactions: Txn[];
  /** schema v2+ */
  scenarios?: Scenario[];
  holdingsSnapshots?: HoldingsSnapshot[];
  decisionRecords?: DecisionRecord[];
  balanceAssertions?: BalanceAssertion[];
  expectedOccurrences?: ExpectedOccurrence[];
}

export interface FinancialBackupValidation {
  ok: boolean;
  errors: string[];
}

export interface FinancialBackupSummary {
  accounts: number;
  cashFlows: number;
  events: number;
  goals: number;
  transactions: number;
  scenarios: number;
  holdingsSnapshots: number;
  decisionRecords: number;
  balanceAssertions: number;
  expectedOccurrences: number;
}

export interface DeleteFinancialDataResult {
  success: boolean;
  deleted: Record<string, number>;
  failed: { table: string; message: string }[];
}

export interface RestoreFinancialDataResult {
  success: boolean;
  schemaVersion: number;
  restored: Record<string, number>;
  restoredAt: string;
}

export interface ImportFinalizePayload {
  sourceFileNameMasked: string;
  sourceFileHash: string;
  schemaVersion: number;
  rawRowCount: number;
  acceptedRows: Array<{
    occurred_on: string;
    original_date?: string;
    source_account_label?: string;
    source_account_masked?: string;
    institution?: string;
    account_type?: string;
    merchant_name?: string;
    description: string;
    source_category?: string;
    normalized_category: string;
    source_amount: number;
    budget_impact: number;
    net_worth_impact: number;
    account_balance_impact: number;
    flow_type: string;
    include_in_spending_analytics: boolean;
    include_in_cash_flow_history: boolean;
    review_status: "open" | "resolved" | "ignored";
    review_flags: unknown;
    transaction_fingerprint: string;
  }>;
  reviewItems: Array<{
    transaction_fingerprint: string;
    review_type: string;
    severity: string;
    reason: string;
    suggested_action: string;
    status: "open" | "resolved" | "ignored";
  }>;
  merchantRules: Array<{
    match_type: "exact" | "contains" | "prefix" | "regex";
    match_value: string;
    normalized_category?: string;
    flow_type_override?: string;
    include_in_spending_analytics_override?: boolean;
  }>;
}

export interface ImportFinalizeResult {
  importId: string;
  status: string;
  acceptedRowCount: number;
  excludedRowCount: number;
  reviewRowCount: number;
  dateMin: string | null;
  dateMax: string | null;
}

export interface ScenarioApplyPreviewRow {
  eventId: string;
  plannedItem: string;
  currentValue: string;
  proposedValue: string;
  effectiveDate: string;
  sourceScenario: string;
}

export interface ApplyScenarioResult {
  appliedCount: number;
  insertedEventIds: string[];
  appliedAt: string;
}

export interface UndoScenarioApplyResult {
  undoneCount: number;
  undoneEventIds: string[];
  undoneAt: string;
}

export interface ReviewItemRecord {
  id: string;
  importId: string;
  transactionId: string | null;
  reviewType: string;
  severity: "high" | "medium" | "low";
  status: "open" | "resolved" | "ignored";
  reason: string;
  suggestedAction: string;
  resolution?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface HoldingPriceTrailReadPoint {
  ts: number;
  price: number;
}

export interface HoldingPriceTrailWritePoint {
  symbol: string;
  ts: number;
  price: number;
  sourceType?: "live" | "snapshot";
}

export interface HoldingDailyCandlePoint {
  date: string;
  close: number;
}

export interface HoldingDailyCandleWritePoint {
  symbol: string;
  date: string;
  close: number;
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** 写操作必须已登录；未登录时抛错，避免静默丢数据。 */
async function requireUserId(): Promise<string> {
  const userId = await currentUserId();
  if (!userId) throw new Error("未登录，无法同步到云端");
  return userId;
}

// ---- 取值辅助：DB 行字段是 unknown，统一在此安全转换 ----
function str(v: unknown): string {
  return v == null ? "" : String(v);
}
function ostr(v: unknown): string | undefined {
  return v == null ? undefined : String(v);
}
function reqn(v: unknown): number {
  return v == null ? 0 : Number(v);
}
function onum(v: unknown): number | undefined {
  return v == null ? undefined : Number(v);
}
function obool(v: unknown): boolean | undefined {
  return v == null ? undefined : Boolean(v);
}

/** 删除值为 undefined 的键，避免可选字段以 undefined 落入内存对象。 */
function prune<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

export function summarizeBackupPayload(
  payload: FinancialBackupPayload
): FinancialBackupSummary {
  return {
    accounts: payload.accounts.length,
    cashFlows: payload.cashFlows.length,
    events: payload.events.length,
    goals: payload.goals.length,
    transactions: payload.transactions.length,
    scenarios: payload.scenarios?.length ?? 0,
    holdingsSnapshots: payload.holdingsSnapshots?.length ?? 0,
    decisionRecords: payload.decisionRecords?.length ?? 0,
    balanceAssertions: payload.balanceAssertions?.length ?? 0,
    expectedOccurrences: payload.expectedOccurrences?.length ?? 0,
  };
}

export function validateFinancialBackupPayload(
  input: unknown
): FinancialBackupValidation {
  const errors: string[] = [];
  if (!input || typeof input !== "object") {
    errors.push("备份文件不是对象");
    return { ok: false, errors };
  }
  const p = input as Partial<FinancialBackupPayload>;
  if (p.schemaVersion !== 1 && p.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    errors.push(`schemaVersion 不匹配，期望 1 或 ${BACKUP_SCHEMA_VERSION}`);
  }
  if (typeof p.exportedAt !== "string") errors.push("缺少 exportedAt");
  if (typeof p.dataVersion !== "number") errors.push("缺少 dataVersion");
  if (!p.assumptions || typeof p.assumptions !== "object") {
    errors.push("缺少 assumptions");
  }
  if (typeof p.privacy !== "boolean") errors.push("缺少 privacy");
  if (!Array.isArray(p.accounts)) errors.push("accounts 必须是数组");
  if (!Array.isArray(p.cashFlows)) errors.push("cashFlows 必须是数组");
  if (!Array.isArray(p.events)) errors.push("events 必须是数组");
  if (!Array.isArray(p.goals)) errors.push("goals 必须是数组");
  if (!Array.isArray(p.transactions)) errors.push("transactions 必须是数组");
  if (p.schemaVersion === BACKUP_SCHEMA_VERSION) {
    if (p.scenarios != null && !Array.isArray(p.scenarios)) errors.push("scenarios 必须是数组");
    if (p.holdingsSnapshots != null && !Array.isArray(p.holdingsSnapshots)) {
      errors.push("holdingsSnapshots 必须是数组");
    }
    if (p.decisionRecords != null && !Array.isArray(p.decisionRecords)) {
      errors.push("decisionRecords 必须是数组");
    }
    if (p.balanceAssertions != null && !Array.isArray(p.balanceAssertions)) {
      errors.push("balanceAssertions 必须是数组");
    }
    if (p.expectedOccurrences != null && !Array.isArray(p.expectedOccurrences)) {
      errors.push("expectedOccurrences 必须是数组");
    }
  }
  return { ok: errors.length === 0, errors };
}

// ===================== Account =====================
function accountFromRow(r: Row): Account {
  return prune({
    id: str(r.id),
    name: str(r.name),
    type: str(r.type) as Account["type"],
    balance: reqn(r.balance),
    annualReturn: onum(r.annual_return),
    apr: onum(r.apr),
    liquid: obool(r.liquid),
    creditMode: ostr(r.credit_mode) as Account["creditMode"],
    statementBalance: onum(r.statement_balance),
    dueDay: onum(r.due_day),
    autoPayMode: ostr(r.auto_pay_mode) as Account["autoPayMode"],
    paymentAccountId: ostr(r.payment_account_id),
    annualFee: onum(r.annual_fee),
    annualFeeDate: ostr(r.annual_fee_date),
    monthlyPayment: onum(r.monthly_payment),
    termMonths: onum(r.term_months),
    basis: onum(r.basis),
    note: ostr(r.note),
    balanceManual: obool(r.balance_manual) ?? undefined,
    fundAllocations: sanitizeFundAllocations(
      r.fund_allocations as AccountFundAllocation[] | null | undefined
    ),
    underlyingAllocation: sanitizeUnderlyingAllocation(
      r.underlying_allocation as import("../types").AccountUnderlyingSlice[] | null | undefined
    ),
    updatedAt: ostr(r.updated_at),
  }) as Account;
}

function accountToRow(userId: string, a: Account): Row {
  return {
    user_id: userId,
    id: a.id,
    name: a.name,
    type: a.type,
    balance: a.balance,
    annual_return: a.annualReturn ?? null,
    apr: a.apr ?? null,
    liquid: a.liquid ?? null,
    credit_mode: a.creditMode ?? null,
    statement_balance: a.statementBalance ?? null,
    due_day: a.dueDay ?? null,
    auto_pay_mode: a.autoPayMode ?? null,
    payment_account_id: a.paymentAccountId ?? null,
    annual_fee: a.annualFee ?? null,
    annual_fee_date: a.annualFeeDate ?? null,
    monthly_payment: a.monthlyPayment ?? null,
    term_months: a.termMonths ?? null,
    basis: a.basis ?? null,
    note: a.note ?? null,
    balance_manual: a.balanceManual ?? false,
    fund_allocations:
      a.fundAllocations && a.fundAllocations.length > 0 ? a.fundAllocations : null,
    underlying_allocation:
      a.underlyingAllocation && a.underlyingAllocation.length > 0
        ? a.underlyingAllocation
        : null,
    updated_at: a.updatedAt ?? new Date().toISOString(),
  };
}

function holdingsSnapshotFromRow(r: Row): HoldingsSnapshot {
  return prune({
    id: str(r.id),
    accountId: ostr(r.account_id),
    institution: ostr(r.institution),
    accountLabel: str(r.account_label),
    asOfDate: str(r.as_of_date),
    asOfTimeLocal: ostr(r.as_of_time_local),
    timezone: ostr(r.timezone),
    importedAt: str(r.imported_at),
    sourceType: str(r.source_type),
    sourceDescription: ostr(r.source_description),
    note: ostr(r.note),
    needsUserConfirmation: obool(r.needs_user_confirmation),
    reconciliationStatus: (ostr(r.reconciliation_status) as HoldingsSnapshot["reconciliationStatus"]) ?? "incomplete",
    holdingsMarketValue: reqn(r.holdings_market_value),
    impliedCostBasis: onum(r.implied_cost_basis),
    unrealizedGain: onum(r.unrealized_gain),
    weightedTotalReturnPct: onum(r.weighted_total_return_pct),
    todayReturnAmountApprox: onum(r.today_return_amount_approx),
    todayReturnPctApprox: onum(r.today_return_pct_approx),
    positionCount: reqn(r.position_count),
    stockCount: onum(r.stock_count),
    etfCount: onum(r.etf_count),
    positions: [],
  }) as HoldingsSnapshot;
}

function holdingsSnapshotToRow(userId: string, s: HoldingsSnapshot): Row {
  return {
    user_id: userId,
    id: s.id,
    account_id: s.accountId ?? null,
    institution: s.institution ?? null,
    account_label: s.accountLabel,
    as_of_date: s.asOfDate,
    as_of_time_local: s.asOfTimeLocal ?? null,
    timezone: s.timezone ?? null,
    imported_at: s.importedAt ?? new Date().toISOString(),
    source_type: s.sourceType,
    source_description: s.sourceDescription ?? null,
    note: s.note ?? null,
    needs_user_confirmation: s.needsUserConfirmation ?? false,
    reconciliation_status: s.reconciliationStatus ?? "incomplete",
    holdings_market_value: s.holdingsMarketValue,
    implied_cost_basis: s.impliedCostBasis ?? null,
    unrealized_gain: s.unrealizedGain ?? null,
    weighted_total_return_pct: s.weightedTotalReturnPct ?? null,
    today_return_amount_approx: s.todayReturnAmountApprox ?? null,
    today_return_pct_approx: s.todayReturnPctApprox ?? null,
    position_count: s.positionCount,
    stock_count: s.stockCount ?? null,
    etf_count: s.etfCount ?? null,
  };
}

function holdingPositionFromRow(r: Row): HoldingPositionRow {
  return prune({
    snapshotId: str(r.snapshot_id),
    id: str(r.id),
    ticker: str(r.ticker),
    securityName: str(r.security_name),
    assetType: (ostr(r.asset_type) as HoldingPosition["assetType"]) ?? "other",
    shares: reqn(r.shares),
    marketPrice: reqn(r.market_price),
    marketValue: reqn(r.market_value),
    averageCostPerShare: onum(r.average_cost_per_share),
    impliedCostBasis: onum(r.implied_cost_basis),
    portfolioWeightPct: onum(r.portfolio_weight_pct),
    portfolioDiversityDisplayedPct: onum(r.portfolio_diversity_displayed_pct),
    todayReturnAmount: onum(r.today_return_amount),
    todayReturnPct: onum(r.today_return_pct),
    totalReturnAmount: onum(r.total_return_amount),
    totalReturnPctDisplayed: onum(r.total_return_pct_displayed),
    sourceCapturedAt: ostr(r.source_captured_at),
  }) as HoldingPositionRow;
}

function holdingPositionToRow(
  userId: string,
  snapshotId: string,
  p: HoldingPosition
): Row {
  return {
    user_id: userId,
    snapshot_id: snapshotId,
    id: p.id,
    ticker: p.ticker,
    security_name: p.securityName,
    asset_type: p.assetType,
    shares: p.shares,
    market_price: p.marketPrice,
    market_value: p.marketValue,
    average_cost_per_share: p.averageCostPerShare ?? null,
    implied_cost_basis: p.impliedCostBasis ?? null,
    portfolio_weight_pct: p.portfolioWeightPct ?? null,
    portfolio_diversity_displayed_pct: p.portfolioDiversityDisplayedPct ?? null,
    today_return_amount: p.todayReturnAmount ?? null,
    today_return_pct: p.todayReturnPct ?? null,
    total_return_amount: p.totalReturnAmount ?? null,
    total_return_pct_displayed: p.totalReturnPctDisplayed ?? null,
    source_captured_at: p.sourceCapturedAt ?? null,
  };
}

// ===================== CashFlow =====================
function cashFlowFromRow(r: Row): CashFlowItem {
  return prune({
    id: str(r.id),
    name: str(r.name),
    type: str(r.type) as CashFlowItem["type"],
    frequency: str(r.frequency) as CashFlowItem["frequency"],
    amount: reqn(r.amount),
    essential: obool(r.essential),
    startMonth: onum(r.start_month),
    endMonth: onum(r.end_month),
    category: ostr(r.category),
    payFrequency: ostr(r.pay_frequency) as CashFlowItem["payFrequency"],
    anchorDate: ostr(r.anchor_date),
    dueDay: onum(r.due_day),
  }) as CashFlowItem;
}

function cashFlowToRow(userId: string, c: CashFlowItem): Row {
  return {
    user_id: userId,
    id: c.id,
    name: c.name,
    type: c.type,
    frequency: c.frequency,
    amount: c.amount,
    essential: c.essential ?? null,
    start_month: c.startMonth ?? null,
    end_month: c.endMonth ?? null,
    category: c.category ?? null,
    pay_frequency: c.payFrequency ?? null,
    anchor_date: c.anchorDate ?? null,
    due_day: c.dueDay ?? null,
  };
}

// ===================== ScenarioEvent =====================
function eventFromRow(r: Row): ScenarioEvent {
  return prune({
    id: str(r.id),
    scenarioId: ostr(r.scenario_id) ?? BASELINE_SCENARIO_ID,
    name: str(r.name),
    eventType: str(r.event_type) as ScenarioEvent["eventType"],
    enabled: Boolean(r.enabled),
    monthOffset: reqn(r.month_offset),
    amount: onum(r.amount),
    date: ostr(r.date),
    percent: onum(r.percent),
    contributionPercent: onum(r.contribution_percent),
    expenseCategory: ostr(r.expense_category),
    fundingSource: ostr(r.funding_source) as ScenarioEvent["fundingSource"],
  }) as ScenarioEvent;
}

function eventToRow(userId: string, e: ScenarioEvent): Row {
  return {
    user_id: userId,
    id: e.id,
    scenario_id: e.scenarioId ?? BASELINE_SCENARIO_ID,
    name: e.name,
    event_type: e.eventType,
    enabled: e.enabled,
    month_offset: e.monthOffset,
    amount: e.amount ?? null,
    date: e.date ?? null,
    percent: e.percent ?? null,
    contribution_percent: e.contributionPercent ?? null,
    expense_category: e.expenseCategory ?? null,
    funding_source: e.fundingSource ?? null,
  };
}

// ===================== Goal =====================
function goalFromRow(r: Row): Goal {
  return prune({
    id: str(r.id),
    name: str(r.name),
    metric: str(r.metric) as Goal["metric"],
    target: reqn(r.target),
    current: onum(r.current),
    priority: ostr(r.priority) as Goal["priority"],
    fundingAccountId: ostr(r.funding_account_id),
    monthlyAllocation: onum(r.monthly_allocation),
    monthlyAllocationDay: onum(r.monthly_allocation_day),
    targetDate: ostr(r.target_date),
    reservePolicy: ostr(r.reserve_policy) as Goal["reservePolicy"],
    reserve: obool(r.reserve),
  }) as Goal;
}

function goalToRow(userId: string, g: Goal): Row {
  return {
    user_id: userId,
    id: g.id,
    name: g.name,
    metric: g.metric,
    target: g.target,
    current: g.current ?? null,
    priority: g.priority ?? null,
    funding_account_id: g.fundingAccountId ?? null,
    monthly_allocation: g.monthlyAllocation ?? null,
    monthly_allocation_day: g.monthlyAllocationDay ?? null,
    target_date: g.targetDate ?? null,
    reserve_policy: g.reservePolicy ?? null,
    reserve: g.reserve ?? null,
  };
}

// ===================== 加载 / 组装 FinanceData =====================
/**
 * 并行读取实体表并组装成内存里的 FinanceData。
 * 返回 null 表示该用户尚未初始化（无 user_settings 行）——调用方应写入种子数据。
 */
export async function loadFinanceData(): Promise<FinanceData | null> {
  const userId = await currentUserId();
  if (!userId) return null;

  const [acc, hs, hp, cf, gl, st, sc] = await Promise.all([
    supabase.from(SB.finance.accounts).select("*").eq("user_id", userId),
    supabase
      .from(SB.finance.holdingsSnapshots)
      .select("*")
      .eq("user_id", userId)
      .order("as_of_date", { ascending: false })
      .order("imported_at", { ascending: false }),
    supabase
      .from(SB.finance.holdingPositions)
      .select("*")
      .eq("user_id", userId),
    supabase.from(SB.finance.cashFlows).select("*").eq("user_id", userId),
    supabase.from(SB.finance.goals).select("*").eq("user_id", userId),
    supabase.from(SB.finance.userSettings).select("*").eq("user_id", userId).maybeSingle(),
    supabase.from(SB.finance.scenarios).select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
  ]);
  const err =
    acc.error ||
    (hs.error && !isHoldingsTableMissing(hs.error) ? hs.error : null) ||
    (hp.error && !isHoldingsTableMissing(hp.error) ? hp.error : null) ||
    cf.error ||
    gl.error ||
    st.error ||
    (sc.error && !isScenariosTableMissing(sc.error) ? sc.error : null);
  if (err) throw err;

  const settings = st.data as Row | null;
  if (!settings) return null;
  const scenariosUnavailable = isScenariosTableMissing(sc.error);
  let scenarios = scenariosUnavailable
    ? [baselineScenario()]
    : ((sc.data as Row[]) ?? []).map(scenarioFromRow);
  if (!scenariosUnavailable && scenarios.length === 0) {
    const baseline = baselineScenario();
    const ins = await supabase.from(SB.finance.scenarios).insert(scenarioToRow(userId, baseline));
    if (!ins.error) scenarios = [baseline];
  }
  const ensuredScenarios =
    scenarios.length > 0
      ? scenarios
      : [baselineScenario()];
  const preferredActive = ostr(settings.active_scenario_id) ?? ensuredScenarios[0].id;
  const activeScenarioId = ensuredScenarios.some((s) => s.id === preferredActive)
    ? preferredActive
    : ensuredScenarios[0].id;

  let ev = await supabase
    .from(SB.finance.scenarioEvents)
    .select("*")
    .eq("user_id", userId)
    .eq("scenario_id", activeScenarioId);
  if (ev.error?.message?.includes("scenario_id")) {
    ev = await supabase.from(SB.finance.scenarioEvents).select("*").eq("user_id", userId);
  }
  if (ev.error) throw ev.error;

  const assumptions = {
    ...defaultAssumptions,
    ...((settings.assumptions as Partial<AssumptionSet>) ?? {}),
  };
  const holdingsUnavailable = isHoldingsTableMissing(hs.error) || isHoldingsTableMissing(hp.error);
  const positionsBySnapshot = new Map<string, HoldingPosition[]>();
  if (!holdingsUnavailable) {
    for (const row of ((hp.data as Row[]) ?? []).map(holdingPositionFromRow)) {
      if (!positionsBySnapshot.has(row.snapshotId)) positionsBySnapshot.set(row.snapshotId, []);
      const { snapshotId: _snapshotId, ...position } = row;
      positionsBySnapshot.get(row.snapshotId)?.push(position);
    }
  }
  const holdingsSnapshots = holdingsUnavailable
    ? []
    : ((hs.data as Row[]) ?? []).map((row) => {
        const snapshot = holdingsSnapshotFromRow(row);
        snapshot.positions = (positionsBySnapshot.get(snapshot.id) ?? []).slice().sort((a, b) => b.marketValue - a.marketValue);
        return snapshot;
      });
  const portfolioAllocationTarget = sanitizePortfolioAllocationTarget(
    settings.portfolio_allocation_target as PortfolioAllocationTarget | null | undefined
  );

  return {
    version: settings.data_version != null ? Number(settings.data_version) : DATA_VERSION,
    accounts: ((acc.data as Row[]) ?? []).map(accountFromRow),
    holdingsSnapshots,
    cashFlows: ((cf.data as Row[]) ?? []).map(cashFlowFromRow),
    events: ((ev.data as Row[]) ?? []).map(eventFromRow),
    scenarios: ensuredScenarios,
    activeScenarioId,
    goals: ((gl.data as Row[]) ?? []).map(goalFromRow),
    assumptions,
    portfolioAllocationTarget,
    updatedAt: ostr(settings.updated_at) ?? new Date().toISOString(),
    privacy: Boolean(settings.privacy),
    locale: isAppLocale(ostr(settings.locale)) ? (ostr(settings.locale) as AppLocale) : "zh-CN",
  };
}

/** 首次初始化：把整份种子数据写入各表（仅在 loadFinanceData 返回 null 时调用）。 */
export async function seedFinanceData(data: FinanceData): Promise<void> {
  const userId = await requireUserId();
  const scenarios =
    data.scenarios && data.scenarios.length > 0
      ? data.scenarios
      : [
          {
            id: BASELINE_SCENARIO_ID,
            name: "基准",
            scenarioType: "custom",
            status: "saved",
          } as Scenario,
        ];
  const activeScenarioId = data.activeScenarioId ?? scenarios[0].id;
  await saveSettings(data.assumptions, data.privacy, data.version, activeScenarioId);
  const jobs: PromiseLike<unknown>[] = [];
  jobs.push(supabase.from(SB.finance.scenarios).upsert(scenarios.map((s) => scenarioToRow(userId, s))));
  if (data.accounts.length)
    jobs.push(supabase.from(SB.finance.accounts).upsert(data.accounts.map((a) => accountToRow(userId, a))));
  if (data.cashFlows.length)
    jobs.push(supabase.from(SB.finance.cashFlows).upsert(data.cashFlows.map((c) => cashFlowToRow(userId, c))));
  if (data.events.length)
    jobs.push(
      supabase
        .from(SB.finance.scenarioEvents)
        .upsert(
          data.events.map((e) => eventToRow(userId, { ...e, scenarioId: e.scenarioId ?? activeScenarioId }))
        )
    );
  if (data.goals.length)
    jobs.push(supabase.from(SB.finance.goals).upsert(data.goals.map((g) => goalToRow(userId, g))));
  const results = await Promise.all(jobs);
  for (const r of results) {
    const e = (r as { error?: unknown }).error;
    if (e) throw e;
  }
}

/** 启动校准写回：账户、持仓快照、假设（仅 upsert，不删用户其它数据）。 */
export async function persistFinanceSetup(data: FinanceData): Promise<void> {
  const userId = await requireUserId();
  await saveSettings(data.assumptions, data.privacy, data.version, data.activeScenarioId);
  if (data.accounts.length) {
    const { error } = await supabase
      .from(SB.finance.accounts)
      .upsert(data.accounts.map((a) => accountToRow(userId, a)));
    if (error) throw error;
  }
  for (const snap of data.holdingsSnapshots) {
    await upsertHoldingsSnapshot(snap);
  }
  if (data.cashFlows.length) {
    const { error } = await supabase
      .from(SB.finance.cashFlows)
      .upsert(data.cashFlows.map((c) => cashFlowToRow(userId, c)));
    if (error) throw error;
  }
}

// ===================== 定点写：assumptions / 各实体 =====================
export async function saveSettings(
  assumptions: AssumptionSet,
  privacy: boolean,
  version: number,
  activeScenarioId?: string
): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from(SB.finance.userSettings).upsert(
    {
      user_id: userId,
      assumptions,
      privacy,
      data_version: version,
      active_scenario_id: activeScenarioId ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) throw error;
}

function isLocaleColumnMissing(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return /locale|column.*does not exist/i.test(msg);
}

/** UI 语言偏好（user_settings.locale）。 */
export async function saveLocale(locale: AppLocale): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from(SB.finance.userSettings)
    .update({ locale, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) {
    if (isLocaleColumnMissing(error)) {
      console.warn(
        "[finance] user_settings.locale 列尚未迁移，语言偏好仅保存在本机。请执行 supabase/migration_locale.sql"
      );
      return;
    }
    throw error;
  }
}

/** 资产配置 Hub 目标（user_settings.portfolio_allocation_target）。 */
export async function savePortfolioAllocationTarget(
  target: PortfolioAllocationTarget
): Promise<void> {
  const userId = await requireUserId();
  const portfolio_allocation_target = sanitizePortfolioAllocationTarget(target);
  const { error } = await supabase
    .from(SB.finance.userSettings)
    .update({
      portfolio_allocation_target,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (error) {
    if (isPortfolioTargetColumnMissing(error)) {
      console.warn(
        "[finance] portfolio_allocation_target 列尚未迁移，目标仅保存在本机。请执行 supabase/migration_portfolio_allocation_target.sql"
      );
      return;
    }
    throw error;
  }
}

export async function upsertAccount(a: Account): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from(SB.finance.accounts)
    .upsert(accountToRow(userId, a), { onConflict: "user_id,id" });
  if (error) {
    if (isFundAllocationsColumnMissing(error) || isUnderlyingAllocationColumnMissing(error)) {
      if (isFundAllocationsColumnMissing(error)) {
        console.warn(
          "[finance] fund_allocations 列尚未迁移，401(k) 基金占比仅保存在本机会话。请执行 supabase/migration_account_fund_allocations.sql"
        );
      }
      if (isUnderlyingAllocationColumnMissing(error)) {
        console.warn(
          "[finance] underlying_allocation 列尚未迁移，穿透配比仅保存在本机会话。请执行 supabase/migration_account_underlying_allocation.sql"
        );
      }
      const row = accountToRow(userId, a);
      if (isFundAllocationsColumnMissing(error)) delete row.fund_allocations;
      if (isUnderlyingAllocationColumnMissing(error)) delete row.underlying_allocation;
      const retry = await supabase
        .from(SB.finance.accounts)
        .upsert(row, { onConflict: "user_id,id" });
      if (retry.error) throw retry.error;
      return;
    }
    throw error;
  }
}
export async function deleteAccount(id: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from(SB.finance.accounts).delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
}

export async function upsertHoldingsSnapshot(snapshot: HoldingsSnapshot): Promise<void> {
  const userId = await requireUserId();
  const upsertSnapshot = await supabase
    .from(SB.finance.holdingsSnapshots)
    .upsert(holdingsSnapshotToRow(userId, snapshot), { onConflict: "user_id,id" });
  if (upsertSnapshot.error) throw upsertSnapshot.error;

  const del = await supabase
    .from(SB.finance.holdingPositions)
    .delete()
    .eq("user_id", userId)
    .eq("snapshot_id", snapshot.id);
  if (del.error) throw del.error;

  if (snapshot.positions.length > 0) {
    const ins = await supabase
      .from(SB.finance.holdingPositions)
      .insert(snapshot.positions.map((p) => holdingPositionToRow(userId, snapshot.id, p)));
    if (ins.error) throw ins.error;
  }
}

const HOLDING_TRAIL_MAX_ROWS = 6000;
const HOLDING_TRAIL_MAX_PER_SYMBOL = 480;

export async function loadHoldingPriceTrails(
  symbols: string[]
): Promise<Record<string, HoldingPriceTrailReadPoint[]>> {
  const userId = await currentUserId();
  if (!userId) return {};
  const normalizedSymbols = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  let query = supabase
    .from(SB.finance.holdingPriceTrails)
    .select("symbol,captured_at,price")
    .eq("user_id", userId)
    .order("captured_at", { ascending: false })
    .limit(HOLDING_TRAIL_MAX_ROWS);
  if (normalizedSymbols.length > 0) query = query.in("symbol", normalizedSymbols);
  const { data, error } = await query;
  if (error) {
    if (isHoldingPriceTrailTableMissing(error)) return {};
    throw error;
  }
  const out: Record<string, HoldingPriceTrailReadPoint[]> = {};
  for (const row of (data as Row[]) ?? []) {
    const symbol = str(row.symbol).trim().toUpperCase();
    if (!symbol) continue;
    const ts = Date.parse(str(row.captured_at));
    const price = reqn(row.price);
    if (!Number.isFinite(ts) || !Number.isFinite(price) || price <= 0) continue;
    if (!out[symbol]) out[symbol] = [];
    if (out[symbol].length >= HOLDING_TRAIL_MAX_PER_SYMBOL) continue;
    out[symbol].push({ ts, price });
  }
  for (const symbol of Object.keys(out)) {
    out[symbol].sort((a, b) => a.ts - b.ts);
  }
  return out;
}

export async function upsertHoldingPriceTrailPoints(
  points: HoldingPriceTrailWritePoint[]
): Promise<void> {
  if (points.length === 0) return;
  const userId = await requireUserId();
  const dedup = new Map<string, HoldingPriceTrailWritePoint>();
  for (const point of points) {
    const symbol = point.symbol.trim().toUpperCase();
    if (!symbol || !Number.isFinite(point.ts) || !Number.isFinite(point.price) || point.price <= 0) {
      continue;
    }
    const capturedAt = new Date(point.ts).toISOString();
    dedup.set(`${symbol}|${capturedAt}`, { ...point, symbol });
  }
  if (dedup.size === 0) return;
  const rows = [...dedup.values()].map((point) => ({
    user_id: userId,
    symbol: point.symbol,
    captured_at: new Date(point.ts).toISOString(),
    price: point.price,
    source_type: point.sourceType ?? "live",
  }));
  const { error } = await supabase
    .from(SB.finance.holdingPriceTrails)
    .upsert(rows, { onConflict: "user_id,symbol,captured_at" });
  if (error && !isHoldingPriceTrailTableMissing(error)) throw error;
}

const HOLDING_DAILY_MAX_PER_SYMBOL = 400;
const HOLDING_DAILY_READ_CONCURRENCY = 6;
const HOLDING_DAILY_UPSERT_CHUNK = 250;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function loadSymbolDailyCandles(
  userId: string,
  symbol: string
): Promise<HoldingDailyCandlePoint[]> {
  const { data, error } = await supabase
    .from(SB.finance.holdingDailyCandles)
    .select("date,close")
    .eq("user_id", userId)
    .eq("symbol", symbol)
    .order("date", { ascending: false })
    .limit(HOLDING_DAILY_MAX_PER_SYMBOL);
  if (error) {
    if (isHoldingDailyCandleTableMissing(error)) return [];
    throw error;
  }
  const out: HoldingDailyCandlePoint[] = [];
  for (const row of (data as Row[]) ?? []) {
    const date = str(row.date).slice(0, 10);
    const close = reqn(row.close);
    if (!date || !Number.isFinite(close) || close <= 0) continue;
    out.push({ date, close });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

export async function loadHoldingDailyCandles(
  symbols: string[]
): Promise<Record<string, HoldingDailyCandlePoint[]>> {
  const { candles } = await loadHoldingDailyCandleState(symbols);
  return candles;
}

/** 每只标的已落库的最新交易日（YYYY-MM-DD）；无数据时不包含该 symbol。 */
export async function loadHoldingDailyCandleWatermarks(
  symbols: string[]
): Promise<Record<string, string>> {
  const { watermarks } = await loadHoldingDailyCandleState(symbols);
  return watermarks;
}

/** 单次并发读取：每只 symbol 独立 limit，避免全局排序截断水位线/历史。 */
export async function loadHoldingDailyCandleState(
  symbols: string[]
): Promise<{
  candles: Record<string, HoldingDailyCandlePoint[]>;
  watermarks: Record<string, string>;
}> {
  const userId = await currentUserId();
  if (!userId) return { candles: {}, watermarks: {} };
  const normalizedSymbols = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  if (normalizedSymbols.length === 0) return { candles: {}, watermarks: {} };

  const candles: Record<string, HoldingDailyCandlePoint[]> = {};
  const watermarks: Record<string, string> = {};

  await mapWithConcurrency(normalizedSymbols, HOLDING_DAILY_READ_CONCURRENCY, async (symbol) => {
    try {
      const list = await loadSymbolDailyCandles(userId, symbol);
      if (list.length === 0) return;
      candles[symbol] = list;
      watermarks[symbol] = list[list.length - 1].date;
    } catch (error) {
      if (isHoldingDailyCandleTableMissing(error as { message?: string })) return;
      throw error;
    }
  });

  return { candles, watermarks };
}

export async function upsertHoldingDailyCandles(
  points: HoldingDailyCandleWritePoint[]
): Promise<void> {
  if (points.length === 0) return;
  const userId = await currentUserId();
  if (!userId) return;
  const dedup = new Map<string, HoldingDailyCandleWritePoint>();
  for (const point of points) {
    const symbol = point.symbol.trim().toUpperCase();
    const date = point.date.trim().slice(0, 10);
    if (!symbol || !date || !Number.isFinite(point.close) || point.close <= 0) continue;
    dedup.set(`${symbol}|${date}`, { symbol, date, close: point.close });
  }
  if (dedup.size === 0) return;
  const rows = [...dedup.values()].map((point) => ({
    user_id: userId,
    symbol: point.symbol,
    date: point.date,
    close: point.close,
  }));
  for (let i = 0; i < rows.length; i += HOLDING_DAILY_UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + HOLDING_DAILY_UPSERT_CHUNK);
    const { error } = await supabase
      .from(SB.finance.holdingDailyCandles)
      .upsert(chunk, { onConflict: "user_id,symbol,date" });
    if (error && !isHoldingDailyCandleTableMissing(error)) throw error;
  }
}

export async function deleteHoldingsSnapshot(id: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from(SB.finance.holdingsSnapshots)
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw error;
}

export async function upsertCashFlow(c: CashFlowItem): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from(SB.finance.cashFlows)
    .upsert(cashFlowToRow(userId, c), { onConflict: "user_id,id" });
  if (error) throw error;
}
export async function deleteCashFlow(id: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from(SB.finance.cashFlows).delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
}

export async function upsertEvent(
  e: ScenarioEvent,
  scenarioId = BASELINE_SCENARIO_ID
): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from(SB.finance.scenarioEvents)
    .upsert(eventToRow(userId, { ...e, scenarioId }), { onConflict: "user_id,id" });
  if (error) throw error;
}
export async function deleteEvent(
  id: string,
  scenarioId = BASELINE_SCENARIO_ID
): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from(SB.finance.scenarioEvents)
    .delete()
    .eq("user_id", userId)
    .eq("scenario_id", scenarioId)
    .eq("id", id);
  if (error) throw error;
}

export async function upsertScenario(s: Scenario): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from(SB.finance.scenarios)
    .upsert(scenarioToRow(userId, s), { onConflict: "user_id,id" });
  if (error) throw error;
}

export async function setActiveScenario(activeScenarioId: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from(SB.finance.userSettings)
    .update({ active_scenario_id: activeScenarioId, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw error;
}

export async function deleteScenario(scenarioId: string): Promise<void> {
  const userId = await requireUserId();
  const ev = await supabase
    .from(SB.finance.scenarioEvents)
    .delete()
    .eq("user_id", userId)
    .eq("scenario_id", scenarioId);
  if (ev.error) throw ev.error;
  const sc = await supabase
    .from(SB.finance.scenarios)
    .delete()
    .eq("user_id", userId)
    .eq("id", scenarioId);
  if (sc.error) throw sc.error;
}

export async function loadScenarioEvents(
  scenarioId: string
): Promise<ScenarioEvent[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from(SB.finance.scenarioEvents)
    .select("*")
    .eq("user_id", userId)
    .eq("scenario_id", scenarioId);
  if (error) throw error;
  return ((data as Row[]) ?? []).map(eventFromRow);
}

export async function duplicateScenario(
  sourceScenarioId: string,
  target: Scenario
): Promise<void> {
  const userId = await requireUserId();
  const source = await supabase
    .from(SB.finance.scenarioEvents)
    .select("*")
    .eq("user_id", userId)
    .eq("scenario_id", sourceScenarioId);
  if (source.error) throw source.error;
  const insertScenario = await supabase
    .from(SB.finance.scenarios)
    .insert(scenarioToRow(userId, target));
  if (insertScenario.error) throw insertScenario.error;
  const rows = (source.data as Row[]) ?? [];
  if (rows.length > 0) {
    const cloned = rows.map((r) => {
      const e = eventFromRow(r);
      return eventToRow(userId, {
        ...e,
        id: `evt_${crypto.randomUUID().slice(0, 8)}`,
        scenarioId: target.id,
      });
    });
    const evIns = await supabase.from(SB.finance.scenarioEvents).insert(cloned);
    if (evIns.error) throw evIns.error;
  }
}

export async function applyScenarioToPlan(
  scenarioId: string,
  selectedEventIds: string[]
): Promise<ApplyScenarioResult> {
  const { data, error } = await supabase.rpc("apply_scenario_to_plan_v1", {
    payload: {
      scenario_id: scenarioId,
      selected_event_ids: selectedEventIds,
    },
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        applied_count?: number;
        inserted_event_ids?: string[] | unknown;
        applied_at?: string;
      }
    | null;
  if (!row) throw new Error("apply_scenario_to_plan_v1 returned empty response");
  const inserted = Array.isArray(row.inserted_event_ids)
    ? (row.inserted_event_ids as string[])
    : [];
  return {
    appliedCount: Number(row.applied_count ?? inserted.length),
    insertedEventIds: inserted,
    appliedAt: row.applied_at ?? new Date().toISOString(),
  };
}

export async function undoLatestScenarioApply(): Promise<UndoScenarioApplyResult> {
  const { data, error } = await supabase.rpc("undo_latest_scenario_apply_v1");
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        undone_count?: number;
        undone_event_ids?: string[] | unknown;
        undone_at?: string;
      }
    | null;
  if (!row) throw new Error("undo_latest_scenario_apply_v1 returned empty response");
  const undone = Array.isArray(row.undone_event_ids)
    ? (row.undone_event_ids as string[])
    : [];
  return {
    undoneCount: Number(row.undone_count ?? undone.length),
    undoneEventIds: undone,
    undoneAt: row.undone_at ?? new Date().toISOString(),
  };
}

export async function loadDecisionRecords(): Promise<DecisionRecord[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from(SB.finance.decisionRecords)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data as Row[]) ?? []).map(decisionRecordFromRow);
}

export async function upsertDecisionRecord(record: DecisionRecord): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from(SB.finance.decisionRecords)
    .upsert(decisionRecordToRow(userId, record), { onConflict: "user_id,id" });
  if (error) throw error;
}

export async function deleteDecisionRecord(id: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from(SB.finance.decisionRecords)
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw error;
}

export async function upsertGoal(g: Goal): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from(SB.finance.goals)
    .upsert(goalToRow(userId, g), { onConflict: "user_id,id" });
  if (error) throw error;
}
export async function deleteGoal(id: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from(SB.finance.goals).delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
}

// ===================== 真实交易流水 =====================
function txnFromRow(r: Row): Txn {
  const date = str(r.occurred_on ?? r.txn_date);
  const flow = str(r.flow_type ?? r.flow) as FlowType;
  const inSpending = r.include_in_spending_analytics != null ? Boolean(r.include_in_spending_analytics) : Boolean(r.in_spending);
  const inCashFlow = r.include_in_cash_flow_history != null ? Boolean(r.include_in_cash_flow_history) : Boolean(r.in_cash_flow);
  return {
    id: ostr(r.id),
    date,
    month: date.slice(0, 7),
    merchant: str(r.merchant_name ?? r.merchant),
    category: str(r.normalized_category ?? r.category),
    account: str(r.source_account_label ?? r.account),
    flow,
    amount: reqn(r.source_amount ?? r.amount),
    budgetImpact: reqn(r.budget_impact),
    inSpending,
    inCashFlow,
    excludeReason: ostr(r.exclude_reason),
    source: (ostr(r.source) as Txn["source"]) ?? "import",
  };
}

function txnFromExtensionRpcRow(r: Row): Txn {
  const date = str(r.date ?? r.occurred_on ?? r.txn_date);
  const flow = str(r.flow_type ?? r.flow) as FlowType;
  const inSpending = Boolean(r.include_in_spending_analytics ?? r.in_spending);
  const inCashFlow = Boolean(r.include_in_cash_flow_history ?? r.in_cash_flow);
  return {
    id: ostr(r.id),
    date,
    month: date.slice(0, 7),
    merchant: str(r.merchant ?? r.merchant_name),
    category: str(r.category ?? r.normalized_category),
    account: str(r.account ?? r.source_account_label),
    flow,
    amount: reqn(r.amount ?? r.source_amount),
    budgetImpact: reqn(r.budget_impact),
    inSpending,
    inCashFlow,
    excludeReason: ostr(r.exclude_reason),
    source: (ostr(r.source) as Txn["source"]) ?? "import",
  };
}

function txnToRow(userId: string, t: Partial<Txn> & { date: string }): Row {
  const flowType = t.flow ?? "expense";
  const merchantName = t.merchant ?? "";
  const category = t.category ?? "Uncategorized";
  const account = t.account ?? "Unknown";
  const sourceAmount = t.amount ?? 0;
  const includeInSpending = t.inSpending ?? false;
  const includeInCashFlow = t.inCashFlow ?? false;
  return {
    user_id: userId,
    txn_date: t.date,
    occurred_on: t.date,
    merchant: merchantName,
    merchant_name: merchantName,
    category,
    normalized_category: category,
    account,
    source_account_label: account,
    flow: flowType,
    flow_type: flowType,
    amount: sourceAmount,
    source_amount: sourceAmount,
    budget_impact: t.budgetImpact ?? 0,
    in_spending: includeInSpending,
    include_in_spending_analytics: includeInSpending,
    in_cash_flow: includeInCashFlow,
    include_in_cash_flow_history: includeInCashFlow,
    exclude_reason: t.excludeReason ?? null,
    source: t.source ?? "manual",
    platform_id: (t as { platformId?: string }).platformId ?? null,
    review_status: "resolved",
    review_flags: [],
  };
}

const TXN_PAGE = 1000;

async function fetchAllTxns(userId: string): Promise<Txn[]> {
  const out: Txn[] = [];
  for (let from = 0; ; from += TXN_PAGE) {
    const { data, error } = await supabase
      .from(SB.finance.transactions)
      .select("*")
      .eq("user_id", userId)
      .order("txn_date", { ascending: false })
      .range(from, from + TXN_PAGE - 1);
    if (error) throw error;
    const batch = (data as Row[]) ?? [];
    out.push(...batch.map(txnFromRow));
    if (batch.length < TXN_PAGE) break;
  }
  return out;
}

/** 加载用户全部流水（Supabase 是唯一数据源）。 */
export async function loadTransactions(): Promise<Txn[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  return fetchAllTxns(userId);
}

/** 记一笔（手动）。返回写入后的完整行（含数据库生成的 id）。 */
export async function insertTxn(t: Omit<Txn, "id" | "month">): Promise<Txn> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from(SB.finance.transactions)
    .insert(txnToRow(userId, t))
    .select()
    .single();
  if (error) throw error;
  return txnFromRow(data as Row);
}

const TXN_INSERT_CHUNK = 100;

/** 批量记一笔（扩展同步用，分块 insert 降低往返次数）。 */
export async function insertTxns(items: Omit<Txn, "id" | "month">[]): Promise<Txn[]> {
  if (items.length === 0) return [];
  const userId = await requireUserId();
  const out: Txn[] = [];
  for (let i = 0; i < items.length; i += TXN_INSERT_CHUNK) {
    const chunk = items.slice(i, i + TXN_INSERT_CHUNK);
    const { data, error } = await supabase
      .from(SB.finance.transactions)
      .insert(chunk.map((t) => txnToRow(userId, t)))
      .select();
    if (error) throw error;
    out.push(...((data as Row[]) ?? []).map(txnFromRow));
  }
  return out;
}

/** 编辑一笔（需带 id）。 */
export async function updateTxn(t: Txn): Promise<Txn> {
  const userId = await requireUserId();
  if (!t.id) throw new Error("缺少交易 id");
  const row = { ...txnToRow(userId, t), updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from(SB.finance.transactions)
    .update(row)
    .eq("user_id", userId)
    .eq("id", t.id)
    .select()
    .single();
  if (error) throw error;
  return txnFromRow(data as Row);
}

/** 删除一笔。 */
export async function deleteTxn(id: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from(SB.finance.transactions).delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
}

export interface ExtensionSyncAssertionPayload {
  account_id: string;
  assertion_date: string;
  amount: number;
  note?: string;
}

export interface FinalizeExtensionSyncInput {
  envelopeId: string;
  payloadHash: string;
  captureSource: string;
  captureKind: string;
  transactions?: Record<string, unknown>[];
  balanceAssertions?: ExtensionSyncAssertionPayload[];
}

export interface FinalizeExtensionSyncResult {
  alreadyProcessed: boolean;
  insertedTransactionCount: number;
  skippedTransactionCount: number;
  insertedAssertionCount: number;
  transactions: Txn[];
}

/** 扩展同步原子落库：幂等记录 + 交易 + 余额锚点（Supabase RPC）。 */
export async function finalizeExtensionSync(
  input: FinalizeExtensionSyncInput
): Promise<FinalizeExtensionSyncResult> {
  const { data, error } = await supabase.rpc("finalize_extension_sync_v1", {
    payload: {
      envelope_id: input.envelopeId,
      payload_hash: input.payloadHash,
      capture_source: input.captureSource,
      capture_kind: input.captureKind,
      transactions: input.transactions ?? [],
      balance_assertions: input.balanceAssertions ?? [],
    },
  });
  if (error) throw error;
  const row = (data ?? {}) as Row;
  const txnsRaw = row.transactions;
  const transactions = Array.isArray(txnsRaw)
    ? (txnsRaw as Row[]).map((t) => txnFromExtensionRpcRow(t))
    : [];
  return {
    alreadyProcessed: Boolean(row.already_processed),
    insertedTransactionCount: Number(row.inserted_transaction_count ?? 0),
    skippedTransactionCount: Number(row.skipped_transaction_count ?? 0),
    insertedAssertionCount: Number(row.inserted_assertion_count ?? 0),
    transactions,
  };
}

export async function finalizeTransactionImport(
  payload: ImportFinalizePayload
): Promise<ImportFinalizeResult> {
  const { data, error } = await supabase.rpc("finalize_transaction_import_v1", {
    payload,
  });
  if (error) throw error;
  const row = (data ?? null) as Partial<{
    import_id: string;
    status: string;
    accepted_row_count: number;
    excluded_row_count: number;
    review_row_count: number;
    date_min: string | null;
    date_max: string | null;
  }> | null;
  if (!row?.import_id) throw new Error("导入完成响应格式不正确");
  return {
    importId: row.import_id,
    status: row.status ?? "finalized",
    acceptedRowCount: Number(row.accepted_row_count ?? 0),
    excludedRowCount: Number(row.excluded_row_count ?? 0),
    reviewRowCount: Number(row.review_row_count ?? 0),
    dateMin: row.date_min ?? null,
    dateMax: row.date_max ?? null,
  };
}

function reviewItemFromRow(r: Row): ReviewItemRecord {
  return {
    id: str(r.id),
    importId: str(r.import_id),
    transactionId: ostr(r.transaction_id) ?? null,
    reviewType: str(r.review_type),
    severity: str(r.severity) as ReviewItemRecord["severity"],
    status: str(r.status) as ReviewItemRecord["status"],
    reason: str(r.reason),
    suggestedAction: str(r.suggested_action),
    resolution: ostr(r.resolution),
    createdAt: str(r.created_at),
    resolvedAt: ostr(r.resolved_at),
  };
}

export async function loadReviewItems(status: "open" | "resolved" | "ignored" | "all" = "open"): Promise<ReviewItemRecord[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  let query = supabase
    .from(SB.finance.reviewItems)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(800);
  if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return ((data as Row[]) ?? []).map(reviewItemFromRow);
}

export async function updateReviewItemStatus(
  id: string,
  status: "open" | "resolved" | "ignored",
  resolution?: string
): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from(SB.finance.reviewItems)
    .update({
      status,
      resolution: resolution ?? null,
      resolved_at: status === "open" ? null : new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw error;
}

function balanceAssertionFromRow(r: Row): BalanceAssertion {
  return {
    id: str(r.id),
    accountId: str(r.account_id),
    date: str(r.assertion_date),
    amount: reqn(r.amount),
    note: ostr(r.note),
    adjustmentTxnId: ostr(r.adjustment_txn_id),
    createdAt: ostr(r.created_at),
  };
}

function balanceAssertionToRow(userId: string, a: BalanceAssertion): Row {
  return {
    user_id: userId,
    id: a.id,
    account_id: a.accountId,
    assertion_date: a.date,
    amount: a.amount,
    note: a.note ?? null,
    adjustment_txn_id: a.adjustmentTxnId ?? null,
  };
}

/** 加载余额断言，按账户 + 日期降序。 */
export async function loadBalanceAssertions(accountId?: string): Promise<BalanceAssertion[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  let query = supabase
    .from(SB.finance.balanceAssertions)
    .select("*")
    .eq("user_id", userId)
    .order("assertion_date", { ascending: false })
    .limit(500);
  if (accountId) query = query.eq("account_id", accountId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data as Row[]) ?? []).map(balanceAssertionFromRow);
}

export interface FinalizeReconciliationResult {
  assertion: BalanceAssertion;
  adjustmentTxn: Txn | null;
}

/** 批量写入余额锚点（无补差交易），供扩展同步 / 自动校准使用。 */
export async function insertBalanceAssertions(
  items: Array<{ accountId: string; date: string; amount: number; note?: string }>
): Promise<BalanceAssertion[]> {
  if (items.length === 0) return [];
  const userId = await requireUserId();
  const createdAt = new Date().toISOString();
  const assertions: BalanceAssertion[] = items.map((item) => ({
    id: crypto.randomUUID(),
    accountId: item.accountId,
    date: item.date,
    amount: item.amount,
    note: item.note,
    createdAt,
  }));
  const { error } = await supabase
    .from(SB.finance.balanceAssertions)
    .insert(assertions.map((a) => balanceAssertionToRow(userId, a)));
  if (error) throw error;
  return assertions;
}

/** 完成对账：可选补差交易 → 写入断言 → 同步账户余额缓存。 */
export async function finalizeAccountReconciliation(input: {
  account: Account;
  assertionDate: string;
  statedBalance: number;
  note?: string;
  adjustmentAmount: number;
  createAdjustment: boolean;
}): Promise<FinalizeReconciliationResult> {
  const userId = await requireUserId();

  let adjustmentTxn: Txn | null = null;
  if (input.createAdjustment && Math.abs(input.adjustmentAmount) >= 0.005) {
    adjustmentTxn = await insertTxn({
      date: input.assertionDate,
      merchant: "对账调整",
      category: "Reconciliation",
      account: input.account.name,
      flow: "reconcile_adjustment",
      amount: input.adjustmentAmount,
      budgetImpact: 0,
      inSpending: false,
      inCashFlow: true,
      source: "manual",
    });
  }

  const assertionId = crypto.randomUUID();
  const assertion: BalanceAssertion = {
    id: assertionId,
    accountId: input.account.id,
    date: input.assertionDate,
    amount: input.statedBalance,
    note: input.note,
    adjustmentTxnId: adjustmentTxn?.id,
    createdAt: new Date().toISOString(),
  };

  const { error: assertionError } = await supabase
    .from(SB.finance.balanceAssertions)
    .insert(balanceAssertionToRow(userId, assertion));
  if (assertionError) throw assertionError;

  return { assertion, adjustmentTxn };
}

function occurrenceFromRow(r: Row): ExpectedOccurrence {
  return {
    id: str(r.id),
    sourceType: str(r.source_type) as ExpectedOccurrence["sourceType"],
    sourceId: str(r.source_id),
    label: str(r.label),
    date: str(r.occurrence_date),
    expectedAmount: reqn(r.expected_amount),
    accountId: ostr(r.account_id),
    state: str(r.state) as OccurrenceState,
    matchedTxnId: ostr(r.matched_txn_id),
    actualAmount: onum(r.actual_amount),
    actualDate: ostr(r.actual_date),
    reconciledPeriodId: ostr(r.reconciled_period_id),
    varianceAmount: onum(r.variance_amount),
    varianceDays: onum(r.variance_days) != null ? Number(r.variance_days) : undefined,
  };
}

function occurrenceToRow(userId: string, o: ExpectedOccurrence): Row {
  return {
    user_id: userId,
    id: o.id,
    source_type: o.sourceType,
    source_id: o.sourceId,
    label: o.label,
    occurrence_date: o.date,
    expected_amount: o.expectedAmount,
    account_id: o.accountId ?? null,
    state: o.state,
    matched_txn_id: o.matchedTxnId ?? null,
    actual_amount: o.actualAmount ?? null,
    actual_date: o.actualDate ?? null,
    reconciled_period_id: o.reconciledPeriodId ?? null,
    variance_amount: o.varianceAmount ?? null,
    variance_days: o.varianceDays ?? null,
    updated_at: new Date().toISOString(),
  };
}

/** 加载全部预期条目。 */
export async function loadExpectedOccurrences(): Promise<ExpectedOccurrence[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from(SB.finance.expectedOccurrences)
    .select("*")
    .eq("user_id", userId)
    .order("occurrence_date", { ascending: true })
    .limit(1000);
  if (error) throw error;
  return ((data as Row[]) ?? []).map(occurrenceFromRow);
}

/** 批量 upsert 预期条目（按 id）。 */
export async function upsertExpectedOccurrences(rows: ExpectedOccurrence[]): Promise<void> {
  if (rows.length === 0) return;
  const userId = await requireUserId();
  const { error } = await supabase
    .from(SB.finance.expectedOccurrences)
    .upsert(rows.map((r) => occurrenceToRow(userId, r)), { onConflict: "id" });
  if (error) throw error;
}

/** 更新单条预期条目状态。 */
export async function updateOccurrenceState(
  id: string,
  patch: Partial<Pick<ExpectedOccurrence, "state" | "matchedTxnId" | "actualAmount" | "actualDate" | "varianceAmount" | "varianceDays" | "reconciledPeriodId">>
): Promise<void> {
  const userId = await requireUserId();
  const row: Row = { updated_at: new Date().toISOString() };
  if (patch.state != null) row.state = patch.state;
  if (patch.matchedTxnId !== undefined) row.matched_txn_id = patch.matchedTxnId;
  if (patch.actualAmount !== undefined) row.actual_amount = patch.actualAmount;
  if (patch.actualDate !== undefined) row.actual_date = patch.actualDate;
  if (patch.varianceAmount !== undefined) row.variance_amount = patch.varianceAmount;
  if (patch.varianceDays !== undefined) row.variance_days = patch.varianceDays;
  if (patch.reconciledPeriodId !== undefined) row.reconciled_period_id = patch.reconciledPeriodId;
  const { error } = await supabase
    .from(SB.finance.expectedOccurrences)
    .update(row)
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw error;
}

export function neutralizeSpreadsheetCell(raw: string): string {
  if (!raw) return raw;
  const first = raw[0];
  if (["=", "+", "-", "@", "\t", "\r"].includes(first)) {
    return `'${raw}`;
  }
  return raw;
}

export async function exportFinancialBackup(): Promise<FinancialBackupPayload> {
  const userId = await requireUserId();
  const [acc, cf, ev, gl, st, txns, sc, hs, hp, dr, ba, occ] = await Promise.all([
    supabase.from(SB.finance.accounts).select("*").eq("user_id", userId),
    supabase.from(SB.finance.cashFlows).select("*").eq("user_id", userId),
    supabase.from(SB.finance.scenarioEvents).select("*").eq("user_id", userId),
    supabase.from(SB.finance.goals).select("*").eq("user_id", userId),
    supabase.from(SB.finance.userSettings).select("*").eq("user_id", userId).maybeSingle(),
    fetchAllTxns(userId),
    supabase.from(SB.finance.scenarios).select("*").eq("user_id", userId),
    supabase.from(SB.finance.holdingsSnapshots).select("*").eq("user_id", userId),
    supabase.from(SB.finance.holdingPositions).select("*").eq("user_id", userId),
    supabase.from(SB.finance.decisionRecords).select("*").eq("user_id", userId),
    supabase.from(SB.finance.balanceAssertions).select("*").eq("user_id", userId),
    supabase.from(SB.finance.expectedOccurrences).select("*").eq("user_id", userId),
  ]);
  const err =
    acc.error ||
    cf.error ||
    ev.error ||
    gl.error ||
    st.error ||
    (sc.error && !isScenariosTableMissing(sc.error) ? sc.error : null) ||
    (hs.error && !isHoldingsTableMissing(hs.error) ? hs.error : null) ||
    (hp.error && !isHoldingsTableMissing(hp.error) ? hp.error : null) ||
    dr.error ||
    ba.error ||
    occ.error;
  if (err) throw err;
  const settings = (st.data as Row | null) ?? {};
  const assumptions = {
    ...defaultAssumptions,
    ...((settings.assumptions as Partial<AssumptionSet>) ?? {}),
  };
  const positionsBySnapshot = new Map<string, HoldingPosition[]>();
  if (!hp.error) {
    for (const row of ((hp.data as Row[]) ?? []).map(holdingPositionFromRow)) {
      if (!positionsBySnapshot.has(row.snapshotId)) positionsBySnapshot.set(row.snapshotId, []);
      const { snapshotId: _snapshotId, ...position } = row;
      positionsBySnapshot.get(row.snapshotId)?.push(position);
    }
  }
  const holdingsSnapshots = hs.error
    ? []
    : ((hs.data as Row[]) ?? []).map((row) => {
        const snapshot = holdingsSnapshotFromRow(row);
        snapshot.positions = (positionsBySnapshot.get(snapshot.id) ?? []).slice();
        return snapshot;
      });
  const scenarios = sc.error
    ? []
    : ((sc.data as Row[]) ?? []).map(scenarioFromRow);
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    dataVersion:
      settings.data_version != null ? Number(settings.data_version) : DATA_VERSION,
    assumptions,
    privacy: Boolean(settings.privacy),
    locale: isAppLocale(ostr(settings.locale)) ? (ostr(settings.locale) as AppLocale) : undefined,
    activeScenarioId: ostr(settings.active_scenario_id) ?? undefined,
    portfolioAllocationTarget: sanitizePortfolioAllocationTarget(
      settings.portfolio_allocation_target as PortfolioAllocationTarget | null | undefined
    ),
    accounts: ((acc.data as Row[]) ?? []).map(accountFromRow),
    cashFlows: ((cf.data as Row[]) ?? []).map(cashFlowFromRow),
    events: ((ev.data as Row[]) ?? []).map(eventFromRow),
    goals: ((gl.data as Row[]) ?? []).map(goalFromRow),
    transactions: txns,
    scenarios,
    holdingsSnapshots,
    decisionRecords: ((dr.data as Row[]) ?? []).map(decisionRecordFromRow),
    balanceAssertions: ((ba.data as Row[]) ?? []).map(balanceAssertionFromRow),
    expectedOccurrences: ((occ.data as Row[]) ?? []).map(occurrenceFromRow),
  };
}

export async function deleteAllFinancialData(): Promise<DeleteFinancialDataResult> {
  let data: unknown = null;
  let error: { message?: string } | null = null;
  const v2 = await supabase.rpc("delete_all_financial_data_v2");
  data = v2.data;
  error = v2.error;
  if (error && /delete_all_financial_data_v2|does not exist/i.test(String(error.message ?? ""))) {
    const v1 = await supabase.rpc("delete_all_financial_data_v1");
    data = v1.data;
    error = v1.error;
  }
  if (error) throw error;
  const deleted = ((data as { deleted?: Record<string, number> } | null)?.deleted ??
    {}) as Record<string, number>;
  return {
    success: true,
    deleted,
    failed: [],
  };
}

export async function restoreFinancialBackup(
  payload: FinancialBackupPayload
): Promise<RestoreFinancialDataResult> {
  const valid = validateFinancialBackupPayload(payload);
  if (!valid.ok) throw new Error(valid.errors.join("; "));
  const rpcName =
    payload.schemaVersion === BACKUP_SCHEMA_VERSION
      ? "restore_finance_backup_v2"
      : "restore_finance_backup_v1";
  let data: unknown = null;
  let error: { message?: string } | null = null;
  const res = await supabase.rpc(rpcName, { payload });
  data = res.data;
  error = res.error;
  if (
    error &&
    rpcName === "restore_finance_backup_v2" &&
    /restore_finance_backup_v2|does not exist/i.test(String(error.message ?? ""))
  ) {
    const fallback = await supabase.rpc("restore_finance_backup_v1", { payload });
    data = fallback.data;
    error = fallback.error;
  }
  if (error) throw error;
  const result = (data ?? {}) as {
    schemaVersion?: number;
    restored?: Record<string, number>;
    restoredAt?: string;
  };
  if (
    typeof result.schemaVersion !== "number" ||
    !result.restored ||
    typeof result.restoredAt !== "string"
  ) {
    throw new Error("恢复返回值格式不正确");
  }
  return {
    success: true,
    schemaVersion: result.schemaVersion,
    restored: result.restored,
    restoredAt: result.restoredAt,
  };
}
