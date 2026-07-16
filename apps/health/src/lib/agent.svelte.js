/**
 * HealthOS Focus 代理客户端。
 * 代理是本地 launchd 常驻进程(apps/health/agent),在 127.0.0.1:5193 暴露只读状态
 * 与最小动作端点;网页/Tauri 壳只消费结果,不承载检测逻辑(Detection ≠ UI)。
 */
export const AGENT_BASE = 'http://127.0.0.1:5193'

export const A = $state({
  online: false,
  /** GET /state 的最新快照,离线时保留上一份用于展示 */
  state: null,
  sessions: [],
  events: [],
  config: null,
  lastError: null,
})

async function getJson(path) {
  const res = await fetch(`${AGENT_BASE}${path}`, { signal: AbortSignal.timeout(1500) })
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`)
  return res.json()
}

export async function refreshState() {
  try {
    A.state = await getJson('/state')
    A.online = true
    A.lastError = null
  } catch (err) {
    A.online = false
    A.lastError = String(err?.message ?? err)
  }
}

export async function refreshDetails() {
  if (!A.online) return
  try {
    const [sessions, events, config] = await Promise.all([
      getJson('/sessions'),
      getJson('/events'),
      getJson('/config'),
    ])
    A.sessions = sessions.sessions ?? []
    A.events = events.events ?? []
    A.config = config
  } catch (err) {
    A.lastError = String(err?.message ?? err)
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
  refreshState()
  const id = setInterval(refreshState, 2000)
  return () => clearInterval(id)
}
