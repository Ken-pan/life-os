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

/** @param {{ payload?: { tasks?: unknown[], lists?: unknown[], projects?: unknown[] } } | null | undefined} row */
export function payloadHasData(row) {
  const payload = row?.payload;
  return Boolean(payload && (payload.tasks?.length || payload.projects?.length || payload.lists?.length > 1));
}

/** @param {{ tasks?: unknown[], lists?: unknown[], projects?: unknown[] } | null | undefined} state */
export function structuredHasData(state) {
  return Boolean(state && (state.tasks?.length || state.projects?.length || state.lists?.length > 1));
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
    updated_at: list.updatedAt ? new Date(list.updatedAt).toISOString() : now
  }));
}

/** @param {string} userId @param {object[]} projects */
export function buildProjectSyncRows(userId, projects) {
  const now = new Date().toISOString();
  return projects.map((project) => ({
    user_id: userId,
    id: project.id,
    data: project,
    updated_at: project.updatedAt ? new Date(project.updatedAt).toISOString() : now
  }));
}

/** @param {string} userId */
async function loadStructuredRows(userId) {
  const [tasksRes, listsRes, projectsRes] = await Promise.all([
    supabase.from('planner_tasks').select('data').eq('user_id', userId),
    supabase.from('planner_lists').select('data').eq('user_id', userId),
    supabase.from('planner_projects').select('data').eq('user_id', userId)
  ]);
  if (tasksRes.error) throw tasksRes.error;
  if (listsRes.error) throw listsRes.error;
  if (projectsRes.error) throw projectsRes.error;

  const tasks = (tasksRes.data ?? []).map((r) => r.data).filter(Boolean);
  const lists = (listsRes.data ?? []).map((r) => r.data).filter(Boolean);
  const projects = (projectsRes.data ?? []).map((r) => r.data).filter(Boolean);
  if (!structuredHasData({ tasks, lists, projects })) return null;

  const blob = await loadPlannerPayload(userId);
  const settings = blob?.payload?.settings ?? {};

  return {
    schemaVersion: blob?.schema_version ?? blob?.payload?.schemaVersion ?? 2,
    tasks,
    projects,
    lists,
    settings
  };
}

/** @param {'planner_tasks'|'planner_lists'|'planner_projects'} table @param {string} userId @param {string[]} ids */
async function deleteRows(table, userId, ids) {
  if (!ids.length) return;
  const { error } = await supabase.from(table).delete().eq('user_id', userId).in('id', ids);
  if (error) throw error;
}

/**
 * 上传结构化行。删除通过墓碑行传播（软删除），这里只物理清理
 * 明确过期的墓碑 id —— 不再按「云端有而本地没有」推断删除，
 * 避免旧设备直接上传时误删其他设备新建的数据。
 *
 * @param {string} userId
 * @param {{ tasks?: unknown[], lists?: unknown[], projects?: unknown[], settings?: object, schemaVersion?: number }} payload
 * @param {number} schemaVersion
 * @param {{ taskIds?: string[], listIds?: string[], projectIds?: string[] }} [expiredTombstones]
 */
async function upsertStructuredRows(userId, payload, schemaVersion, expiredTombstones = {}) {
  const tasks = payload.tasks ?? [];
  const lists = payload.lists ?? [];
  const projects = payload.projects ?? [];

  if (tasks.length) {
    const { error } = await supabase.from('planner_tasks').upsert(buildTaskSyncRows(userId, tasks));
    if (error) throw error;
  }
  await deleteRows('planner_tasks', userId, expiredTombstones.taskIds ?? []);

  if (projects.length) {
    const { error } = await supabase.from('planner_projects').upsert(buildProjectSyncRows(userId, projects));
    if (error) throw error;
  }
  await deleteRows('planner_projects', userId, expiredTombstones.projectIds ?? []);

  if (lists.length) {
    const { error } = await supabase.from('planner_lists').upsert(buildListSyncRows(userId, lists));
    if (error) throw error;
  }
  await deleteRows('planner_lists', userId, expiredTombstones.listIds ?? []);

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
    if (!/planner_tasks|planner_lists|planner_projects|relation.*does not exist/i.test(String(e?.message || e))) {
      throw e;
    }
  }

  const row = await loadPlannerPayload(userId);
  if (!payloadHasData(row)) return null;
  return {
    schemaVersion: row.schema_version ?? row.payload?.schemaVersion ?? 2,
    tasks: row.payload.tasks ?? [],
    projects: row.payload.projects ?? [],
    lists: row.payload.lists ?? [],
    settings: row.payload.settings ?? {}
  };
}

/**
 * @param {string} userId
 * @param {{ tasks?: unknown[], lists?: unknown[], projects?: unknown[], settings?: object, schemaVersion?: number }} payload
 * @param {number} schemaVersion
 * @param {{ taskIds?: string[], listIds?: string[], projectIds?: string[] }} [expiredTombstones] 需从云端物理清理的过期墓碑 id
 */
export async function upsertPlannerState(userId, payload, schemaVersion, expiredTombstones) {
  try {
    await upsertStructuredRows(userId, payload, schemaVersion, expiredTombstones);
  } catch (e) {
    if (/planner_tasks|planner_lists|planner_projects|relation.*does not exist/i.test(String(e?.message || e))) {
      await upsertPlannerPayload(userId, payload, schemaVersion);
      return;
    }
    throw e;
  }
}

/** @param {{ tasks?: unknown[], lists?: unknown[], projects?: unknown[], settings?: object } | null | undefined} state */
export function stateHasData(state) {
  return structuredHasData(state);
}
