/**
 * 统一日期/时间格式（中文界面为主，英文兜底）。整站笔记时间只走这里，避免
 * 「June 7, 2026 / 6/7 / 08:19 AM」混排的拼接感。
 */
import { S } from '$lib/state.svelte.js'

const DAY = 86400000

function startOfDay(ms) {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const EN_MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function isZh() {
  return S?.settings?.locale !== 'en'
}

/** 列表卡片角标：今天→时刻，昨天→「昨天」，本年→月日，跨年→年月日。 */
export function shortTime(ts) {
  const zh = isZh()
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const t0 = startOfDay(Date.now())
  const d0 = startOfDay(ts)
  if (d0 === t0) return `${hh}:${mm}`
  if (d0 === t0 - DAY) return zh ? '昨天' : 'Yest.'
  const thisYear = d.getFullYear() === new Date().getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  if (thisYear) return zh ? `${m}月${day}日` : `${EN_MONTH[d.getMonth()]} ${day}`
  return zh ? `${d.getFullYear()}年${m}月${day}日` : `${EN_MONTH[d.getMonth()]} ${day}, ${d.getFullYear()}`
}

/** 文档头元信息：今天→「今天 08:19」，昨天→「昨天」，本年→月日，跨年→年月日。 */
export function metaWhen(ts) {
  const zh = isZh()
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const t0 = startOfDay(Date.now())
  const d0 = startOfDay(ts)
  if (d0 === t0) return zh ? `今天 ${hh}:${mm}` : `Today ${hh}:${mm}`
  if (d0 === t0 - DAY) return zh ? '昨天' : 'Yesterday'
  const thisYear = d.getFullYear() === new Date().getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  if (thisYear) return zh ? `${m}月${day}日` : `${EN_MONTH[d.getMonth()]} ${day}`
  return zh ? `${d.getFullYear()}年${m}月${day}日` : `${EN_MONTH[d.getMonth()]} ${day}, ${d.getFullYear()}`
}
