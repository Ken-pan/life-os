/**
 * 功能真源 —— 「这件家具/表面**实际**做什么」的单一权威(规范 §1.1)。纯函数,无 IO。
 *
 * 铁律(评审 B1):**意图与观察分离**。
 * - effective 用途只由用户/文档/扫描证据解析,**照片不在链里**:照片只能说明
 *   「目前里面出现了什么」,不能重写用户确认的长期职责。用户说玻璃柜是摄影柜,
 *   几天后照片里出现按摩枪,系统只提示 drift、绝不把它重定义成康复设备柜。
 * - 优先链:用户 > 种子导入(待确认) > 文档 > 扫描 > 猜测(按 kind,即今天的唯一行为)。
 *
 * i18n:本模块只吐 key / reasonCode,不吐中文 —— 显示文案在 routes 层(评审 §4)。
 */

import { canonicalPlacementKind } from './placements.js'

/** @typedef {import('./types.js').FunctionKey} FunctionKey */
/** @typedef {import('./types.js').FunctionSource} FunctionSource */
/** @typedef {import('./types.js').SurfacePolicy} SurfacePolicy */
/** @typedef {import('./types.js').SpatialPlacement} SpatialPlacement */

/**
 * 用途注册表(单一权威)。**不含中文** —— 显示名在 routes 层按 key 查。
 * - `defaultSurfaceMode`:未覆写时 surfaceTypeOf 派生的默认表面策略。
 * - `allowsStorage`:这类用途是否天然承载储物(影响 storage 归属候选)。
 * - `anchorHint`:类目就近定位的作业点提示(对应 storage-plan.js ANCHORS 的 id),
 *   null = 无特定作业点。用 id 而非中文,避免耦合 catZh。
 * - `allowedCategories`:fixed-equipment 默认批准的类目(anchor id);其余外溢物要清。
 * @type {Record<string, { defaultSurfaceMode: SurfacePolicy['mode'], allowsStorage: boolean, anchorHint: string|null, allowedCategories?: string[] }>}
 */
export const FUNCTIONS = {
  // §10 本住宅已确认集合
  'diet-equipment-station': { defaultSurfaceMode: 'fixed-equipment', allowsStorage: true, anchorHint: 'stove', allowedCategories: ['stove', 'fridge'] },
  'photography': { defaultSurfaceMode: 'core-operation', allowsStorage: true, anchorHint: 'desk' },
  'tools-cables-power': { defaultSurfaceMode: 'core-operation', allowsStorage: true, anchorHint: 'desk' },
  'pet-supplies': { defaultSurfaceMode: 'core-operation', allowsStorage: true, anchorHint: 'pet' },
  'long-term-stock': { defaultSurfaceMode: 'core-operation', allowsStorage: true, anchorHint: null },
  'sleep-only': { defaultSurfaceMode: 'prohibited-storage', allowsStorage: false, anchorHint: 'bed' },
  // 通用
  'work-surface': { defaultSurfaceMode: 'core-operation', allowsStorage: false, anchorHint: 'desk' },
  'dining': { defaultSurfaceMode: 'core-operation', allowsStorage: false, anchorHint: null },
  'cooking': { defaultSurfaceMode: 'prohibited-storage', allowsStorage: false, anchorHint: 'stove' },
  'general-storage': { defaultSurfaceMode: 'core-operation', allowsStorage: true, anchorHint: null },
}

/** UI 下拉用:所有可选用途 key。 */
export const FUNCTION_KEYS = /** @type {FunctionKey[]} */ (Object.keys(FUNCTIONS))

/**
 * kind 级硬规则:这些表面**无论**用途都是禁止储物面(规范 §1.3, §3.3, §4.3)——
 * 灶台必须能烹饪、抽油烟机是通风口、围栏顶坠物误食。用途覆写不了物理危险。
 */
const PROHIBITED_KINDS = new Set(['stove', 'range', 'oven', 'range_hood', 'pet_pen', 'pet_gate'])

/**
 * 按 kind 猜用途(兜底,即今天的唯一行为)。未映射 → general-storage。
 * @param {SpatialPlacement} placement
 * @returns {FunctionKey}
 */
function guessFunction(placement) {
  const kind = canonicalPlacementKind(placement?.kind ?? '')
  if (/^bed/.test(kind)) return 'sleep-only'
  if (kind === 'stove' || kind === 'range' || kind === 'oven') return 'cooking'
  if (kind === 'desk' || kind === 'standing_desk') return 'work-surface'
  if (kind === 'table' || kind === 'folding_table') return 'dining'
  if (kind === 'pet_pen' || kind === 'pet_gate') return 'pet-supplies'
  return 'general-storage'
}

/**
 * 解析一件家具/表面的**effective 用途**。**照片不参与**(评审 B1)。
 * @param {SpatialPlacement} placement
 * @returns {{ key: FunctionKey, source: FunctionSource }}
 */
export function resolveFunction(placement) {
  const f = placement?.attrs?.function
  if (f?.byUser?.key) return { key: f.byUser.key, source: 'user' }
  if (f?.bySessionImport?.key) return { key: f.bySessionImport.key, source: 'user-session-import' }
  if (f?.byDocument?.key) return { key: f.byDocument.key, source: 'document' }
  if (f?.byScan?.key) return { key: f.byScan.key, source: 'scan' }
  return { key: guessFunction(placement), source: 'guess' }
}

/** 是否已被用户在 UI 亲手确认(session-import 不算)。 */
export function isUserConfirmed(placement) {
  return !!placement?.attrs?.function?.byUser?.key
}

/**
 * 照片观察 vs effective 用途的漂移(规范 §1.1:照片只提示,不重定义)。
 * @param {SpatialPlacement} placement
 * @returns {{ drift: boolean, reasonCode?: string, params?: object }}
 */
export function observedDrift(placement) {
  const obs = placement?.attrs?.function?.observedByPhoto
  if (!obs?.key) return { drift: false }
  const eff = resolveFunction(placement)
  if (obs.key === eff.key) return { drift: false }
  return {
    drift: true,
    reasonCode: 'FUNCTION_OBSERVED_DRIFT',
    params: { observedKey: obs.key, effectiveKey: eff.key, confidence: obs.confidence ?? null },
  }
}

/**
 * 派生一件家具/表面的表面策略(规范 §1.3)。覆写优先;kind 级禁止储物硬规则次之;
 * 否则按用途默认。
 * @param {SpatialPlacement} placement
 * @param {{ key: FunctionKey }} [fn] 已解析的用途(省略则内部解析)
 * @returns {SurfacePolicy}
 */
export function surfaceTypeOf(placement, fn) {
  const override = placement?.attrs?.surfacePolicy
  if (override?.mode) return override
  const kind = canonicalPlacementKind(placement?.kind ?? '')
  if (PROHIBITED_KINDS.has(kind)) return { mode: 'prohibited-storage' }
  const key = (fn ?? resolveFunction(placement)).key
  const spec = FUNCTIONS[key]
  /** @type {SurfacePolicy} */
  const policy = { mode: spec?.defaultSurfaceMode ?? 'core-operation' }
  if (policy.mode === 'fixed-equipment' && spec?.allowedCategories) {
    policy.allowedCategories = spec.allowedCategories
  }
  return policy
}

/**
 * 纯助手:把某个用途写成**用户确认**(source=user),旧 effective 压入 history。
 * 不改动 placement,返回新 attrs(写方 spread 回去)。规范 §8.4:纠正立即成永久真源。
 * @param {SpatialPlacement} placement
 * @param {FunctionKey} key
 * @param {number} now epoch ms(注入时钟,便于确定性单测)
 * @returns {import('./types.js').PlacementAttrs}
 */
export function recordUserFunction(placement, key, now) {
  return writeFunction(placement, key, now, 'byUser')
}

/**
 * 纯助手:种子补丁写入(source=user-session-import,**待用户确认**,不置 byUser)。
 * @param {SpatialPlacement} placement
 * @param {FunctionKey} key
 * @param {number} now epoch ms
 * @returns {import('./types.js').PlacementAttrs}
 */
export function recordSessionImport(placement, key, now) {
  return writeFunction(placement, key, now, 'bySessionImport')
}

/**
 * @param {SpatialPlacement} placement
 * @param {FunctionKey} key
 * @param {number} now
 * @param {'byUser'|'bySessionImport'} slot
 * @returns {import('./types.js').PlacementAttrs}
 */
function writeFunction(placement, key, now, slot) {
  const attrs = placement?.attrs ?? {}
  const fn = attrs.function ?? {}
  const at = new Date(now).toISOString()
  const prev = resolveFunction(placement)
  const history = Array.isArray(fn.history) ? fn.history.slice() : []
  // 只有 effective 真变了才记一笔历史,避免重复确认刷屏
  if (prev.key !== key) history.push({ key: prev.key, source: prev.source, at })
  return {
    ...attrs,
    function: { ...fn, [slot]: { key, at }, history: history.length ? history : undefined },
  }
}
