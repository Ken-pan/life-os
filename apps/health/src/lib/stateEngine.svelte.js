/**
 * State Engine 的观察数据层(Raw observations):
 * 手动 check-in / 睡眠记录,本地优先持久化(localStorage,append-only,留最近 500 条)。
 * 推导(Interpretation)在 stateEngine.core.js,页面把 OBS + Focus 代理快照喂给 deriveState。
 */
import { browser } from '$app/environment'

const KEY = 'healthos_observations_v1'

function load() {
  if (!browser) return []
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const OBS = $state({ list: load() })

function persist() {
  if (!browser) return
  try {
    localStorage.setItem(KEY, JSON.stringify(OBS.list.slice(-500)))
  } catch {
    // 存储满/隐私模式:忽略,内存态仍可用
  }
}

/** 记录一次主观状态 @param {{energy: number, stress: number}} v */
export function logCheckin(v) {
  OBS.list = [...OBS.list, { ts: Date.now(), type: 'checkin', energy: v.energy, stress: v.stress }]
  persist()
}

/** 记录昨晚睡眠时长(小时) */
export function logSleep(hours) {
  OBS.list = [...OBS.list, { ts: Date.now(), type: 'sleep', hours }]
  persist()
}
