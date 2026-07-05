// 启动时一次性校准：假设补全、持仓快照绑定、券商市值/成本写回账户、401(k)/HSA 与 payroll 供款。

import type {
  Account,
  AccountFundAllocation,
  AccountUnderlyingSlice,
  CashFlowItem,
  FinanceData,
  HoldingsSnapshot,
} from "../types";
import { defaultAssumptions } from "../store/defaults";
import { LOCKBOX_CONTRIBUTION_CATEGORY } from "./monthly";
import {
  BUNDLED_SNAPSHOT_ID,
  createBundledRobinhoodSnapshot,
  resolveSnapshotAccountId,
} from "./holdings";
import {
  costBasisFromSnapshot,
  syncBrokerageFromSnapshots,
} from "./projectionAccounts";

export interface FinanceSetupResult {
  data: FinanceData;
  changed: boolean;
  notes: string[];
}

const ROBINHOOD_CASH_ID = "acct-robinhood-cash";
const ROBINHOOD_BROKERAGE_IDS = new Set(["acct-robinhood-6853", "robinhood-individual-6853"]);

const FIDELITY_401K_ID = "acct-401k-fidelity-0576";
const FIDELITY_HSA_ID = "acct-hsa-fidelity-1152";
const CF_401K_EMPLOYEE = "cf-401k-employee";
const CF_401K_EMPLOYER = "cf-401k-employer-match";

/** Fidelity Asset allocation 穿透（OGSV MW 2065，2026-06-01）。 */
const FIDELITY_401K_UNDERLYING: AccountUnderlyingSlice[] = [
  { id: "domestic-stock", label: "Domestic Stock", weightPct: 57.58, assetClass: "equity", sourceTicker: "OGSV", valueUsd: 32594.33 },
  { id: "foreign-stock", label: "Foreign Stock", weightPct: 33.3, assetClass: "equity", sourceTicker: "OGSV", valueUsd: 18848.74 },
  { id: "bonds", label: "Bonds", weightPct: 5.05, assetClass: "bond", sourceTicker: "OGSV", valueUsd: 2858.58 },
  { id: "short-term", label: "Short Term", weightPct: 1.01, assetClass: "cash", sourceTicker: "OGSV", valueUsd: 571.72 },
  { id: "other", label: "Other", weightPct: 3.05, assetClass: "other", sourceTicker: "OGSV", valueUsd: 1726.47 },
  { id: "unknown", label: "Unknown", weightPct: 0.01, assetClass: "other", sourceTicker: "OGSV", valueUsd: 5.66 },
];

/** Fidelity 401(k) Top Positions（用户 2026-06 对账）。 */
const FIDELITY_401K_FUNDS: AccountFundAllocation[] = [
  {
    ticker: "OGSV",
    securityName: "OGSV（401k 主仓 · 分散股票型）",
    weightPct: 97,
    assetClass: "equity",
    asOfDate: "2026-06-01",
  },
  {
    ticker: "FDRXX",
    securityName: "Fidelity Govt Cash Reserves (FDRXX)",
    weightPct: 3,
    assetClass: "cash",
    asOfDate: "2026-04-30",
  },
];

/** Fidelity 401(k) 对账数据（余额/成本 + 基金占比）。 */
const FIDELITY_401K_CANON = {
  balance: 56605.49,
  basis: 42996.39,
  fundAllocations: FIDELITY_401K_FUNDS,
  underlyingAllocation: FIDELITY_401K_UNDERLYING,
  note:
    "Top positions: OGSV 97% · FDRXX 3% (money market)\n" +
    "Asset allocation look-through: OGSV MW 2065 (Domestic/Foreign/Bonds/Short/Other)\n" +
    "员工 10% 税前 · 雇主 match 最高 5%\n" +
    "allocation-import: yes",
};

const FIDELITY_HSA_CANON = {
  balance: 1846.5,
  note: "Fidelity HSA · 余额对账 2026-06-01",
};

/** 双周 paycheck 供款额（与 cf-salary 同发薪日历）。 */
const PAYROLL_401K_EMPLOYEE_PER_CHECK = 642.74;
const PAYROLL_401K_EMPLOYER_PER_CHECK = 160.93;

function upsertSnapshot(list: HoldingsSnapshot[], snap: HoldingsSnapshot): HoldingsSnapshot[] {
  const idx = list.findIndex((s) => s.id === snap.id);
  if (idx >= 0) {
    const next = [...list];
    next[idx] = snap;
    return next;
  }
  return [...list, snap];
}

function mergeAssumptions(
  data: FinanceData,
  notes: string[]
): { assumptions: FinanceData["assumptions"]; changed: boolean } {
  let changed = false;
  const merged = { ...defaultAssumptions, ...data.assumptions };
  for (const key of Object.keys(defaultAssumptions) as (keyof typeof defaultAssumptions)[]) {
    if (data.assumptions[key] === undefined) {
      changed = true;
      notes.push(`补全预测假设：${key}`);
    }
  }
  return { assumptions: merged, changed };
}

/** Robinhood 内现金 sweep：应急储备，不计入运营流动现金。 */
function normalizeRobinhoodCashReserve(accounts: Account[], notes: string[]): Account[] {
  return accounts.map((a) => {
    if (a.id !== ROBINHOOD_CASH_ID) return a;
    if (a.liquid === false) return a;
    notes.push("Robinhood Saving 标记为非流动应急储备（与引擎口径一致）");
    return {
      ...a,
      liquid: false,
      note:
        a.note ??
        "Robinhood 账户内现金 sweep；计入应急储备，不参与「在途现金」与 safe-to-spend",
      updatedAt: new Date().toISOString(),
    };
  });
}

function linkSnapshotsToBrokerage(
  accounts: Account[],
  snapshots: HoldingsSnapshot[],
  notes: string[]
): HoldingsSnapshot[] {
  return snapshots.map((snap) => {
    const resolvedId = resolveSnapshotAccountId(snap, accounts);
    if (!resolvedId || snap.accountId === resolvedId) return snap;
    const acct = accounts.find((a) => a.id === resolvedId);
    if (!acct) return snap;
    notes.push(`持仓快照「${snap.accountLabel}」已绑定到 ${acct.name}`);
    return {
      ...snap,
      accountId: acct.id,
      accountLabel: acct.name,
      needsUserConfirmation: false,
    };
  });
}

/** 用最新关联快照覆盖 brokerage 的 balance / basis（证券市值与成本，不含现金 sweep）。 */
function persistBrokerageFromSnapshots(
  accounts: Account[],
  snapshots: HoldingsSnapshot[],
  notes: string[]
): Account[] {
  const synced = syncBrokerageFromSnapshots(accounts, snapshots);
  const byId = new Map(synced.map((a) => [a.id, a]));
  return accounts.map((prev) => {
    const next = byId.get(prev.id);
    if (!next || next.type !== "brokerage") return prev;
    if (prev.balanceManual) return prev;
    if (!ROBINHOOD_BROKERAGE_IDS.has(prev.id) && !/robinhood/i.test(prev.name)) return prev;

    const snap = snapshots.find((s) => resolveSnapshotAccountId(s, accounts) === prev.id);
    if (!snap) return prev;

    const basis = costBasisFromSnapshot(snap) ?? next.basis;
    const balance = snap.holdingsMarketValue;
    const sameBal = Math.abs(num(prev.balance) - balance) < 0.01;
    const sameBasis =
      basis == null
        ? prev.basis == null
        : prev.basis != null && Math.abs(num(prev.basis) - basis) < 0.01;
    if (sameBal && sameBasis) return prev;

    notes.push(
      `Robinhood 证券账户：市值 ${fmt(balance)}、成本 ${basis != null ? fmt(basis) : "—"}（来自 ${snap.asOfDate} 快照）`
    );
    return {
      ...prev,
      balance,
      basis,
      note: "证券持仓市值（不含 Robinhood 现金 sweep）；由持仓快照自动同步",
      updatedAt: new Date().toISOString(),
    };
  });
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function monthlyFromBiweeklyPerCheck(perCheck: number): number {
  return (perCheck * 26) / 12;
}

function touchAccount(prev: Account, patch: Partial<Account>, notes: string[], note: string): Account {
  notes.push(note);
  return { ...prev, ...patch, updatedAt: new Date().toISOString() };
}

/** 401(k)/HSA 余额、类型、基金构成备注（幂等）。 */
function normalizeLockedAccounts(accounts: Account[], notes: string[]): Account[] {
  return accounts.map((prev) => {
    if (prev.balanceManual) return prev;
    if (prev.id === FIDELITY_401K_ID || (/401\s*\(k\)|401k/i.test(prev.name) && /fidelity|0576/i.test(prev.name))) {
      let next = prev;
      if (Math.abs(num(prev.balance) - FIDELITY_401K_CANON.balance) > 0.01) {
        next = touchAccount(
          next,
          { balance: FIDELITY_401K_CANON.balance },
          notes,
          `401(k) 余额更新为 ${fmt(FIDELITY_401K_CANON.balance)}`
        );
      }
      if (
        prev.basis == null ||
        Math.abs(num(prev.basis) - FIDELITY_401K_CANON.basis) > 0.01
      ) {
        next = touchAccount(
          next,
          { basis: FIDELITY_401K_CANON.basis },
          notes,
          `401(k) 成本基础 ${fmt(FIDELITY_401K_CANON.basis)}`
        );
      }
      if ((prev.note ?? "") !== FIDELITY_401K_CANON.note) {
        next = touchAccount(next, { note: FIDELITY_401K_CANON.note }, notes, "401(k) 基金构成已录入");
      }
      const prevFunds = JSON.stringify(prev.fundAllocations ?? []);
      const nextFunds = JSON.stringify(FIDELITY_401K_CANON.fundAllocations);
      if (prevFunds !== nextFunds) {
        next = touchAccount(
          next,
          { fundAllocations: FIDELITY_401K_CANON.fundAllocations },
          notes,
          "401(k) Top Positions：OGSV 97% · FDRXX 3%"
        );
      }
      const prevUnderlying = JSON.stringify(prev.underlyingAllocation ?? []);
      const nextUnderlying = JSON.stringify(FIDELITY_401K_CANON.underlyingAllocation);
      if (prevUnderlying !== nextUnderlying) {
        next = touchAccount(
          next,
          { underlyingAllocation: FIDELITY_401K_CANON.underlyingAllocation },
          notes,
          "401(k) Asset allocation 穿透已录入（OGSV 大类）"
        );
      }
      return next;
    }

    if (
      prev.id === FIDELITY_HSA_ID ||
      (/hsa|health savings/i.test(prev.name) && /fidelity|1152/i.test(prev.name))
    ) {
      let next = prev;
      if (prev.type !== "hsa") {
        next = touchAccount(next, { type: "hsa" }, notes, "HSA 账户类型修正为 hsa（原误标 retirement）");
      }
      if (Math.abs(num(prev.balance) - FIDELITY_HSA_CANON.balance) > 0.01) {
        next = touchAccount(
          next,
          { balance: FIDELITY_HSA_CANON.balance },
          notes,
          `HSA 余额更新为 ${fmt(FIDELITY_HSA_CANON.balance)}`
        );
      }
      if (!prev.note?.includes("Fidelity HSA")) {
        next = touchAccount(next, { note: FIDELITY_HSA_CANON.note }, notes, "HSA 余额备注已更新");
      }
      return next;
    }

    return prev;
  });
}

function upsertCashFlow(list: CashFlowItem[], item: CashFlowItem): CashFlowItem[] {
  const idx = list.findIndex((c) => c.id === item.id);
  if (idx >= 0) {
    const next = [...list];
    next[idx] = item;
    return next;
  }
  return [...list, item];
}

/** 401(k) 双周 payroll 供款：lockbox-contribution，不从 checking 扣。 */
function ensureLockedContributionFlows(
  cashFlows: CashFlowItem[],
  accounts: Account[],
  notes: string[]
): CashFlowItem[] {
  const has401k = accounts.some(
    (a) =>
      a.type === "retirement" &&
      (a.id === FIDELITY_401K_ID || /401\s*\(k\)|401k/i.test(a.name))
  );
  if (!has401k) return cashFlows;

  const salary = cashFlows.find((c) => c.id === "cf-salary");
  const anchor = salary?.anchorDate ?? "2026-06-05";

  const templates: CashFlowItem[] = [
    {
      id: CF_401K_EMPLOYEE,
      name: "401(k) 员工税前供款",
      type: "expense",
      frequency: "monthly",
      amount: monthlyFromBiweeklyPerCheck(PAYROLL_401K_EMPLOYEE_PER_CHECK),
      essential: false,
      category: LOCKBOX_CONTRIBUTION_CATEGORY,
      payFrequency: "biweekly",
      anchorDate: anchor,
      startMonth: 0,
    },
    {
      id: CF_401K_EMPLOYER,
      name: "401(k) 雇主 match",
      type: "expense",
      frequency: "monthly",
      amount: monthlyFromBiweeklyPerCheck(PAYROLL_401K_EMPLOYER_PER_CHECK),
      essential: false,
      category: LOCKBOX_CONTRIBUTION_CATEGORY,
      payFrequency: "biweekly",
      anchorDate: anchor,
      startMonth: 0,
    },
  ];

  let flows = cashFlows;
  for (const template of templates) {
    const existing = flows.find((c) => c.id === template.id);
    if (!existing) {
      notes.push(`补全锁定账户供款：${template.name}`);
      flows = upsertCashFlow(flows, template);
      continue;
    }
    const needsCategory = existing.category !== LOCKBOX_CONTRIBUTION_CATEGORY;
    const needsAmount = Math.abs(num(existing.amount) - template.amount) > 0.05;
    const needsAnchor = existing.anchorDate !== template.anchorDate;
    if (needsCategory || needsAmount || needsAnchor) {
      notes.push(`更新锁定账户供款：${template.name}`);
      flows = upsertCashFlow(flows, { ...existing, ...template });
    }
  }
  return flows;
}

/**
 * 幂等校准：补假设、加载/绑定持仓快照、写回券商成本、修正 Robinhood 现金口径。
 * 登录加载后调用；有变更时由 repo.persistFinanceSetup 写回 Supabase。
 */
export function ensureFinanceSetup(data: FinanceData): FinanceSetupResult {
  const notes: string[] = [];
  let accounts = [...data.accounts];
  let holdingsSnapshots = [...data.holdingsSnapshots];
  let cashFlows = [...data.cashFlows];

  const { assumptions, changed: assumptionsChanged } = mergeAssumptions(data, notes);

  accounts = normalizeRobinhoodCashReserve(accounts, notes);
  accounts = normalizeLockedAccounts(accounts, notes);
  cashFlows = ensureLockedContributionFlows(cashFlows, accounts, notes);

  const hadBundled = holdingsSnapshots.some((s) => s.id === BUNDLED_SNAPSHOT_ID);
  if (!hadBundled) {
    try {
      const { snapshot } = createBundledRobinhoodSnapshot(accounts);
      holdingsSnapshots = upsertSnapshot(holdingsSnapshots, snapshot);
      notes.push("已加载内置 Robinhood 持仓快照（2026-06-01）");
    } catch {
      notes.push("内置持仓快照加载跳过（缺少可绑定的券商账户）");
    }
  }

  holdingsSnapshots = linkSnapshotsToBrokerage(accounts, holdingsSnapshots, notes);
  accounts = persistBrokerageFromSnapshots(accounts, holdingsSnapshots, notes);

  const accountsChanged = JSON.stringify(accounts) !== JSON.stringify(data.accounts);
  const snapshotsChanged =
    JSON.stringify(holdingsSnapshots) !== JSON.stringify(data.holdingsSnapshots);
  const cashFlowsChanged = JSON.stringify(cashFlows) !== JSON.stringify(data.cashFlows);
  const changed = assumptionsChanged || accountsChanged || snapshotsChanged || cashFlowsChanged;

  return {
    data: {
      ...data,
      accounts,
      cashFlows,
      holdingsSnapshots,
      assumptions,
      updatedAt: new Date().toISOString(),
    },
    changed,
    notes,
  };
}
