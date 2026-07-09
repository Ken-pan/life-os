// 长期月度预测用的账户口径：对账锚定流动现金 + 持仓快照覆盖券商余额。

import type { Account, HoldingsSnapshot } from "../types.js";
import { resolveSnapshotAccountId } from "./holdings";
import { sortedSnapshots } from "./holdingsPortfolio";

/** 从持仓快照解析总成本（优先 derivedSummary，否则逐只持仓求和）。 */
export function costBasisFromSnapshot(snap: HoldingsSnapshot): number | undefined {
  if (snap.impliedCostBasis != null && Number.isFinite(snap.impliedCostBasis)) {
    return snap.impliedCostBasis;
  }
  if (snap.positions.length === 0) return undefined;
  let sum = 0;
  let any = false;
  for (const p of snap.positions) {
    if (p.impliedCostBasis == null || !Number.isFinite(p.impliedCostBasis)) continue;
    sum += p.impliedCostBasis;
    any = true;
  }
  return any ? sum : undefined;
}

/** 用最新关联持仓快照覆盖 brokerage 余额与成本（账面余额可能滞后）。 */
export function syncBrokerageFromSnapshots(
  accounts: Account[],
  snapshots: HoldingsSnapshot[]
): Account[] {
  if (snapshots.length === 0) return accounts;

  const latestByAccount = new Map<string, HoldingsSnapshot>();
  for (const snap of sortedSnapshots(snapshots)) {
    const accountId = resolveSnapshotAccountId(snap, accounts);
    if (!accountId || latestByAccount.has(accountId)) continue;
    latestByAccount.set(accountId, snap);
  }
  if (latestByAccount.size === 0) return accounts;

  return accounts.map((a) => {
    if (a.type !== "brokerage") return a;
    const snap = latestByAccount.get(a.id);
    if (!snap) return a;
    const basis = costBasisFromSnapshot(snap) ?? a.basis;
    return {
      ...a,
      balance: snap.holdingsMarketValue,
      basis,
    };
  });
}

export interface ProjectionAccountOptions {
  /** P2：对账后的运营流动现金（checking + savings，不含 reserve）。 */
  operatingLiquidOverride?: number;
  holdingsSnapshots?: HoldingsSnapshot[];
}

/** 组装进入 projectMonthly 的账户列表。 */
export function accountsForProjection(
  accounts: Account[],
  options: ProjectionAccountOptions = {}
): Account[] {
  const synced = syncBrokerageFromSnapshots(
    accounts,
    options.holdingsSnapshots ?? []
  );
  return synced;
}

export interface SimStateLiquid {
  checking: number;
  savings: number;
}

/** 将 checking+savings 总量对齐到对账锚点（差额记入 checking）。 */
export function applyOperatingLiquidOverride(
  state: SimStateLiquid,
  target: number | undefined
): void {
  if (target == null || !Number.isFinite(target)) return;
  const current = state.checking + state.savings;
  if (Math.abs(current - target) < 0.005) return;
  state.checking += target - current;
}
