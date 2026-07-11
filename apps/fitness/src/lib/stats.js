import { S, todayKey, daysBetween, dayDone, dateKeyOf } from './state.svelte.js';
import { effectiveDone } from './logs.js';
import { getProgram } from './programRuntime.js';
import { estimate1RM } from './tools/calculators.js';
import { EX_BY_ID, exerciseIdVariants, resolveExerciseId } from './data/exercises.js';
import { t, localeTag } from './i18n/index.js';

/** 所有有训练记录的日期（去重，跳过的动作不算真实训练） */
export function sessionDates() {
  const dates = new Set();
  Object.keys(S.logs).forEach((k) => {
    if (Object.values(S.logs[k]).some((v) => effectiveDone(v, Infinity) > 0))
      dates.add(k.split('|')[0]);
  });
  return [...dates].sort();
}

/** 近 N 周每周训练次数（自然周，周一为一周开始，符合日历直觉） */
export function sessionsByWeek(weeks = 4) {
  const now = new Date();
  // 本周一 00:00
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

  const dates = sessionDates();
  const buckets = [];

  for (let w = 0; w < weeks; w++) {
    const start = new Date(monday);
    start.setDate(start.getDate() - w * 7);
    const startKey = dateKeyOf(start);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const endKey = dateKeyOf(end);
    const count = dates.filter((d) => d >= startKey && d <= endKey).length;
    buckets.unshift({
      label: w === 0 ? t('stats.weekThis') : w === 1 ? t('stats.weekLast') : t('stats.weekAgo', { n: w }),
      count
    });
  }
  return buckets;
}

/** 近 N 天各训练日有效组数（跳过的动作只算真实做过的组） */
export function volumeByDayType(daysBack = 28) {
  const today = todayKey();
  const totals = {};

  Object.keys(S.logs).forEach((k) => {
    const [date, dayId] = k.split('|');
    if (daysBetween(date, today) > daysBack) return;
    const day = getProgram().days[dayId];
    if (!day?.ex) return;

    const log = S.logs[k];
    let sets = 0;
    Object.entries(log).forEach(([exId, entry]) => {
      const ex = day.ex.find((item) => item.id === exId) ?? EX_BY_ID[resolveExerciseId(exId)];
      if (!ex) return;
      sets += effectiveDone(entry, ex.sets);
    });
    if (sets === 0) return;
    totals[dayId] = (totals[dayId] || 0) + sets;
  });

  return Object.entries(totals)
    .map(([id, sets]) => ({
      id,
      cn: getProgram().days[id]?.cn ?? id,
      name: getProgram().days[id]?.name ?? id,
      sets
    }))
    .sort((a, b) => b.sets - a.sets);
}

/** 已自定义重量的动作列表 */
export function customWeightsList() {
  return Object.entries(S.weights)
    .map(([exId, w]) => {
      const variants = new Set(exerciseIdVariants(exId));
      for (const day of Object.values(getProgram().days)) {
        const ex = day.ex?.find((e) => variants.has(e.id));
        if (ex) {
          return {
            exId: resolveExerciseId(exId),
            name: ex.name,
            muscle: ex.m,
            weight: w,
            defaultW: ex.w,
            dayCn: day.cn
          };
        }
      }
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, localeTag()));
}

/** 当月训练日历数据 */
export function monthCalendar(ref = new Date()) {
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const sessions = {};

  Object.keys(S.logs).forEach((k) => {
    const [date, dayId] = k.split('|');
    if (!date.startsWith(prefix)) return;
    const day = getProgram().days[dayId];
    if (!day) return;
    const dd = dayDone(date, day);
    if (dd.done === 0) return;
    if (!sessions[date]) sessions[date] = [];
    sessions[date].push({ dayId, cn: day.cn, pct: dd.pct });
  });

  return {
    year,
    month,
    label: ref.toLocaleDateString(localeTag(), { year: 'numeric', month: 'long' }),
    daysInMonth,
    startDow: first.getDay(),
    sessions
  };
}

/** 动作完成率（近 N 天有记录的动作） */
export function exerciseCompletion(daysBack = 28) {
  const today = todayKey();
  const map = {};

  Object.keys(S.logs).forEach((k) => {
    const [date, dayId] = k.split('|');
    if (daysBetween(date, today) > daysBack) return;
    const day = getProgram().days[dayId];
    if (!day?.ex) return;
    const log = S.logs[k];

    Object.entries(log).forEach(([exId, entry]) => {
      const ex = day.ex.find((item) => item.id === exId) ?? EX_BY_ID[resolveExerciseId(exId)];
      if (!ex) return;
      const done = effectiveDone(entry, ex.sets);
      if (done === 0) return;
      const skipped = entry && typeof entry === 'object' && entry.skipped;
      if (!map[ex.id]) {
        map[ex.id] = { exId: ex.id, name: ex.name, muscle: ex.m, done: 0, total: 0, sessions: 0 };
      }
      map[ex.id].done += done;
      // 跳过的动作按实际组数中性计入，不拉低该动作完成率
      map[ex.id].total += skipped ? done : ex.sets;
      map[ex.id].sessions += 1;
    });
  });

  return Object.values(map)
    .map((r) => ({ ...r, pct: r.total ? Math.round((r.done / r.total) * 100) : 0 }))
    .sort((a, b) => b.done - a.done)
    .slice(0, 12);
}

/** 动作历史（近 N 次 session） */
export function exerciseHistory(exId, sessions = 8) {
  const variants = new Set(exerciseIdVariants(exId));
  const rows = [];
  const keys = Object.keys(S.logs).sort().reverse();

  for (const k of keys) {
    const [date, dayId] = k.split('|');
    const day = getProgram().days[dayId];
    const ex = day?.ex?.find((e) => variants.has(e.id)) ?? [...variants].map((id) => EX_BY_ID[id]).find(Boolean);
    if (!ex) continue;

    let log = null;
    for (const vid of variants) {
      if (S.logs[k][vid]) {
        log = S.logs[k][vid];
        break;
      }
    }
    if (!log || effectiveDone(log, ex.sets) === 0) continue;

    const sets = Array.isArray(log.sets) ? log.sets.filter(Boolean) : [];
    const reps = sets.map((s) => s.reps).filter((r) => r != null);
    const rirs = sets.map((s) => s.rir).filter((r) => r != null);
    const weights = sets.map((s) => s.weight).filter((w) => w != null && w > 0);

    let maxE1rm = null;
    sets.forEach((s) => {
      if (s && s.reps && s.weight) {
        const rm = estimate1RM(s.weight, s.reps, s.rir || 0);
        if (rm && (!maxE1rm || rm.avg > maxE1rm)) maxE1rm = rm.avg;
      }
    });

    rows.push({
      date,
      weight: weights.length ? Math.max(...weights) : null,
      e1rm: maxE1rm,
      avgReps: reps.length ? Math.round(reps.reduce((a, b) => a + b, 0) / reps.length) : null,
      avgRir: rirs.length ? Math.round((rirs.reduce((a, b) => a + b, 0) / rirs.length) * 10) / 10 : null,
      volume: sets.reduce((a, s) => a + (s.reps || 0) * (s.weight || 0), 0),
      done: effectiveDone(log, ex.sets)
    });
    if (rows.length >= sessions) break;
  }

  return rows.reverse();
}

/** 历史 PR 信息：重量 PR 优先（最直觉），无重量记录时退回单次容量 PR */
export function exercisePR(exId) {
  const history = exerciseHistory(exId, 999);
  if (!history.length) return null;

  let bestWeight = 0;
  let bestWeightDate = null;
  let bestVolume = 0;
  let bestVolumeDate = null;

  history.forEach((h) => {
    if (h.weight && h.weight > bestWeight) {
      bestWeight = h.weight;
      bestWeightDate = h.date;
    }
    if (h.volume > bestVolume) {
      bestVolume = h.volume;
      bestVolumeDate = h.date;
    }
  });

  if (!bestWeight && !bestVolume) return null;
  const type = bestWeight ? 'weight' : 'volume';
  return {
    date: type === 'weight' ? bestWeightDate : bestVolumeDate,
    weight: bestWeight,
    volume: bestVolume,
    type
  };
}
