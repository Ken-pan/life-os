/**
 * 数据变更通知总线(chat/memory → 云同步)。
 * chat.svelte.js 和 memory.svelte.js 在 persist 时喊一声,云同步模块
 * 订阅后做防抖推送——单向依赖,避免 cloud ↔ chat 互相 import 成环。
 */

const listeners = new Set()

/** @param {() => void} fn @returns {() => void} 取消订阅 */
export function onDataChanged(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function dataChanged() {
  for (const fn of listeners) fn()
}
