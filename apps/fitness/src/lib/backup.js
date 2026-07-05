import { browser } from '$app/environment';
import { S, save, todayKey, SCHEMA_VERSION, applyState, activeProgramId } from './state.svelte.js';
import { DEFAULT_PROGRAM_ID } from './data/program.js';

/** 导出当前全部训练数据为 JSON 文件 */
export function exportBackup() {
  if (!browser) return;

  const payload = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'fitness-os',
    data: {
      settings: structuredClone(S.settings),
      weights: structuredClone(S.weights),
      logs: structuredClone(S.logs),
      rotation: structuredClone(S.rotation),
      lastDay: S.lastDay,
      sessionMeta: structuredClone(S.sessionMeta || {}),
      programOverrides: structuredClone(S.programOverrides || {}),
      activeProgramId: activeProgramId() || DEFAULT_PROGRAM_ID
    }
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fitos-backup-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** 校验并解析备份 JSON */
export function parseBackup(text) {
  const raw = JSON.parse(text);
  const data = raw.data ?? raw;
  if (!data || typeof data !== 'object' || !data.settings) {
    throw new Error('无效的备份文件：缺少 settings 字段');
  }
  return { meta: raw, data };
}

/** 导入备份（replace = 完全覆盖，merge = 合并日志与重量） */
export function importBackup(text, mode = 'replace') {
  const { data } = parseBackup(text);
  applyState(data, mode);
  save();
}
