// 本地演示模式（localhost）—— 空库时自动灌入 demo 音乐库，全面展示核心功能。
// 严格只在 localhost 生效，生产域名永不激活。语义与 planner 的 demoMode 对齐：
//   - localhost 下库为空 → 默认灌 demo；
//   - ?demo=0 显式关闭（持久化，露出真实空态）；?demo=1 显式开启；
//   - 有真实数据时永不覆盖（调用方只在「空库」分支触发）。
import { browser } from '$app/environment'

const FLAG_KEY = 'musicos_demo'

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

/** 空库时是否应灌入 demo 数据。仅 localhost；消化 ?demo= 开关。 */
export default function shouldSeedDemo() {
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

export { shouldSeedDemo }
