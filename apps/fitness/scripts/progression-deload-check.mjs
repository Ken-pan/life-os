#!/usr/bin/env node
/**
 * 降重建议校验（回归锁）—— 覆盖 2026-07-15 修的两个 bug：
 *
 *  1. 降重给出杠铃装不出的重量：降重走百分比（×0.9 / ×0.93），算出任意小数后
 *     按 2.5 取整；但双边杠铃最小片 2.5 → 总重每格是 5。185 会被建议成 167.5，
 *     每侧 61.25，没有 1.25 的片。
 *  2. 减载滚雪球：减载基准若取「当前工作重量」，采纳一次后 cur 变成减载后的重量，
 *     下次打开又按它再减 10%，200 → 180 → 160 → 145 一路往下滚。
 *
 * 跑法（必须带别名钩子，否则 $app/environment 和 runes 都过不去）：
 *   node --import ./scripts/lib/register-alias.mjs scripts/progression-deload-check.mjs
 */
import { S, todayKey } from '../src/lib/state.svelte.js';
import { recommendNextWeight } from '../src/lib/progression.js';
import { sessionKey } from '../src/lib/session.js';
import { plateLoading, PLATES_LBS, EQUIP_INFO } from '../src/lib/tools/calculators.js';
import { deloadAdvice } from '../src/lib/phase.js';

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('✗', msg);
    failed++;
  }
}

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

/** 把状态摆成「该减载了」：从没减载过 + 历史场次超过阈值(12) */
function forceDeload() {
  S.rotation.lastDeload = null;
  S.rotation.history = Array.from({ length: 14 }, (_, i) => ({ day: 'legs', date: daysAgo(i + 1) }));
}

const mkLog = (weight, sets = 4) => ({
  done: sets,
  sets: Array.from({ length: sets }, () => ({ reps: 8, weight, rir: 2 }))
});

/**
 * 塞历史：weights 按「从近到远」给，每场隔两天。
 * 都是「练完了、达标」的场次，让 progressionAdvice 有数据可评。
 */
function seedHistory(dayId, exId, weights) {
  for (const k of Object.keys(S.logs)) delete S.logs[k];
  weights.forEach((w, i) => {
    S.logs[sessionKey(dayId, daysAgo(2 + i * 2))] = { [exId]: mkLog(w) };
  });
}
const seedSession = (dayId, exId, weight) => seedHistory(dayId, exId, [weight]);

const loadableOnBar = (w, bar = 45) => {
  const r = plateLoading(w, bar, { sides: 2, plates: PLATES_LBS, collar: 0 });
  return !r.error && r.verify != null && Math.abs(r.verify - w) < 0.01;
};

forceDeload();
assert(deloadAdvice().shouldDeload, '前置：状态应判定为需要减载');

/* ── 1. 降重建议必须是杠铃装得出的重量 ───────────────────────────── */
{
  const exId = 'l_squat';
  assert(EQUIP_INFO.barbell.step === 5, '前置：杠铃步进应为 5');
  for (const w of [185, 180, 175, 165, 155, 145, 135, 225, 315, 200, 95, 65]) {
    seedSession('legs', exId, w);
    S.weights[exId] = w;
    const a = recommendNextWeight(exId);
    if (a.action !== 'decrease') continue;
    assert(
      loadableOnBar(a.suggestedWeight),
      `${w} → 建议 ${a.suggestedWeight}，45lb 杆装不出（每侧 ${(a.suggestedWeight - 45) / 2}）`
    );
    assert(a.suggestedWeight < w, `${w} → 建议 ${a.suggestedWeight} 应低于当前重量`);
  }
}

/* ── 2. 减载不能滚雪球：采纳后不该再继续往下减 ───────────────────── */
{
  const exId = 'l_squat';
  const START = 200;
  seedSession('legs', exId, START);
  S.weights[exId] = START;

  const first = recommendNextWeight(exId);
  assert(first.action === 'decrease', '首次应建议减载降重');
  assert(first.suggestedWeight === 180, `200 的减载建议应为 180，实际 ${first.suggestedWeight}`);

  // 采纳：工作重量落到建议值（历史仍是 200 —— 用户还没按新重量练）
  S.weights[exId] = first.suggestedWeight;
  const second = recommendNextWeight(exId);
  assert(
    second.action !== 'decrease',
    `采纳后不该继续降重，却又建议降到 ${second.suggestedWeight}（滚雪球）`
  );
  // 也不能反过来劝加重 —— 那等于把刚采纳的减载抵消掉
  assert(
    second.action === 'hold' && second.reasonKey === 'deloadHold',
    `减载期内采纳后应保持不动，实际 action=${second.action} → ${second.suggestedWeight}`
  );

  // 按减载重量真练了一场之后（历史里既有 180 也还有之前的 200），
  // 基准仍应锚在练过的最重，不该再往下滚
  seedHistory('legs', exId, [first.suggestedWeight, START, START, START]);
  S.weights[exId] = first.suggestedWeight;
  const third = recommendNextWeight(exId);
  assert(
    third.action !== 'decrease',
    `按减载重量练过后又被建议降到 ${third.suggestedWeight}（滚雪球）`
  );
  assert(third.action === 'hold', `减载期内练过后仍应保持不动，实际 ${third.action}`);

  // 减载结束（点了「我已减载完成」）后，正常进阶逻辑要恢复
  S.rotation.lastDeload = todayKey();
  const after = recommendNextWeight(exId);
  assert(
    after.reasonKey !== 'deloadHold',
    '标记减载完成后不该还卡在 deloadHold'
  );
  forceDeload();
}

/* ── 3. 哑铃保持 2.5 的精度，不该被粗化到 5 ──────────────────────── */
{
  assert(EQUIP_INFO.dumbbell.step === 2.5, '前置：哑铃步进应为 2.5');
}

if (failed) {
  console.error(`\n${failed} 项失败`);
  process.exit(1);
}
console.log('✓ progression-deload-check 全部通过');
