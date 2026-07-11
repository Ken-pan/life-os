import { browser } from '$app/environment'
import {
  applyResolvedTheme,
  bindSystemThemeChange,
  resolveTheme,
} from '@life-os/theme'
import { getProgramById, DEFAULT_PROGRAM_ID } from './data/program.js'
import { EX_BY_ID, EX_ID_ALIASES, resolveExerciseId } from './data/exercises.js'
import { effectiveDone, migrateLogEntry } from './logs.js'
import {
  equipType,
  plateConfigFor,
  activePlatesFor,
  allPlatesFor,
  isAllowedEquipMode,
  recommendEquipMode,
} from './tools/calculators.js'
import { t } from './i18n/index.js'

/** @typedef {import('@life-os/contracts/appearance').ColorSchemePreference} ColorSchemePreference */
/** @typedef {import('@life-os/contracts/appearance').ThemePreferenceModel} ThemePreferenceModel */

/* ═══════════════ STATE (Svelte 5 runes + localStorage) ═══════════════ */
const SKEY = 'fitos_v2'
export const SCHEMA_VERSION = 6

/** 本地时区的 YYYY-MM-DD（避免 UTC 偏移导致晚间训练记到「明天」） */
export const dateKeyOf = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const todayKey = () => dateKeyOf(new Date())

const defaultState = () => ({
  schemaVersion: SCHEMA_VERSION,
  activeProgramId: DEFAULT_PROGRAM_ID,
  settings: {
    unit: 'lbs',
    sound: true,
    accent: 'auto',
    theme: 'dark',
    locale: 'zh',
    lockPortraitOnPhone: true,
    logDetail: 'quick',
    notifyRest: true,
    barWeights: {},
    plateInventory: null,
    plateCollarLbs: 0,
    plateCollarKg: 0,
    equipModes: {},
  },
  weights: {},
  logs: {},
  rotation: { next: 0, history: [], lastDeload: null, phaseStart: null },
  lastDay: null,
  sessionMeta: {},
  programOverrides: {},
})

function migrateLogs(logs, programId = DEFAULT_PROGRAM_ID) {
  const out = {}
  if (!logs || typeof logs !== 'object') return out
  const days = getProgramById(programId).days

  Object.entries(logs).forEach(([k, dayLog]) => {
    if (!dayLog || typeof dayLog !== 'object') return
    const [, dayId] = k.split('|')
    const day = days[dayId]
    out[k] = {}

    Object.entries(dayLog).forEach(([exId, val]) => {
      const ex = day?.ex?.find((e) => e.id === exId)
      const totalSets = ex?.sets ?? 12
      out[k][exId] = migrateLogEntry(val, totalSets)
    })
  })
  return out
}

function migrateWeights(weights) {
  const out = { ...weights }
  for (const [oldId, newId] of Object.entries(EX_ID_ALIASES)) {
    if (out[oldId] === undefined) continue
    if (out[newId] === undefined) out[newId] = out[oldId]
    delete out[oldId]
  }
  return out
}

function migrateProgramOverrides(overrides) {
  const out = {}
  for (const [key, val] of Object.entries(overrides || {})) {
    const newKey = key.startsWith('day:') ? key : resolveExerciseId(key)
    let newVal = val
    if (key.startsWith('day:') && val && typeof val === 'object') {
      newVal = { ...val }
      if (Array.isArray(newVal.addedEx)) {
        newVal.addedEx = [
          ...new Set(newVal.addedEx.map((id) => resolveExerciseId(id))),
        ]
      }
      if (Array.isArray(newVal.exOrder)) {
        newVal.exOrder = newVal.exOrder.map((id) => resolveExerciseId(id))
      }
    }
    if (newVal?.pairWith) {
      newVal = { ...newVal, pairWith: resolveExerciseId(newVal.pairWith) }
    }
    if (!key.startsWith('day:') && out[newKey])
      out[newKey] = { ...out[newKey], ...newVal }
    else out[newKey] = newVal
  }
  return out
}

function migrateExerciseIds(data) {
  data.weights = migrateWeights(data.weights || {})
  data.programOverrides = migrateProgramOverrides(data.programOverrides || {})
  if (data.logs) {
    const migrated = {}
    Object.entries(data.logs).forEach(([k, dayLog]) => {
      if (!dayLog || typeof dayLog !== 'object') {
        migrated[k] = dayLog
        return
      }
      migrated[k] = {}
      Object.entries(dayLog).forEach(([exId, val]) => {
        migrated[k][resolveExerciseId(exId)] = val
      })
    })
    data.logs = migrated
  }
  return data
}

function migrate(raw) {
  const base = defaultState()
  if (!raw || typeof raw !== 'object') return base
  const data = { ...base, ...raw }
  if (!data.settings) data.settings = base.settings
  data.settings = { ...base.settings, ...data.settings }
  if (!data.weights) data.weights = {}
  if (!data.rotation) data.rotation = base.rotation
  if (data.rotation.lastDeload === undefined) data.rotation.lastDeload = null
  if (data.rotation.phaseStart === undefined) data.rotation.phaseStart = null
  if (!data.sessionMeta) data.sessionMeta = {}
  if (!data.programOverrides) data.programOverrides = {}
  if (!data.activeProgramId) data.activeProgramId = DEFAULT_PROGRAM_ID
  if ((raw.schemaVersion ?? 0) < 5) migrateExerciseIds(data)
  data.logs = migrateLogs(data.logs, data.activeProgramId)
  data.schemaVersion = SCHEMA_VERSION
  return data
}

function load() {
  if (!browser) return defaultState()
  try {
    const r = JSON.parse(localStorage.getItem(SKEY) ?? 'null')
    if (r && r.settings) return migrate(r)
  } catch (e) {
    /* corrupted data → fall back to defaults */
  }
  return defaultState()
}

/** 导入或恢复状态（replace = 覆盖，merge = 合并日志/重量/历史） */
export function applyState(data, mode = 'replace') {
  const next = migrate(data)
  if (mode === 'merge') {
    S.settings = { ...next.settings, ...S.settings }
    S.weights = { ...next.weights, ...S.weights }
    const mergedLogs = { ...(S.logs || {}) }
    for (const [k, dayLog] of Object.entries(next.logs || {})) {
      mergedLogs[k] = mergedLogs[k] ? { ...dayLog, ...mergedLogs[k] } : dayLog
    }
    S.logs = mergedLogs
    S.sessionMeta = { ...next.sessionMeta, ...S.sessionMeta }
    S.programOverrides = { ...S.programOverrides, ...next.programOverrides }
    if (next.activeProgramId) S.activeProgramId = next.activeProgramId
    if (next.rotation?.history?.length) {
      const seen = new Set()
      const merged = [...(S.rotation.history || []), ...next.rotation.history]
        .filter((h) => {
          const k = `${h.date}|${h.dayId}`
          if (seen.has(k)) return false
          seen.add(k)
          return true
        })
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-60)
      S.rotation = {
        ...S.rotation,
        history: merged,
        next: next.rotation.next ?? S.rotation.next,
      }
    }
    if (next.lastDay) S.lastDay = next.lastDay
  } else {
    S.settings = next.settings
    S.weights = next.weights
    S.logs = next.logs
    S.rotation = next.rotation
    S.lastDay = next.lastDay
    S.sessionMeta = next.sessionMeta
    S.programOverrides = next.programOverrides ?? {}
    S.activeProgramId = next.activeProgramId ?? DEFAULT_PROGRAM_ID
  }
}

/** 全局响应式状态，跨组件共享 */
export const S = $state(load())

export function save() {
  if (browser) localStorage.setItem(SKEY, JSON.stringify(S))
}

/** 重置全部数据（保持引用，逐键替换以维持响应式） */
export function resetAll() {
  const fresh = defaultState()
  S.schemaVersion = fresh.schemaVersion
  S.settings = fresh.settings
  S.weights = fresh.weights
  S.logs = fresh.logs
  S.rotation = fresh.rotation
  S.lastDay = fresh.lastDay
  S.sessionMeta = fresh.sessionMeta
  S.programOverrides = fresh.programOverrides
  S.activeProgramId = fresh.activeProgramId
  save()
}

export function activeProgramId() {
  return S.activeProgramId || DEFAULT_PROGRAM_ID
}

/* ═══════════════ HELPERS ═══════════════ */
export function exWeight(ex) {
  const id = resolveExerciseId(ex.id)
  if (S.weights[id] !== undefined) return S.weights[id]
  if (S.weights[ex.id] !== undefined) return S.weights[ex.id]
  return ex.w
}

export function exUnit(ex) {
  const perSide =
    (ex.unit && /侧/.test(ex.unit)) || equipType(ex) === 'dumbbell'
  if (perSide)
    return S.settings.unit === 'kg'
      ? t('units.kgPerSide')
      : t('units.lbsPerSide')
  if (ex.unit && !/LBS|KG/i.test(ex.unit)) return ex.unit
  return S.settings.unit.toUpperCase()
}

/** 杆重记忆键：按动作 + 加载方式分存，避免杠铃/史密斯串杆重 */
function barWeightKey(exId, equip) {
  return `${resolveExerciseId(exId)}:${equip}`
}

/** 某动作当前加载方式（可覆盖目录默认 equip） */
export function exEquipMode(ex) {
  if (!ex) return null
  const id = resolveExerciseId(ex.id)
  const saved = S.settings.equipModes?.[id]
  if (saved && isAllowedEquipMode(id, saved)) return saved
  return equipType(ex)
}

/** @param {string} exId @param {import('./tools/calculators.js').EquipType} equip */
export function setExEquipMode(exId, equip) {
  const id = resolveExerciseId(exId)
  if (!isAllowedEquipMode(id, equip)) return
  if (!S.settings.equipModes) S.settings.equipModes = {}
  S.settings.equipModes[id] = equip
  save()
}

/** 用户是否曾显式选择过该动作的加载方式 */
export function hasSavedEquipMode(exId) {
  const id = resolveExerciseId(exId)
  return Boolean(S.settings.equipModes?.[id])
}

/** @param {object} ex @param {number} weightLbs 存储单位 LBS */
export function recommendEquipFor(ex, weightLbs) {
  return recommendEquipMode(ex, weightLbs, {
    equipModes: S.settings.equipModes,
    barWeights: S.settings.barWeights,
  })
}

/** 某动作记忆的杆重（display 单位）；无记忆时用该器械类型默认杆重 */
export function exBarWeight(ex, unit = S.settings.unit, equipOverride) {
  const equip = equipOverride ?? exEquipMode(ex)
  const cfg = plateConfigFor(ex, unit, equip)
  if (!cfg) return null
  const id = resolveExerciseId(ex.id)
  const keyed = S.settings.barWeights?.[barWeightKey(id, equip)]
  if (keyed && keyed.u === unit) return keyed.v
  // 兼容旧版：仅按动作 id 存过杠铃杆重
  if (equip === 'barbell' || equip === equipType(ex)) {
    const legacy = S.settings.barWeights?.[id] ?? S.settings.barWeights?.[ex.id]
    if (legacy && legacy.u === unit) return legacy.v
  }
  return cfg.defaultBar
}

/** @param {string} exId @param {'lbs'|'kg'} unit @param {number} v @param {import('./tools/calculators.js').EquipType} equip */
export function setExBarWeight(exId, unit, v, equip) {
  if (!equip) return
  if (!S.settings.barWeights) S.settings.barWeights = {}
  S.settings.barWeights[barWeightKey(exId, equip)] = { u: unit, v }
  save()
}

/** @param {'lbs' | 'kg'} unit */
export function plateInventoryFor(unit) {
  const inv = S.settings.plateInventory?.[unit]
  return activePlatesFor(unit, inv)
}

/** @param {'lbs' | 'kg'} unit @param {number} plate */
export function isPlateEnabled(unit, plate) {
  const inv = S.settings.plateInventory?.[unit]
  if (!inv) return true
  return inv[plate] !== false
}

/** @param {'lbs' | 'kg'} unit @param {number} plate @param {boolean} enabled */
export function setPlateEnabled(unit, plate, enabled) {
  if (!S.settings.plateInventory)
    S.settings.plateInventory = { lbs: {}, kg: {} }
  if (!S.settings.plateInventory[unit]) {
    S.settings.plateInventory[unit] = Object.fromEntries(
      allPlatesFor(unit).map((p) => [p, true]),
    )
  }
  S.settings.plateInventory[unit][plate] = enabled
  save()
}

/** @param {'lbs' | 'kg'} unit */
export function plateCollarFor(unit) {
  return unit === 'kg'
    ? (S.settings.plateCollarKg ?? 0)
    : (S.settings.plateCollarLbs ?? 0)
}

/** @param {'lbs' | 'kg'} unit @param {number} v */
export function setPlateCollar(unit, v) {
  if (unit === 'kg') S.settings.plateCollarKg = Math.max(0, v)
  else S.settings.plateCollarLbs = Math.max(0, v)
  save()
}

export function displayWeight(w) {
  if (S.settings.unit === 'kg') return Math.round(w * 0.4536 * 2) / 2
  return w
}

export const ORDER = () => getProgramById(activeProgramId()).rotationOrder

export function todayDayId() {
  return ORDER()[(S.rotation.next || 0) % ORDER().length]
}

/**
 * 某日完成度。跳过的动作按「实际做过的组」中性计入（done 与 total 同加），
 * 既不拉低完成率，也不虚报成满组。
 */
export function dayDone(dateK, day) {
  if (!day.ex) return { done: 0, total: 0, pct: 0 }
  const log = S.logs[dateK + '|' + day.id] || {}
  let done = 0
  let total = 0
  day.ex.forEach((e) => {
    const entry = log[e.id]
    const eff = effectiveDone(entry, e.sets)
    const skipped = entry && typeof entry === 'object' && entry.skipped
    done += eff
    total += skipped ? eff : e.sets
  })
  const plannedIds = new Set(day.ex.map((e) => e.id))
  Object.entries(log).forEach(([exId, entry]) => {
    if (plannedIds.has(exId)) return
    const performed = EX_BY_ID[resolveExerciseId(exId)]
    if (!performed) return
    const eff = effectiveDone(entry, performed.sets)
    done += eff
    total += entry?.skipped ? eff : performed.sets
  })
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 }
}

/** 找某一天最近一次有记录的训练 */
export function lastSessionForDay(dayId) {
  let best = null
  Object.keys(S.logs).forEach((k) => {
    const [date, did] = k.split('|')
    if (did !== dayId) return
    const any = Object.values(S.logs[k]).some(
      (v) => effectiveDone(v, Infinity) > 0,
    )
    if (any && (!best || date > best)) best = date
  })
  if (!best) return null
  const day = getProgramById(activeProgramId()).days[dayId]
  return { date: best, ...dayDone(best, day) }
}

/** 完成训练 → 记录 + 推进轮换指针（附加训练如核心不改变轮换） */
export function completeDay(dayId) {
  const t = todayKey()
  S.rotation.history = (S.rotation.history || []).filter(
    (h) => !(h.date === t && h.dayId === dayId),
  )
  S.rotation.history.push({ date: t, dayId })
  if (S.rotation.history.length > 60)
    S.rotation.history = S.rotation.history.slice(-60)
  if (ORDER().includes(dayId)) {
    S.rotation.next = (ORDER().indexOf(dayId) + 1) % ORDER().length
  }
  save()
}

export function daysBetween(d1, d2) {
  return Math.round((new Date(d2) - new Date(d1)) / 86400000)
}

/** 训练频次统计：基于实际有记录的日期（跳过的动作不算真实训练） */
export function sessionStats() {
  const dates = new Set()
  Object.keys(S.logs).forEach((k) => {
    if (Object.values(S.logs[k]).some((v) => effectiveDone(v, Infinity) > 0))
      dates.add(k.split('|')[0])
  })
  const arr = [...dates].sort()
  const today = todayKey()
  const week7 = arr.filter(
    (d) => daysBetween(d, today) >= 0 && daysBetween(d, today) < 7,
  ).length
  const last = arr.length ? arr[arr.length - 1] : null
  return {
    total: arr.length,
    week7,
    last,
    daysSince: last ? daysBetween(last, today) : null,
  }
}

/** 估算训练时长（分钟） */
export function estMinutes(day) {
  if (!day.ex) return 0
  let sec = 0
  day.ex.forEach((e) => {
    sec += e.sets * (40 + e.rest)
  })
  if (day.warmup) sec += 300
  return Math.round(sec / 60)
}

export function fmtRest(sec) {
  return sec >= 60
    ? sec % 60 === 0
      ? `${sec / 60} min`
      : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
    : `${sec} sec`
}

export function setExWeight(exId, v) {
  const id = resolveExerciseId(exId)
  const val = isNaN(v) ? 0 : v
  S.weights[id] = val
  for (const [oldId, newId] of Object.entries(EX_ID_ALIASES)) {
    if (newId === id && oldId !== id) delete S.weights[oldId]
  }
  save()
}

export function clearToday() {
  ORDER().forEach((did) => {
    const k = todayKey() + '|' + did
    delete S.logs[k]
    if (S.sessionMeta) delete S.sessionMeta[k]
  })
  save()
}

/* ═══════════════ THEME (Life OS 统一) ═══════════════
 * Fitness persists only `settings.theme`; implicit brand `fitness`, ambient `coverMedia`.
 */
const THEME_APPLY_OPTIONS = {
  themeColorFallback: { light: '#f4f4f3', dark: '#0d0d0e' },
}

/** @returns {'light'|'dark'} */
export function resolveAppTheme() {
  return resolveTheme(S.settings.theme, 'dark')
}

export function applyTheme() {
  if (!browser) return
  applyResolvedTheme(resolveAppTheme(), THEME_APPLY_OPTIONS)
}

/** @deprecated 使用 applyTheme；保留别名避免外部引用断裂 */
export function syncThemeColor() {
  applyTheme()
}

/** @returns {() => void} */
export function bindAppThemeSystemChange() {
  return bindSystemThemeChange(
    () => S.settings.theme,
    (resolved) => applyResolvedTheme(resolved, THEME_APPLY_OPTIONS),
    'dark',
  )
}
