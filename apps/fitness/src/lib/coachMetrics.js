import { S, todayKey, daysBetween, sessionStats } from './state.svelte.js';
import { effectiveDone } from './logs.js';
import { getProgram } from './programRuntime.js';
import { exerciseHistory } from './stats.js';
import { EX_BY_ID, resolveExerciseId } from './data/exercises.js';

/* ═══════════════ 肌群归一化与周容量 ═══════════════ */

const GROUP_RULES = [
  ['二头', /二头|肱肌/],
  ['三头', /三头/],
  ['胸', /胸/],
  ['肩', /肩袖|侧束|前束|后束|^肩/],
  ['背', /背|斜方|竖脊|后链/],
  ['股四', /股四/],
  ['腘绳', /腘绳/],
  ['臀', /臀/],
  ['小腿', /小腿|比目鱼/],
  ['核心', /腹|核心|抗伸展|抗旋/]
];

/** 将动作的 m 标签归一化为主肌群（取 "/" 前的主要部分优先匹配） */
export function muscleGroupOf(m) {
  if (!m) return null;
  const primary = String(m).split('/')[0];
  for (const [group, re] of GROUP_RULES) if (re.test(primary)) return group;
  for (const [group, re] of GROUP_RULES) if (re.test(String(m))) return group;
  return null;
}

/** 近 N 天各主肌群的直接训练组数 */
export function weeklyMuscleVolume(daysBack = 7) {
  const today = todayKey();
  const days = getProgram().days;
  const totals = {};

  Object.keys(S.logs).forEach((k) => {
    const [date, dayId] = k.split('|');
    const diff = daysBetween(date, today);
    if (diff < 0 || diff >= daysBack) return;
    const day = days[dayId];
    if (!day?.ex) return;

    const log = S.logs[k];
    Object.entries(log).forEach(([exId, entry]) => {
      const ex = day.ex.find((item) => item.id === exId) ?? EX_BY_ID[resolveExerciseId(exId)];
      if (!ex) return;
      const done = effectiveDone(entry, ex.sets);
      if (!done) return;
      const g = muscleGroupOf(ex.m);
      if (!g) return;
      totals[g] = (totals[g] || 0) + done;
    });
  });
  return totals;
}

/**
 * 容量执行缺口：只对比「实际练过的训练日」里各肌群的计划组数 vs 完成组数，
 * 找出砍量最狠的肌群。轮换制下某肌群本周还没轮到不算缺口（那是频率问题）。
 * 排除今天（session 可能还在进行中）。
 */
export function muscleVolumeGap(daysBack = 7) {
  if (sessionStats().week7 < 2) return null;
  const today = todayKey();
  const days = getProgram().days;
  const done = {};
  const planned = {};

  Object.keys(S.logs).forEach((k) => {
    const [date, dayId] = k.split('|');
    const diff = daysBetween(date, today);
    if (diff <= 0 || diff >= daysBack) return;
    const day = days[dayId];
    if (!day?.ex) return;

    const log = S.logs[k];
    const trained = day.ex.some((ex) => effectiveDone(log[ex.id], ex.sets) > 0);
    if (!trained) return;

    day.ex.forEach((ex) => {
      const g = muscleGroupOf(ex.m);
      if (!g) return;
      planned[g] = (planned[g] || 0) + ex.sets;
      done[g] = (done[g] || 0) + effectiveDone(log[ex.id], ex.sets);
    });
    const plannedIds = new Set(day.ex.map((ex) => ex.id));
    Object.entries(log).forEach(([exId, entry]) => {
      if (plannedIds.has(exId)) return;
      const ex = EX_BY_ID[resolveExerciseId(exId)];
      if (!ex) return;
      const g = muscleGroupOf(ex.m);
      if (!g) return;
      done[g] = (done[g] || 0) + effectiveDone(entry, ex.sets);
    });
  });

  let worst = null;
  Object.keys(planned).forEach((g) => {
    if (planned[g] < 6) return;
    const ratio = (done[g] || 0) / planned[g];
    if (ratio >= 0.6) return;
    if (!worst || ratio < worst.ratio) {
      worst = { group: g, sets: done[g] || 0, planned: planned[g], ratio };
    }
  });
  return worst;
}

/* ═══════════════ 疲劳 / 强度监控（基于 RIR 记录） ═══════════════ */

/** 近 N 天所有已记录 RIR 的组的统计 */
export function recentRirStats(daysBack = 7) {
  const today = todayKey();
  let n = 0;
  let sum = 0;
  let atFailure = 0;

  Object.keys(S.logs).forEach((k) => {
    const diff = daysBetween(k.split('|')[0], today);
    if (diff < 0 || diff >= daysBack) return;
    Object.values(S.logs[k]).forEach((entry) => {
      if (!Array.isArray(entry?.sets)) return;
      entry.sets.forEach((s) => {
        if (!s || s.rir == null) return;
        n += 1;
        sum += s.rir;
        if (s.rir === 0) atFailure += 1;
      });
    });
  });

  if (!n) return null;
  return {
    sets: n,
    avgRir: Math.round((sum / n) * 10) / 10,
    failurePct: Math.round((atFailure / n) * 100)
  };
}

/* ═══════════════ 平台期检测 ═══════════════ */

/**
 * 找出停滞动作：近 4 次 session 重量没变、次数也没往上走的负重动作。
 * 只看仍在计划里、且近 3 周有练过的动作。
 */
export function stagnantExercises(limit = 2) {
  const prog = getProgram();
  const today = todayKey();
  const seen = new Set();
  const out = [];

  (prog.rotationOrder || []).forEach((dayId) => {
    prog.days[dayId]?.ex?.forEach((ex) => {
      if (seen.has(ex.id) || !(ex.w > 0)) return;
      seen.add(ex.id);

      const hist = exerciseHistory(ex.id, 4);
      if (hist.length < 4) return;
      if (daysBetween(hist[hist.length - 1].date, today) > 21) return;

      const weights = hist.map((h) => h.weight);
      if (weights.some((w) => !w) || !weights.every((w) => w === weights[0])) return;

      const reps = hist.map((h) => h.avgReps);
      if (reps.some((r) => r == null)) return;
      if (reps[hist.length - 1] > reps[0]) return;

      out.push({
        ex,
        weight: weights[0],
        sessions: hist.length,
        alternative: ex.alternatives?.[0]?.name ?? null
      });
    });
  });
  return out.slice(0, limit);
}

/* ═══════════════ 跳过模式检测 ═══════════════ */

/** 近 N 天被跳过 ≥ 2 次的动作 */
export function frequentSkips(daysBack = 21) {
  const today = todayKey();
  const days = getProgram().days;
  const counts = {};

  Object.keys(S.logs).forEach((k) => {
    const [date, dayId] = k.split('|');
    const diff = daysBetween(date, today);
    if (diff < 0 || diff >= daysBack) return;
    const day = days[dayId];
    if (!day?.ex) return;

    Object.entries(S.logs[k]).forEach(([exId, entry]) => {
      if (!entry?.skipped) return;
      const ex = day.ex.find((e) => e.id === exId);
      if (!ex) return;
      if (!counts[exId]) counts[exId] = { ex, count: 0, alternative: ex.alternatives?.[0]?.name ?? null };
      counts[exId].count += 1;
    });
  });

  return Object.values(counts)
    .filter((c) => c.count >= 2)
    .sort((a, b) => b.count - a.count);
}
