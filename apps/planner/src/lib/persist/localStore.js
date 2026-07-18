import { browser } from '$app/environment';
import { readSyncMeta as readAppSyncMeta, writeSyncMeta as writeAppSyncMeta } from '@life-os/sync';
import { STORAGE_KEY } from './localDataKeys.js';
import { defaultState, migrate } from './migrate.js';
import { shouldSeedDemo } from '../demoMode.js';
import { buildDemoState } from './demoData.js';

const APP_ID = 'planner';

function safeStorage() {
  if (!browser) return null;
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** @returns {import('../types.js').AppState} */
export function loadState() {
  const ls = safeStorage();
  if (!ls) return defaultState();
  try {
    const raw = JSON.parse(ls.getItem(STORAGE_KEY) || 'null');
    // localhost 空库 → 灌入演示数据全面展示核心功能（生产/有数据时不触发）。
    if (!raw && shouldSeedDemo()) return migrate(buildDemoState());
    return migrate(raw);
  } catch {
    return defaultState();
  }
}

/** @param {import('../types.js').AppState} state */
export function saveState(state) {
  const ls = safeStorage();
  if (!ls) return false;
  try {
    ls.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function readSyncMeta() {
  return readAppSyncMeta(APP_ID);
}

/** @param {string} userId */
export function writeSyncMeta(userId) {
  writeAppSyncMeta(APP_ID, userId);
}
