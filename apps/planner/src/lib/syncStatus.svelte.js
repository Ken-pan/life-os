/**
 * 云同步状态（响应式），供设置页/指示器展示。
 * phase: idle 空闲 | syncing 同步中 | error 失败 | offline 离线待同步
 */
export const syncState = $state({
  /** @type {'idle'|'syncing'|'error'|'offline'} */
  phase: 'idle',
  /** 失败原因（phase === 'error' 时有值） */
  message: '',
  /** @type {string|null} 上次成功同步时间（ISO） */
  lastSyncAt: null,
  /** 本地有尚未上云的改动 */
  pendingChanges: false
});

export function markSyncing() {
  syncState.phase = 'syncing';
  syncState.message = '';
}

export function markSynced() {
  syncState.phase = 'idle';
  syncState.message = '';
  syncState.lastSyncAt = new Date().toISOString();
  syncState.pendingChanges = false;
}

/** @param {unknown} err */
export function markSyncError(err) {
  syncState.phase = 'error';
  syncState.message = /** @type {{ message?: string }} */ (err)?.message || String(err ?? '');
}

export function markOffline() {
  syncState.phase = 'offline';
  syncState.message = '';
}

export function markPendingChanges() {
  syncState.pendingChanges = true;
}
