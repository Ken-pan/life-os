import { S, todayKey, daysBetween, sessionStats } from './state.svelte.js';
import { effectiveDone } from './logs.js';
import { getProgram } from './programRuntime.js';
import { exerciseHistory } from './stats.js';
import { EX_BY_ID, EX_GROUPS, resolveExerciseId } from './data/exercises.js';

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

/* ───────── 分数容量（fractional volume）计数 ─────────
 * RP / Israetel 的容量地标是按「主动肌 1 组 + 协同肌约 0.5 组」定义的。
 * 若只数直接组，卧推不计三头/前束、划船不计二头、深蹲不计臀 —— 会系统性
 * 低估间接受力大的肌群（手臂、臀、后链），把已练够的部位误报成「偏低」。
 * 因此这里对复合动作补记 0.5 组间接容量，口径才与地标一致。
 * 参考：Schoenfeld 容量-剂量反应；Israetel《Scientific Principles of Hypertrophy Training》。
 */

/** 动作 id → 目录分组（chest/back/shoulders/…），判断动作模式用 */
const EX_BUCKET = {};
for (const [bucket, list] of Object.entries(EX_GROUPS)) {
  for (const e of list) EX_BUCKET[e.id] = bucket;
}

/** 直臂/耸肩类背部动作二头不参与，排除间接二头容量 */
const PULL_NO_BICEPS = new Set(['b_straightarm', 'b_pullover', 'b_shrug']);
/** 直立划船更偏肩/斜方，三头不参与 */
const PRESS_NO_TRICEPS = new Set(['sh_upright']);

/**
 * 单个动作对各肌群的容量贡献（分数组）：主动肌 1.0、次要/间接肌 0.5。
 * 来源：① m 里 "/" 后列出的次要区域；② 复合推→三头、复合拉→二头 的标准间接容量。
 * 注意：肩（三角肌）合并了前/中/后束，为避免推举把侧束缺口掩盖成「达标」，
 * 不给普通卧推补记前束间接容量（肩容量只认直接的推举/侧平举/后束动作）。
 * @param {{ id?: string, m?: string }} ex
 * @returns {Map<string, number>}
 */
function exerciseContributions(ex) {
  const contrib = new Map();
  const id = ex?.id ? resolveExerciseId(ex.id) : null;
  const rawM = (id && EX_BY_ID[id]?.m) || ex?.m || '';
  const parts = String(rawM)
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);

  const primary = muscleGroupOf(parts[0]);
  if (primary) contrib.set(primary, 1);
  for (const p of parts.slice(1)) {
    const g = muscleGroupOf(p);
    if (g && !contrib.has(g)) contrib.set(g, 0.5);
  }

  const bucket = id ? EX_BUCKET[id] : null;
  const isChestPress = bucket === 'chest' && !/孤立|内侧/.test(rawM);
  const isShoulderPress = bucket === 'shoulders' && parts[0] === '肩' && !PRESS_NO_TRICEPS.has(id);
  const isBackPull =
    bucket === 'back' && /背阔|中背|背厚|上背|背宽/.test(parts[0] || '') && !PULL_NO_BICEPS.has(id);

  if ((isChestPress || isShoulderPress) && !contrib.has('三头')) contrib.set('三头', 0.5);
  if (isBackPull && !contrib.has('二头')) contrib.set('二头', 0.5);

  return contrib;
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
    const raw = totals[group] || 0;
    const status = raw < mev ? 'low' : raw > mrv ? 'high' : 'optimal';
    // 分数容量四舍五入到 0.5 组用于展示；状态判定用原始值
    const sets = Math.round(raw * 2) / 2;
    return { group, sets, mev, mav, mrv, status };
  });
}

/**
 * 近 N 天各肌群的分数容量（fractional sets）：主动肌记满、复合动作的协同肌记 0.5，
 * 口径与 MUSCLE_LANDMARKS 一致（见上方 exerciseContributions 说明）。
 */
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
      for (const [g, frac] of exerciseContributions({ id: exId, m: ex.m })) {
        totals[g] = (totals[g] || 0) + done * frac;
      }
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
