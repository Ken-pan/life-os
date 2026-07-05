import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { computeMeta, type Txn, type TxnMeta } from "../engine/transactions";
import { deleteTxn, insertTxn, insertTxns, loadTransactions, updateTxn } from "../lib/repo";
import { CACHE_SCOPES, peekSessionUserId, readCache, writeCache } from "../lib/localCache";

/** 新建一笔时的输入（id/month 由系统补全）。 */
export type NewTxn = Omit<Txn, "id" | "month"> & {
  /** 扩展抓取侧稳定 ID（Rocket Money 等）；有则 DB unique 去重。 */
  platformId?: string;
};

export interface TransactionsStore {
  txns: Txn[];
  meta: TxnMeta;
  loading: boolean;
  error: string | null;
  /** 记一笔（手动）。 */
  addTxn: (input: NewTxn) => Promise<void>;
  /** 编辑一笔（需带 id）。 */
  editTxn: (t: Txn) => Promise<void>;
  /** 删除一笔。 */
  removeTxn: (id: string) => Promise<void>;
  /** 重新从云端拉取。 */
  reload: () => Promise<void>;
  /** 首次云端拉取已完成（含缓存秒开后的后台 refresh），扩展同步应等待此标志。 */
  syncReady: boolean;
  /** 批量记一笔（扩展同步用）。 */
  addTxnsBatch: (inputs: NewTxn[]) => Promise<Txn[]>;
  /** 扩展 RPC 已写入的交易合并进本地 store（不重复请求云端）。 */
  mergeImportedTxns: (rows: Txn[]) => void;
}

const Ctx = createContext<TransactionsStore | null>(null);

function sortDesc(list: Txn[]): Txn[] {
  return [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** 首帧同步读取本地缓存的交易，实现「秒开不空屏」。 */
function readCachedTxns(): Txn[] | null {
  const userId = peekSessionUserId();
  if (!userId) return null;
  return readCache<Txn[]>(CACHE_SCOPES.txns, userId);
}

export function TransactionsProvider({ children }: { children: ReactNode }) {
  const cached = readCachedTxns();
  const [txns, setTxns] = useState<Txn[]>(() => cached ?? []);
  // 已有缓存时不显示 loading：先渲染缓存，后台静默刷新。
  const [loading, setLoading] = useState(() => !cached);
  const [syncReady, setSyncReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    // 无缓存时才进入显式 loading 态，避免覆盖已渲染的缓存内容造成闪烁。
    setError(null);
    const userId = peekSessionUserId();
    if (!readCache<Txn[]>(CACHE_SCOPES.txns, userId ?? "")) setLoading(true);
    try {
      const rows = await loadTransactions();
      const sorted = sortDesc(rows);
      setTxns(sorted);
      const uid = peekSessionUserId();
      if (uid) writeCache(CACHE_SCOPES.txns, uid, sorted);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载交易失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void reload().finally(() => {
      if (!cancelled) setSyncReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  // 本地任何增删改后，同步刷新缓存，保证下次秒开看到的是最新内容。
  useEffect(() => {
    if (loading) return;
    const uid = peekSessionUserId();
    if (uid) writeCache(CACHE_SCOPES.txns, uid, txns);
  }, [txns, loading]);

  const addTxn = useCallback(async (input: NewTxn) => {
    const saved = await insertTxn(input);
    setTxns((prev) => sortDesc([saved, ...prev]));
  }, []);

  const addTxnsBatch = useCallback(async (inputs: NewTxn[]) => {
    if (inputs.length === 0) return [];
    const saved = await insertTxns(inputs);
    setTxns((prev) => sortDesc([...saved, ...prev]));
    return saved;
  }, []);

  const mergeImportedTxns = useCallback((rows: Txn[]) => {
    if (rows.length === 0) return;
    setTxns((prev) => {
      const ids = new Set(rows.map((r) => r.id).filter(Boolean));
      const rest = prev.filter((t) => !t.id || !ids.has(t.id));
      return sortDesc([...rows, ...rest]);
    });
  }, []);

  const editTxn = useCallback(async (t: Txn) => {
    const saved = await updateTxn(t);
    setTxns((prev) => sortDesc(prev.map((x) => (x.id === saved.id ? saved : x))));
  }, []);

  const removeTxn = useCallback(async (id: string) => {
    await deleteTxn(id);
    setTxns((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const meta = useMemo(() => computeMeta(txns), [txns]);

  const store = useMemo<TransactionsStore>(
    () => ({ txns, meta, loading, error, syncReady, addTxn, addTxnsBatch, mergeImportedTxns, editTxn, removeTxn, reload }),
    [txns, meta, loading, error, syncReady, addTxn, addTxnsBatch, mergeImportedTxns, editTxn, removeTxn, reload]
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useTransactions(): TransactionsStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTransactions must be used within TransactionsProvider");
  return ctx;
}
