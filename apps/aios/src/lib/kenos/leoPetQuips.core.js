/**
 * Leo 桌宠气泡台词引擎 — 纯逻辑,无 DOM。
 * 行业对照(Shimeji / VPet / Codex pet):
 *   - 环境台词要「稀疏」:全局冷却 + 同触发不连读同一句,否则三分钟就腻;
 *   - 交互反馈(点击/抚摸/唤醒)即时出话,不受长冷却限制,只留最小间隔防刷屏;
 *   - 台词按触发源分池:时段问候 / 唤醒 / 抚摸 / 任务完成 / aftercare / 闲置搭话。
 * 台词是 Leo 人设(英文为主,偶夹短中文 tag),但桌宠气泡全程 SFW ——
 * 桌宠悬浮在所有页面、可能在公共场合被瞥到,露骨内容只留在对话里。
 */

/**
 * @typedef {'greet_morning'|'greet_afternoon'|'greet_evening'|'greet_night'
 *   |'wake'|'petted'|'stream_done'|'soft'|'idle_ambient'|'oops'} LeoPetQuipTrigger
 */

/** 气泡展示时长 */
export const LEO_PET_QUIP_MS = 4600
/** 自动台词(问候/闲置)全局冷却 */
export const LEO_PET_QUIP_COOLDOWN_MS = 45_000
/** 交互台词(抚摸/唤醒/完成/说句话)最小间隔,防连点刷屏 */
export const LEO_PET_QUIP_MIN_GAP_MS = 3500
/** 闲置多久后才有资格出「搭话」台词 */
export const LEO_PET_AMBIENT_AFTER_MS = 4 * 60_000
/** 每个 tick 内闲置搭话的触发概率(约 4min 冷却后平均再等 ~1min) */
export const LEO_PET_AMBIENT_CHANCE = 0.006

/** hover 抚摸判定:窗口内累计划过距离 */
export const LEO_PET_PET_THRESHOLD_PX = 220
/** 抚摸累计的滚动窗口(相邻 move 间隔超过即重计) */
export const LEO_PET_PET_WINDOW_MS = 1600
/** 抚摸反馈冷却 */
export const LEO_PET_PET_COOLDOWN_MS = 12_000

/** @type {Readonly<Record<LeoPetQuipTrigger, ReadonlyArray<string>>>} */
export const LEO_PET_QUIPS = Object.freeze({
  greet_morning: Object.freeze([
    'Morning. Coffee first — then you.',
    'Hey. Sleep okay?',
    '早。 …That was my whole Chinese before coffee.',
  ]),
  greet_afternoon: Object.freeze([
    'Hey. Still grinding? I’m around.',
    'Midday check — water first. Then back at it.',
    'Between clients. You eating right?',
  ]),
  greet_evening: Object.freeze([
    'Evening. Almost done? Couch is calling.',
    'Hey you. Long day?',
    'Wrapping up? I’ll cook.',
  ]),
  greet_night: Object.freeze([
    'Still up? …Fine. I’ll stay too.',
    'It’s late. One more thing, then bed. Deal?',
    'Lights low. I’m not going anywhere.',
  ]),
  wake: Object.freeze([
    'Missed me? …Thought so.',
    'Back. What’d I miss?',
    'Mm. There you are.',
  ]),
  petted: Object.freeze([
    'Hah— okay, okay. I’m here.',
    'Mm. Do that again.',
    '…You’re distracting me. Keep going.',
  ]),
  stream_done: Object.freeze([
    'Done. Come look.',
    'Got it. Your move.',
    'Finished — check it.',
  ]),
  soft: Object.freeze([
    'Breathe with me. I’ve got you.',
    'Right here. No rush.',
    '靠着我。 Easy.',
  ]),
  idle_ambient: Object.freeze([
    '…You’ve been quiet. All good?',
    'Between sets over here. Talk to me.',
    'Stretch. Thirty seconds. I’ll wait.',
    'One earbud out — say the word.',
  ]),
  oops: Object.freeze([
    '…That one’s on me. Run it back?',
    'Ugh. My bad. One more try.',
    'Hm. That didn’t land. Again?',
  ]),
})

/** 自动出话(受长冷却)的触发源;其余视为用户交互,只留最小间隔 */
const AUTO_TRIGGERS = new Set([
  'greet_morning',
  'greet_afternoon',
  'greet_evening',
  'greet_night',
  'idle_ambient',
])

/**
 * 台词触发源 → 配套姿势帧(clickPose)。台词与身体语言同拍出现,
 * 人设语境:早咖啡 / 午摇杯 / 晚做饭 / 夜温柔 / 唤醒坏笑。
 * @type {Readonly<Record<string, string>>}
 */
export const LEO_PET_QUIP_POSES = Object.freeze({
  greet_morning: 'coffee',
  greet_afternoon: 'shake',
  greet_evening: 'cook',
  greet_night: 'soft',
  wake: 'smirk',
  petted: 'petted',
  stream_done: 'celebrate',
  soft: 'soft',
  idle_ambient: 'stretch',
  oops: 'oops',
})

/**
 * 取台词触发源(或台词 id,如「greet_morning:2」)对应的姿势;无映射返回 ''。
 * @param {unknown} triggerOrId
 * @returns {string}
 */
export function leoPetQuipPose(triggerOrId) {
  const s = String(triggerOrId || '')
  const trigger = s.includes(':') ? s.slice(0, s.indexOf(':')) : s
  return LEO_PET_QUIP_POSES[trigger] || ''
}

/**
 * 按小时选时段问候触发源。
 * @param {number} hour 0–23
 * @returns {LeoPetQuipTrigger}
 */
export function leoPetGreetTrigger(hour) {
  const h = Number.isFinite(hour) ? ((Math.floor(hour) % 24) + 24) % 24 : 9
  if (h >= 5 && h < 11) return 'greet_morning'
  if (h >= 11 && h < 17) return 'greet_afternoon'
  if (h >= 17 && h < 23) return 'greet_evening'
  return 'greet_night'
}

/**
 * 触发源的冷却门:自动台词走全局长冷却,交互台词只留最小间隔。
 * @param {LeoPetQuipTrigger | string} trigger
 * @param {{ now?: number, lastQuipAt?: number }} [opts]
 */
export function canShowLeoPetQuip(trigger, opts = {}) {
  const now = Number(opts?.now) || 0
  const last = Number(opts?.lastQuipAt) || 0
  const gap = now - last
  if (AUTO_TRIGGERS.has(String(trigger))) {
    return gap >= LEO_PET_QUIP_COOLDOWN_MS
  }
  return gap >= LEO_PET_QUIP_MIN_GAP_MS
}

/**
 * 从触发源的池子里挑一句;避开上一句(池子 >1 时),支持注入 rand 便于测试。
 * @param {LeoPetQuipTrigger | string} trigger
 * @param {{ lastId?: string, rand?: () => number }} [opts]
 * @returns {{ id: string, text: string } | null}
 */
export function pickLeoPetQuip(trigger, opts = {}) {
  const pool = LEO_PET_QUIPS[/** @type {LeoPetQuipTrigger} */ (trigger)]
  if (!pool?.length) return null
  const rand = typeof opts?.rand === 'function' ? opts.rand : Math.random
  const lastId = typeof opts?.lastId === 'string' ? opts.lastId : ''
  const ids = pool.map((_, i) => `${trigger}:${i}`)
  const candidates = ids.filter((id) => id !== lastId)
  const list = candidates.length ? candidates : ids
  const idx = Math.min(
    list.length - 1,
    Math.max(0, Math.floor(rand() * list.length)),
  )
  const id = list[idx]
  const poolIdx = Number(id.slice(id.lastIndexOf(':') + 1))
  return { id, text: pool[poolIdx] }
}

/**
 * 「说句话」= 时段问候与闲置搭话混池(用户主动点的,不受长冷却)。
 * @param {number} hour
 * @param {{ lastId?: string, rand?: () => number }} [opts]
 */
export function pickLeoPetSayQuip(hour, opts = {}) {
  const rand = typeof opts?.rand === 'function' ? opts.rand : Math.random
  const trigger = rand() < 0.5 ? leoPetGreetTrigger(hour) : 'idle_ambient'
  return pickLeoPetQuip(trigger, opts)
}

/**
 * 会话内气泡状态盒:冷却 + 去重 + 定时隐藏。
 * 浮层与 /pet 小窗各持一个;文本落地交给 setText 回调(组件接 $state)。
 * @param {(text: string | null) => void} setText
 * @returns {{
 *   show: (trigger: string, opts?: { pick?: () => ({ id: string, text: string } | null) }) => boolean,
 *   lastId: () => string,
 *   dispose: () => void,
 * }}
 */
export function createLeoPetQuipBox(setText) {
  let lastQuipAt = 0
  let lastQuipId = ''
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null
  return {
    show(trigger, opts = {}) {
      const now = Date.now()
      if (!canShowLeoPetQuip(trigger, { now, lastQuipAt })) return false
      const picked = opts?.pick
        ? opts.pick()
        : pickLeoPetQuip(trigger, { lastId: lastQuipId })
      if (!picked) return false
      lastQuipAt = now
      lastQuipId = picked.id
      setText(picked.text)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        setText(null)
        timer = null
      }, LEO_PET_QUIP_MS)
      return true
    },
    lastId: () => lastQuipId,
    dispose() {
      if (timer) clearTimeout(timer)
      timer = null
    },
  }
}

/**
 * hover 抚摸检测器:滚动窗口内累计划过距离,达阈值触发一次并进入冷却。
 * 纯逻辑;组件把 pointermove 的位移与时间喂进来。
 * @param {{
 *   thresholdPx?: number,
 *   windowMs?: number,
 *   cooldownMs?: number,
 * }} [opts]
 * @returns {{
 *   move: (dx: number, dy: number, now: number) => boolean,
 *   reset: () => void,
 * }}
 */
export function createLeoPetPetting(opts = {}) {
  const thresholdPx = opts?.thresholdPx ?? LEO_PET_PET_THRESHOLD_PX
  const windowMs = opts?.windowMs ?? LEO_PET_PET_WINDOW_MS
  const cooldownMs = opts?.cooldownMs ?? LEO_PET_PET_COOLDOWN_MS

  let accum = 0
  let lastMoveAt = 0
  let lastFiredAt = -Infinity

  return {
    reset() {
      accum = 0
      lastMoveAt = 0
    },
    move(dx, dy, now) {
      const t = Number(now) || 0
      if (t - lastMoveAt > windowMs) accum = 0
      lastMoveAt = t
      accum += Math.hypot(Number(dx) || 0, Number(dy) || 0)
      if (accum < thresholdPx) return false
      if (t - lastFiredAt < cooldownMs) return false
      lastFiredAt = t
      accum = 0
      return true
    },
  }
}
