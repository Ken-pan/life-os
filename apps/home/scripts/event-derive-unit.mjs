/**
 * 事件流派生单测(能力17):追加日志 → 长期结论。
 * Usage: node apps/home/scripts/event-derive-unit.mjs
 */
import assert from 'node:assert/strict'
import {
  clutterRecurrence,
  daysAgoLabel,
  dimensionStats,
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

/* ---- 尺寸测量史:中位数 + 离散度,90° 互换归一 ---- */
{
  const events = [
    // 问题柜:三次扫描测出 30/34/58in(最后一次是包围盒抖动的离群值)
    makeEvent('object_observed', { placementId: 'p1' }, { wIn: 30, hIn: 16 }, NOW - 3 * DAY),
    makeEvent('object_observed', { placementId: 'p1' }, { wIn: 34, hIn: 15 }, NOW - 2 * DAY),
    makeEvent('object_moved', { placementId: 'p1' }, { source: 'scan', wIn: 58, hIn: 17 }, NOW - 1 * DAY),
    // 转着扫的桌子:第二次 w/h 互换,应归一回同一组
    makeEvent('object_observed', { placementId: 'p2' }, { wIn: 60, hIn: 30 }, NOW - 2 * DAY),
    makeEvent('object_observed', { placementId: 'p2' }, { wIn: 31, hIn: 59 }, NOW - 1 * DAY),
    // layout 源的挪动不带测量语义
    makeEvent('object_moved', { placementId: 'p3' }, { source: 'layout', wIn: 40, hIn: 20 }, NOW),
    // 无尺寸的观测不产生样本
    makeEvent('object_observed', { placementId: 'p4' }, {}, NOW),
  ]
  const stats = dimensionStats(events)
  const p1 = stats.get('p1')
  assert.equal(p1.samples, 3)
  assert.equal(p1.medianWIn, 34, '中位数扛住离群值(58 被压掉)')
  assert.equal(p1.spreadWIn, 28, '离散度如实报出(这件的尺寸别太当真)')
  const p2 = stats.get('p2')
  assert.equal(p2.samples, 2)
  assert.equal(p2.medianWIn, 59.5, '90° 互换归一后再取中位')
  assert.ok(!stats.has('p3'), 'layout 源不算测量')
  assert.ok(!stats.has('p4'), '无尺寸不产生样本')
}

/* ---- 相对时间人话 ---- */
{
  assert.equal(daysAgoLabel(NOW - 2 * 60 * 60 * 1000, NOW), '今天')
  assert.equal(daysAgoLabel(NOW - 1 * DAY - 1000, NOW), '昨天')
  assert.equal(daysAgoLabel(NOW - 3 * DAY, NOW), '3 天前')
  assert.equal(daysAgoLabel(0, NOW), '', '无时间戳不显示')
  assert.equal(daysAgoLabel(undefined, NOW), '')
}

console.log('event-derive-unit: all assertions passed')
