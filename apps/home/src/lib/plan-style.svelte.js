/**
 * 平面图显示风格(线稿 / 真实贴图),跨页面共享的一份 —— 和 plan-view.svelte.js
 * 同理:/plan 和 /storage 挂的是同一张图,在一处切了贴图,另一处也该是贴图。
 *
 * 持久化到 localStorage:这是「我喜欢怎么看我的家」级别的偏好,不是一次会话
 * 的临时态。
 */
import { browser } from '$app/environment'

const KEY = 'homeos.plan.textured'
const SUN_KEY = 'homeos.plan.sun'

const style = $state({
  textured: browser && localStorage.getItem(KEY) === '1',
  sun: browser && localStorage.getItem(SUN_KEY) === '1',
  /**
   * 日照模拟的「一天中的第几分钟」;null = 跟随当前时间。
   * 会话态不持久 —— 拖到下午三点看看光斑是探索,不是要把图定格在下午三点。
   * @type {number | null}
   */
  sunMinutes: null,
  /**
   * 日照模拟取哪一天(YYYY-MM-DD);null = 今天。会话态,理由同上 ——
   * 翻到冬至对比是探索,不是要让图从此活在十二月。
   * @type {string | null}
   */
  sunDateISO: null,
  /**
   * live = 某一时刻的光斑;heat = 全天直射热力图(选盆栽位/工位用)。
   * @type {'live' | 'heat'}
   */
  sunMode: 'live',
})

/** 读共享的显示风格。返回 $state 代理本身。 */
export function getPlanStyle() {
  return style
}

/** @param {boolean} on */
export function setPlanTextured(on) {
  style.textured = on
  if (browser) localStorage.setItem(KEY, on ? '1' : '0')
}

/** @param {boolean} on */
export function setPlanSun(on) {
  style.sun = on
  if (browser) localStorage.setItem(SUN_KEY, on ? '1' : '0')
}

/** @param {number | null} minutes 0–1439;null = 回到「现在」 */
export function setPlanSunMinutes(minutes) {
  style.sunMinutes = minutes
}

/** @param {string | null} iso YYYY-MM-DD;null = 今天 */
export function setPlanSunDate(iso) {
  style.sunDateISO = iso
}

/** @param {'live' | 'heat'} mode */
export function setPlanSunMode(mode) {
  style.sunMode = mode
}
