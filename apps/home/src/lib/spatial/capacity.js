/**
 * 储物区容量 —— **定性优先,不伪精确**(规范 §6.3, 评审 B4)。纯函数,无 IO。
 *
 * 核心事实:几何容量 ≠ 可用容量。一个箱子即使还能塞 10%,若已无法正常取物,
 * 就是功能性满载。而「取一件要搬三件」这种事,体积算不出来 —— 只有用户/照片
 * 能作证。所以:
 * - 用户/照片明示的 capacityState 最高(尤其 functional-full,体积永远看不出)。
 * - 几何**只**在区内每件物品尺寸都够全时,才给数值 fillPct;缺一件就退回定性/unknown。
 * - 缓冲目标(默认 15%)只是 available→near-full 的软阈值,**不代表当前已满**。
 *
 * i18n:只吐 state / reason 枚举,不吐中文(评审 §4)。
 */

/** @typedef {import('./types.js').SpatialStorageZone} SpatialStorageZone */
/** @typedef {import('./types.js').CapacityState} CapacityState */

/** 缓冲目标:保留这么多空余算健康(规范 §6.3:理想 15–20%,最低 10%)。 */
export const DEFAULT_BUFFER_PCT = 15

/** 1 升 = 61.0237 立方英寸。 */
const IN3_PER_L = 61.0237

/**
 * 柜内可用容积(立方英寸)。实测内腔优先,退容积升数。都没有 → null。
 * @param {SpatialStorageZone} zone
 * @returns {number | null}
 */
function interiorVolIn3(zone) {
  const c = zone?.container
  if (!c) return null
  const i = c.interiorIn
  if (i && i.w > 0 && i.d > 0 && i.h > 0) return i.w * i.d * i.h
  if (Number.isFinite(c.volumeL) && c.volumeL > 0) return c.volumeL * IN3_PER_L
  return null
}

/**
 * 数值填充率(0–100)。**仅**当内腔容积已知**且**区内每件物品都有完整 sizeIn 时才算;
 * 缺任一 → null(不伪造精度,规范 §9.2)。
 * @param {SpatialStorageZone} zone
 * @returns {number | null}
 */
export function computeFillPct(zone) {
  const cap = interiorVolIn3(zone)
  if (!cap) return null
  const items = zone?.items ?? []
  if (!items.length) return 0
  let used = 0
  for (const it of items) {
    const s = it?.sizeIn
    if (!s || !(s.w > 0) || !(s.d > 0) || !(s.h > 0)) return null
    const qty = Number.isInteger(it.qty) && it.qty > 1 ? it.qty : 1
    used += s.w * s.d * s.h * qty
  }
  return Math.round(Math.min(100, (used / cap) * 100))
}

/**
 * 一个区的容量结论。优先级:用户/照片明示 > 几何体积估算 > unknown。
 * @param {SpatialStorageZone} zone
 * @param {{ bufferPct?: number }} [opts]
 * @returns {{ state: CapacityState, evidence: import('./types.js').CapacityEvidence | null, fillPct: number | null }}
 */
export function zoneCapacity(zone, opts = {}) {
  const bufferPct = opts.bufferPct ?? DEFAULT_BUFFER_PCT
  const fillPct = computeFillPct(zone)

  // 1) 用户/照片明示优先 —— functional-full 尤其只有他们看得出(取物受阻/门关不上)
  if (zone?.capacityState && zone.capacityState !== 'unknown') {
    return { state: zone.capacityState, evidence: zone.capacityEvidence ?? null, fillPct }
  }

  // 2) 几何体积估算(仅尺寸够全)。体积能证明「溢出/接近」,证明不了「取物受阻」
  if (fillPct == null) return { state: 'unknown', evidence: null, fillPct: null }
  if (fillPct >= 100) {
    return { state: 'functional-full', evidence: { source: 'geometry', at: '', reason: 'volume-estimate' }, fillPct }
  }
  if (fillPct >= 100 - bufferPct) {
    return { state: 'near-full', evidence: { source: 'geometry', at: '', reason: 'volume-estimate' }, fillPct }
  }
  return { state: 'available', evidence: null, fillPct }
}

/** 满载态:不该再往里塞(规范 §6.3 钢架一旦功能性满载不能再推荐「塞进去」)。 */
export function isFull(zone, opts) {
  const s = zoneCapacity(zone, opts).state
  return s === 'functional-full' || s === 'near-full'
}

/**
 * 空格数 —— 把空位当**正式资源**(规范 §6.4)。靠柜内实测的 compartments 与 item.level。
 * 无实测层信息 → null(未知,不是 0)。
 * @param {SpatialStorageZone} zone
 * @returns {number | null}
 */
export function emptySlots(zone) {
  const comps = zone?.container?.compartments
  if (!Array.isArray(comps) || !comps.length) return null
  const occupied = new Set(
    (zone.items ?? []).map((i) => i.level).filter((l) => Number.isInteger(l)),
  )
  let empty = 0
  for (const c of comps) if (!occupied.has(c.level)) empty++
  return empty
}

/**
 * 全屋只允许一个待处理箱(规范 §6.5)。保留数组里第一个 inbox,清掉其余的。
 * 幂等:已经 ≤1 个则原样返回。纯函数,写方在写储物时调。
 * @param {SpatialStorageZone[]} zones
 * @returns {SpatialStorageZone[]}
 */
export function enforceSingleInbox(zones) {
  if (!Array.isArray(zones)) return zones
  let seen = false
  let changed = false
  const next = zones.map((z) => {
    if (!z?.inbox) return z
    if (!seen) {
      seen = true
      return z
    }
    changed = true
    const { inbox, ...rest } = z
    return rest
  })
  return changed ? next : zones
}
