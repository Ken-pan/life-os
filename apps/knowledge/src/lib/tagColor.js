/**
 * 标签 → 稳定分类色（零依赖纯函数）。哈希到主题的具名 hue token（已 CVD 校验）。
 * 返回 CSS 值 `var(--chart-hue-…)`，供彩色分类 chip 用。同一标签永远同色。
 */
const HUES = ['blue', 'green', 'orange', 'violet', 'magenta', 'aqua', 'red', 'yellow']

/** @param {string} tag @returns {string} 如 `var(--chart-hue-blue)` */
export function tagHueVar(tag) {
  let h = 0
  const s = String(tag)
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return `var(--chart-hue-${HUES[h % HUES.length]})`
}
