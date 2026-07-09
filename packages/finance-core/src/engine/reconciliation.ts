// P1B L2 — 余额断言与对账纯函数引擎。
// 不触碰 UI / 持久化；repo 与 Review 页消费这些函数。

import type { Account, BalanceAssertion } from "../types.js";
import type { Txn } from "./transactions";
import { num } from "./finance";

export interface ReconciliationPreview {
  accountId: string;
  accountName: string;
  assertionDate: string;
  /** 用户从银行抄来的余额。 */
  statedBalance: number;
  /** 上次断言金额；首次对账时为 null。 */
  lastAssertionAmount: number | null;
  lastAssertionDate: string | null;
  /** 上次断言之后、断言日（含）之间的流水净额。 */
  txnNetSinceLast: number;
  expectedBalance: number;
  difference: number;
  /** 区间内计入该账户的流水笔数。 */
  txnCount: number;
  /** 是否首次建立锚点（不做 txn 校验）。 */
  isOpeningAssertion: boolean;
  /** |difference| ≤ 0.005 */
  isBalanced: boolean;
}

const CASH_TYPES = new Set<Account["type"]>(["checking", "savings"]);

/** P0：仅 checking / savings 且未被标为非流动。 */
export function isReconcilableCashAccount(a: Account): boolean {
  if (!CASH_TYPES.has(a.type)) return false;
  if (a.liquid === false) return false;
  return true;
}

function accountNamesMatch(accountName: string, txnAccount: string): boolean {
  return accountName.trim().toLowerCase() === txnAccount.trim().toLowerCase();
}

/**
 * 单笔交易对该账户余额的 signed delta（正=余额增加）。
 * 统一 manual（expense 为正数）与 import（expense 为负数）两种约定。
 */
export function accountBalanceDelta(t: Txn): number {
  switch (t.flow) {
    case "income":
    case "refund_or_reversal":
      return t.amount < 0 ? -t.amount : Math.abs(t.amount);
    case "expense":
    case "credit_card_payment":
    case "internal_transfer":
      return t.amount < 0 ? t.amount : -Math.abs(t.amount);
    case "reconcile_adjustment":
      return t.amount;
    case "ignored":
    case "zero_activity":
      return 0;
    default:
      return t.inCashFlow ? t.amount : 0;
  }
}

export function txnsForAccountInRange(
  txns: Txn[],
  accountName: string,
  afterDateExclusive: string | null,
  throughDateInclusive: string
): Txn[] {
  return txns.filter((t) => {
    if (!accountNamesMatch(accountName, t.account)) return false;
    if (afterDateExclusive != null && t.date <= afterDateExclusive) return false;
    if (t.date > throughDateInclusive) return false;
    return true;
  });
}

export function sumBalanceDelta(rows: Txn[]): number {
  let sum = 0;
  for (const t of rows) sum += accountBalanceDelta(t);
  return round2(sum);
}

export function computeReconciliationPreview(input: {
  account: Account;
  assertionDate: string;
  statedBalance: number;
  txns: Txn[];
  lastAssertion: { date: string; amount: number } | null;
}): ReconciliationPreview {
  const { account, assertionDate, statedBalance, txns, lastAssertion } = input;
  const isOpeningAssertion = lastAssertion == null;

  if (isOpeningAssertion) {
    const diff = round2(statedBalance - account.balance);
    return {
      accountId: account.id,
      accountName: account.name,
      assertionDate,
      statedBalance: round2(statedBalance),
      lastAssertionAmount: null,
      lastAssertionDate: null,
      txnNetSinceLast: 0,
      expectedBalance: round2(account.balance),
      difference: diff,
      txnCount: 0,
      isOpeningAssertion: true,
      isBalanced: Math.abs(diff) < 0.005,
    };
  }

  const inRange = txnsForAccountInRange(
    txns,
    account.name,
    lastAssertion.date,
    assertionDate
  );
  const txnNet = sumBalanceDelta(inRange);
  const expected = round2(lastAssertion.amount + txnNet);
  const difference = round2(statedBalance - expected);

  return {
    accountId: account.id,
    accountName: account.name,
    assertionDate,
    statedBalance: round2(statedBalance),
    lastAssertionAmount: lastAssertion.amount,
    lastAssertionDate: lastAssertion.date,
    txnNetSinceLast: txnNet,
    expectedBalance: expected,
    difference,
    txnCount: inRange.length,
    isOpeningAssertion: false,
    isBalanced: Math.abs(difference) < 0.005,
  };
}

/** 对账补差交易的 signed amount（正=余额需增加）。 */
export function reconciliationAdjustmentAmount(difference: number): number {
  return round2(difference);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function todayIso(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isOperatingLiquid(a: Account): boolean {
  if (a.liquid === false) return false;
  return a.type === "checking" || a.type === "savings" || (a.type === "other" && num(a.balance) > 0);
}

function latestAssertionByAccount(
  assertions: BalanceAssertion[]
): Map<string, BalanceAssertion> {
  const map = new Map<string, BalanceAssertion>();
  for (const a of assertions) {
    const prev = map.get(a.accountId);
    if (!prev || a.date > prev.date) map.set(a.accountId, a);
  }
  return map;
}

/** P2：Cleared / Working 现金锚点（YNAB 三态在 CSV-only 场景下的映射）。 */
export interface LiquidCashAnchors {
  /** 最近断言余额之和（已清算底数）。 */
  clearedLiquid: number;
  /** 断言 + 断言后流水；用作 projectDaily 起点。 */
  workingLiquid: number;
  /** 非可对账流动账户（如受保护储蓄）仍用账面余额。 */
  otherLiquid: number;
  /** working + other → 投影起点。 */
  totalStartLiquid: number;
  /** 账面账户余额之和（对照漂移）。 */
  cacheLiquid: number;
  /** 与 cache 的差额（正=账面偏高）。 */
  driftFromCache: number;
  hasAnchoredAccounts: boolean;
  anchoredAccountCount: number;
  /** 待确认计划流出（仅展示，不计入 working 数字）。 */
  pendingOutflowTotal: number;
}

/** Today 页「现金口径」展示门控（与 UI 阈值一致，≥1 元视为有意义差额）。 */
export const CASH_POSITION_ATTENTION_EPS = 1;

export type CashPositionUiVariant = "onboarding" | "attention";

export interface CashPositionUiState {
  visible: boolean;
  variant: CashPositionUiVariant | null;
  showDriftWarning: boolean;
  showUnclearedHint: boolean;
  clearedTotal: number;
  workingTotal: number;
  drift: number;
  /** 可对账账户：在途 working − 已清算 cleared（不含 otherLiquid）。 */
  txnDelta: number;
}

export function resolveCashPositionUiState(anchors: LiquidCashAnchors): CashPositionUiState {
  const clearedTotal = round2(anchors.clearedLiquid + anchors.otherLiquid);
  const workingTotal = anchors.totalStartLiquid;
  const hasLiquid =
    anchors.clearedLiquid !== 0 || anchors.workingLiquid !== 0 || anchors.otherLiquid !== 0;

  if (!hasLiquid) {
    return {
      visible: false,
      variant: null,
      showDriftWarning: false,
      showUnclearedHint: false,
      clearedTotal: 0,
      workingTotal: 0,
      drift: 0,
      txnDelta: 0,
    };
  }

  const drift = Math.abs(anchors.driftFromCache);
  const txnDelta = round2(anchors.workingLiquid - anchors.clearedLiquid);
  const showDriftWarning =
    anchors.hasAnchoredAccounts && drift >= CASH_POSITION_ATTENTION_EPS;
  const showUnclearedHint =
    anchors.hasAnchoredAccounts && Math.abs(txnDelta) >= CASH_POSITION_ATTENTION_EPS;

  if (!anchors.hasAnchoredAccounts) {
    return {
      visible: true,
      variant: "onboarding",
      showDriftWarning: false,
      showUnclearedHint: false,
      clearedTotal,
      workingTotal,
      drift,
      txnDelta,
    };
  }

  // 仅在有意义的余额漂移时打扰用户；锚点后的新流水会自动计入预测，无需黄条提示。
  if (showDriftWarning) {
    return {
      visible: true,
      variant: "attention",
      showDriftWarning: true,
      showUnclearedHint,
      clearedTotal,
      workingTotal,
      drift,
      txnDelta,
    };
  }

  return {
    visible: false,
    variant: null,
    showDriftWarning: false,
    showUnclearedHint: false,
    clearedTotal,
    workingTotal,
    drift,
    txnDelta,
  };
}

export interface CashReanchorTarget {
  accountId: string;
  accountName: string;
  amount: number;
  date: string;
}

/** 将可对账活期/储蓄账户锚定到当前账面余额（扩展同步 / 自动校准用）。 */
export function planCashReanchorTargets(input: {
  accounts: Account[];
  accountIds?: Set<string>;
  assertionDate: string;
}): CashReanchorTarget[] {
  const out: CashReanchorTarget[] = [];
  for (const a of input.accounts) {
    if (!isReconcilableCashAccount(a)) continue;
    if (input.accountIds && !input.accountIds.has(a.id)) continue;
    out.push({
      accountId: a.id,
      accountName: a.name,
      amount: round2(num(a.balance)),
      date: input.assertionDate,
    });
  }
  return out;
}

export const AUTO_HEAL_MAX_ACCOUNT_AGE_DAYS = 14;

/** 账户余额比最近锚点新且存在漂移时，可自动用账面余额重锚。 */
export function shouldAutoHealCashDrift(input: {
  anchors: LiquidCashAnchors;
  accounts: Account[];
  assertions: BalanceAssertion[];
  maxAccountAgeDays?: number;
}): boolean {
  if (!input.anchors.hasAnchoredAccounts) return false;
  if (Math.abs(input.anchors.driftFromCache) < CASH_POSITION_ATTENTION_EPS) return false;
  return accountsNeedingReanchor(input).size > 0;
}

export function accountsNeedingReanchor(input: {
  accounts: Account[];
  assertions: BalanceAssertion[];
  accountIds?: Set<string>;
  maxAccountAgeDays?: number;
}): Set<string> {
  const ids = new Set<string>();
  const maxAge = input.maxAccountAgeDays ?? AUTO_HEAL_MAX_ACCOUNT_AGE_DAYS;
  const now = Date.now();
  const byAccount = latestAssertionByAccount(input.assertions);
  for (const a of input.accounts) {
    if (!isReconcilableCashAccount(a)) continue;
    if (input.accountIds && !input.accountIds.has(a.id)) continue;
    const updatedAtMs = a.updatedAt ? new Date(a.updatedAt).getTime() : NaN;
    if (Number.isNaN(updatedAtMs)) continue;
    if ((now - updatedAtMs) / 86400000 > maxAge) continue;
    const assertion = byAccount.get(a.id);
    if (!assertion) {
      ids.add(a.id);
      continue;
    }
    const assertMs = assertion.createdAt
      ? new Date(assertion.createdAt).getTime()
      : new Date(assertion.date).getTime();
    if (updatedAtMs > assertMs) ids.add(a.id);
  }
  return ids;
}

export function computeLiquidCashAnchors(input: {
  accounts: Account[];
  assertions: BalanceAssertion[];
  txns: Txn[];
  pendingOutflowTotal?: number;
  today?: Date;
}): LiquidCashAnchors {
  const asOf = todayIso(input.today ?? new Date());
  const byAccount = latestAssertionByAccount(input.assertions);
  let clearedLiquid = 0;
  let workingLiquid = 0;
  let otherLiquid = 0;
  let cacheLiquid = 0;
  let anchoredAccountCount = 0;

  for (const account of input.accounts) {
    if (!isOperatingLiquid(account)) continue;
    const bal = num(account.balance);
    cacheLiquid = round2(cacheLiquid + bal);

    if (isReconcilableCashAccount(account)) {
      const assertion = byAccount.get(account.id);
      if (assertion) {
        anchoredAccountCount += 1;
        const txnNet = sumBalanceDelta(
          txnsForAccountInRange(input.txns, account.name, assertion.date, asOf)
        );
        clearedLiquid = round2(clearedLiquid + assertion.amount);
        workingLiquid = round2(workingLiquid + assertion.amount + txnNet);
      } else {
        clearedLiquid = round2(clearedLiquid + bal);
        workingLiquid = round2(workingLiquid + bal);
      }
    } else {
      otherLiquid = round2(otherLiquid + bal);
    }
  }

  const totalStartLiquid = round2(workingLiquid + otherLiquid);
  return {
    clearedLiquid,
    workingLiquid,
    otherLiquid,
    totalStartLiquid,
    cacheLiquid,
    driftFromCache: round2(cacheLiquid - totalStartLiquid),
    hasAnchoredAccounts: anchoredAccountCount > 0,
    anchoredAccountCount,
    pendingOutflowTotal: round2(input.pendingOutflowTotal ?? 0),
  };
}
