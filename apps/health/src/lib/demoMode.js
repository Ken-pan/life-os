// 本地演示模式（localhost）—— 当本地 Focus 代理（127.0.0.1:5193）离线时，
// 给 A 存储灌入 demo 指标，让 /、/focus、/trends 全面展示核心功能。
// 严格只在 localhost 生效，生产域名永不激活；真实代理可达时永远用真实数据（不覆盖）。
// 语义与 planner 的 demoMode 对齐：
//   - localhost 且代理离线 → 默认灌 demo；
//   - ?demo=0 显式关闭（持久化，露出真实离线空态）；?demo=1 显式开启；
import { browser } from '$app/environment'

const FLAG_KEY = 'healthos_demo'

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

/** 代理离线时是否应灌入 demo 数据。仅 localhost；消化 ?demo= 开关。 */
export function shouldSeedDemo() {
  if (!isLocalHost()) return false
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

/**
 * 是否「强制」演示（?demo=1 或已持久化 healthos_demo='1'）。
 * 与 shouldSeedDemo 的区别：强制态下即便真实 Focus 代理在线，也用 demo（截图/走查用）；
 * 未强制时保持「真实代理优先、仅离线才灌 demo」。仅 localhost。
 */
export function isDemoForced() {
  if (!isLocalHost()) return false
  try {
    const p = new URLSearchParams(location.search)
    if (p.has('demo')) return p.get('demo') !== '0'
    return localStorage.getItem(FLAG_KEY) === '1'
  } catch {
    return false
  }
}
