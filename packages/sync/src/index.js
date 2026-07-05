export {
  LIFE_OS_AUTH_STORAGE_KEY,
  SYNC_DEFAULTS,
  AUTH_SYNC_EVENTS,
  syncMetaStorageKey,
  readSyncMeta,
  writeSyncMeta
} from './constants.js';

export { createBidirectionalSync } from './bidirectional.js';
export { createDebouncedTask } from './debounced.js';
export { bindVisibilitySync } from './visibility.js';
export { createAuthSyncHandler } from './authSync.js';

/** Life OS 三端 appId（sync meta 键前缀） */
export const LIFE_OS_APP_IDS = /** @type {const} */ (['finance', 'fitness', 'planner']);
