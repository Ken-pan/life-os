import { browser } from '$app/environment';
import { S, save, todayKey, SCHEMA_VERSION, applyState } from './state.svelte.js';
import {
  buildBackupPayload,
  downloadBackupFile,
  parseBackup as parseBackupShared
} from '@life-os/platform-web/backup';

export function exportBackup() {
  if (!browser) return;

  const payload = buildBackupPayload({
    app: 'planner-os',
    schemaVersion: SCHEMA_VERSION,
    data: {
      tasks: JSON.parse(JSON.stringify(S.tasks)),
      projects: JSON.parse(JSON.stringify(S.projects)),
      lists: JSON.parse(JSON.stringify(S.lists)),
      settings: JSON.parse(JSON.stringify(S.settings))
    }
  });
  downloadBackupFile(payload, `planos-backup-${todayKey()}.json`);
}

export function parseBackup(text) {
  return parseBackupShared(text, { invalidMessage: 'invalid backup' });
}

export function importBackup(text, mode = 'replace') {
  const { data } = parseBackup(text);
  applyState(data, mode);
  save();
}
