import { getProgramById, DEFAULT_PROGRAM_ID, listPrograms, PROGRAMS } from './data/program.js';
import { EX_BY_ID, resolveExerciseId } from './data/exercises.js';
import { localizeDay, localizeProgram, rotationLabel } from './i18n/programLabels.js';
import { S, save, activeProgramId } from './state.svelte.js';

const PATCH_KEYS = ['name', 'sets', 'reps', 'rest', 'rir', 'w', 'hidden', 'scheme', 'pairWith'];

function baseExercise(exId) {
  const base = getBaseProgram();
  for (const day of Object.values(base.days)) {
    const ex = day.ex.find((e) => e.id === exId);
    if (ex) return ex;
  }
  return EX_BY_ID[exId] ?? null;
}

function isAddedExercise(exId) {
  const ov = S.programOverrides || {};
  return Object.entries(ov).some(([k, v]) => k.startsWith('day:') && (v.addedEx || []).includes(exId));
}

function exerciseHasFieldOverride(exId, ov) {
  const base = baseExercise(exId);
  if (!base) {
    return Object.keys(ov).some((k) => k !== 'hidden' && ov[k] !== undefined);
  }
  return PATCH_KEYS.some((k) => {
    if (k === 'hidden') return false;
    if (ov[k] === undefined) return false;
    if (k === 'scheme') return ov[k] !== (base[k] ?? 'straight');
    if (k === 'pairWith') return ov[k] !== (base[k] ?? undefined);
    return ov[k] !== base[k];
  });
}

function baseFieldValue(base, key) {
  if (key === 'scheme') return base[key] ?? 'straight';
  if (key === 'pairWith') return base[key] ?? undefined;
  return base[key];
}

function pruneExerciseOverride(exId, merged) {
  const base = baseExercise(exId);
  if (base) {
    PATCH_KEYS.forEach((k) => {
      if (k === 'hidden') return;
      if (merged[k] === undefined) return;
      if (merged[k] === baseFieldValue(base, k)) delete merged[k];
    });
  }
  if (!merged.hidden) delete merged.hidden;
  if (!merged.scheme || merged.scheme === 'straight') delete merged.scheme;
  if (!merged.pairWith || merged.scheme !== 'superset') delete merged.pairWith;
  return merged;
}

/** 删除/隐藏动作后，清除同日内指向它的超级组配对 */
function clearPairWithReferences(dayId, removedExId) {
  for (const id of getDayAllExerciseIds(dayId)) {
    if (id === removedExId) continue;
    const ov = S.programOverrides?.[id];
    if (ov?.pairWith === removedExId) {
      setExerciseOverride(id, { pairWith: undefined });
    }
  }
}

/** 导入或结构变更后，清除指向不可见动作的 pairWith */
function sanitizeOrphanPairWith() {
  const prog = getProgram();
  const fixes = [];
  for (const day of Object.values(prog.days)) {
    const visibleIds = new Set(day.ex.map((e) => e.id));
    for (const ex of day.ex) {
      if (ex.pairWith && !visibleIds.has(ex.pairWith)) fixes.push(ex.id);
    }
  }
  for (const exId of fixes) {
    setExerciseOverride(exId, { pairWith: undefined });
  }
}

function mergeExercise(ex, override) {
  if (!override) return { ...ex };
  const merged = { ...ex };
  PATCH_KEYS.forEach((k) => {
    if (override[k] !== undefined) merged[k] = override[k];
  });
  return merged;
}

function defaultDayOrder(dayId) {
  const base = getBaseProgram().days[dayId];
  if (!base) return [];
  const dayOv = S.programOverrides?.[`day:${dayId}`] || {};
  const baseIds = base.ex.map((e) => e.id);
  const addedEx = (dayOv.addedEx || []).filter((id) => !baseIds.includes(id));
  return [...baseIds, ...addedEx];
}

function ordersEqual(a, b) {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

function applyExerciseOrder(defaultOrder, customOrder) {
  if (!customOrder?.length) return defaultOrder;
  const allIds = new Set(defaultOrder);
  const seen = new Set();
  const result = [];
  for (const id of customOrder) {
    if (allIds.has(id) && !seen.has(id)) {
      result.push(id);
      seen.add(id);
    }
  }
  for (const id of defaultOrder) {
    if (!seen.has(id)) result.push(id);
  }
  return result;
}

/** 训练日全部动作 id（含已删除），按当前顺序 */
function getDayAllExerciseIds(dayId) {
  return applyExerciseOrder(defaultDayOrder(dayId), S.programOverrides?.[`day:${dayId}`]?.exOrder);
}

function pruneDayOrder(key, dayId) {
  const dayOv = S.programOverrides?.[key];
  if (!dayOv?.exOrder) return;
  if (ordersEqual(dayOv.exOrder, defaultDayOrder(dayId))) {
    const { exOrder, ...rest } = dayOv;
    if (Object.keys(rest).length) S.programOverrides[key] = rest;
    else delete S.programOverrides[key];
  }
}

function setDayExerciseOrder(dayId, order) {
  const key = `day:${dayId}`;
  if (!S.programOverrides) S.programOverrides = {};
  if (!S.programOverrides[key]) S.programOverrides[key] = {};
  S.programOverrides[key].exOrder = order;
  pruneDayOrder(key, dayId);
  save();
}

function restoreExerciseDefaultOrder(dayId, exId) {
  const key = `day:${dayId}`;
  const dayOv = S.programOverrides?.[key];
  if (!dayOv?.exOrder) return;

  const def = defaultDayOrder(dayId);
  const defaultIdx = def.indexOf(exId);
  if (defaultIdx < 0) return;

  const order = dayOv.exOrder.filter((id) => id !== exId);
  for (const id of def) {
    if (!order.includes(id)) order.push(id);
  }
  order.splice(defaultIdx, 0, exId);
  dayOv.exOrder = order;
  pruneDayOrder(key, dayId);
}

function getBaseProgram() {
  return getProgramById(activeProgramId());
}

/** 合并默认计划与用户 overrides */
export function getProgram() {
  const base = getBaseProgram();
  const ov = S.programOverrides || {};
  const days = {};

  Object.entries(base.days).forEach(([dayId, day]) => {
    const dayOv = ov[`day:${dayId}`] || {};
    const baseIds = new Set(day.ex.map((e) => e.id));
    const addedEx = (dayOv.addedEx || [])
      .filter((id) => !baseIds.has(id))
      .map((id) => EX_BY_ID[id])
      .filter(Boolean);

    const byId = new Map([...day.ex, ...addedEx].map((ex) => [ex.id, ex]));
    const orderedIds = applyExerciseOrder([...byId.keys()], dayOv.exOrder);

    days[dayId] = localizeDay(
      {
        ...day,
        ...dayOv,
        ex: orderedIds
          .map((id) => byId.get(id))
          .filter(Boolean)
          .map((ex) => mergeExercise(ex, ov[ex.id]))
          .filter((ex) => !ov[ex.id]?.hidden)
      },
      dayId
    );
  });

  return localizeProgram({
    ...base,
    days,
    rotationOrder: base.rotationOrder
  });
}

export function getDay(dayId) {
  return getProgram().days[dayId] ?? null;
}

export function findExercise(exId) {
  const id = resolveExerciseId(exId);
  for (const day of Object.values(getProgram().days)) {
    const ex = day.ex?.find((e) => e.id === id || e.id === exId);
    if (ex) return { ex, dayId: day.id };
  }
  return null;
}

export function setExerciseOverride(exId, patch) {
  if (!S.programOverrides) S.programOverrides = {};
  const merged = pruneExerciseOverride(exId, { ...(S.programOverrides[exId] || {}), ...patch });
  if (Object.keys(merged).length === 0) delete S.programOverrides[exId];
  else S.programOverrides[exId] = merged;
  save();
}

/** 从训练日删除动作：基础动作记 hidden 覆盖；动作库添加的则彻底移除 */
export function removeExerciseFromDay(dayId, exId) {
  const key = `day:${dayId}`;
  if (S.programOverrides?.[key]?.addedEx?.includes(exId)) {
    resetExerciseInDay(dayId, exId);
    return;
  }
  setExerciseOverride(exId, { hidden: true });
  clearPairWithReferences(dayId, exId);
}

/** 从动作库添加动作到指定训练日 */
export function addExerciseToDay(dayId, exId) {
  const id = resolveExerciseId(exId);
  if (!EX_BY_ID[id]) return;
  const key = `day:${dayId}`;
  if (!S.programOverrides) S.programOverrides = {};
  if (!S.programOverrides[key]) S.programOverrides[key] = {};
  const added = S.programOverrides[key].addedEx || [];
  if (!added.includes(id)) {
    S.programOverrides[key].addedEx = [...added, id];
    const order = S.programOverrides[key].exOrder;
    if (order?.length && !order.includes(id)) {
      S.programOverrides[key].exOrder = [...order, id];
    }
  }
  if (S.programOverrides[exId]?.hidden || S.programOverrides[id]?.hidden) {
    const next = { ...(S.programOverrides[id] || S.programOverrides[exId] || {}) };
    delete next.hidden;
    delete S.programOverrides[exId];
    if (Object.keys(next).length) S.programOverrides[id] = next;
    else delete S.programOverrides[id];
  }
  save();
}

export function clearExerciseOverride(exId) {
  if (!S.programOverrides) return;
  delete S.programOverrides[exId];
  save();
}

/** 重置单个动作：清除字段覆盖；若从动作库添加则一并移除 */
export function resetExerciseInDay(dayId, exId) {
  const key = `day:${dayId}`;
  const dayOv = S.programOverrides?.[key];
  if (dayOv?.addedEx?.includes(exId)) {
    const nextAdded = dayOv.addedEx.filter((id) => id !== exId);
    if (nextAdded.length) dayOv.addedEx = nextAdded;
    else {
      const { addedEx, ...rest } = dayOv;
      if (Object.keys(rest).length) S.programOverrides[key] = rest;
      else delete S.programOverrides[key];
    }
    if (S.programOverrides?.[key]?.exOrder) {
      const nextOrder = S.programOverrides[key].exOrder.filter((id) => id !== exId);
      if (nextOrder.length) S.programOverrides[key].exOrder = nextOrder;
      else {
        const { exOrder, ...rest } = S.programOverrides[key];
        if (Object.keys(rest).length) S.programOverrides[key] = rest;
        else delete S.programOverrides[key];
      }
      pruneDayOrder(key, dayId);
    }
    clearPairWithReferences(dayId, exId);
  } else {
    restoreExerciseDefaultOrder(dayId, exId);
  }
  clearExerciseOverride(exId);
}

/** 在训练日内上移/下移动作（仅可见项之间交换） */
export function moveExerciseInDay(dayId, exId, delta) {
  const allIds = getDayAllExerciseIds(dayId);
  const visibleIds = allIds.filter((id) => !S.programOverrides?.[id]?.hidden);
  const visIdx = visibleIds.indexOf(exId);
  if (visIdx < 0) return;

  const targetVisIdx = visIdx + delta;
  if (targetVisIdx < 0 || targetVisIdx >= visibleIds.length) return;

  const swapId = visibleIds[targetVisIdx];
  const idxA = allIds.indexOf(exId);
  const idxB = allIds.indexOf(swapId);
  const next = [...allIds];
  [next[idxA], next[idxB]] = [next[idxB], next[idxA]];
  setDayExerciseOrder(dayId, next);
}

export function dayHasCustomOrder(dayId) {
  const dayOv = S.programOverrides?.[`day:${dayId}`];
  if (!dayOv?.exOrder?.length) return false;
  return !ordersEqual(dayOv.exOrder, defaultDayOrder(dayId));
}

export function clearAllProgramOverrides() {
  S.programOverrides = {};
  save();
}

export function overrideCount() {
  const ov = S.programOverrides || {};
  const touched = new Set();

  Object.entries(ov).forEach(([k, v]) => {
    if (!k.startsWith('day:')) return;
    (v.addedEx || []).forEach((id) => touched.add(id));
    const dayId = k.slice(4);
    if (v.exOrder?.length && !ordersEqual(v.exOrder, defaultDayOrder(dayId))) {
      touched.add(`${k}:order`);
    }
  });
  Object.entries(ov).forEach(([k, v]) => {
    if (k.startsWith('day:')) return;
    if (v.hidden || exerciseHasFieldOverride(k, v)) touched.add(k);
  });

  return touched.size;
}

/** 编辑页：该动作是否有用户向的改动（含删除、字段修改、从动作库添加） */
export function exerciseHasOverride(exId) {
  if (S.programOverrides?.[exId]?.hidden) return true;
  if (isAddedExercise(exId)) return true;
  const ov = S.programOverrides?.[exId];
  if (!ov) return false;
  return exerciseHasFieldOverride(exId, ov);
}

/** 切换训练计划模板（保留 overrides 与历史记录） */
export function setActiveProgram(id) {
  const next = PROGRAMS.find((p) => p.id === id);
  if (!next) throw new Error('未知计划');
  S.activeProgramId = id;
  S.rotation.next = 0;
  save();
  return next;
}

export { listPrograms, rotationLabel };

/** 导出仅计划 overrides（便于分享/备份） */
export function exportProgramOverrides() {
  return {
    exportedAt: new Date().toISOString(),
    activeProgramId: activeProgramId(),
    programOverrides: structuredClone(S.programOverrides || {})
  };
}

export function importProgramOverrides(data) {
  const ov = data?.programOverrides ?? data;
  if (!ov || typeof ov !== 'object') throw new Error('无效的计划配置');
  if (data?.activeProgramId) setActiveProgram(data.activeProgramId);
  S.programOverrides = ov;
  sanitizeOrphanPairWith();
  save();
}

/** 默认计划（只读，用于编辑页对比） */
export function baseProgram() {
  return getBaseProgram();
}
