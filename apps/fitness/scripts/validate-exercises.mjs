#!/usr/bin/env node
/**
 * 动作库数据校验：equip 覆盖、命名规范、计划引用、ID 别名
 */
import { EX_GROUPS, EX_BY_ID, EX_ID_ALIASES, DAY_POOL_GROUPS, getPoolExercisesForDay } from '../src/lib/data/exercises.js';
import { EQUIP_INFO, equipType } from '../src/lib/tools/calculators.js';
import { PROGRAMS } from '../src/lib/data/program.js';

let failed = 0;
const assert = (ok, msg) => {
  if (!ok) {
    console.error('FAIL:', msg);
    failed++;
  }
};

const all = Object.values(EX_GROUPS).flat();
const primary = all.filter((e) => !EX_ID_ALIASES[e.id]);

assert(primary.length >= 100, `动作数量异常: ${primary.length}`);
console.log('动作总数（不含别名）:', primary.length);

for (const e of primary) {
  assert(e.equip && EQUIP_INFO[e.equip], `${e.id}: 无效 equip ${e.equip}`);
  assert(equipType(e) === e.equip, `${e.id}: equipType 不一致`);
  assert(!/[／]/.test(e.name), `${e.id}: 名称含全角斜杠合并: ${e.name}`);
  const slashParts = e.name.split('/').map((s) => s.trim()).filter(Boolean);
  if (slashParts.length > 1 && !/胸|背|三头|二头|股四|臀|肩|腹|后链|下胸|肱肌|侧束|后束|竖脊|比目鱼|内收|前臂|上胸|下胸|中下|中背|背阔|背厚|背宽|孤立|稳定|抗伸展|抗旋|上腹|下腹|腹斜肌|体态|外旋|斜方|前束|长头|短头|峰|内侧|后链/.test(e.m)) {
    assert(false, `${e.id}: 名称疑似合并多个动作: ${e.name}`);
  }
}

const names = new Map();
const ALLOW_DUPLICATE_NAMES = new Set(['罗马尼亚硬拉']);
for (const e of primary) {
  if (names.has(e.name) && !ALLOW_DUPLICATE_NAMES.has(e.name)) {
    assert(false, `重名动作: ${e.name} (${e.id}, also ${names.get(e.name)})`);
  }
  names.set(e.name, e.id);
}

for (const prog of PROGRAMS) {
  for (const [dayId, day] of Object.entries(prog.days)) {
    for (const e of day.ex || []) {
      const known = EX_BY_ID[e.id] || e.id.startsWith('mo_');
      assert(known, `${prog.id}/${dayId} 引用未知动作 ${e.id}`);
      if (e.id === 'c_dip') assert(false, `${prog.id}/${dayId} 仍使用已废弃 c_dip`);
    }
  }
}

for (const [oldId, newId] of Object.entries(EX_ID_ALIASES)) {
  assert(EX_BY_ID[newId], `别名 ${oldId} → ${newId} 目标不存在`);
  assert(EX_BY_ID[oldId], `别名 ${oldId} 未注册到 EX_BY_ID`);
}

assert(getPoolExercisesForDay('chest').some((e) => e.id === 'sh_latraise'), '胸日池应含肩孤立动作');
assert(getPoolExercisesForDay('back').some((e) => e.id === 'b_face'), '背日池应含面拉');
assert(getPoolExercisesForDay('pull_a').some((e) => e.id === 'sh_reardelt'), '拉日池应含肩后束动作');
assert(getPoolExercisesForDay('upper_b').some((e) => e.id === 'b_face'), '上肢B池应含面拉');

const coreDay = PROGRAMS[0].days.core;
assert(coreDay.ex.some((e) => e.id === 'co_plank'), '核心日应含平板支撑');

const deltsDay = PROGRAMS[0].days.delts;
assert(deltsDay?.supp === true, '肩补充训练应标记为 supp');
assert(deltsDay.ex.length === 4, '肩补充训练应含 4 个动作');
assert(deltsDay.ex.some((e) => e.id === 'sh_cableraise'), '肩日应以侧平举打头');
assert(deltsDay.ex.some((e) => e.id === 'b_face'), '肩日应含面拉');
assert(!deltsDay.ex.some((e) => e.id === 'sh_ohp' || e.id === 'sh_dbpress'), '肩补充日不含推举（前束已由推日覆盖）');
assert(PROGRAMS.every((p) => p.days.delts), '所有计划应含肩补充训练');

assert(EX_BY_ID.b_ext.equip === 'bodyweight', '山羊挺身应为 bodyweight');
assert(EX_BY_ID.ar_dip.equip === 'bodyweight', '双杠应为 bodyweight');
assert(!EX_GROUPS.shoulders.some((e) => e.id === 'sh_facepull_iso'), '应移除重复面拉条目');

console.log(failed ? `\n${failed} 项校验失败` : '\n全部校验通过');
process.exit(failed ? 1 : 0);
