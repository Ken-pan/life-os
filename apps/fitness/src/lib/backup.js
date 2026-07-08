import { browser } from '$app/environment';
import { S, save, todayKey, SCHEMA_VERSION, applyState, activeProgramId } from './state.svelte.js';
import { DEFAULT_PROGRAM_ID } from './data/program.js';
import {
  buildBackupPayload,
  downloadBackupFile,
  parseBackup as parseBackupShared
} from '@life-os/platform-web/backup';

/** 导出当前全部训练数据为 JSON 文件 */
export function exportBackup() {
  if (!browser) return;

  const payload = buildBackupPayload({
    app: 'fitness-os',
    schemaVersion: SCHEMA_VERSION,
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
  });
  downloadBackupFile(payload, `fitos-backup-${todayKey()}.json`);
}

/** 校验并解析备份 JSON */
export function parseBackup(text) {
  return parseBackupShared(text, { invalidMessage: '无效的备份文件：缺少 settings 字段' });
}

/** 导入备份（replace = 完全覆盖，merge = 合并日志与重量） */
export function importBackup(text, mode = 'replace') {
  const { data } = parseBackup(text);
  applyState(data, mode);
  save();
}
