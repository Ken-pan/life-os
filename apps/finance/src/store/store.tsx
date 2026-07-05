import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  Account,
  AssumptionSet,
  CashFlowItem,
  FinanceData,
  Goal,
  HoldingsSnapshot,
  PortfolioAllocationTarget,
  Scenario,
  ScenarioEvent,
} from "../types";
import {
  sanitizePortfolioAllocationTarget,
  savePortfolioAllocationTargetLocal,
} from "../lib/portfolioAllocationPrefs";
import { BASELINE_SCENARIO_ID, createDefaultData } from "./defaults";
import * as repo from "../lib/repo";
import { notifySyncError } from "../lib/syncNotify";
import { CACHE_SCOPES, peekSessionUserId, writeCache } from "../lib/localCache";

export function uid(prefix: string): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rnd}`;
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx >= 0) {
    const next = [...list];
    next[idx] = item;
    return next;
  }
  return [...list, item];
}

function now(): string {
  return new Date().toISOString();
}

/** 把定点写入的 Promise 兜底，失败时通知用户（本地状态已乐观更新）。 */
function persist(p: Promise<void>): void {
  p.catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[finance] 同步到 Supabase 失败：", e);
    notifySyncError(msg);
  });
}

export interface FinanceStore {
  data: FinanceData;
  setAssumptions: (patch: Partial<AssumptionSet>) => void;
  upsertAccount: (a: Account) => void;
  removeAccount: (id: string) => void;
  upsertHoldingsSnapshot: (snapshot: HoldingsSnapshot) => void;
  removeHoldingsSnapshot: (id: string) => void;
  upsertCashFlow: (c: CashFlowItem) => void;
  removeCashFlow: (id: string) => void;
  upsertEvent: (e: ScenarioEvent) => void;
  removeEvent: (id: string) => void;
  toggleEvent: (id: string) => void;
  upsertScenario: (s: Scenario) => void;
  removeScenario: (id: string) => void;
  duplicateActiveScenario: () => void;
  setActiveScenario: (id: string) => void;
  upsertGoal: (g: Goal) => void;
  removeGoal: (id: string) => void;
  setPrivacy: (b: boolean) => void;
  setPortfolioAllocationTarget: (target: PortfolioAllocationTarget) => void;
}

const Ctx = createContext<FinanceStore | null>(null);

export function FinanceProvider({
  children,
  initialData,
}: {
  children: ReactNode;
  /** 由 AuthGate 从 Supabase 加载后传入；缺省时回退到代码预设（仅用于离线/未配置场景）。 */
  initialData?: FinanceData;
}) {
  const [data, setData] = useState<FinanceData>(
    () => initialData ?? createDefaultData()
  );

  // 本地编辑后立即刷新 finance 缓存，避免刷新页面或换 tab 时短暂显示旧数据。
  useEffect(() => {
    const uid = peekSessionUserId();
    if (uid) writeCache(CACHE_SCOPES.finance, uid, data);
  }, [data]);

  // 每个 action：先乐观更新本地状态，再对相应的表做定点 upsert/delete。
  // 对外接口与字段（data: FinanceData）保持不变，使各视图/hook 零改动。
  const store = useMemo<FinanceStore>(
    () => ({
      data,
      setAssumptions: (patch) => {
        const assumptions = { ...data.assumptions, ...patch };
        setData((d) => ({ ...d, assumptions, updatedAt: now() }));
        persist(
          repo.saveSettings(
            assumptions,
            data.privacy,
            data.version,
            data.activeScenarioId
          )
        );
      },
      setPrivacy: (b) => {
        setData((d) => ({ ...d, privacy: b, updatedAt: now() }));
        persist(
          repo.saveSettings(
            data.assumptions,
            b,
            data.version,
            data.activeScenarioId
          )
        );
      },
      upsertAccount: (a) => {
        setData((d) => ({ ...d, accounts: upsert(d.accounts, a), updatedAt: now() }));
        persist(repo.upsertAccount(a));
      },
      removeAccount: (id) => {
        setData((d) => ({ ...d, accounts: d.accounts.filter((x) => x.id !== id), updatedAt: now() }));
        persist(repo.deleteAccount(id));
      },
      upsertHoldingsSnapshot: (snapshot) => {
        setData((d) => ({
          ...d,
          holdingsSnapshots: upsert(d.holdingsSnapshots, snapshot),
          updatedAt: now(),
        }));
        persist(repo.upsertHoldingsSnapshot(snapshot));
      },
      removeHoldingsSnapshot: (id) => {
        setData((d) => ({
          ...d,
          holdingsSnapshots: d.holdingsSnapshots.filter((x) => x.id !== id),
          updatedAt: now(),
        }));
        persist(repo.deleteHoldingsSnapshot(id));
      },
      upsertCashFlow: (c) => {
        setData((d) => ({ ...d, cashFlows: upsert(d.cashFlows, c), updatedAt: now() }));
        persist(repo.upsertCashFlow(c));
      },
      removeCashFlow: (id) => {
        setData((d) => ({ ...d, cashFlows: d.cashFlows.filter((x) => x.id !== id), updatedAt: now() }));
        persist(repo.deleteCashFlow(id));
      },
      upsertEvent: (e) => {
        const scenarioId = data.activeScenarioId ?? BASELINE_SCENARIO_ID;
        const event = { ...e, scenarioId };
        setData((d) => ({ ...d, events: upsert(d.events, event), updatedAt: now() }));
        persist(repo.upsertEvent(event, scenarioId));
      },
      removeEvent: (id) => {
        const scenarioId = data.activeScenarioId ?? BASELINE_SCENARIO_ID;
        setData((d) => ({ ...d, events: d.events.filter((x) => x.id !== id), updatedAt: now() }));
        persist(repo.deleteEvent(id, scenarioId));
      },
      toggleEvent: (id) => {
        const cur = data.events.find((e) => e.id === id);
        if (!cur) return;
        const next = { ...cur, enabled: !cur.enabled };
        const scenarioId = data.activeScenarioId ?? BASELINE_SCENARIO_ID;
        setData((d) => ({
          ...d,
          events: d.events.map((e) => (e.id === id ? next : e)),
          updatedAt: now(),
        }));
        persist(repo.upsertEvent({ ...next, scenarioId }, scenarioId));
      },
      upsertScenario: (s) => {
        setData((d) => {
          const scenarios = upsert(d.scenarios ?? [], s);
          return { ...d, scenarios, updatedAt: now() };
        });
        persist(repo.upsertScenario(s));
      },
      removeScenario: (id) => {
        if (id === BASELINE_SCENARIO_ID) return;
        const fallbackId =
          data.scenarios?.find((s) => s.id !== id)?.id ?? BASELINE_SCENARIO_ID;
        setData((d) => ({
          ...d,
          scenarios: (d.scenarios ?? []).filter((s) => s.id !== id),
          activeScenarioId:
            d.activeScenarioId === id ? fallbackId : d.activeScenarioId,
          events:
            d.activeScenarioId === id ? [] : d.events,
          updatedAt: now(),
        }));
        persist(repo.deleteScenario(id));
        if (data.activeScenarioId === id) {
          persist(repo.setActiveScenario(fallbackId));
          repo
            .loadScenarioEvents(fallbackId)
            .then((events) => {
              setData((d) => ({
                ...d,
                events,
                activeScenarioId: fallbackId,
                updatedAt: now(),
              }));
            })
            .catch((e) =>
              console.error("[finance] 切换场景后加载事件失败：", e)
            );
        }
      },
      duplicateActiveScenario: () => {
        const sourceId = data.activeScenarioId ?? BASELINE_SCENARIO_ID;
        const targetId = uid("scn");
        const sourceName =
          data.scenarios?.find((s) => s.id === sourceId)?.name ?? "Scenario";
        const scenario: Scenario = {
          id: targetId,
          name: `${sourceName} Copy`,
          scenarioType: "custom",
          status: "draft",
          updatedAt: now(),
        };
        setData((d) => ({
          ...d,
          scenarios: [...(d.scenarios ?? []), scenario],
          updatedAt: now(),
        }));
        persist(repo.duplicateScenario(sourceId, scenario));
      },
      setActiveScenario: (id) => {
        if (id === data.activeScenarioId) return;
        setData((d) => ({ ...d, activeScenarioId: id, events: [], updatedAt: now() }));
        persist(repo.setActiveScenario(id));
        repo
          .loadScenarioEvents(id)
          .then((events) => {
            setData((d) => ({ ...d, activeScenarioId: id, events, updatedAt: now() }));
          })
          .catch((e) => console.error("[finance] 加载场景事件失败：", e));
      },
      upsertGoal: (g) => {
        setData((d) => ({ ...d, goals: upsert(d.goals, g), updatedAt: now() }));
        persist(repo.upsertGoal(g));
      },
      removeGoal: (id) => {
        setData((d) => ({ ...d, goals: d.goals.filter((x) => x.id !== id), updatedAt: now() }));
        persist(repo.deleteGoal(id));
      },
      setPortfolioAllocationTarget: (target) => {
        const portfolioAllocationTarget = sanitizePortfolioAllocationTarget(target);
        setData((d) => ({
          ...d,
          portfolioAllocationTarget,
          updatedAt: now(),
        }));
        savePortfolioAllocationTargetLocal(portfolioAllocationTarget);
        persist(repo.savePortfolioAllocationTarget(portfolioAllocationTarget));
      },
    }),
    [data]
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useFinance(): FinanceStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFinance must be used within FinanceProvider");
  return ctx;
}
