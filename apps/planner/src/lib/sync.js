import { browser } from '$app/environment';
import { createBidirectionalSync, readSyncMeta, writeSyncMeta } from '@life-os/sync';
import {
  S,
  save,
  applyState,
  exportPayload,
  SCHEMA_VERSION,
  flushSave,
  applyTheme
} from './state.svelte.js';
import { loadPlannerState, upsertPlannerState, stateHasData, requireUserId } from './repo.js';
import { CACHE_SCOPES, writeCache } from './localCache.js';
import { syncRemindersToServiceWorker } from './services/reminders.js';
import { withSyncNotify } from './syncNotify.js';
import { toast } from './ui.svelte.js';
import { t } from './i18n/index.js';

const APP_ID = 'planner';

export function localHasData() {
  return S.tasks.length > 0 || S.lists.length > 1;
}

function cachePayload(userId) {
  writeCache(CACHE_SCOPES.state, userId, exportPayload());
}

/** @param {object} state @param {'replace'|'merge'} mode @param {string} userId */
function applyCloudState(state, mode, userId) {
  applyState(state, mode);
  save();
  cachePayload(userId);
}

async function pushToCloudInternal() {
  flushSave();
  const userId = await requireUserId();
  const payload = exportPayload();
  await upsertPlannerState(userId, payload, SCHEMA_VERSION);
  writeSyncMeta(APP_ID, userId);
  cachePayload(userId);
  return { pushed: true };
}

export function pushToCloud() {
  return withSyncNotify(() => pushToCloudInternal());
}

export function pullFromCloud(mode = 'replace') {
  return withSyncNotify(async () => {
    const userId = await requireUserId();
    const state = await loadPlannerState(userId);
    if (!state || !stateHasData(state)) {
      throw new Error(t('sync.cloudEmpty'));
    }
    applyCloudState(state, mode, userId);
    await syncRemindersToServiceWorker();
    writeSyncMeta(APP_ID, userId);
    return { pulled: true };
  });
}

async function syncNowInternal(mode = 'merge') {
  const userId = await requireUserId();
  const meta = readSyncMeta(APP_ID);
  const sameUser = !meta?.userId || meta.userId === userId;

  const state = await loadPlannerState(userId);
  let pushed = false;
  let pulled = false;

  if (state && stateHasData(state)) {
    applyCloudState(state, localHasData() ? mode : 'replace', userId);
    pulled = true;
    await syncRemindersToServiceWorker();
  }

  if (localHasData() && sameUser) {
    await pushToCloudInternal();
    pushed = true;
  }

  writeSyncMeta(APP_ID, userId);
  return { pushed, pulled, switchedAccount: false };
}

export function syncNow(mode = 'merge') {
  return withSyncNotify(() => syncNowInternal(mode));
}

function reportSyncResult(result) {
  applyTheme();
  const { pulled, pushed, switchedAccount } = result;
  if (switchedAccount) {
    if (pushed && pulled) toast(t('sync.merged'));
    else if (pushed) toast(t('sync.uploaded'));
    else if (pulled) toast(t('sync.downloaded'));
    return;
  }
  if (pushed && pulled) toast(t('sync.merged'));
  else if (pushed) toast(t('sync.uploaded'));
  else if (pulled) toast(t('sync.downloaded'));
}

/** Pull → Merge → Push（local-first 双向收敛） */
async function performBidirectionalSync() {
  const userId = await requireUserId();
  if (!S.settings.syncAuto) {
    writeSyncMeta(APP_ID, userId);
    return { pushed: false, pulled: false, switchedAccount: false, userId };
  }

  const meta = readSyncMeta(APP_ID);
  const sameUser = !meta?.userId || meta.userId === userId;
  const switchedAccount = !sameUser;

  const state = await loadPlannerState(userId);
  let pulled = false;
  let pushed = false;

  if (!sameUser) {
    if (state && stateHasData(state)) {
      applyCloudState(state, 'merge', userId);
      pulled = true;
      await syncRemindersToServiceWorker();
    }
    if (localHasData() || pulled) {
      await pushToCloudInternal();
      pushed = true;
    }
    writeSyncMeta(APP_ID, userId);
    return { pulled, pushed, switchedAccount: true, userId, notify: reportSyncResult };
  }

  if (state && stateHasData(state)) {
    const mode = sameUser && localHasData() ? 'merge' : 'replace';
    applyCloudState(state, mode, userId);
    pulled = true;
    await syncRemindersToServiceWorker();
  }

  if (localHasData() || pulled) {
    await pushToCloudInternal();
    pushed = true;
  }

  writeSyncMeta(APP_ID, userId);
  return { pulled, pushed, switchedAccount, userId, notify: reportSyncResult };
}

const { syncBidirectional, scheduleBidirectionalSync, resetCooldown: resetSyncCooldown } =
  createBidirectionalSync({
    performSync: performBidirectionalSync,
    onError: () => toast(t('sync.failed'), 'error'),
    onSilentPull: () => {
      applyTheme();
      toast(t('sync.pulledFromCloud'));
    }
  });

export { syncBidirectional, scheduleBidirectionalSync, resetSyncCooldown };

export function autoSyncOnLogin() {
  return syncBidirectional({ force: true });
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
