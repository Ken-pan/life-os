// 本地演示模式（FIN.DEMO）—— 让 FinanceOS 在本地无需登录/Supabase 即可载入一整套
// 模拟数据用于 UI/UX 验证与走查。严格只在 localhost 生效，生产域名下永不激活。
//
// 默认行为（2026-07-17 起）：localhost 下**未登录即自动进演示模式** —— 打开就有
// 数据，不用记着带 ?demo=1。已登录（有 Supabase 会话）则照常用真实数据。
//
// 显式覆盖（持久化到 localStorage，仅 localhost）：
//   ?demo=1  强制演示（即便已登录）；?demo=0  强制关闭（露出登录门，用真实账户）。
//   localStorage 'fos_demo' = '1'（强制开）/ '0'（强制关）/ 缺省（按登录态自动）。
//   —— uiux-review 截图脚本设 fos_demo='1' 仍照常强制演示。
//
// 生产安全：hostname 不是本地回环时直接返回 false，任何 flag 都无效。

import { peekSessionUserId } from './localCache'

const DEMO_FLAG_KEY = 'fos_demo'

/** 仅本地回环允许演示模式。 */
function isLocalHost(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '[::1]' ||
    h === '::1' ||
    h.endsWith('.localhost')
  )
}

/**
 * 私网主机（mDNS .local / RFC1918）—— Kenos 原生壳 Daily Beta / QA 采集经此访问。
 * 与 localhost 不同：只认显式 ?demo=1（或已持久化 '1'），绝不按登录态自动 —— 真机不受影响。
 */
function isPrivateLanHost(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  return (
    h.endsWith('.local') ||
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)
  )
}

type DemoFlag = 'on' | 'off' | 'unset'

/**
 * 读演示开关状态，并把 URL 上的 ?demo= 持久化到 localStorage。
 * 'on' = 强制演示，'off' = 强制真实，'unset' = 未显式设置（交给登录态决定）。
 * 仅在 isLocalHost() 已确认后调用。
 */
function readFlagState(): DemoFlag {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.has('demo')) {
      const on = params.get('demo') !== '0'
      window.localStorage.setItem(DEMO_FLAG_KEY, on ? '1' : '0')
      return on ? 'on' : 'off'
    }
    const stored = window.localStorage.getItem(DEMO_FLAG_KEY)
    if (stored === '1') return 'on'
    if (stored === '0') return 'off'
  } catch {
    /* localStorage 不可用时按未设置处理 */
  }
  return 'unset'
}

/** 本地是否已有登录会话（同步读 Supabase 持久化 token）。 */
function hasSession(): boolean {
  try {
    return !!peekSessionUserId()
  } catch {
    return false
  }
}

/**
 * 当前是否处于本地演示模式。副作用：会消化 URL 上的 ?demo= 开关。
 * 规则（仅 localhost）：显式 on/off 优先；未设置时，未登录→演示、已登录→真实。
 */
export function isDemoMode(): boolean {
  // 私网主机：只走显式 'on'，永不按登录态自动演示。
  if (!isLocalHost()) return isPrivateLanHost() && readFlagState() === 'on'
  const flag = readFlagState()
  if (flag === 'on') return true
  if (flag === 'off') return false
  return !hasSession()
}

/** 供脚本/控制台显式开启演示（返回是否成功——仅本地）。 */
export function enableDemoMode(): boolean {
  if (!isLocalHost() && !isPrivateLanHost()) return false
  try {
    window.localStorage.setItem(DEMO_FLAG_KEY, '1')
    return true
  } catch {
    return false
  }
}

/** 供控制台显式关闭演示（持久化 '0'，露出登录门用真实账户；仅本地）。 */
export function disableDemoMode(): boolean {
  if (!isLocalHost() && !isPrivateLanHost()) return false
  try {
    window.localStorage.setItem(DEMO_FLAG_KEY, '0')
    return true
  } catch {
    return false
  }
}
