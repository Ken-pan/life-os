// P1B P1 — 统一时间轴：物化预期条目、状态推进、自动匹配。

import type { Account, BalanceAssertion, FinanceData, ScenarioEvent } from "../types.js";
import type { Txn } from "./transactions";
import { parseLocalDate } from "./calendar";
import { num, paysFromReserve, pickSpendingCard } from "./finance";
import {
  goalMonthlyAllocationDay,
  isEmergencyReserveGoal,
  monthlyGoalAllocations,
} from "./goals";
import { TIMELINE_DEFAULTS, TIMELINE_PROJECTION_HORIZON_DAYS } from "./timelineConstants";
import { t } from "../i18n/translate.js";

export type OccurrenceSourceType =
  | "cashflow"
  | "event"
  | "card_bill"
  | "goal_transfer"
  | "annual_fee";

export type OccurrenceState =
  | "planned"
  | "upcoming"
  | "pending"
  | "matched"
  | "reconciled"
  | "skipped";

export interface ExpectedOccurrence {
  id: string;
  sourceType: OccurrenceSourceType;
  sourceId: string;
  label: string;
  date: string;
  /** 正=流入，负=流出。 */
  expectedAmount: number;
  accountId?: string;
  state: OccurrenceState;
  matchedTxnId?: string;
  actualAmount?: number;
  actualDate?: string;
  reconciledPeriodId?: string;
  varianceAmount?: number;
  varianceDays?: number;
}

export type OccurrenceDisplayStatus =
  | "planned"
  | "upcoming"
  | "pending"
  | "matched_ok"
  | "matched_warn"
  | "reconciled"
  | "skipped";

export interface OccurrenceDraft {
  sourceType: OccurrenceSourceType;
  sourceId: string;
  label: string;
  date: string;
  expectedAmount: number;
  accountId?: string;
}

const DAY_MS = 86_400_000;
const DEFAULT_HORIZON_DAYS = TIMELINE_PROJECTION_HORIZON_DAYS;

function fmtISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = startOfDay(parseLocalDate(fromIso)).getTime();
  const b = startOfDay(parseLocalDate(toIso)).getTime();
  return Math.round((b - a) / DAY_MS);
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function dateOnDay(year: number, month: number, day: number): Date {
  const d = Math.min(Math.max(1, Math.round(day)), lastDayOfMonth(year, month));
  return new Date(year, month, d);
}

function occurrenceKey(o: Pick<ExpectedOccurrence, "sourceType" | "sourceId" | "date">): string {
  return `${o.sourceType}|${o.sourceId}|${o.date}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function minCreditPayment(balance: number): number {
  return Math.min(balance, Math.max(25, balance * 0.02));
}

function primaryLiquidAccountId(accounts: Account[]): string | undefined {
  const checking = accounts.find((a) => a.type === "checking" && a.liquid !== false);
  return checking?.id ?? accounts.find((a) => a.type === "savings" && a.liquid !== false)?.id;
}

/** 物化窗口内从计划项生成预期条目草稿（不含 id/state）。 */
export function materializeOccurrenceDrafts(
  data: FinanceData,
  today: Date,
  horizonDays = DEFAULT_HORIZON_DAYS
): OccurrenceDraft[] {
  const start = startOfDay(today);
  const startTs = start.getTime();
  const endTs = startTs + horizonDays * DAY_MS;
  const windowStartTs = startTs - TIMELINE_DEFAULTS.upcomingWindowDays * DAY_MS;
  const drafts: OccurrenceDraft[] = [];
  const defaultAccountId = primaryLiquidAccountId(data.accounts);

  const months: { year: number; month: number }[] = [];
  {
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur.getTime() <= endTs) {
      months.push({ year: cur.getFullYear(), month: cur.getMonth() });
      cur.setMonth(cur.getMonth() + 1);
    }
  }

  for (const c of data.cashFlows) {
    if (c.frequency === "annual") continue;
    const amt = num(c.amount);
    if (amt === 0 || c.dueDay == null) continue;
    const signed = c.type === "income" ? amt : -amt;
    for (const ym of months) {
      const d = dateOnDay(ym.year, ym.month, c.dueDay);
      const ts = d.getTime();
      if (ts < windowStartTs || ts >= endTs) continue;
      drafts.push({
        sourceType: "cashflow",
        sourceId: c.id,
        label: c.name || (c.type === "income" ? "收入" : "支出"),
        date: fmtISO(d),
        expectedAmount: round2(signed),
        accountId: defaultAccountId,
      });
    }
  }

  for (const e of data.events) {
    if (!e.enabled || !e.date) continue;
    if (e.eventType !== "windfall" && e.eventType !== "one-time-purchase") continue;
    if (
      e.eventType === "one-time-purchase" &&
      (e.fundingSource ?? "checking") === "credit-card" &&
      pickSpendingCard(data.accounts)
    ) {
      // 刷卡消费：现金在账单日流出，不在购买日记入运营流动现金。
      continue;
    }
    const d = parseLocalDate(e.date);
    const ts = startOfDay(d).getTime();
    if (ts < windowStartTs || ts >= endTs) continue;
    const amt = num(e.amount);
    drafts.push({
      sourceType: "event",
      sourceId: e.id,
      label: e.name || (e.eventType === "windfall" ? "一次性收入" : "一次性支出"),
      date: fmtISO(d),
      expectedAmount: e.eventType === "windfall" ? amt : -amt,
      accountId: defaultAccountId,
    });
  }

  for (const a of data.accounts) {
    if (a.type === "credit-card") {
      const bal = num(a.balance);
      const stmt = a.statementBalance != null ? num(a.statementBalance) : bal;
      const revolving = a.creditMode === "revolving";
      const mode = a.autoPayMode ?? (revolving ? "minimum" : "statement");
      let payAmt = 0;
      if (mode === "minimum") payAmt = minCreditPayment(bal);
      else if (mode === "full-balance") payAmt = bal;
      else if (mode !== "none") payAmt = stmt;
      if (payAmt <= 0) continue;
      const fromReserve = paysFromReserve(a, data.accounts);
      const day = a.dueDay ?? 15;
      for (const ym of months) {
        const d = dateOnDay(ym.year, ym.month, day);
        const ts = d.getTime();
        if (ts < windowStartTs || ts >= endTs) continue;
        drafts.push({
          sourceType: "card_bill",
          sourceId: a.id,
          label: `${a.name || "信用卡"} 账单`,
          date: fmtISO(d),
          expectedAmount: round2(-payAmt),
          accountId: fromReserve ? a.paymentAccountId : primaryLiquidAccountId(data.accounts),
        });
      }
    }
    if (a.annualFee && a.annualFeeDate && num(a.annualFee) > 0) {
      const d = parseLocalDate(a.annualFeeDate);
      const ts = startOfDay(d).getTime();
      if (ts >= windowStartTs && ts < endTs) {
        drafts.push({
          sourceType: "annual_fee",
          sourceId: a.id,
          label: `${a.name || "卡"} 年费`,
          date: fmtISO(d),
          expectedAmount: round2(-num(a.annualFee)),
          accountId: primaryLiquidAccountId(data.accounts),
        });
      }
    }
  }

  const allocationGoals = monthlyGoalAllocations(data.goals).filter(
    (g) => !isEmergencyReserveGoal(g)
  );
  for (const goal of allocationGoals) {
    const amount = Math.max(0, num(goal.monthlyAllocation));
    if (amount <= 0) continue;
    for (const ym of months) {
      const d = dateOnDay(ym.year, ym.month, goalMonthlyAllocationDay(goal));
      const ts = d.getTime();
      if (ts < startTs || ts >= endTs) continue;
      drafts.push({
        sourceType: "goal_transfer",
        sourceId: goal.id,
        label: `${goal.name || "目标"} 月度预留`,
        date: fmtISO(d),
        expectedAmount: round2(-amount),
        accountId: defaultAccountId,
      });
    }
  }

  return drafts;
}

function isTerminalOccurrenceState(state: OccurrenceState): boolean {
  return state === "matched" || state === "reconciled" || state === "skipped";
}

/** 合并物化草稿与已存条目（幂等，保留终端状态）。 */
export function mergeOccurrences(
  drafts: OccurrenceDraft[],
  stored: ExpectedOccurrence[],
  today?: Date
): ExpectedOccurrence[] {
  const byKey = new Map<string, ExpectedOccurrence>();
  for (const row of stored) byKey.set(occurrenceKey(row), row);

  const out: ExpectedOccurrence[] = [];
  for (const draft of drafts) {
    const key = occurrenceKey(draft);
    const existing = byKey.get(key);
    if (existing) {
      if (isTerminalOccurrenceState(existing.state)) {
        // 终端状态是历史事实：不用新草稿金额覆写 expectedAmount，
        // 且在 actualAmount 存在时保证 variance = actual - expected 的不变量。
        out.push({
          ...existing,
          label: draft.label,
          accountId: draft.accountId ?? existing.accountId,
          varianceAmount:
            existing.actualAmount != null
              ? round2(existing.actualAmount - existing.expectedAmount)
              : existing.varianceAmount,
        });
      } else {
        out.push({
          ...existing,
          label: draft.label,
          expectedAmount: draft.expectedAmount,
          accountId: draft.accountId ?? existing.accountId,
        });
      }
      byKey.delete(key);
    } else {
      out.push({
        id: `occ_${key.replace(/\|/g, "_")}`,
        ...draft,
        state: "planned",
      });
    }
  }
  const todayIso = today ? fmtISO(startOfDay(today)) : undefined;
  for (const leftover of byKey.values()) {
    if (isTerminalOccurrenceState(leftover.state)) {
      out.push(leftover);
      continue;
    }
    // 逾期且未确认的条目（如上月未勾选的账单）不能静默消失，保留待用户处理。
    if (todayIso && leftover.date < todayIso) {
      out.push(leftover);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
}

export function advanceOccurrenceStates(
  rows: ExpectedOccurrence[],
  today: Date
): ExpectedOccurrence[] {
  const todayIso = fmtISO(startOfDay(today));
  return rows.map((row) => {
    if (row.state === "reconciled" || row.state === "skipped") return row;
    if (row.state === "matched") return row;

    const daysUntil = daysBetween(todayIso, row.date);
    if (daysUntil < 0) return { ...row, state: "pending" };
    if (daysUntil <= TIMELINE_DEFAULTS.upcomingWindowDays) return { ...row, state: "upcoming" };
    return { ...row, state: "planned" };
  });
}

/** 用于匹配的预期 signed 金额（与 expectedAmount 同符号空间）。 */
export function txnSignedForMatch(t: Txn): number {
  switch (t.flow) {
    case "income":
      return t.amount < 0 ? -t.amount : Math.abs(t.amount);
    case "refund_or_reversal":
      return Math.abs(t.budgetImpact);
    case "expense":
      return t.budgetImpact <= 0 ? t.budgetImpact : -Math.abs(t.budgetImpact);
    case "credit_card_payment":
      return t.amount < 0 ? t.amount : -Math.abs(t.amount);
    case "internal_transfer":
      return t.amount < 0 ? t.amount : -Math.abs(t.amount);
    default:
      return t.inCashFlow ? t.amount : 0;
  }
}

function amountsWithinTolerance(expected: number, actual: number): boolean {
  const tol = TIMELINE_DEFAULTS.matchAmountTolerance(expected);
  return Math.abs(actual - expected) <= tol + 0.004;
}

function labelHintsMatch(label: string, t: Txn): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const l = norm(label);
  const merchant = norm(t.merchant);
  const category = norm(t.category);
  if (!l || l.length < 3) return true;
  if (merchant.includes(l) || l.includes(merchant)) return true;
  if (category && (category.includes(l) || l.includes(category))) return true;
  const token = l.split(/\s+/)[0];
  return token.length >= 4 && (merchant.includes(token) || category.includes(token));
}

function txnMatchesOccurrence(occ: ExpectedOccurrence, t: Txn): boolean {
  if (Math.abs(daysBetween(occ.date, t.date)) > TIMELINE_DEFAULTS.matchDateToleranceDays) {
    return false;
  }
  const signed = txnSignedForMatch(t);
  if (!amountsWithinTolerance(occ.expectedAmount, signed)) return false;

  if (occ.sourceType === "card_bill") {
    return t.flow === "credit_card_payment" || t.flow === "expense";
  }
  if (occ.sourceType === "cashflow" || occ.sourceType === "goal_transfer") {
    return labelHintsMatch(occ.label, t) || amountsWithinTolerance(occ.expectedAmount, signed);
  }
  return true;
}

/** 自动匹配：pending/upcoming → matched。 */
export function matchOccurrences(
  rows: ExpectedOccurrence[],
  txns: Txn[]
): ExpectedOccurrence[] {
  const usedTxnIds = new Set<string>();
  for (const row of rows) {
    if (row.matchedTxnId) usedTxnIds.add(row.matchedTxnId);
  }

  const candidates = rows.filter(
    (r) => r.state === "pending" || r.state === "upcoming"
  );
  const sorted = [...candidates].sort((a, b) => a.date.localeCompare(b.date));
  const updates = new Map<string, ExpectedOccurrence>();

  for (const occ of sorted) {
    let best: { txn: Txn; score: number } | null = null;
    for (const t of txns) {
      if (t.id && usedTxnIds.has(t.id)) continue;
      if (!txnMatchesOccurrence(occ, t)) continue;
      const dateDiff = Math.abs(daysBetween(occ.date, t.date));
      const amtDiff = Math.abs(txnSignedForMatch(t) - occ.expectedAmount);
      const score = dateDiff * 100 + amtDiff;
      if (!best || score < best.score) best = { txn: t, score };
    }
    if (!best?.txn.id) continue;

    const signed = txnSignedForMatch(best.txn);
    const varianceAmount = round2(signed - occ.expectedAmount);
    const varianceDays = daysBetween(occ.date, best.txn.date);
    usedTxnIds.add(best.txn.id);
    updates.set(occ.id, {
      ...occ,
      state: "matched",
      matchedTxnId: best.txn.id,
      actualAmount: signed,
      actualDate: best.txn.date,
      varianceAmount,
      varianceDays,
    });
  }

  if (updates.size === 0) return rows;
  return rows.map((r) => updates.get(r.id) ?? r);
}

/** 对账断言通过后，锁定同期 matched 条目。 */
export function applyReconciledLocks(
  rows: ExpectedOccurrence[],
  assertions: BalanceAssertion[]
): ExpectedOccurrence[] {
  if (!assertions.length) return rows;
  const latestByAccount = new Map<string, BalanceAssertion>();
  for (const a of assertions) {
    const prev = latestByAccount.get(a.accountId);
    if (!prev || a.date > prev.date) latestByAccount.set(a.accountId, a);
  }

  return rows.map((row) => {
    if (row.state !== "matched" || !row.accountId) return row;
    const assertion = latestByAccount.get(row.accountId);
    if (!assertion || row.date > assertion.date) return row;
    return {
      ...row,
      state: "reconciled",
      reconciledPeriodId: assertion.id,
    };
  });
}

export function rollTimeline(input: {
  data: FinanceData;
  txns: Txn[];
  stored: ExpectedOccurrence[];
  assertions?: BalanceAssertion[];
  today?: Date;
  horizonDays?: number;
}): ExpectedOccurrence[] {
  const today = input.today ?? new Date();
  const drafts = materializeOccurrenceDrafts(input.data, today, input.horizonDays);
  let rows = mergeOccurrences(drafts, input.stored, today);
  rows = advanceOccurrenceStates(rows, today);
  rows = matchOccurrences(rows, input.txns);
  rows = applyReconciledLocks(rows, input.assertions ?? []);
  return rows;
}

export function occurrenceDisplayStatus(occ: ExpectedOccurrence): OccurrenceDisplayStatus {
  if (occ.state === "reconciled") return "reconciled";
  if (occ.state === "skipped") return "skipped";
  if (occ.state === "planned") return "planned";
  if (occ.state === "upcoming") return "upcoming";
  if (occ.state === "pending") return "pending";
  if (occ.state === "matched") {
    const amtOk =
      occ.varianceAmount == null ||
      amountsWithinTolerance(occ.expectedAmount, occ.expectedAmount + occ.varianceAmount);
    const dateOk =
      occ.varianceDays == null ||
      Math.abs(occ.varianceDays) <= TIMELINE_DEFAULTS.matchDateToleranceDays;
    return amtOk && dateOk ? "matched_ok" : "matched_warn";
  }
  return "planned";
}

export function pendingConfirmations(
  rows: ExpectedOccurrence[],
  today: Date
): ExpectedOccurrence[] {
  const todayIso = fmtISO(startOfDay(today));
  const monthPrefix = todayIso.slice(0, 7);
  return rows.filter(
    (r) =>
      r.state === "pending" &&
      (r.date.startsWith(monthPrefix) || r.date <= todayIso)
  );
}

/** 到期/逾期待用户确认的计划项（含扣款当日的 upcoming）。 */
export function actionableConfirmations(
  rows: ExpectedOccurrence[],
  today: Date
): ExpectedOccurrence[] {
  const todayIso = fmtISO(startOfDay(today));
  return rows.filter(
    (r) =>
      (r.state === "pending" || r.state === "upcoming") &&
      r.date <= todayIso
  );
}

export function occurrencesInMonth(
  rows: ExpectedOccurrence[],
  monthPrefix: string
): ExpectedOccurrence[] {
  return rows.filter((r) => r.date.startsWith(monthPrefix) && r.state !== "skipped");
}

export function displayStatusClass(status: OccurrenceDisplayStatus): string {
  switch (status) {
    case "upcoming":
      return "occ-upcoming";
    case "matched_ok":
      return "occ-matched-ok";
    case "matched_warn":
      return "occ-matched-warn";
    case "pending":
      return "occ-pending";
    case "reconciled":
      return "occ-reconciled";
    case "skipped":
      return "occ-skipped";
    default:
      return "occ-planned";
  }
}

export function occurrenceAffectsBalance(state: OccurrenceState): boolean {
  return state === "planned" || state === "upcoming" || state === "pending";
}

/** 信用卡账单是否从受保护储备账户扣款（不影响流动现金日历）。 */
export function cardBillPaysFromReserve(
  occ: Pick<ExpectedOccurrence, "sourceType" | "sourceId">,
  accounts: Account[]
): boolean {
  if (occ.sourceType !== "card_bill") return false;
  const card = accounts.find((a) => a.id === occ.sourceId);
  return !!card && paysFromReserve(card, accounts);
}

/** 时间轴条目是否应计入流动现金投影。 */
export function occurrenceAffectsLiquidCash(
  occ: ExpectedOccurrence,
  accounts: Account[]
): boolean {
  if (!occurrenceAffectsBalance(occ.state)) return false;
  if (cardBillPaysFromReserve(occ, accounts)) return false;
  return true;
}

export function occurrenceDayEventKind(
  occ: ExpectedOccurrence
): "income" | "expense" | "card" | "fee" | "transfer" {
  if (occ.expectedAmount >= 0) return "income";
  switch (occ.sourceType) {
    case "card_bill":
      return "card";
    case "annual_fee":
      return "fee";
    case "goal_transfer":
      return "transfer";
    default:
      return "expense";
  }
}

export function confirmOccurredLabel(occ: Pick<ExpectedOccurrence, "expectedAmount">): string {
  return occ.expectedAmount >= 0
    ? t("timeline.confirmInflow")
    : t("timeline.confirmOutflow");
}

export function displayStatusLabel(status: OccurrenceDisplayStatus): string {
  switch (status) {
    case "upcoming":
      return t("timeline.statusUpcoming");
    case "matched_ok":
      return t("timeline.statusMatchedOk");
    case "matched_warn":
      return t("timeline.statusMatchedWarn");
    case "pending":
      return t("timeline.statusPending");
    case "reconciled":
      return t("timeline.statusReconciled");
    case "skipped":
      return t("timeline.statusSkipped");
    default:
      return t("timeline.statusPlanned");
  }
}

/** 大额收支条目在时间轴上的闭合分组。 */
export type EventClosureBucket = "planned" | "pending" | "closed";

/** 查找某条 scenario event 对应的预期条目（同 eventId，优先同 date）。 */
export function occurrenceForEvent(
  occurrences: ExpectedOccurrence[],
  eventId: string,
  eventDate?: string
): ExpectedOccurrence | undefined {
  const matches = occurrences.filter(
    (o) => o.sourceType === "event" && o.sourceId === eventId
  );
  if (eventDate) {
    const exact = matches.find((o) => o.date === eventDate);
    if (exact) return exact;
  }
  return matches.sort((a, b) => b.date.localeCompare(a.date))[0];
}

/** 根据事件日期与时间轴状态，判断应落在哪个 UI 分区。 */
export function classifyEventClosure(
  event: Pick<ScenarioEvent, "date" | "monthOffset">,
  occ: ExpectedOccurrence | undefined,
  today: Date = new Date()
): EventClosureBucket {
  const todayIso = fmtISO(startOfDay(today));

  if (event.date) {
    const eventIso = fmtISO(startOfDay(parseLocalDate(event.date)));
    if (eventIso > todayIso) return "planned";
  } else if ((event.monthOffset ?? 0) >= 0) {
    return "planned";
  }

  if (!occ) return "pending";

  if (occ.state === "skipped" || occ.state === "matched" || occ.state === "reconciled") {
    return "closed";
  }
  if (occ.state === "pending") return "pending";
  if (occ.state === "upcoming" && occ.date <= todayIso) return "pending";
  if ((occ.state === "planned" || occ.state === "upcoming") && occ.date <= todayIso) {
    return "pending";
  }

  return "closed";
}

/** 为待确认条目推荐可关联的真实交易（按日期/金额接近度排序）。 */
export function rankTxnCandidates(
  occ: ExpectedOccurrence,
  txns: Txn[],
  limit = 5
): Txn[] {
  const scored: { txn: Txn; score: number }[] = [];
  for (const t of txns) {
    if (!txnMatchesOccurrence(occ, t)) continue;
    const dateDiff = Math.abs(daysBetween(occ.date, t.date));
    const amtDiff = Math.abs(txnSignedForMatch(t) - occ.expectedAmount);
    scored.push({ txn: t, score: dateDiff * 100 + amtDiff });
  }
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((s) => s.txn);
}

/** 待确认条目应跳转到哪个管理入口（与侧栏 IA 对齐）。 */
export type OccurrenceNavHint =
  | { kind: "oneoff"; eventId: string }
  | { kind: "fixed" }
  | { kind: "review" }
  | { kind: "none" };

export function occurrenceNavHint(
  occ: Pick<ExpectedOccurrence, "sourceType" | "sourceId">
): OccurrenceNavHint {
  if (occ.sourceType === "event") return { kind: "oneoff", eventId: occ.sourceId };
  if (occ.sourceType === "cashflow") return { kind: "fixed" };
  if (occ.sourceType === "card_bill" || occ.sourceType === "annual_fee") return { kind: "review" };
  return { kind: "none" };
}

export function occurrenceNavLabel(hint: OccurrenceNavHint): string | null {
  switch (hint.kind) {
    case "oneoff":
      return t("timeline.navOneoff");
    case "fixed":
      return t("timeline.navFixed");
    case "review":
      return t("timeline.navReview");
    default:
      return null;
  }
}

export { occurrenceKey };
