/**
 * 事件流派生(能力17)—— 事件是**事实的追加日志**,派生是从日志里读出的
 * 长期结论(纯函数,无 IO,node 单测直接跑;IO 在 lib/event-log.js)。
 *
 * 原则(按规格):每次扫描、用户纠正、整理都是事件,不覆盖旧状态;
 * 系统学的是**行为事实**(哪个区反复变乱、哪件家具总被挪、哪些建议
 * 被否),不是无依据的人格画像。
 *
 * 事件形状(为将来上云准备,append-only、无更新语义):
 *   { id, ts, type, subject: { placementId?|itemId?|zoneId?|zoneCode?|signature? },
 *     data: {...},  v: 1 }
 */

/** 认识的事件类型(白名单;未知类型进日志但不参与派生) */
export const EVENT_TYPES = Object.freeze([
  // 扫描(跨扫描身份的结论,不是原始帧)
  'object_observed', // 这次扫描确认了这件家具还在原位
  'object_moved', // 位置变了:data.movedFt, data.source: 'scan'|'layout'|'manual'
  'object_added',
  'object_removed',
  // 收纳
  'item_added',
  'item_removed',
  'item_moved', // 换储藏区
  'item_level_set', // 指定第几层
  'container_synced', // 柜内实测挂上储藏区
  // 整理与布局
  'tidy_done', // 完成一步整理任务(subject.zoneId)
  'zone_cluttered', // 某区杂乱分越线(subject.zoneId, data.score)
  'layout_applied', // 应用了一套布局方案
  'layout_rejected', // 用户忽略了一套方案(subject.signature)
])

const TYPE_SET = new Set(EVENT_TYPES)

let seq = 0

/**
 * 造一条事件(id 确定性递增后缀,同毫秒多条不撞)。
 * @param {string} type
 * @param {Record<string, string>} [subject]
 * @param {Record<string, any>} [data]
 * @param {number} [ts]
 */
export function makeEvent(type, subject = {}, data = {}, ts = Date.now()) {
  seq = (seq + 1) % 10000
  return {
    id: `ev-${ts}-${String(seq).padStart(4, '0')}`,
    ts,
    type,
    subject,
    data,
    v: 1,
  }
}

/** 事件是否结构合法(坏事件跳过,不拖垮派生) */
export function isValidEvent(e) {
  return Boolean(
    e &&
      typeof e === 'object' &&
      typeof e.id === 'string' &&
      Number.isFinite(e.ts) &&
      typeof e.type === 'string',
  )
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 每件家具的「上次被扫描确认」时刻(object_observed/object_moved 的 scan 源)。
 * 「东西在哪里」回答里的可信度基础:确认越新越可信。
 * @param {any[]} events
 * @returns {Map<string, number>} placementId → ts
 */
export function lastObservedAt(events) {
  const out = new Map()
  for (const e of events) {
    if (!isValidEvent(e)) continue
    if (e.type !== 'object_observed' && !(e.type === 'object_moved' && e.data?.source === 'scan'))
      continue
    const id = e.subject?.placementId
    if (!id) continue
    if ((out.get(id) ?? 0) < e.ts) out.set(id, e.ts)
  }
  return out
}

/**
 * 最常被挪动的家具(手动拖 + 布局方案 + 扫描发现真挪了)。
 * 「这件东西总在漂」= 它可能没有合理的固定位置。
 * @param {any[]} events
 * @returns {Array<{ placementId: string, label: string, count: number, totalFt: number, lastTs: number }>}
 */
export function moveStats(events) {
  /** @type {Map<string, { placementId: string, label: string, count: number, totalFt: number, lastTs: number }>} */
  const by = new Map()
  for (const e of events) {
    if (!isValidEvent(e) || e.type !== 'object_moved') continue
    const id = e.subject?.placementId
    if (!id) continue
    const cur = by.get(id) ?? {
      placementId: id,
      label: e.data?.label ?? id,
      count: 0,
      totalFt: 0,
      lastTs: 0,
    }
    cur.count += 1
    cur.totalFt += Number(e.data?.movedFt) || 0
    cur.lastTs = Math.max(cur.lastTs, e.ts)
    if (e.data?.label) cur.label = e.data.label
    by.set(id, cur)
  }
  return [...by.values()].sort((a, b) => b.count - a.count)
}

/**
 * 反复变乱的区 + 根因线索(规格能力17的核心推导):
 * - times: 窗口内变乱几次
 * - afterTidy: 其中几次发生在该区整理完成后 7 天内 ——
 *   整理了还反弹 = 问题不是「没整理」,是收纳位置/习惯不匹配
 * @param {any[]} events
 * @param {{ now?: number, windowDays?: number, reboundDays?: number }} [opts]
 */
export function clutterRecurrence(events, opts = {}) {
  const now = opts.now ?? Date.now()
  const windowMs = (opts.windowDays ?? 30) * DAY_MS
  const reboundMs = (opts.reboundDays ?? 7) * DAY_MS
  const clutter = []
  const tidy = []
  for (const e of events) {
    if (!isValidEvent(e) || now - e.ts > windowMs) continue
    if (e.type === 'zone_cluttered' && e.subject?.zoneId) clutter.push(e)
    if (e.type === 'tidy_done' && e.subject?.zoneId) tidy.push(e)
  }
  /** @type {Map<string, { zoneId: string, nameZh: string, times: number, afterTidy: number, lastTs: number }>} */
  const by = new Map()
  for (const e of clutter) {
    const zid = e.subject.zoneId
    const cur = by.get(zid) ?? {
      zoneId: zid,
      nameZh: e.data?.nameZh ?? zid,
      times: 0,
      afterTidy: 0,
      lastTs: 0,
    }
    cur.times += 1
    cur.lastTs = Math.max(cur.lastTs, e.ts)
    if (e.data?.nameZh) cur.nameZh = e.data.nameZh
    const rebound = tidy.some(
      (t) => t.subject.zoneId === zid && e.ts > t.ts && e.ts - t.ts <= reboundMs,
    )
    if (rebound) cur.afterTidy += 1
    by.set(zid, cur)
  }
  return [...by.values()]
    .filter((z) => z.times >= 2)
    .sort((a, b) => b.times - a.times)
}

/**
 * 被用户忽略过的布局方案签名 → 忽略时刻。
 * 同款方案不再重复推荐 —— 「系统学习你否决过什么」的最小实现。
 * @param {any[]} events
 * @returns {Map<string, number>}
 */
export function rejectedSignatures(events) {
  const out = new Map()
  for (const e of events) {
    if (!isValidEvent(e) || e.type !== 'layout_rejected') continue
    const sig = e.subject?.signature
    if (sig) out.set(sig, Math.max(out.get(sig) ?? 0, e.ts))
  }
  return out
}

/**
 * /tidy「长期观察」用的洞察汇总。
 * @param {any[]} events
 * @param {{ now?: number }} [opts]
 */
export function summarizeEvents(events, opts = {}) {
  const now = opts.now ?? Date.now()
  const valid = events.filter(isValidEvent)
  const firstTs = valid.length ? Math.min(...valid.map((e) => e.ts)) : null
  const moved = moveStats(valid).filter((m) => m.count >= 2)
  return {
    total: valid.length,
    sinceDays: firstTs === null ? 0 : Math.max(0, Math.round((now - firstTs) / DAY_MS)),
    recurrence: clutterRecurrence(valid, { now }),
    frequentMovers: moved.slice(0, 3),
    rejectedCount: rejectedSignatures(valid).size,
    tidyDoneCount: valid.filter((e) => e.type === 'tidy_done').length,
  }
}

/**
 * 「某区最近 N 天内是否已记过变乱」—— zone_cluttered 的去抖:
 * 分数在阈值上方波动不该刷屏,一周记一次就够画出「反复」曲线。
 * @param {any[]} events
 * @param {string} zoneId
 * @param {number} now
 * @param {number} [debounceDays]
 */
export function recentlyMarkedCluttered(events, zoneId, now, debounceDays = 7) {
  const cutoff = now - debounceDays * DAY_MS
  return events.some(
    (e) =>
      isValidEvent(e) &&
      e.type === 'zone_cluttered' &&
      e.subject?.zoneId === zoneId &&
      e.ts >= cutoff,
  )
}

export function isKnownEventType(type) {
  return TYPE_SET.has(type)
}
