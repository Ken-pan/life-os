import { SYSTEM_LIST_INBOX, normalizeRecurrence } from '../types.js';

export const SCHEMA_VERSION = 2;

/** 墓碑（已删除标记）保留时长，超过后本地与云端都会被物理清理 */
export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** @param {{ deletedAt?: number|null }} item @param {number} [now] */
export function isExpiredTombstone(item, now = Date.now()) {
  return Boolean(item?.deletedAt && now - item.deletedAt > TOMBSTONE_TTL_MS);
}

/**
 * 把数组拆成「仍需同步的行」与「过期墓碑 id」。
 * @template {{ id: string, deletedAt?: number|null }} T
 * @param {T[]} items
 * @param {number} [now]
 * @returns {{ live: T[], expiredIds: string[] }}
 */
export function splitExpiredTombstones(items, now = Date.now()) {
  /** @type {T[]} */
  const live = [];
  /** @type {string[]} */
  const expiredIds = [];
  for (const item of items) {
    if (isExpiredTombstone(item, now)) expiredIds.push(item.id);
    else live.push(item);
  }
  return { live, expiredIds };
}

export const dateKeyOf = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const todayKey = () => dateKeyOf(new Date());

export const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

/** @returns {import('../types.js').AppState} */
export function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    tasks: [],
    lists: [
      {
        id: SYSTEM_LIST_INBOX,
        title: 'inbox',
        icon: 'inbox',
        color: '#F5A623',
        sortOrder: 0,
        system: 'inbox',
        updatedAt: 0,
        deletedAt: null
      }
    ],
    settings: {
      theme: 'auto',
      locale: 'zh',
      defaultListId: SYSTEM_LIST_INBOX,
      notificationsEnabled: false,
      syncAuto: true,
      updatedAt: 0
    }
  };
}

/** @param {unknown} task */
export function migrateTask(task) {
  if (!task || typeof task !== 'object') return null;
  const t = /** @type {Record<string, unknown>} */ (task);
  return {
    ...t,
    reminderMinutes: t.reminderMinutes ?? null,
    recurrence: normalizeRecurrence(t.recurrence),
    deletedAt: typeof t.deletedAt === 'number' ? t.deletedAt : null,
    meta: t.meta && typeof t.meta === 'object' ? t.meta : {}
  };
}

/** @param {unknown} list */
export function migrateList(list) {
  if (!list || typeof list !== 'object') return null;
  const l = /** @type {Record<string, unknown>} */ (list);
  if (typeof l.id !== 'string' || !l.id) return null;
  return {
    ...l,
    updatedAt: typeof l.updatedAt === 'number' ? l.updatedAt : 0,
    deletedAt: typeof l.deletedAt === 'number' ? l.deletedAt : null
  };
}

/** @param {import('../types.js').Task[]} local @param {import('../types.js').Task[]} incoming */
export function mergeTasksByUpdatedAt(local, incoming) {
  const byId = new Map(local.map((t) => [t.id, t]));
  for (const t of incoming.map(migrateTask).filter(Boolean)) {
    const existing = byId.get(t.id);
    if (!existing || (t.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
      byId.set(t.id, t);
    }
  }
  return [...byId.values()];
}

/** LWW 合并清单：按 updatedAt 取较新，墓碑同样参与传播 */
/** @param {import('../types.js').TaskList[]} local @param {import('../types.js').TaskList[]} incoming */
export function mergeListsByUpdatedAt(local, incoming) {
  const byId = new Map(local.map((l) => [l.id, l]));
  for (const l of incoming.map(migrateList).filter(Boolean)) {
    const existing = byId.get(l.id);
    if (!existing || (l.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
      byId.set(l.id, l);
    }
  }
  return [...byId.values()];
}

/**
 * LWW 合并设置：incoming（云端）更新才覆盖，避免旧设备的旧设置回灌。
 * 历史数据无 updatedAt 时视为 0（保留本地）。
 * @param {import('../types.js').AppSettings} local
 * @param {Partial<import('../types.js').AppSettings> | null | undefined} incoming
 */
export function mergeSettingsByUpdatedAt(local, incoming) {
  if (!incoming || typeof incoming !== 'object') return local;
  const localAt = typeof local?.updatedAt === 'number' ? local.updatedAt : 0;
  const incomingAt = typeof incoming.updatedAt === 'number' ? incoming.updatedAt : 0;
  if (incomingAt > localAt) return { ...local, ...incoming };
  return local;
}

/** @param {unknown} raw */
export function migrate(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const r = /** @type {Record<string, unknown>} */ (raw);
  const now = Date.now();
  const tasks = (Array.isArray(r.tasks) ? r.tasks.map(migrateTask).filter(Boolean) : []).filter(
    (t) => !isExpiredTombstone(t, now)
  );
  let lists = (Array.isArray(r.lists) ? r.lists.map(migrateList).filter(Boolean) : []).filter(
    (l) => !isExpiredTombstone(l, now)
  );
  if (!lists.some((l) => l.id === SYSTEM_LIST_INBOX && !l.deletedAt)) {
    lists = [...base.lists, ...lists.filter((l) => l.id !== SYSTEM_LIST_INBOX)];
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    tasks,
    lists,
    settings: { ...base.settings, ...(r.settings || {}) }
  };
}
