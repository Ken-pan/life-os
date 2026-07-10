import { browser } from '$app/environment';
import { createBidirectionalSync, readSyncMeta, writeSyncMeta, notifyManualSyncResult } from '@life-os/sync';
import {
  S,
  save,
  applyState,
  exportPayload,
  SCHEMA_VERSION,
  flushSave,
  applyTheme,
  onStateMutation
} from './state.svelte.js';
import { splitExpiredTombstones, defaultState } from './persist/migrate.js';
import { loadPlannerState, upsertPlannerState, stateHasData, requireUserId } from './repo.js';
import { CACHE_SCOPES, writeCache, readCache } from './localCache.js';
import { planAccountSwitchHydration } from './syncAccount.js';
import { syncRemindersToServiceWorker } from './services/reminders.js';
import { withSyncNotify } from './syncNotify.js';
import {
  markSyncing,
  markSynced,
  markSyncError,
  markOffline,
  markPendingChanges,
  syncState
} from './syncStatus.svelte.js';
import { toast } from './ui.svelte.js';
import { t } from './i18n/index.js';

const APP_ID = 'planner';

/** 编辑后自动上云的 debounce（比包内 800ms 更宽，避免连续输入频繁请求） */
const AUTO_SYNC_DEBOUNCE_MS = 2500;

// 墓碑也算数据：全部删光后仍需 merge + push 才能把删除传播到云端
export function localHasData() {
  return S.tasks.length > 0 || S.projects.length > 0 || S.lists.length > 1;
}

function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function cachePayload(userId) {
  writeCache(CACHE_SCOPES.state, userId, exportPayload());
}

/** 正在应用云端数据时，本地 mutation 监听不应再触发自动上云 */
let applyingCloud = false;

/** @param {object} state @param {'replace'|'merge'} mode @param {string} userId */
function applyCloudState(state, mode, userId) {
  applyingCloud = true;
  try {
    applyState(state, mode);
    save();
  } finally {
    applyingCloud = false;
  }
  cachePayload(userId);
}

/**
 * 物理清理过期墓碑：本地移除，并返回需要从云端删除的 id。
 * @returns {{ taskIds: string[], projectIds: string[], listIds: string[] }}
 */
function pruneExpiredTombstones() {
  const now = Date.now();
  const tasks = splitExpiredTombstones(S.tasks, now);
  if (tasks.expiredIds.length) S.tasks = tasks.live;
  const projects = splitExpiredTombstones(S.projects, now);
  if (projects.expiredIds.length) S.projects = projects.live;
  const lists = splitExpiredTombstones(S.lists, now);
  if (lists.expiredIds.length) S.lists = lists.live;
  return {
    taskIds: tasks.expiredIds,
    projectIds: projects.expiredIds,
    listIds: lists.expiredIds
  };
}

async function pushToCloudInternal() {
  const expiredTombstones = pruneExpiredTombstones();
  flushSave();
  const userId = await requireUserId();
  const payload = exportPayload();
  await upsertPlannerState(userId, payload, SCHEMA_VERSION, expiredTombstones);
  writeSyncMeta(APP_ID, userId);
  cachePayload(userId);
  return { pushed: true };
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 */
async function withSyncStatus(fn) {
  markSyncing();
  try {
    const result = await fn();
    markSynced();
    return result;
  } catch (e) {
    markSyncError(e);
    throw e;
  }
}

export function pushToCloud() {
  return withSyncNotify(() => withSyncStatus(() => pushToCloudInternal()));
}

export function pullFromCloud(mode = 'replace') {
  return withSyncNotify(() =>
    withSyncStatus(async () => {
      const userId = await requireUserId();
      const state = await loadPlannerState(userId);
      if (!state || !stateHasData(state)) {
        throw new Error(t('sync.cloudEmpty'));
      }
      applyCloudState(state, mode, userId);
      await syncRemindersToServiceWorker();
      writeSyncMeta(APP_ID, userId);
      return { pulled: true };
    })
  );
}

async function syncNowInternal(mode = 'merge') {
  const userId = await requireUserId();
  const meta = readSyncMeta(APP_ID);
  const sameUser = !meta?.userId || meta.userId === userId;

  if (!sameUser) {
    const state = await loadPlannerState(userId);
    const { pulled } = await hydrateForAccountSwitch(userId, state);
    writeSyncMeta(APP_ID, userId);
    return { pushed: false, pulled, switchedAccount: true };
  }

  const state = await loadPlannerState(userId);
  let pushed = false;
  let pulled = false;

  if (state && stateHasData(state)) {
    applyCloudState(state, localHasData() ? mode : 'replace', userId);
    pulled = true;
    await syncRemindersToServiceWorker();
  }

  if (localHasData()) {
    await pushToCloudInternal();
    pushed = true;
  }

  writeSyncMeta(APP_ID, userId);
  return { pushed, pulled, switchedAccount: false };
}

export function syncNow(mode = 'merge') {
  return withSyncNotify(() => withSyncStatus(() => syncNowInternal(mode)));
}

/** 设置页等用户主动触发的同步结果 Toast（背景同步不调用） */
export function toastManualSyncResult(result) {
  void notifyManualSyncResult(result, {
    toast,
    onBeforeNotify: applyTheme,
    labels: {
      merged: t('sync.merged'),
      uploaded: t('sync.uploaded'),
      downloaded: t('sync.downloaded'),
      accountLoaded: t('sync.accountLoaded'),
      accountSwitched: t('sync.accountSwitched')
    }
  });
}

/**
 * 换账号：优先该用户 cache → 云端 replace → 空默认态；不 push 旧账号本地数据。
 * @param {string} userId
 * @param {object|null|undefined} cloudState
 * @returns {Promise<{ pulled: boolean }>}
 */
async function hydrateForAccountSwitch(userId, cloudState) {
  const cached = readCache(CACHE_SCOPES.state, userId);
  const plan = planAccountSwitchHydration({
    cached,
    cloud: cloudState,
    cloudHasData: Boolean(cloudState && stateHasData(cloudState))
  });

  if (plan.source === 'cache') {
    applyCloudState(cached, 'replace', userId);
  } else if (plan.source === 'cloud') {
    applyCloudState(cloudState, 'replace', userId);
  } else {
    applyCloudState(defaultState(), 'replace', userId);
    save();
    cachePayload(userId);
  }

  await syncRemindersToServiceWorker();
  return { pulled: plan.pulled };
}

/** 记录本地最后一次改动 / 最近一次已成功上云的改动时间，用于补同步 */
let lastMutationAt = 0;
let lastPushedMutationAt = 0;

/** Pull → Merge → Push（local-first 双向收敛） */
async function performBidirectionalSync() {
  const userId = await requireUserId();
  if (!S.settings.syncAuto) {
    writeSyncMeta(APP_ID, userId);
    return { pushed: false, pulled: false, switchedAccount: false, userId };
  }
  if (isOffline()) {
    markOffline();
    return { pushed: false, pulled: false, switchedAccount: false, userId, offline: true };
  }

  return withSyncStatus(async () => {
    const mutationAtStart = lastMutationAt;
    const meta = readSyncMeta(APP_ID);
    const sameUser = !meta?.userId || meta.userId === userId;
    const switchedAccount = !sameUser;

    const state = await loadPlannerState(userId);
    let pulled = false;
    let pushed = false;

    if (switchedAccount) {
      ({ pulled } = await hydrateForAccountSwitch(userId, state));
      writeSyncMeta(APP_ID, userId);
      lastPushedMutationAt = mutationAtStart;
      return { pulled, pushed: false, switchedAccount: true, userId };
    }

    if (state && stateHasData(state)) {
      const mode = localHasData() ? 'merge' : 'replace';
      applyCloudState(state, mode, userId);
      pulled = true;
      await syncRemindersToServiceWorker();
    }

    if (localHasData() || pulled) {
      await pushToCloudInternal();
      pushed = true;
      lastPushedMutationAt = mutationAtStart;
    }

    writeSyncMeta(APP_ID, userId);
    return { pulled, pushed, switchedAccount: false, userId };
  });
}

const { syncBidirectional, scheduleBidirectionalSync, resetCooldown: resetSyncCooldown } =
  createBidirectionalSync({
    performSync: performBidirectionalSync,
    onSilentPull: () => {
      applyTheme();
    }
  });

export { syncBidirectional, scheduleBidirectionalSync, resetSyncCooldown };

/* ------------------------------------------------------------------ */
/* 编辑后自动上云 + 离线恢复补同步                                        */
/* ------------------------------------------------------------------ */

/** @type {() => boolean} */
let signedInCheck = () => false;
/** @type {ReturnType<typeof setTimeout> | null} */
let autoSyncTimer = null;

function scheduleAutoSync() {
  if (autoSyncTimer) clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(() => {
    autoSyncTimer = null;
    runAutoSync();
  }, AUTO_SYNC_DEBOUNCE_MS);
}

async function runAutoSync() {
  if (!signedInCheck() || !S.settings.syncAuto) return;
  if (isOffline()) {
    markOffline();
    return;
  }
  try {
    // force：绕过 4s cooldown，否则「同步后立即编辑」的改动会被跳过
    await syncBidirectional({ silent: true, force: true });
  } catch {
    /* markSyncError 已写入 syncState；设置页可见 pending/offline 状态 */
  }
  // 同步进行中又有新改动 → 追加一轮，保证收敛
  if (lastMutationAt > lastPushedMutationAt) {
    markPendingChanges();
    scheduleAutoSync();
  }
}

function handleLocalMutation() {
  if (applyingCloud) return;
  lastMutationAt = Date.now();
  markPendingChanges();
  if (!signedInCheck() || !S.settings.syncAuto) return;
  if (isOffline()) {
    markOffline();
    return;
  }
  scheduleAutoSync();
}

/**
 * 初始化自动同步：本地编辑 → debounce 上云；恢复在线/切后台 → 补同步。
 * @param {{ isSignedIn: () => boolean }} options
 * @returns {() => void} cleanup
 */
export function initAutoSync({ isSignedIn }) {
  if (!browser) return () => {};
  signedInCheck = isSignedIn;

  const offMutation = onStateMutation(handleLocalMutation);

  const onOnline = () => {
    if (!signedInCheck()) return;
    if (syncState.phase === 'offline') syncState.phase = 'idle';
    // 恢复在线：无论有无待传改动都做一次双向同步，顺带拉取云端新数据
    scheduleBidirectionalSync();
  };
  window.addEventListener('online', onOnline);

  const onOffline = () => {
    if (syncState.pendingChanges) markOffline();
  };
  window.addEventListener('offline', onOffline);

  // 切后台（移动端切 app / 关标签前）：立即冲刷待传改动，不等 debounce
  const onVisibilityHidden = () => {
    if (document.visibilityState !== 'hidden') return;
    if (!syncState.pendingChanges || !signedInCheck() || isOffline()) return;
    if (autoSyncTimer) {
      clearTimeout(autoSyncTimer);
      autoSyncTimer = null;
    }
    runAutoSync();
  };
  document.addEventListener('visibilitychange', onVisibilityHidden);

  return () => {
    offMutation();
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    document.removeEventListener('visibilitychange', onVisibilityHidden);
    if (autoSyncTimer) {
      clearTimeout(autoSyncTimer);
      autoSyncTimer = null;
    }
  };
}

export function lastSyncLabel() {
  const meta = readSyncMeta(APP_ID);
  if (!meta?.lastSyncAt) return '';
  try {
    return new Date(meta.lastSyncAt).toLocaleString();
  } catch {
    return meta.lastSyncAt;
  }
}
