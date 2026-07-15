/**
 * 事件流派生单测(能力17):追加日志 → 长期结论。
 * Usage: node apps/home/scripts/event-derive-unit.mjs
 */
import assert from 'node:assert/strict'
import {
  clutterRecurrence,
  isValidEvent,
  lastObservedAt,
  makeEvent,
  moveStats,
  recentlyMarkedCluttered,
  rejectedSignatures,
  summarizeEvents,
} from '../src/lib/spatial/event-derive.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_800_000_000_000

/* ---- 事件构造与校验 ---- */
{
  const a = makeEvent('tidy_done', { zoneId: 'z1' }, {}, NOW)
  const b = makeEvent('tidy_done', { zoneId: 'z1' }, {}, NOW)
  assert.notEqual(a.id, b.id, '同毫秒两条事件 id 不许撞')
  assert.ok(isValidEvent(a))
  assert.ok(!isValidEvent(null))
  assert.ok(!isValidEvent({ type: 'x' }), '缺 ts/id 不合法')
}

/* ---- 上次扫描确认时刻 ---- */
{
  const events = [
    makeEvent('object_observed', { placementId: 'p1' }, {}, NOW - 5 * DAY),
    makeEvent('object_observed', { placementId: 'p1' }, {}, NOW - 2 * DAY),
    makeEvent('object_moved', { placementId: 'p2' }, { source: 'scan', movedFt: 3 }, NOW - 1 * DAY),
    // 布局应用不算「扫描确认」:那是我们让它动的,不是现实观测
    makeEvent('object_moved', { placementId: 'p3' }, { source: 'layout', movedFt: 2 }, NOW),
  ]
  const seen = lastObservedAt(events)
  assert.equal(seen.get('p1'), NOW - 2 * DAY, '取最近一次')
  assert.equal(seen.get('p2'), NOW - 1 * DAY, '扫描发现真挪了也是一次确认')
  assert.equal(seen.get('p3'), undefined, 'layout 源不算观测')
}

/* ---- 最常挪动 ---- */
{
  const events = [
    makeEvent('object_moved', { placementId: 'p1' }, { source: 'layout', label: '办公椅', movedFt: 2 }, NOW - 3 * DAY),
    makeEvent('object_moved', { placementId: 'p1' }, { source: 'scan', label: '办公椅', movedFt: 4 }, NOW - 1 * DAY),
    makeEvent('object_moved', { placementId: 'p2' }, { source: 'scan', label: '沙发', movedFt: 1 }, NOW),
  ]
  const stats = moveStats(events)
  assert.equal(stats[0].placementId, 'p1')
  assert.equal(stats[0].count, 2)
  assert.equal(stats[0].totalFt, 6)
  assert.equal(stats[0].label, '办公椅')
}

/* ---- 反复变乱 + 整理后反弹(根因线索) ---- */
{
  const events = [
    makeEvent('zone_cluttered', { zoneId: 'z1' }, { nameZh: '餐区', score: 66 }, NOW - 20 * DAY),
    makeEvent('tidy_done', { zoneId: 'z1' }, {}, NOW - 10 * DAY),
    // 整理后 3 天又乱 → 反弹
    makeEvent('zone_cluttered', { zoneId: 'z1' }, { nameZh: '餐区', score: 62 }, NOW - 7 * DAY),
    // 只乱过一次的区不算「反复」
    makeEvent('zone_cluttered', { zoneId: 'z2' }, { nameZh: '卧室', score: 70 }, NOW - 3 * DAY),
    // 窗口外的老账不算
    makeEvent('zone_cluttered', { zoneId: 'z3' }, { nameZh: '厨房', score: 80 }, NOW - 60 * DAY),
  ]
  const rec = clutterRecurrence(events, { now: NOW })
  assert.equal(rec.length, 1, '只有餐区算反复')
  assert.equal(rec[0].zoneId, 'z1')
  assert.equal(rec[0].times, 2)
  assert.equal(rec[0].afterTidy, 1, '其中一次是整理后反弹')

  // 去抖:5 天前记过 → 最近已标;10 天前 → 该再记了
  assert.ok(recentlyMarkedCluttered(events, 'z1', NOW - 2 * DAY))
  assert.ok(!recentlyMarkedCluttered(events, 'z1', NOW + 3 * DAY))
}

/* ---- 被否决的方案签名 ---- */
{
  const events = [
    makeEvent('layout_rejected', { signature: 'sigA' }, {}, NOW - 2 * DAY),
    makeEvent('layout_rejected', { signature: 'sigA' }, {}, NOW - 1 * DAY),
    makeEvent('layout_rejected', { signature: 'sigB' }, {}, NOW),
  ]
  const rej = rejectedSignatures(events)
  assert.equal(rej.size, 2)
  assert.equal(rej.get('sigA'), NOW - 1 * DAY, '同签名取最近一次')
}

/* ---- 汇总 ---- */
{
  const events = [
    makeEvent('zone_cluttered', { zoneId: 'z1' }, { nameZh: '餐区', score: 66 }, NOW - 8 * DAY),
    makeEvent('zone_cluttered', { zoneId: 'z1' }, { nameZh: '餐区', score: 61 }, NOW - 1 * DAY),
    makeEvent('object_moved', { placementId: 'p1' }, { label: '办公椅', movedFt: 2, source: 'layout' }, NOW - 2 * DAY),
    makeEvent('object_moved', { placementId: 'p1' }, { label: '办公椅', movedFt: 3, source: 'scan' }, NOW - 1 * DAY),
    makeEvent('tidy_done', { zoneId: 'z1' }, {}, NOW - 9 * DAY),
    makeEvent('layout_rejected', { signature: 's' }, {}, NOW),
    { garbage: true }, // 坏事件不拖垮派生
  ]
  const s = summarizeEvents(events, { now: NOW })
  assert.equal(s.total, 6)
  assert.equal(s.recurrence.length, 1)
  assert.equal(s.frequentMovers.length, 1, '挪 ≥2 次才上榜')
  assert.equal(s.rejectedCount, 1)
  assert.equal(s.tidyDoneCount, 1)
  assert.equal(s.sinceDays, 9)
}

console.log('event-derive-unit: all assertions passed')
