/** 读取完成组数（兼容 v2 number 与 v3 object） */
export function getDoneCount(exLog) {
  if (exLog == null) return 0;
  if (typeof exLog === 'number') return exLog;
  return exLog.done ?? 0;
}

/**
 * 有效完成组数（统计口径统一入口）。
 * 跳过的动作只算真实做过的组（旧版本曾把跳过写成满组，这里按 sets 里的实际记录修正）。
 */
export function effectiveDone(exLog, plannedSets) {
  if (exLog == null) return 0;
  if (typeof exLog === 'number') return Math.min(exLog, plannedSets);
  if (exLog.skipped) {
    const recorded = Array.isArray(exLog.sets) ? exLog.sets.filter(Boolean).length : 0;
    return Math.min(recorded, plannedSets);
  }
  return Math.min(getDoneCount(exLog), plannedSets);
}

/** 将任意 exLog 规范为 v3 结构 */
export function normalizeExLog(exLog, totalSets) {
  if (exLog && typeof exLog === 'object' && !Array.isArray(exLog)) {
    const sets = Array.isArray(exLog.sets) ? [...exLog.sets] : [];
    while (sets.length < totalSets) sets.push(null);
    // 缺 done 字段（外部导入/云备份）时按已记录的组推断
    const inferredDone = exLog.done ?? sets.filter(Boolean).length;
    return {
      done: Math.min(inferredDone, totalSets),
      sets: sets.slice(0, totalSets),
      skipped: exLog.skipped ?? null,
      startedAt: exLog.startedAt ?? null
    };
  }
  const done = typeof exLog === 'number' ? exLog : 0;
  const sets = Array(totalSets).fill(null);
  return { done, sets, skipped: null, startedAt: null };
}

export function migrateLogEntry(val, totalSets = 12) {
  if (val == null) return null;
  if (typeof val === 'number') {
    const sets = Array(totalSets).fill(null);
    return { done: val, sets, skipped: null, startedAt: null };
  }
  if (typeof val === 'object') {
    return normalizeExLog(val, totalSets);
  }
  return null;
}
