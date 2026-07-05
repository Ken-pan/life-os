import { supabase, isSupabaseConfigured } from './supabase.js';
import { t } from './i18n/index.js';

export { isSupabaseConfigured };

export async function currentUserId() {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

export async function requireUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error(t('sync.notSignedIn'));
  return data.user.id;
}

/** @param {string} userId */
export async function loadPlannerPayload(userId) {
  const { data, error } = await supabase
    .from('planner_user_state')
    .select('payload, schema_version, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * @param {string} userId
 * @param {object} payload
 * @param {number} schemaVersion
 */
export async function upsertPlannerPayload(userId, payload, schemaVersion) {
  const { error } = await supabase.from('planner_user_state').upsert({
    user_id: userId,
    payload,
    schema_version: schemaVersion,
    updated_at: new Date().toISOString()
  });
  if (error) throw error;
}

/** @param {{ payload?: { tasks?: unknown[], lists?: unknown[] } } | null | undefined} row */
export function payloadHasData(row) {
  const payload = row?.payload;
  return Boolean(payload && (payload.tasks?.length || payload.lists?.length > 1));
}

/** @param {{ tasks?: unknown[], lists?: unknown[] } | null | undefined} state */
export function structuredHasData(state) {
  return Boolean(state && (state.tasks?.length || state.lists?.length > 1));
}

/** @param {string[]} remoteIds @param {string[]} localIds */
export function remoteIdsToDelete(remoteIds, localIds) {
  const local = new Set(localIds);
  return remoteIds.filter((id) => !local.has(id));
}

/** @param {string} userId @param {object[]} tasks */
export function buildTaskSyncRows(userId, tasks) {
  const now = new Date().toISOString();
  return tasks.map((task) => ({
    user_id: userId,
    id: task.id,
    data: task,
    updated_at: task.updatedAt ? new Date(task.updatedAt).toISOString() : now
  }));
}

/** @param {string} userId @param {object[]} lists */
export function buildListSyncRows(userId, lists) {
  const now = new Date().toISOString();
  return lists.map((list) => ({
    user_id: userId,
    id: list.id,
    data: list,
    updated_at: now
  }));
}

/** @param {string} userId */
async function loadStructuredRows(userId) {
  const [tasksRes, listsRes] = await Promise.all([
    supabase.from('planner_tasks').select('data').eq('user_id', userId),
    supabase.from('planner_lists').select('data').eq('user_id', userId)
  ]);
  if (tasksRes.error) throw tasksRes.error;
  if (listsRes.error) throw listsRes.error;

  const tasks = (tasksRes.data ?? []).map((r) => r.data).filter(Boolean);
  const lists = (listsRes.data ?? []).map((r) => r.data).filter(Boolean);
  if (!structuredHasData({ tasks, lists })) return null;

  const blob = await loadPlannerPayload(userId);
  const settings = blob?.payload?.settings ?? {};

  return {
    schemaVersion: blob?.schema_version ?? blob?.payload?.schemaVersion ?? 2,
    tasks,
    lists,
    settings
  };
}

/**
 * @param {string} userId
 * @param {{ tasks?: unknown[], lists?: unknown[], settings?: object, schemaVersion?: number }} payload
 * @param {number} schemaVersion
 */
async function upsertStructuredRows(userId, payload, schemaVersion) {
  const tasks = payload.tasks ?? [];
  const lists = payload.lists ?? [];

  if (tasks.length) {
    const rows = buildTaskSyncRows(userId, tasks);
    const { error } = await supabase.from('planner_tasks').upsert(rows);
    if (error) throw error;

    const { data: remoteTasks, error: remoteTasksErr } = await supabase
      .from('planner_tasks')
      .select('id')
      .eq('user_id', userId);
    if (remoteTasksErr) throw remoteTasksErr;
    const deleteTaskIds = remoteIdsToDelete(
      (remoteTasks ?? []).map((r) => r.id),
      tasks.map((t) => t.id)
    );
    if (deleteTaskIds.length) {
      const { error: delErr } = await supabase
        .from('planner_tasks')
        .delete()
        .eq('user_id', userId)
        .in('id', deleteTaskIds);
      if (delErr) throw delErr;
    }
  }

  if (lists.length) {
    const rows = buildListSyncRows(userId, lists);
    const { error } = await supabase.from('planner_lists').upsert(rows);
    if (error) throw error;

    const { data: remoteLists, error: remoteListsErr } = await supabase
      .from('planner_lists')
      .select('id')
      .eq('user_id', userId);
    if (remoteListsErr) throw remoteListsErr;
    const deleteListIds = remoteIdsToDelete(
      (remoteLists ?? []).map((r) => r.id),
      lists.map((l) => l.id)
    );
    if (deleteListIds.length) {
      const { error: delErr } = await supabase
        .from('planner_lists')
        .delete()
        .eq('user_id', userId)
        .in('id', deleteListIds);
      if (delErr) throw delErr;
    }
  }

  await upsertPlannerPayload(userId, { ...payload, schemaVersion }, schemaVersion);
}

/**
 * Load planner state: structured tables first, legacy JSON blob fallback.
 * @param {string} userId
 */
export async function loadPlannerState(userId) {
  try {
    const structured = await loadStructuredRows(userId);
    if (structured) return structured;
  } catch (e) {
    if (!/planner_tasks|planner_lists|relation.*does not exist/i.test(String(e?.message || e))) {
      throw e;
    }
  }

  const row = await loadPlannerPayload(userId);
  if (!payloadHasData(row)) return null;
  return {
    schemaVersion: row.schema_version ?? row.payload?.schemaVersion ?? 2,
    tasks: row.payload.tasks ?? [],
    lists: row.payload.lists ?? [],
    settings: row.payload.settings ?? {}
  };
}

/**
 * @param {string} userId
 * @param {{ tasks?: unknown[], lists?: unknown[], settings?: object, schemaVersion?: number }} payload
 * @param {number} schemaVersion
 */
export async function upsertPlannerState(userId, payload, schemaVersion) {
  try {
    await upsertStructuredRows(userId, payload, schemaVersion);
  } catch (e) {
    if (/planner_tasks|planner_lists|relation.*does not exist/i.test(String(e?.message || e))) {
      await upsertPlannerPayload(userId, payload, schemaVersion);
      return;
    }
    throw e;
  }
}

/** @param {{ tasks?: unknown[], lists?: unknown[], settings?: object } | null | undefined} state */
export function stateHasData(state) {
  return structuredHasData(state);
}
