import { browser } from '$app/environment';
import {
  createBidirectionalSync,
  createDebouncedTask,
  notifyManualSyncResult,
  readSyncMeta,
  writeSyncMeta
} from '@life-os/sync';
import { supabase } from './supabase.js';
import { FITNESS_TABLES as T } from './supabaseTables.js';
import { resolveExerciseId } from './data/exercises.js';
import { S, save, applyState, activeProgramId, SCHEMA_VERSION } from './state.svelte.js';
import { sessionHasActivity, exLogHasActivity } from './session.js';
import { t } from './i18n/index.js';
import { toast } from './ui.svelte.js';
import { notifySyncError, withSyncNotify } from './syncNotify.js';

const APP_ID = 'fitness';

/**
 * 云同步:本地 localStorage 状态 ⇄ Supabase (fitness schema, 表名见 supabaseTables.js)
 *   settings / rotation / programOverrides / activeProgramId / lastDay → fitness_user_state
 *   weights → fitness_exercise_weights
 *   logs + sessionMeta(按 `date|dayId` 键) → fitness_workout_sessions + fitness_exercise_logs
 */

async function requireUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error(t('sync.notSignedIn'));
  return data.user;
}

const nonEmpty = (obj) =>
  obj && typeof obj === 'object' && Object.keys(obj).length ? obj : null;

/** 设置页手动同步等场景的错误文案（SyncErrorBanner 订阅源） */
export { syncErrorMessage } from './syncNotify.js';

/** 本机是否有值得上传的数据 */
export function localHasData() {
  return Boolean(
    Object.keys(S.logs || {}).length ||
      Object.keys(S.weights || {}).length ||
      Object.keys(S.programOverrides || {}).length ||
      S.rotation?.history?.length
  );
}

/* ───────── 云端快照 ───────── */
async function fetchCloudSnapshot() {
  const [stateRes, weightsRes, sessionsRes, logsRes] = await Promise.all([
    supabase.from(T.userState).select('*').maybeSingle(),
    supabase.from(T.exerciseWeights).select('exercise_id, weight'),
    supabase.from(T.workoutSessions).select('id, session_date, day_id, started_at, ended_at'),
    supabase.from(T.exerciseLogs).select('session_id, exercise_id, done, sets, skipped, started_at')
  ]);
  for (const res of [stateRes, weightsRes, sessionsRes, logsRes]) {
    if (res.error) throw res.error;
  }
  return {
    state: stateRes.data,
    weights: weightsRes.data,
    sessions: sessionsRes.data,
    logs: logsRes.data
  };
}

function cloudHasData(snap) {
  return Boolean(
    snap.sessions.length ||
      snap.weights.length ||
      nonEmpty(snap.state?.settings) ||
      nonEmpty(snap.state?.program_overrides) ||
      nonEmpty(snap.state?.rotation) ||
      snap.state?.active_program_id
  );
}

/** 把云端快照写入本地(mode: replace 覆盖 / merge 合并) */
function applySnapshot(snap, mode) {
  const cloudState = snap.state;

  const weights = {};
  snap.weights.forEach((r) => {
    const id = resolveExerciseId(r.exercise_id);
    if (weights[id] === undefined) weights[id] = Number(r.weight);
  });

  const keyById = new Map();
  const sessionMeta = {};
  snap.sessions.forEach((s) => {
    const k = `${s.session_date}|${s.day_id}`;
    keyById.set(s.id, k);
    if (s.started_at || s.ended_at) {
      sessionMeta[k] = {};
      if (s.started_at) sessionMeta[k].startedAt = s.started_at;
      if (s.ended_at) sessionMeta[k].endedAt = s.ended_at;
    }
  });

  const logs = {};
  snap.logs.forEach((r) => {
    const k = keyById.get(r.session_id);
    if (!k) return;
    if (!logs[k]) logs[k] = {};
    logs[k][resolveExerciseId(r.exercise_id)] = {
      done: r.done,
      sets: r.sets,
      skipped: r.skipped,
      startedAt: r.started_at
    };
  });

  applyState(
    {
      schemaVersion: cloudState?.schema_version ?? SCHEMA_VERSION,
      settings: nonEmpty(cloudState?.settings) ?? S.settings,
      weights,
      logs,
      rotation: nonEmpty(cloudState?.rotation) ?? S.rotation,
      lastDay: cloudState?.last_day ?? S.lastDay,
      sessionMeta,
      programOverrides:
        nonEmpty(cloudState?.program_overrides) ?? (mode === 'replace' ? {} : S.programOverrides),
      activeProgramId: cloudState?.active_program_id ?? activeProgramId()
    },
    mode
  );
  save();
}

/* ───────── 上传 ───────── */

/** 上传本地全部数据到云端(以本地为准覆盖云端) */
export async function pushToCloud() {
  const user = await requireUser();
  const uid = user.id;

  const { error: stateErr } = await supabase.from(T.userState).upsert(
    {
      user_id: uid,
      settings: S.settings,
      rotation: S.rotation,
      program_overrides: S.programOverrides || {},
      active_program_id: activeProgramId(),
      last_day: S.lastDay,
      schema_version: SCHEMA_VERSION
    },
    { onConflict: 'user_id' }
  );
  if (stateErr) throw stateErr;

  const weightRows = Object.entries(S.weights || {}).map(([exercise_id, weight]) => ({
    user_id: uid,
    exercise_id: resolveExerciseId(exercise_id),
    weight: Number(weight) || 0
  }));
  if (weightRows.length) {
    const { error } = await supabase
      .from(T.exerciseWeights)
      .upsert(weightRows, { onConflict: 'user_id,exercise_id' });
    if (error) throw error;
  }

  const keys = [
    ...new Set([...Object.keys(S.logs || {}), ...Object.keys(S.sessionMeta || {})])
  ].filter((k) => sessionHasActivity(k));
  const sessionRows = keys.map((k) => {
    const [date, dayId] = k.split('|');
    const meta = S.sessionMeta?.[k] || {};
    return {
      user_id: uid,
      session_date: date,
      day_id: dayId,
      program_id: activeProgramId(),
      started_at: meta.startedAt ?? null,
      ended_at: meta.endedAt ?? null
    };
  });

  let logCount = 0;
  if (sessionRows.length) {
    const { data: sessions, error: sessErr } = await supabase
      .from(T.workoutSessions)
      .upsert(sessionRows, { onConflict: 'user_id,session_date,day_id' })
      .select('id, session_date, day_id');
    if (sessErr) throw sessErr;

    const idByKey = new Map(sessions.map((s) => [`${s.session_date}|${s.day_id}`, s.id]));
    const logRows = [];
    Object.entries(S.logs || {}).forEach(([k, dayLog]) => {
      const sessionId = idByKey.get(k);
      if (!sessionId) return;
      Object.entries(dayLog || {}).forEach(([exercise_id, entry]) => {
        if (!entry || typeof entry !== 'object') return;
        if (!exLogHasActivity(entry)) return;
        logRows.push({
          session_id: sessionId,
          user_id: uid,
          exercise_id: resolveExerciseId(exercise_id),
          done: entry.done ?? 0,
          sets: entry.sets ?? [],
          skipped: entry.skipped ?? null,
          started_at: entry.startedAt ?? null
        });
      });
    });
    if (logRows.length) {
      const { error } = await supabase
        .from(T.exerciseLogs)
        .upsert(logRows, { onConflict: 'session_id,exercise_id' });
      if (error) throw error;
    }
    logCount = logRows.length;
  }

  writeSyncMeta(APP_ID, uid);
  return { sessions: sessionRows.length, logs: logCount };
}

/* ───────── 拉取 ───────── */

/** 从云端拉取数据并写入本地(mode: replace 覆盖 / merge 合并) */
export async function pullFromCloud(mode = 'merge') {
  const user = await requireUser();
  const snap = await fetchCloudSnapshot();
  if (!cloudHasData(snap)) {
    throw new Error(t('sync.cloudEmpty'));
  }
  applySnapshot(snap, mode);
  writeSyncMeta(APP_ID, user.id);
  return { sessions: snap.sessions.length, logs: snap.logs.length };
}

/* ───────── 练完 / 后台自动上传 ───────── */

const cloudPush = createDebouncedTask(async (options = {}) => {
  const { toastOnResult = false } = options;
  if (!browser) return { skipped: true, reason: 'no_browser' };

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { skipped: true, reason: 'not_signed_in' };
  if (!localHasData()) return { skipped: true, reason: 'no_local_data' };

  try {
    const result = await pushToCloud();
    if (toastOnResult) {
      const { toast } = await import('./ui.svelte.js');
      toast(t('sync.workoutUploaded', result), 'success', { key: 'sync-workout-uploaded' });
    }
    return { ok: true, ...result };
  } catch (err) {
    if (toastOnResult) {
      const { toast } = await import('./ui.svelte.js');
      toast(t('sync.workoutFailed'), 'error', { key: 'sync-workout-failed' });
    } else {
      notifySyncError(err);
    }
    return { ok: false, error: err };
  }
});

/** 已登录且本机有数据时推送到云端 */
export function autoCloudPush(options = {}) {
  return cloudPush.execute(options);
}

/** 完成训练后立即上传(总结页「完成训练」) */
export function autoCloudPushAfterWorkout() {
  cloudPush.cancelDebounce();
  return autoCloudPush({ toastOnResult: true });
}

/** 防抖上传:用于启动时补记历史、避免短时间重复请求 */
export function scheduleAutoCloudPush(options = {}) {
  return cloudPush.schedule(options);
}

/* ───────── 登录 / 多端双向同步 ───────── */

async function performBidirectionalSync() {
  const user = await requireUser();
  const meta = readSyncMeta(APP_ID);
  const sameUser = !meta?.userId || meta.userId === user.id;

  const snap = await fetchCloudSnapshot();
  const hasCloud = cloudHasData(snap);
  const hasLocal = localHasData();

  let pulled = false;
  let pushed = false;
  let switchedAccount = !sameUser;

  if (!sameUser) {
    if (hasCloud) {
      applySnapshot(snap, 'merge');
      pulled = true;
    }
    if (hasLocal || pulled) {
      await pushToCloud();
      pushed = true;
    }
    writeSyncMeta(APP_ID, user.id);
    return { pulled, pushed, switchedAccount, userId: user.id };
  }

  if (hasCloud) {
    applySnapshot(snap, 'merge');
    pulled = true;
  }
  if (hasLocal || pulled) {
    await pushToCloud();
    pushed = true;
  }
  writeSyncMeta(APP_ID, user.id);
  return { pulled, pushed, switchedAccount, userId: user.id };
}

/** 设置页等用户主动触发的同步结果 Toast（背景同步不调用） */
export async function toastManualSyncResult(result) {
  const { applyTheme } = await import('./state.svelte.js');
  await notifyManualSyncResult(result, {
    toast,
    onBeforeNotify: applyTheme,
    labels: {
      merged: t('auth.syncMerged'),
      uploaded: t('auth.syncUploaded'),
      downloaded: t('auth.syncLoaded'),
      accountLoaded: t('auth.syncSwitchedLoaded'),
      accountSwitched: t('auth.syncSwitched')
    }
  });
}

const { syncBidirectional, scheduleBidirectionalSync, resetCooldown: resetSyncCooldown } =
  createBidirectionalSync({
    performSync: async () => {
      try {
        return await performBidirectionalSync();
      } catch (err) {
        notifySyncError(err);
        throw err;
      }
    },
    onSilentPull: async () => {
      const { applyTheme } = await import('./state.svelte.js');
      applyTheme();
    }
  });

export { syncBidirectional, scheduleBidirectionalSync, resetSyncCooldown, withSyncNotify };
