/**
 * 平面图显示风格(线稿 / 真实贴图),跨页面共享的一份 —— 和 plan-view.svelte.js
 * 同理:/plan 和 /storage 挂的是同一张图,在一处切了贴图,另一处也该是贴图。
 *
 * 持久化到 localStorage:这是「我喜欢怎么看我的家」级别的偏好,不是一次会话
 * 的临时态。
 */
import { browser } from '$app/environment'

const KEY = 'homeos.plan.textured'

const style = $state({
  textured: browser && localStorage.getItem(KEY) === '1',
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
