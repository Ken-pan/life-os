import { SYSTEM_LIST_INBOX, normalizeRecurrence } from '../types.js';

export const SCHEMA_VERSION = 2;

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
        system: 'inbox'
      }
    ],
    settings: {
      theme: 'auto',
      locale: 'zh',
      defaultListId: SYSTEM_LIST_INBOX,
      notificationsEnabled: false,
      syncAuto: true
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
    meta: t.meta && typeof t.meta === 'object' ? t.meta : {}
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

/** @param {unknown} raw */
export function migrate(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const r = /** @type {Record<string, unknown>} */ (raw);
  const tasks = Array.isArray(r.tasks) ? r.tasks.map(migrateTask).filter(Boolean) : [];
  return {
    schemaVersion: SCHEMA_VERSION,
    tasks,
    lists: Array.isArray(r.lists) && r.lists.length ? r.lists : base.lists,
    settings: { ...base.settings, ...(r.settings || {}) }
  };
}
