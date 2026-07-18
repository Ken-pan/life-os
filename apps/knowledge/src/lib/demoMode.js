// 本地演示模式（localhost 网页）—— 空库时自动灌入 demo 笔记，全面点亮
// 收集箱 / 库 / 概览 / 项目 / 时间线各页。语义与 planner 的 demoMode 对齐：
//   - localhost 网页（非 Tauri/Vault）下库为空 → 默认灌 demo；
//   - ?demo=0 显式关闭（持久化，露出真实空态）；?demo=1 显式开启；
//   - 有真实条目（localStorage 已存）时永不覆盖（只在「空」分支调用）；
//   - 原生 Vault 后端永不激活（.md 文件即数据库，绝不注入假数据）。
import { browser } from '$app/environment'
import { isTauri } from '$lib/vault.js'

const FLAG_KEY = 'knowledgeos_demo'

function isLocalHost() {
  if (!browser) return false
  const h = location.hostname
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '[::1]' ||
    h === '::1' ||
    h.endsWith('.localhost')
  )
}

/** 空库时是否应灌入 demo 数据。仅 localhost 网页（非 Tauri）；消化 ?demo= 开关。 */
export function shouldSeedDemo() {
  if (!browser || isTauri() || !isLocalHost()) return false
  try {
    const p = new URLSearchParams(location.search)
    if (p.has('demo')) {
      const on = p.get('demo') !== '0'
      localStorage.setItem(FLAG_KEY, on ? '1' : '0')
      return on
    }
    if (localStorage.getItem(FLAG_KEY) === '0') return false
  } catch {
    /* localStorage 不可用 → 按默认（灌）处理 */
  }
  return true
}
