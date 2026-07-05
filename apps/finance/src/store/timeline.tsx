import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  actionableConfirmations,
  pendingConfirmations,
  rollTimeline,
  txnSignedForMatch,
  daysBetween,
  type ExpectedOccurrence,
} from "../engine/timeline";
import { computeLiquidCashAnchors, shouldAutoHealCashDrift, type LiquidCashAnchors } from "../engine/reconciliation";
import { loadBalanceAssertions, loadExpectedOccurrences, updateOccurrenceState, upsertExpectedOccurrences } from "../lib/repo";
import { MANUAL_ALIGN_NOTE, reanchorCashAccounts } from "../lib/cashReanchor";
import type { BalanceAssertion } from "../types";
import { CACHE_SCOPES, peekSessionUserId, readCache, writeCache } from "../lib/localCache";
import { useFinance } from "./store";
import { useTransactions } from "./transactions";

export interface TimelineStore {
  occurrences: ExpectedOccurrence[];
  pending: ExpectedOccurrence[];
  /** 到期/逾期需用户确认（含扣款当日的 upcoming）。 */
  actionable: ExpectedOccurrence[];
  cashAnchors: LiquidCashAnchors;
  loading: boolean;
  error: string | null;
  markSkipped: (id: string) => Promise<void>;
  /** 银行/账户已发生但 CSV 未导入时，手动确认（matched）。 */
  markConfirmedPaid: (id: string) => Promise<void>;
  /** 手动将预期条目关联到某笔真实交易。 */
  markMatchedWithTxn: (id: string, txnId: string) => Promise<void>;
  /** 用设置页当前余额重锚可对账账户，消除漂移。 */
  alignCashToAccountBalances: (accountIds?: string[]) => Promise<void>;
  reload: () => Promise<void>;
  /** 仅刷新余额锚点（扩展同步后，避免全量 timeline reload）。 */
  reloadAssertions: () => Promise<void>;
}

const Ctx = createContext<TimelineStore | null>(null);

function snapshotRows(rows: ExpectedOccurrence[]): string {
  return JSON.stringify(
    rows.map((r) => ({
      id: r.id,
      state: r.state,
      matchedTxnId: r.matchedTxnId ?? null,
      varianceAmount: r.varianceAmount ?? null,
      varianceDays: r.varianceDays ?? null,
      reconciledPeriodId: r.reconciledPeriodId ?? null,
      expectedAmount: r.expectedAmount,
      date: r.date,
    }))
  );
}

interface TimelineCache {
  occurrences: ExpectedOccurrence[];
  assertions: BalanceAssertion[];
}

/** 首帧同步读取缓存的时间轴数据，避免空屏。 */
function readTimelineCache(): TimelineCache | null {
  const userId = peekSessionUserId();
  if (!userId) return null;
  const occ = readCache<ExpectedOccurrence[]>(CACHE_SCOPES.occurrences, userId);
  const asserts = readCache<BalanceAssertion[]>(CACHE_SCOPES.assertions, userId);
  if (!occ && !asserts) return null;
  return { occurrences: occ ?? [], assertions: asserts ?? [] };
}

export function TimelineProvider({ children }: { children: ReactNode }) {
  const { data } = useFinance();
  const { txns } = useTransactions();
  const cached = readTimelineCache();
  const [stored, setStored] = useState<ExpectedOccurrence[]>(
    () => cached?.occurrences ?? []
  );
  const [assertions, setAssertions] = useState<BalanceAssertion[]>(
    () => cached?.assertions ?? []
  );
  const [loading, setLoading] = useState(() => !cached);
  const [error, setError] = useState<string | null>(null);
  const lastPersisted = useRef<string>(
    cached ? snapshotRows(cached.occurrences) : ""
  );
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    const userId = peekSessionUserId();
    const hasCache = Boolean(
      readCache<ExpectedOccurrence[]>(CACHE_SCOPES.occurrences, userId ?? "")
    );
    if (!hasCache) setLoading(true);
    try {
      const [occ, asserts] = await Promise.all([loadExpectedOccurrences(), loadBalanceAssertions()]);
      setStored(occ);
      setAssertions(asserts);
      lastPersisted.current = snapshotRows(occ);
      const uid = peekSessionUserId();
      if (uid) {
        writeCache(CACHE_SCOPES.occurrences, uid, occ);
        writeCache(CACHE_SCOPES.assertions, uid, asserts);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载时间轴失败");
      if (!hasCache) setStored([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadAssertions = useCallback(async () => {
    try {
      const asserts = await loadBalanceAssertions();
      setAssertions(asserts);
      const uid = peekSessionUserId();
      if (uid) writeCache(CACHE_SCOPES.assertions, uid, asserts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "刷新余额锚点失败");
      throw e;
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void reload();
    }, 0);
    return () => clearTimeout(timer);
  }, [reload]);

  // stored 变化（标记跳过 / 后台同步）后刷新缓存，保证下次秒开是最新状态。
  useEffect(() => {
    if (loading) return;
    const uid = peekSessionUserId();
    if (uid) writeCache(CACHE_SCOPES.occurrences, uid, stored);
  }, [stored, loading]);

  const occurrences = useMemo(() => {
    if (loading && stored.length === 0) return [];
    return rollTimeline({ data, txns, stored, assertions });
  }, [data, txns, stored, assertions, loading]);

  const pending = useMemo(
    () => pendingConfirmations(occurrences, new Date()),
    [occurrences]
  );

  const actionable = useMemo(
    () => actionableConfirmations(occurrences, new Date()),
    [occurrences]
  );

  const cashAnchors = useMemo(() => {
    const pendingOutflowTotal = pending.reduce(
      (s, o) => (o.expectedAmount < 0 ? s + Math.abs(o.expectedAmount) : s),
      0
    );
    return computeLiquidCashAnchors({
      accounts: data.accounts,
      assertions,
      txns,
      pendingOutflowTotal,
    });
  }, [data.accounts, assertions, txns, pending]);

  useEffect(() => {
    if (loading) return;
    const snap = snapshotRows(occurrences);
    if (snap === lastPersisted.current) return;

    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      void (async () => {
        try {
          await upsertExpectedOccurrences(occurrences);
          lastPersisted.current = snap;
          setStored(occurrences);
        } catch (e) {
          setError(e instanceof Error ? e.message : "同步时间轴失败");
        }
      })();
    }, 400);

    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [occurrences, loading]);

  const applyLocalOccurrencePatch = useCallback(
    (id: string, patch: Partial<ExpectedOccurrence>) => {
      setStored((prev) => {
        const fromRoll = occurrences.find((r) => r.id === id);
        const base = prev.find((r) => r.id === id) ?? fromRoll;
        if (!base) return prev;
        const exists = prev.some((r) => r.id === id);
        const next = exists
          ? prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
          : [...prev, { ...base, ...patch }];
        const rolled = rollTimeline({ data, txns, stored: next, assertions });
        lastPersisted.current = snapshotRows(rolled);
        return rolled;
      });
    },
    [data, txns, assertions, occurrences]
  );

  const markSkipped = useCallback(
    async (id: string) => {
      await updateOccurrenceState(id, { state: "skipped" });
      applyLocalOccurrencePatch(id, { state: "skipped" });
    },
    [applyLocalOccurrencePatch]
  );

  const markConfirmedPaid = useCallback(
    async (id: string) => {
      const row = occurrences.find((r) => r.id === id);
      if (!row) return;
      const patch = {
        state: "matched" as const,
        actualAmount: row.expectedAmount,
        actualDate: row.date,
        varianceAmount: 0,
        varianceDays: 0,
      };
      await updateOccurrenceState(id, patch);
      applyLocalOccurrencePatch(id, patch);
    },
    [occurrences, applyLocalOccurrencePatch]
  );

  const markMatchedWithTxn = useCallback(
    async (id: string, txnId: string) => {
      const row = occurrences.find((r) => r.id === id);
      const txn = txns.find((t) => t.id === txnId);
      if (!row || !txn) return;
      const signed = txnSignedForMatch(txn);
      const varianceAmount = Math.round((signed - row.expectedAmount) * 100) / 100;
      const varianceDays = daysBetween(row.date, txn.date);
      const patch = {
        state: "matched" as const,
        matchedTxnId: txnId,
        actualAmount: signed,
        actualDate: txn.date,
        varianceAmount,
        varianceDays,
      };
      await updateOccurrenceState(id, patch);
      applyLocalOccurrencePatch(id, patch);
    },
    [occurrences, txns, applyLocalOccurrencePatch]
  );

  const alignCashToAccountBalances = useCallback(
    async (accountIds?: string[]) => {
      const today = new Date();
      const assertionDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      await reanchorCashAccounts({
        accounts: data.accounts,
        accountIds: accountIds ? new Set(accountIds) : undefined,
        assertionDate,
        note: MANUAL_ALIGN_NOTE,
      });
      await reloadAssertions();
    },
    [data.accounts, reloadAssertions]
  );

  const autoHealAttempted = useRef(false);
  useEffect(() => {
    if (loading || autoHealAttempted.current) return;
    if (
      !shouldAutoHealCashDrift({
        anchors: cashAnchors,
        accounts: data.accounts,
        assertions,
      })
    ) {
      return;
    }
    autoHealAttempted.current = true;
    void (async () => {
      try {
        const today = new Date();
        const assertionDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        await reanchorCashAccounts({
          accounts: data.accounts,
          assertionDate,
        });
        await reloadAssertions();
      } catch (e) {
        autoHealAttempted.current = false;
        setError(e instanceof Error ? e.message : "自动校准余额失败");
      }
    })();
  }, [loading, cashAnchors, data.accounts, assertions, reloadAssertions]);

  const store = useMemo<TimelineStore>(
    () => ({
      occurrences,
      pending,
      actionable,
      cashAnchors,
      loading,
      error,
      markSkipped,
      markConfirmedPaid,
      markMatchedWithTxn,
      alignCashToAccountBalances,
      reload,
      reloadAssertions,
    }),
    [occurrences, pending, actionable, cashAnchors, loading, error, markSkipped, markConfirmedPaid, markMatchedWithTxn, alignCashToAccountBalances, reload, reloadAssertions]
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useTimeline(): TimelineStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTimeline must be used within TimelineProvider");
  return ctx;
}
