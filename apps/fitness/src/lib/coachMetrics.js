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

/**
 * 从动作解析主肌群。GROUP_RULES 用中文肌群正则，而 getProgram() 返回的
 * ex.m 在英文 locale 下已被本地化 → 必须回到原始目录（EX_BY_ID，恒中文）取 m，
 * 否则英文下容量统计全部落空。
 * @param {{ id?: string, m?: string }} ex
 */
function groupOfExercise(ex) {
  const rawM = (ex?.id && EX_BY_ID[resolveExerciseId(ex.id)]?.m) || ex?.m;
  return muscleGroupOf(rawM);
}

/**
 * 各肌群每周直接组数的科学容量地标（hypertrophy volume landmarks，RP 风格）：
 *   mev = 最低有效容量（低于此 → 增肌刺激不足）
 *   mav = 适应容量区间上沿（多数人最佳产出落在 mev~mav）
 *   mrv = 最大可恢复容量（高于此 → 恢复不足 / 垃圾容量风险）
 * key 与 GROUP_RULES 归一化后的组名一致。
 */
export const MUSCLE_LANDMARKS = {
  胸: { mev: 10, mav: 18, mrv: 22 },
  背: { mev: 10, mav: 20, mrv: 25 },
  肩: { mev: 8, mav: 20, mrv: 26 },
  二头: { mev: 8, mav: 18, mrv: 26 },
  三头: { mev: 6, mav: 14, mrv: 18 },
  股四: { mev: 8, mav: 16, mrv: 20 },
  腘绳: { mev: 6, mav: 14, mrv: 20 },
  臀: { mev: 4, mav: 12, mrv: 16 },
  小腿: { mev: 8, mav: 14, mrv: 20 },
  核心: { mev: 6, mav: 14, mrv: 25 }
};

/** GROUP_RULES 声明顺序 = 展示顺序（胸背肩臂 → 腿 → 核心的直觉分组由规则表决定） */
const LANDMARK_ORDER = GROUP_RULES.map(([g]) => g).filter((g) => MUSCLE_LANDMARKS[g]);

/**
 * 每周各肌群容量 vs 科学地标：给容量仪表盘用。
 * 返回按固定顺序排列的全部有地标的肌群，即使本周 0 组（0 组正是要暴露的缺口）。
 * status：low = 低于 MEV（欠练）· optimal = MEV~MRV · high = 超过 MRV（过量）
 * @param {number} daysBack
 * @returns {{ group: string, sets: number, mev: number, mav: number, mrv: number, status: 'low'|'optimal'|'high' }[]}
 */
export function muscleVolumeStatus(daysBack = 7) {
  const totals = weeklyMuscleVolume(daysBack);
  return LANDMARK_ORDER.map((group) => {
    const { mev, mav, mrv } = MUSCLE_LANDMARKS[group];
    const sets = totals[group] || 0;
    const status = sets < mev ? 'low' : sets > mrv ? 'high' : 'optimal';
    return { group, sets, mev, mav, mrv, status };
  });
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
      const g = groupOfExercise({ id: exId, m: ex.m });
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
      const g = groupOfExercise(ex);
      if (!g) return;
      planned[g] = (planned[g] || 0) + ex.sets;
      done[g] = (done[g] || 0) + effectiveDone(log[ex.id], ex.sets);
    });
    const plannedIds = new Set(day.ex.map((ex) => ex.id));
    Object.entries(log).forEach(([exId, entry]) => {
      if (plannedIds.has(exId)) return;
      const ex = EX_BY_ID[resolveExerciseId(exId)];
      if (!ex) return;
      const g = groupOfExercise({ id: exId, m: ex.m });
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
