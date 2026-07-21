/**
 * HealthOS Focus 代理客户端。
 * 代理是本地 launchd 常驻进程(apps/health/agent),在 127.0.0.1:5193 暴露只读状态
 * 与最小动作端点;网页/Tauri 壳只消费结果,不承载检测逻辑(Detection ≠ UI)。
 */
import { shouldSeedDemo, isDemoForced } from './demoMode.js'
import {
  buildDemoState,
  buildDemoHealth,
  buildDemoSessions,
  buildDemoEvents,
  buildDemoConfig,
} from './demoData.js'

export const AGENT_BASE = 'http://127.0.0.1:5193'

export const A = $state({
  online: false,
  /** GET /state 的最新快照,离线时保留上一份用于展示 */
  state: null,
  sessions: [],
  events: [],
  config: null,
  /** GET /health:Apple Health 导入的近 30 天测量数据 */
  health: [],
  lastError: null,
})

/**
 * Kenos iOS native shell injects HealthKit aggregates as
 * `window.__KENOS_APPLE_HEALTH__ = { source, syncedAt, enabledMetrics, coveredMetrics, days }`.
 * Prefer this when the Mac Focus agent is unreachable on-device.
 * Core day fields feed State Engine; extra fields (activeEnergyKcal, workouts, …) pass through.
 */
function nativeAppleHealthDays() {
  if (typeof window === 'undefined') return null
  const payload = window.__KENOS_APPLE_HEALTH__
  const days = Array.isArray(payload?.days) ? payload.days : null
  return days && days.length > 0 ? days : null
}

function applyNativeAppleHealth() {
  const days = nativeAppleHealthDays()
  if (!days) return false
  A.health = days
  A.lastError = null
  try {
    // Publish privacy-safe summary for Kenos shell peers (same inject surface).
    import('@life-os/platform-web/kenos-health-readiness').then((m) => {
      const summary = m.buildHealthReadinessFromMeasurements({
        now: Date.now(),
        health: days,
        agent: { online: A.online },
        source: window.__KENOS_APPLE_HEALTH__?.source || 'healthkit',
      })
      window.__KENOS_HEALTH_READINESS__ = summary
      window.dispatchEvent(
        new CustomEvent('kenos-health-readiness', { detail: summary }),
      )
    })
  } catch {
    /* ignore */
  }
  return true
}

async function getJson(path) {
  const res = await fetch(`${AGENT_BASE}${path}`, {
    signal: AbortSignal.timeout(1500),
  })
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`)
  return res.json()
}

/**
 * 本地演示模式:代理离线时,把 demo 数据一次性灌进 A 并置 online=true,
 * 让三页首帧即满数据。仅 localhost + demoMode 开启时启用;真实代理一旦响应,
 * refreshState/refreshDetails 会用真实数据覆盖(见 demoActive 复位)。
 */
let demoActive = false

function applyDemo() {
  A.state = buildDemoState()
  A.sessions = buildDemoSessions()
  A.events = buildDemoEvents()
  A.config = buildDemoConfig()
  A.health = buildDemoHealth()
  A.online = true
  A.lastError = null
  demoActive = true
}

export async function refreshState() {
  // 强制演示（?demo=1 / healthos_demo=1）:即便真实代理在线也用 demo（走查/截图用）。
  if (isDemoForced()) {
    if (!demoActive) applyDemo()
    return
  }
  try {
    A.state = await getJson('/state')
    A.online = true
    A.lastError = null
    demoActive = false // 真实代理响应 → 退出 demo,后续 details 拉真实数据
  } catch (err) {
    // 代理不可达:localhost demo 下改用 demo 数据(真实数据永不被覆盖,只走这个空/离线分支)
    if (shouldSeedDemo()) {
      applyDemo()
      return
    }
    A.online = false
    A.lastError = String(err?.message ?? err)
  }
}

export async function refreshDetails() {
  if (demoActive) return // demo 已整体灌好,不用失败的真实请求去和它打架
  if (!A.online) {
    applyNativeAppleHealth()
    return
  }
  try {
    const [sessions, events, config, health] = await Promise.all([
      getJson('/sessions'),
      getJson('/events'),
      getJson('/config'),
      getJson('/health'),
    ])
    A.sessions = sessions.sessions ?? []
    A.events = events.events ?? []
    A.config = config
    A.health = health.days?.length
      ? health.days
      : (nativeAppleHealthDays() ?? [])
  } catch (err) {
    if (!applyNativeAppleHealth()) {
      A.lastError = String(err?.message ?? err)
    }
  }
}

/** HLT-3:把 State Engine 推荐的当日专注窗口(分钟)推给代理;driver 为 null 时清除覆盖 */
export async function pushPolicy(limitMinutes, reason) {
  const body =
    reason == null
      ? { clear: true }
      : { limitSeconds: Math.round(limitMinutes * 60), reason }
  try {
    await fetch(`${AGENT_BASE}/policy`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(1500),
    })
  } finally {
    await refreshState()
  }
}

/** @param {'break'|'pause30'|'pause2h'|'pauseToday'|'resume'} type */
export async function act(type) {
  try {
    await fetch(`${AGENT_BASE}/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type }),
      signal: AbortSignal.timeout(1500),
    })
  } finally {
    await refreshState()
  }
}

/** 挂载期轮询:状态 2s 一次;details 由页面按需刷新 */
export function pollState() {
  // 首帧即填充:localhost demo 下同步灌 demo,后续轮询若发现真实代理会立即覆盖
  // （强制态除外:refreshState 会持续短路回 demo）
  if (shouldSeedDemo() && !A.state) applyDemo()
  applyNativeAppleHealth()
  refreshState()
  // 强制演示时不必轮询真实代理(refreshState 已短路)。
  if (isDemoForced()) return () => {}
  const onNative = () => {
    applyNativeAppleHealth()
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('kenos-apple-health', onNative)
  }
  const id = setInterval(refreshState, 2000)
  return () => {
    clearInterval(id)
    if (typeof window !== 'undefined') {
      window.removeEventListener('kenos-apple-health', onNative)
    }
  }
}
