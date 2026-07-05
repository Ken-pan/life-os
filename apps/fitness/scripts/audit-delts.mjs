#!/usr/bin/env node
/** 肩补充训练日（delts）专项审计 */
import { existsSync } from 'node:fs';
import { PROGRAMS, dayImage, exerciseImage, getProgramById } from '../src/lib/data/program.js';
import { EX_BY_ID, EX_GROUPS, getPoolExercisesForDay, DAY_POOL_GROUPS } from '../src/lib/data/exercises.js';
import { equipType } from '../src/lib/tools/calculators.js';
import { getRecommendedEntries } from '../src/lib/data/libraryHelpers.js';

let failed = 0;
const assert = (ok, msg) => {
  if (!ok) {
    console.error('FAIL:', msg);
    failed++;
  }
};

const PRESS_IDS = ['sh_ohp', 'sh_dbpress', 'sh_arnold', 'sh_machinepress', 'sh_frontraise'];

for (const prog of PROGRAMS) {
  const delts = prog.days.delts;
  assert(delts, `${prog.id}: 缺少 delts 日`);
  if (!delts) continue;
  assert(delts.supp === true, `${prog.id}: delts 未标记 supp`);
  assert(!prog.rotationOrder.includes('delts'), `${prog.id}: delts 误入 rotationOrder`);
  assert(delts.ex?.length === 4, `${prog.id}: 动作数=${delts.ex?.length}，期望 4`);
  assert(delts.warmup?.length >= 2, `${prog.id}: 缺少热身`);
  assert(delts.note?.includes('前束'), `${prog.id}: note 应说明前束覆盖逻辑`);

  const ids = [];
  for (const ex of delts.ex) {
    ids.push(ex.id);
    assert(EX_BY_ID[ex.id], `${prog.id}: 未知动作 ${ex.id}`);
    assert(equipType(ex) === equipType(EX_BY_ID[ex.id]), `${prog.id}/${ex.id}: equip 不一致`);
    assert(ex.cues?.length >= 2, `${prog.id}/${ex.id}: cues 不足`);
    for (const alt of ex.alternatives || []) {
      assert(EX_BY_ID[alt.id], `${prog.id}: 无效替代 ${alt.id}`);
    }
  }
  assert(
    ids.join(',') === 'sh_cableraise,sh_latraise,b_face,sh_reardelt',
    `${prog.id}: 动作顺序/组合异常: ${ids.join(',')}`
  );
  assert(!ids.some((id) => PRESS_IDS.includes(id)), `${prog.id}: 不应含推举类`);
}

const bro = getProgramById('bro-split');
assert(JSON.stringify(bro.rotationOrder) === JSON.stringify(['chest', 'back', 'legs', 'arms']), '四日轮换被破坏');
assert(Object.keys(bro.days).includes('delts'), 'bro-split 应含 delts');

const imgPath = 'static' + dayImage('delts');
assert(existsSync(imgPath), `封面图不存在: ${imgPath}`);

const pool = getPoolExercisesForDay('delts');
assert(pool.length >= 20, `delts 可选池仅 ${pool.length} 个动作`);
assert(pool.some((e) => e.id === 'b_face'), '可选池应含面拉');
assert(pool.some((e) => e.id === 'sh_cableraise'), '可选池应含绳索侧平举');
assert(DAY_POOL_GROUPS.delts.includes('shoulders'), '池配置应含 shoulders');
assert(DAY_POOL_GROUPS.delts.includes('back'), '池配置应含 back');

const lib = getRecommendedEntries({ dayId: 'delts', limit: 3 });
assert(lib.length === 3, 'delts 资料推荐应为 3 条');

// 重量语义：哑铃动作应有 /侧 或 dumbbell equip
const lat = bro.days.delts.ex.find((e) => e.id === 'sh_latraise');
const rear = bro.days.delts.ex.find((e) => e.id === 'sh_reardelt');
assert(lat.unit === 'LBS/侧', '哑铃侧平举应有 LBS/侧');
assert(rear.unit === 'LBS/侧', '后束飞鸟应有 LBS/侧');
assert(equipType(bro.days.delts.ex.find((e) => e.id === 'b_face')) === 'cable', '面拉应为 cable');

// anchor 应在首个侧束动作
assert(bro.days.delts.ex[0].anchor === true, '首个动作应为 anchor');
assert(bro.days.delts.ex[0].id === 'sh_cableraise', 'anchor 应为绳索侧平举');

// 周容量估算：12 组孤立 + 背日已有面拉不重复计数（用户自选频率）
const weeklyIf2x = bro.days.delts.ex.reduce((s, e) => s + e.sets, 0) * 2;
assert(weeklyIf2x === 24, `每周2次容量=${weeklyIf2x}，侧+后束偏高但可接受`);

console.log('程序数:', PROGRAMS.length);
console.log('delts 动作:', bro.days.delts.ex.map((e) => `${e.name} ${e.sets}×${e.reps}`).join(' · '));
console.log('可选池:', pool.length, '个动作');
console.log(failed ? `\n${failed} 项未通过` : '\n肩补充训练审计全部通过');
process.exit(failed ? 1 : 0);
