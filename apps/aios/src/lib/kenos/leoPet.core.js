/**
 * Leo 桌宠状态机 — Codex-style companion poses.
 * 素材: apps/aios/static/leo/pet/
 */

/** @typedef {'idle'|'wave'|'think'|'listen'|'happy'|'busy'|'sleep'|'soft'|'petted'|'celebrate'|'stretch'|'coffee'|'smirk'|'shake'|'cook'|'speak'|'draw'|'oops'|'yawn'} LeoPetPose */
/** @typedef {'sm'|'md'|'lg'} LeoPetSize */

/** @type {ReadonlyArray<LeoPetPose>} */
export const LEO_PET_POSES = Object.freeze([
  'idle',
  'wave',
  'think',
  'listen',
  'happy',
  'busy',
  'sleep',
  'soft',
  // 交互/台词语境专属帧(仅作 clickPose,不参与常驻状态推导)
  'petted',
  'celebrate',
  'stretch',
  'coffee',
  'smirk',
  'shake',
  'cook',
  'oops',
  // 运行时状态帧(参与 resolveLeoPetPose 推导)
  'speak',
  'draw',
  'yawn',
])

/** idle 呼吸双帧 */
export const LEO_PET_IDLE_FRAMES = Object.freeze(['idle_a', 'idle_b'])

/** @type {Readonly<Record<Exclude<LeoPetPose, 'idle'>, string>>} */
export const LEO_PET_SRC = Object.freeze({
  wave: '/leo/pet/wave.png',
  think: '/leo/pet/think.png',
  listen: '/leo/pet/listen.png',
  happy: '/leo/pet/happy.png',
  busy: '/leo/pet/busy.png',
  sleep: '/leo/pet/sleep.png',
  soft: '/leo/pet/soft.png',
  petted: '/leo/pet/petted.png',
  celebrate: '/leo/pet/celebrate.png',
  stretch: '/leo/pet/stretch.png',
  coffee: '/leo/pet/coffee.png',
  smirk: '/leo/pet/smirk.png',
  shake: '/leo/pet/shake.png',
  cook: '/leo/pet/cook.png',
  speak: '/leo/pet/speak.png',
  draw: '/leo/pet/draw.png',
  oops: '/leo/pet/oops.png',
  yawn: '/leo/pet/yawn.png',
})

/** @type {Readonly<Record<LeoPetSize, number>>} */
export const LEO_PET_SIZE_PX = Object.freeze({
  sm: 88,
  md: 120,
  lg: 152,
})

/** 点击反馈展示时长 */
export const LEO_PET_CLICK_MS = 1600
/** 空闲多久进入 sleep */
export const LEO_PET_SLEEP_AFTER_MS = 8 * 60 * 1000
/** 入睡前的哈欠过渡窗口(sleep 阈值前这么久开始打哈欠) */
export const LEO_PET_YAWN_WINDOW_MS = 60 * 1000
/** idle 呼吸切换间隔 */
export const LEO_PET_IDLE_TICK_MS = 2400
/** 主窗 → pet 窗状态广播节流下限 */
export const LEO_PET_PUBLISH_MIN_MS = 250

/**
 * @param {unknown} value
 * @returns {LeoPetPose}
 */
export function normalizeLeoPetPose(value) {
  return LEO_PET_POSES.includes(/** @type {LeoPetPose} */ (value))
    ? /** @type {LeoPetPose} */ (value)
    : 'idle'
}

/**
 * @param {unknown} value
 * @returns {LeoPetSize}
 */
export function normalizeLeoPetSize(value) {
  if (value === 'sm' || value === 'lg') return value
  return 'md'
}

/**
 * @param {LeoPetSize | null | undefined} size
 */
export function leoPetSizePx(size) {
  return LEO_PET_SIZE_PX[normalizeLeoPetSize(size)] ?? LEO_PET_SIZE_PX.md
}

/** 右键菜单循环尺寸: sm → md → lg → sm */
export function cycleLeoPetSize(current) {
  const order = /** @type {const} */ (['sm', 'md', 'lg'])
  const i = order.indexOf(normalizeLeoPetSize(current))
  return order[(i + 1) % order.length]
}

/**
 * @param {LeoPetPose | null | undefined} pose
 * @param {{ idleFrame?: 0 | 1 } | null | undefined} [opts]
 */
export function leoPetSrc(pose, opts = {}) {
  const p = normalizeLeoPetPose(pose)
  if (p === 'idle') {
    const frame = opts?.idleFrame === 1 ? 'idle_b' : 'idle_a'
    return `/leo/pet/${frame}.png`
  }
  return LEO_PET_SRC[p] || '/leo/pet/idle_a.png'
}

/**
 * 所有静态帧路径（预加载用）。
 * @returns {string[]}
 */
export function leoPetAllSrcs() {
  return [
    '/leo/pet/idle_a.png',
    '/leo/pet/idle_b.png',
    ...Object.values(LEO_PET_SRC),
  ]
}

/**
 * 优先级: click 反馈 > soft/aftercare > 生图/draw > busy > streaming/think
 *        > 朗读/speak > listening > sleep > 睡前 yawn > idle
 * @param {{
 *   streaming?: boolean,
 *   toolRunning?: boolean,
 *   imageGen?: boolean,
 *   speaking?: boolean,
 *   listening?: boolean,
 *   softMode?: boolean,
 *   idleMs?: number,
 *   clickRemainingMs?: number,
 *   clickPose?: LeoPetPose | null,
 *   sleepAfterMs?: number,
 * } | null | undefined} [ctx]
 * @returns {LeoPetPose}
 */
export function resolveLeoPetPose(ctx = {}) {
  const clickMs = Number(ctx?.clickRemainingMs) || 0
  if (clickMs > 0) {
    const cp = normalizeLeoPetPose(ctx?.clickPose)
    return cp === 'idle' ? 'wave' : cp
  }
  if (ctx?.softMode) return 'soft'
  if (ctx?.imageGen) return 'draw'
  if (ctx?.toolRunning) return 'busy'
  if (ctx?.streaming) return 'think'
  if (ctx?.speaking) return 'speak'
  if (ctx?.listening) return 'listen'
  const idleMs = Number(ctx?.idleMs) || 0
  const sleepAfter = Number(ctx?.sleepAfterMs) || LEO_PET_SLEEP_AFTER_MS
  if (idleMs >= sleepAfter) return 'sleep'
  if (idleMs >= sleepAfter - LEO_PET_YAWN_WINDOW_MS) return 'yawn'
  return 'idle'
}

/**
 * @param {unknown} value
 * @param {{ maxRight?: number, maxBottom?: number } | null | undefined} [bounds]
 * @returns {{ right: number, bottom: number }}
 */
export function normalizeLeoPetPosition(value, bounds = {}) {
  const o =
    value && typeof value === 'object'
      ? /** @type {Record<string, unknown>} */ (value)
      : null
  // 兼容旧 { x, y }（右下偏移）
  const right = Number(o?.right ?? (o?.x != null ? Math.abs(Number(o.x)) : NaN))
  const bottom = Number(
    o?.bottom ?? (o?.y != null ? Math.abs(Number(o.y)) : NaN),
  )
  const maxR = Number(bounds?.maxRight)
  const maxB = Number(bounds?.maxBottom)
  let r = Number.isFinite(right) ? Math.round(right) : 24
  let b = Number.isFinite(bottom) ? Math.round(bottom) : 96
  r = Math.max(8, r)
  b = Math.max(8, b)
  if (Number.isFinite(maxR)) r = Math.min(r, maxR)
  if (Number.isFinite(maxB)) b = Math.min(b, maxB)
  return { right: r, bottom: b }
}

/**
 * 桌宠是否应显示（人格 + 开关 + 未 tuck）。
 * @param {{ assistantPersona?: unknown, leoPetEnabled?: unknown } | null | undefined} settings
 * @param {{ tucked?: boolean } | null | undefined} [runtime]
 */
export function leoPetShouldShow(settings, runtime = {}) {
  if (settings?.assistantPersona !== 'leo') return false
  if (settings?.leoPetEnabled === false) return false
  if (runtime?.tucked) return false
  return true
}

/**
 * Tauri 桌面置顶窗是否开启（显式 opt-in）。
 * @param {{ assistantPersona?: unknown, leoPetEnabled?: unknown, leoPetDesktop?: unknown } | null | undefined} settings
 */
export function leoPetDesktopShouldOpen(settings) {
  if (!leoPetShouldShow(settings)) return false
  // 必须显式 true：默认关闭，避免误开系统级置顶窗
  return settings?.leoPetDesktop === true
}

/**
 * 后台标签页应暂停呼吸动画（省电 / 减写盘）。
 * @param {{ hidden?: boolean, reducedMotion?: boolean } | null | undefined} [opts]
 */
export function leoPetShouldAnimate(opts = {}) {
  if (opts?.hidden) return false
  if (opts?.reducedMotion) return false
  return true
}
