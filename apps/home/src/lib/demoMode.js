// 本地演示模式（localhost）—— 空/未布置时自动灌入 graph + tidy 演示数据，
// 全面展示 /plan 墙图编辑（①墙体②划分③布置）与 /tidy 整理计划。
// 严格只在 localhost 生效，生产域名永不激活。语义与 planner 的 demoMode 对齐：
//   - localhost 下项目还没有墙图/布置 → 默认灌 demo；
//   - ?demo=0 显式关闭（持久化，露出真实空态）；?demo=1 显式开启；
//   - 有真实图层数据（用户已画墙/布置）时永不覆盖（只在「空」分支调用）。
import { browser } from '$app/environment'

const FLAG_KEY = 'homeos_demo'

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

// 私网主机（mDNS .local / RFC1918）—— Kenos 原生壳 Daily Beta / QA 采集经此访问。
// 与 localhost 不同：只认显式 ?demo=1（或已持久化 '1'），绝不默认灌 —— 真机空库不受影响。
function isPrivateLanExplicitDemo() {
  if (!browser) return false
  const h = location.hostname
  const priv =
    h.endsWith('.local') ||
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)
  if (!priv) return false
  try {
    const p = new URLSearchParams(location.search)
    if (p.get('demo') === '1') {
      localStorage.setItem(FLAG_KEY, '1')
      return true
    }
    return localStorage.getItem(FLAG_KEY) === '1'
  } catch {
    return false
  }
}

/** 图层为空时是否应灌入 demo 数据。仅 localhost；消化 ?demo= 开关。 */
export function shouldSeedDemo() {
  if (!isLocalHost() && !isPrivateLanExplicitDemo()) return false
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
