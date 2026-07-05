import { browser } from '$app/environment';
import { S, save, todayKey, SCHEMA_VERSION, applyState } from './state.svelte.js';

export function exportBackup() {
  if (!browser) return;

  const payload = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'planner-os',
    data: {
      tasks: JSON.parse(JSON.stringify(S.tasks)),
      lists: JSON.parse(JSON.stringify(S.lists)),
      settings: JSON.parse(JSON.stringify(S.settings))
    }
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `planos-backup-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseBackup(text) {
  const raw = JSON.parse(text);
  const data = raw.data ?? raw;
  if (!data || typeof data !== 'object' || !data.settings) {
    throw new Error('invalid backup');
  }
  return { meta: raw, data };
}

export function importBackup(text, mode = 'replace') {
  const { data } = parseBackup(text);
  applyState(data, mode);
  save();
}
