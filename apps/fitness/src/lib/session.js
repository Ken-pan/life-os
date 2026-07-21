import { browser } from '$app/environment'
import { getProgram } from './programRuntime.js'
import {
  S,
  save,
  todayKey,
  exWeight,
  setExWeight,
  ORDER,
} from './state.svelte.js'
import { effectiveDone, normalizeExLog } from './logs.js'
import { EX_BY_ID, resolveExerciseId } from './data/exercises.js'
import { buildSessionQueue } from './sessionQueue.js'
import { carryForwardWeight, carriesStartingWeight } from './weightMemory.js'

/** 某条动作记录是否有真实训练痕迹(做过组或明确跳过) */
export function exLogHasActivity(entry) {
  if (!entry || typeof entry !== 'object')
    return typeof entry === 'number' && entry > 0
  if (Array.isArray(entry.sets) && entry.sets.some(Boolean)) return true
  if ((entry.done ?? 0) > 0) return true
  return Boolean(entry.skipped)
}

/** 某次会话(date|dayId)是否有真实训练痕迹 */
export function sessionHasActivity(key) {
  const dayLog = S.logs[key]
  if (!dayLog) return false
  return Object.values(dayLog).some(exLogHasActivity)
}

/** 会话内所有已记录组的时间戳(升序) */
function sessionTimestamps(key) {
  const out = []
  Object.values(S.logs[key] || {}).forEach((entry) => {
    if (entry?.startedAt) out.push(entry.startedAt)
    if (Array.isArray(entry?.sets)) {
      entry.sets.forEach((s) => {
        if (s?.ts) out.push(s.ts)
      })
    }
  })
  return out.sort()
}

/**
 * 启动时的记录自愈(只处理今天以前的数据):
 *   1. 幽灵会话 → 删除:进过训练页但一组没练的,清掉空的 sessionMeta / logs
 *   2. 未收尾的训练 → 自动补记:有真实组记录但没点「完成训练」的,
 *      用最后一组时间补 endedAt、写入轮换历史,若是最近一次训练则推进轮换指针
 * 返回 { finalized, pruned }
 */
export function finalizeStaleSessions() {
  const today = todayKey()
  const keys = new Set([
    ...Object.keys(S.logs || {}),
    ...Object.keys(S.sessionMeta || {}),
  ])
  let finalized = 0
  let pruned = 0
  const newHistory = []

  for (const key of keys) {
    const [date, dayId] = key.split('|')
    if (!date || !dayId || date >= today) continue

    if (!sessionHasActivity(key)) {
      if (S.sessionMeta?.[key]) delete S.sessionMeta[key]
      if (S.logs?.[key]) delete S.logs[key]
      pruned += 1
      continue
    }

    const ts = sessionTimestamps(key)
    if (!S.sessionMeta) S.sessionMeta = {}
    if (!S.sessionMeta[key]) S.sessionMeta[key] = {}
    const meta = S.sessionMeta[key]
    let touched = false
    if (!meta.startedAt && ts.length) {
      meta.startedAt = ts[0]
      touched = true
    }
    if (!meta.endedAt) {
      meta.endedAt = ts[ts.length - 1] ?? meta.startedAt ?? null
      touched = true
    }

    const history = S.rotation.history || []
    if (!history.some((h) => h.date === date && h.dayId === dayId)) {
      newHistory.push({ date, dayId })
      touched = true
    }
    if (touched) finalized += 1
  }

  if (newHistory.length) {
    const merged = [...(S.rotation.history || []), ...newHistory]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-60)
    const prevLatest =
      (S.rotation.history || [])
        .map((h) => h.date)
        .sort()
        .pop() ?? ''
    S.rotation.history = merged

    // 只有补记的训练比已知的最近一次更新时,才推进轮换指针(不覆盖用户手动设置)
    const latestNew = newHistory
      .sort((a, b) => a.date.localeCompare(b.date))
      .pop()
    if (latestNew.date >= prevLatest && ORDER().includes(latestNew.dayId)) {
      S.rotation.next = (ORDER().indexOf(latestNew.dayId) + 1) % ORDER().length
    }
  }

  if (finalized || pruned) save()
  return { finalized, pruned }
}

/** 从 reps 字符串解析目标区间，如 "6–8" → { min: 6, mid: 7, max: 8 } */
export function parseRepsTarget(reps) {
  if (!reps) return { min: 8, mid: 8, max: 8 }
  const nums = String(reps).match(/\d+/g)
  if (!nums?.length) return { min: 8, mid: 8, max: 8 }
  const values = nums.map(Number)
  const min = values[0]
  const max = values.length > 1 ? values[values.length - 1] : min
  return { min, mid: Math.round((min + max) / 2), max }
}

export function parseTimedTarget(reps) {
  if (!reps) return null
  const text = String(reps).trim().toLowerCase()
  const clock = text.match(/(\d+):([0-5]?\d)/)
  if (clock) return Number(clock[1]) * 60 + Number(clock[2])

  // 单位必须紧跟数字（如 "40–60s"、"1min"），避免把 "10 reps" 之类误判为计时动作
  const timed = text.match(
    /(\d+)\s*(min(?:ute)?s?|secs?|seconds?|分钟|秒|m|s)(?![a-z0-9])/,
  )
  if (!timed) return null

  const value = Number(timed[1])
  const multiplier = /^(m|min|mins|minute|minutes|分钟)$/.test(timed[2])
    ? 60
    : 1
  const seconds = value * multiplier
  return seconds > 0 ? seconds : null
}

export function sessionKey(dayId, dateK = todayKey()) {
  return `${dateK}|${dayId}`
}

export function getDayLog(dayId, dateK = todayKey()) {
  return S.logs[sessionKey(dayId, dateK)] || {}
}

export function getExLog(dayId, exId, totalSets, dateK = todayKey()) {
  const dayLog = getDayLog(dayId, dateK)
  return normalizeExLog(dayLog[exId], totalSets)
}

function listedSubstitute(day, plannedEx, substituteId) {
  const id = resolveExerciseId(substituteId)
  if (!id || id === plannedEx.id || !EX_BY_ID[id]) return null
  if (!plannedEx.alternatives?.some((alt) => resolveExerciseId(alt.id) === id))
    return null
  return EX_BY_ID[id]
}

/** Canonical persisted Focus queue, with valid substitutions replacing planned slots. */
export function getSessionExercises(dayId, dateK = todayKey()) {
  const day = getProgram().days[dayId]
  if (!day?.ex) return []
  const dayLog = getDayLog(dayId, dateK)
  return buildSessionQueue(dayId, day.ex, dayLog, EX_BY_ID, resolveExerciseId)
}

export function getSessionExercise(dayId, exId, dateK = todayKey()) {
  const id = resolveExerciseId(exId)
  return (
    getSessionExercises(dayId, dateK).find(
      (ex) => ex.slotKey === exId || resolveExerciseId(ex.id) === id,
    ) ?? null
  )
}

function writeExLog(dayId, exId, entry, dateK = todayKey()) {
  const k = sessionKey(dayId, dateK)
  if (!S.logs[k]) S.logs[k] = {}
  S.logs[k][exId] = entry
  save()
}

/** 确保 session 元数据存在 */
export function ensureSession(dayId, dateK = todayKey()) {
  const k = sessionKey(dayId, dateK)
  if (!S.sessionMeta) S.sessionMeta = {}
  if (!S.sessionMeta[k]) {
    S.sessionMeta[k] = { startedAt: new Date().toISOString() }
    save()
  }
  return S.sessionMeta[k]
}

/** 下一待做组索引（1-based），全部完成返回 null */
export function getCurrentSet(dayId, exId, totalSets, dateK = todayKey()) {
  const log = getExLog(dayId, exId, totalSets, dateK)
  if (log.skipped) return null
  if (log.done >= totalSets) return null
  return log.done + 1
}

/**
 * Continuity resume: ensure log.done is far enough that getCurrentSet === targetSet.
 * Default never reduces progress. With `pin: true` (Continuity deep-link), also trims
 * ahead-of-target logs so a stale cloud merge cannot skip the handoff set.
 * @param {string} dayId
 * @param {string} exId
 * @param {number} targetSet 1-based next set to perform
 * @param {string} [dateK]
 * @param {{ pin?: boolean }} [opts]
 * @returns {number | null} getCurrentSet after ensure
 */
export function ensureResumeCurrentSet(
  dayId,
  exId,
  targetSet,
  dateK = todayKey(),
  opts = {},
) {
  const pin = Boolean(opts?.pin)
  const target = Number(targetSet)
  if (!Number.isFinite(target) || target < 1) {
    const ex = getSessionExercise(dayId, exId, dateK)
    return ex ? getCurrentSet(dayId, exId, ex.sets, dateK) : null
  }
  const ex = getSessionExercise(dayId, exId, dateK)
  if (!ex) return null
  const needDone = Math.min(Math.floor(target) - 1, ex.sets)
  let log = getExLog(dayId, exId, ex.sets, dateK)

  if (pin && log.done > needDone) {
    while (log.sets.length < ex.sets) log.sets.push(null)
    for (let i = needDone; i < log.sets.length; i++) log.sets[i] = null
    log.done = needDone
    if (needDone <= 0) log.startedAt = null
    writeExLog(dayId, exId, log, dateK)
    log = getExLog(dayId, exId, ex.sets, dateK)
  }

  for (let s = log.done + 1; s <= needDone; s++) {
    const result = completeSet(dayId, exId, s, { reps: null }, dateK)
    if (!result.ok) break
    log = getExLog(dayId, exId, ex.sets, dateK)
  }
  return getCurrentSet(dayId, exId, ex.sets, dateK)
}

/** 训练进度：总组数、已完成、当前动作索引 */
export function getSessionProgress(dayId, dateK = todayKey()) {
  const day = getProgram().days[dayId]
  if (!day?.ex) return { done: 0, total: 0, pct: 0, exIndex: 0, exId: null }
  const queue = getSessionExercises(dayId, dateK)

  let done = 0
  let total = 0
  let exIndex = 0
  let foundCurrent = false

  for (let i = 0; i < queue.length; i++) {
    const ex = queue[i]
    const log = getExLog(dayId, ex.id, ex.sets, dateK)
    const plannedLog = ex.substitution
      ? getExLog(dayId, ex.plannedExerciseId, day.ex[i].sets, dateK)
      : null
    const preserved = plannedLog ? effectiveDone(plannedLog, day.ex[i].sets) : 0
    // 跳过的动作按实际做过的组中性计入（done/total 同加），不再伪装成满组
    const recorded = log.skipped
      ? Math.min(log.sets.filter(Boolean).length, ex.sets)
      : Math.min(log.done, ex.sets)
    done += recorded + preserved
    total += (log.skipped ? recorded : ex.sets) + preserved
    if (!foundCurrent && !log.skipped && log.done < ex.sets) {
      exIndex = i
      foundCurrent = true
    }
  }

  const allDone = queue.every((ex) => {
    const l = getExLog(dayId, ex.id, ex.sets, dateK)
    return l.skipped || l.done >= ex.sets
  })

  const currentEx = queue[exIndex]

  return {
    done,
    total,
    pct: total ? Math.round((done / total) * 100) : 0,
    exIndex: allDone ? queue.length - 1 : exIndex,
    exId: currentEx?.id ?? null,
    allDone,
  }
}

/** 完成一组（setIndex 为 1-based） */
export function completeSet(
  dayId,
  exId,
  setIndex,
  payload = {},
  dateK = todayKey(),
) {
  const ex = getSessionExercise(dayId, exId, dateK)
  if (!ex) return { ok: false }

  ensureSession(dayId, dateK)
  const log = getExLog(dayId, exId, ex.sets, dateK)
  const prev = log.done

  if (setIndex <= log.done) return { ok: false, prev, next: log.done }

  while (log.sets.length < ex.sets) log.sets.push(null)

  const setData = {
    reps: payload.reps ?? null,
    rir: payload.rir ?? null,
    weight: payload.weight ?? exWeight(ex),
    ts: new Date().toISOString(),
  }
  log.sets[setIndex - 1] = setData
  log.done = setIndex
  if (!log.startedAt) log.startedAt = setData.ts

  writeExLog(dayId, exId, log, dateK)
  // Straight sets carry each newly performed load immediately. Ramp/drop-style
  // schemes keep the currently selected load between sets, then restore their
  // first work-set load only after the exercise is complete for the next session.
  if (!carriesStartingWeight(ex) || setIndex >= ex.sets) {
    const nextWeight = carryForwardWeight(ex, log.sets)
    if (nextWeight != null) setExWeight(ex.id, nextWeight)
  }
  return { ok: true, prev, next: setIndex, setData, ex }
}

/** 撤销最后一组 */
export function undoLastSet(dayId, exId, dateK = todayKey()) {
  const ex = getSessionExercise(dayId, exId, dateK)
  if (!ex) return { ok: false }

  const log = getExLog(dayId, exId, ex.sets, dateK)
  if (log.done <= 0) return { ok: false }

  log.sets[log.done - 1] = null
  log.done -= 1
  writeExLog(dayId, exId, log, dateK)
  return { ok: true, next: log.done }
}

/** 切换某组完成状态（列表模式兼容） */
export function toggleSet(dayId, exId, i, dateK = todayKey()) {
  const ex = getSessionExercise(dayId, exId, dateK)
  if (!ex) return { prev: 0, next: 0 }

  const log = getExLog(dayId, exId, ex.sets, dateK)
  const cur = log.done
  const newVal = cur === i ? i - 1 : i

  if (newVal < cur) {
    for (let s = cur - 1; s >= newVal; s--) log.sets[s] = null
    log.done = newVal
    writeExLog(dayId, exId, log, dateK)
    return { prev: cur, next: newVal }
  }

  ensureSession(dayId, dateK)
  while (log.done < newVal) {
    log.done += 1
    log.sets[log.done - 1] = {
      reps: null,
      rir: null,
      weight: exWeight(ex),
      ts: new Date().toISOString(),
    }
  }
  writeExLog(dayId, exId, log, dateK)
  return { prev: cur, next: newVal, ex }
}

/** 跳过动作：保留已完成的组，不把剩余组伪装成已完成（统计口径以 skipped 标记为准） */
export function skipExercise(
  dayId,
  exId,
  reason,
  substituteId = null,
  dateK = todayKey(),
) {
  const day = getProgram().days[dayId]
  const ex = day?.ex?.find((e) => e.id === exId)
  if (!ex) return { ok: false, reason: 'missing_exercise' }

  const log = getExLog(dayId, exId, ex.sets, dateK)
  if (log.skipped) return { ok: false, reason: 'already_skipped' }
  const substitute = substituteId
    ? listedSubstitute(day, ex, substituteId)
    : null
  log.skipped = {
    reason,
    substituteId: substitute?.id ?? null,
    attribution: substitute ? { source: 'user_selection' } : null,
    ts: new Date().toISOString(),
  }
  writeExLog(dayId, exId, log, dateK)
  return {
    ok: true,
    substituted: Boolean(substitute),
    substitute: substitute ?? null,
    reason: substituteId && !substitute ? 'invalid_substitute' : null,
  }
}

/** 更新已完成的某一组数据 */
export function updateSetLog(
  dayId,
  exId,
  setIndex,
  payload,
  dateK = todayKey(),
) {
  const ex = getSessionExercise(dayId, exId, dateK)
  if (!ex) return false

  const log = getExLog(dayId, exId, ex.sets, dateK)
  if (setIndex < 1 || setIndex > log.done) return false

  const existing = log.sets[setIndex - 1] || {}
  log.sets[setIndex - 1] = {
    ...existing,
    reps: payload.reps ?? existing.reps ?? null,
    rir: payload.rir ?? existing.rir ?? null,
    weight: existing.weight ?? exWeight(ex),
    ts: existing.ts ?? new Date().toISOString(),
  }
  writeExLog(dayId, exId, log, dateK)
  return true
}

/** Focus 光标持久化 */
const FOCUS_KEY = 'fitos_focus'

export function loadFocusCursor(dayId) {
  if (!browser) return null
  try {
    const raw = JSON.parse(sessionStorage.getItem(FOCUS_KEY) ?? 'null')
    if (raw?.dayId === dayId) return raw.exIndex ?? 0
  } catch {
    /* ignore */
  }
  return null
}

export function saveFocusCursor(dayId, exIndex) {
  if (!browser) return
  sessionStorage.setItem(FOCUS_KEY, JSON.stringify({ dayId, exIndex }))
}

export function clearFocusCursor() {
  if (!browser) return
  sessionStorage.removeItem(FOCUS_KEY)
}

/** 获取某动作最近 N 次 session 记录 */
export function recentSessionsForEx(exId, limit = 3) {
  const sessions = []
  const keys = Object.keys(S.logs).sort().reverse()

  for (const k of keys) {
    const log = S.logs[k][exId]
    const [date, dayId] = k.split('|')
    const day = getProgram().days[dayId]
    const ex =
      day?.ex?.find((e) => e.id === exId) ?? EX_BY_ID[resolveExerciseId(exId)]
    if (!ex) continue
    if (!log || effectiveDone(log, ex.sets) === 0) continue

    const normalized = normalizeExLog(log, ex.sets)
    sessions.push({ date, dayId, log: normalized, ex })
    if (sessions.length >= limit) break
  }
  return sessions
}

/**
 * 历史记录的真实训练时长（分钟）。
 * 有组时间戳时用「首组 → 末组/endedAt」窗口，避免早上打开 Focus 却晚上才练
 * 把 sessionMeta.startedAt 算进数百分钟。未正常结束时用末组收口，
 * 不把时长拉到 Date.now()。无法确定时返回 null。
 */
export function recordedSessionMinutes(dayId, dateK) {
  const k = sessionKey(dayId, dateK)
  const meta = S.sessionMeta?.[k]
  const dayLog = S.logs[k] || {}

  const timestamps = []
  Object.values(dayLog).forEach((entry) => {
    if (entry?.startedAt) timestamps.push(entry.startedAt)
    if (Array.isArray(entry?.sets)) {
      entry.sets.forEach((s) => {
        if (s?.ts) timestamps.push(s.ts)
      })
    }
  })
  timestamps.sort()

  // Prefer first set clock — meta.startedAt can predate any real work by hours.
  const startIso = timestamps[0] ?? meta?.startedAt ?? null
  if (!startIso) return null

  let endIso = timestamps[timestamps.length - 1] ?? null
  if (meta?.endedAt) {
    const endedMs = new Date(meta.endedAt).getTime()
    const lastSetMs = endIso ? new Date(endIso).getTime() : 0
    if (!endIso || endedMs >= lastSetMs) endIso = meta.endedAt
  }
  if (!endIso) return null

  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  if (!(ms > 0)) return null
  return Math.max(1, Math.round(ms / 60000))
}

/** session 耗时（分钟）；有组记录时与 History 同一套窗口，避免未收尾会话膨胀 */
export function sessionDuration(dayId, dateK = todayKey()) {
  const recorded = recordedSessionMinutes(dayId, dateK)
  if (recorded != null) return recorded
  const k = sessionKey(dayId, dateK)
  const meta = S.sessionMeta?.[k]
  if (!meta?.startedAt) return null
  const start = new Date(meta.startedAt).getTime()
  const end = meta.endedAt ? new Date(meta.endedAt).getTime() : Date.now()
  return Math.max(1, Math.round((end - start) / 60000))
}

/** 离开 Focus 时调用:一组都没练的空会话直接丢弃,不留幽灵记录 */
export function abandonSessionIfEmpty(dayId, dateK = todayKey()) {
  const k = sessionKey(dayId, dateK)
  if (sessionHasActivity(k)) return false
  let touched = false
  if (S.sessionMeta?.[k]) {
    delete S.sessionMeta[k]
    touched = true
  }
  if (S.logs?.[k]) {
    delete S.logs[k]
    touched = true
  }
  if (touched) save()
  return touched
}

/** 进入 Focus 时调用：确保 session 存在，若曾结束则恢复计时 */
export function beginFocusSession(dayId, dateK = todayKey()) {
  const meta = ensureSession(dayId, dateK)
  const k = sessionKey(dayId, dateK)
  if (S.sessionMeta[k].endedAt) {
    delete S.sessionMeta[k].endedAt
    save()
  }
  return meta
}

/** session 起止时间戳（毫秒），用于全局训练计时；基于持久化的时间戳，离开/后台均不漂移 */
export function getSessionTimes(dayId, dateK = todayKey()) {
  const meta = S.sessionMeta?.[sessionKey(dayId, dateK)]
  if (!meta?.startedAt) return null
  return {
    startMs: new Date(meta.startedAt).getTime(),
    endMs: meta.endedAt ? new Date(meta.endedAt).getTime() : null,
  }
}

export function markSessionEnded(dayId, dateK = todayKey()) {
  const k = sessionKey(dayId, dateK)
  if (!S.sessionMeta) S.sessionMeta = {}
  if (!S.sessionMeta[k]) S.sessionMeta[k] = {}
  // 已结束则不再后移（避免在总结页停留的时间被算进训练时长）
  if (S.sessionMeta[k].endedAt) return
  S.sessionMeta[k].endedAt = new Date().toISOString()
  save()
}
