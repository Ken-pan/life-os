// 本地演示数据构建器 —— 形状与 Focus 代理真实端点（/state、/health、/sessions、
// /events、/config）返回值一致，只在 demoMode 判定为「灌 demo」时被 agent 层调用。
// 数据用确定性伪随机生成（固定种子），每次刷新稳定，便于演示与截图。

const DAY = 86400
const HOUR = 3600

/** 确定性伪随机：同一 seed 稳定输出 [0,1)，避免每帧抖动 */
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

function ymd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 近 14 天连续测量数据，结尾为今天；带日间波动 + 温和趋势，喂六维状态与全部趋势图 */
export function buildDemoHealth() {
  const r = rng(20260717)
  const days = 14
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const out = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY * 1000)
    // progress: 0（14 天前）→ 1（今天），让近期略好，趋势可读
    const progress = (days - 1 - i) / (days - 1)
    const wobble = (r() - 0.5) * 2 // [-1,1]
    const sleepHours = clamp(6.5 + progress * 0.9 + wobble * 0.6, 6.2, 8.2)
    const hrv = Math.round(clamp(48 + progress * 12 + wobble * 6, 42, 72))
    const restingHR = Math.round(clamp(58 - progress * 5 + wobble * 2.5, 49, 61))
    const steps = Math.round(clamp(6000 + progress * 3000 + wobble * 2200, 4800, 11200))
    out.push({
      date: ymd(d),
      sleepHours: Number(sleepHours.toFixed(1)),
      restingHR,
      hrv,
      steps,
    })
  }
  return out
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

/** GET /state 快照：正常相、有进行中会话、当日已休息两次 */
export function buildDemoState() {
  const nowSec = Math.floor(Date.now() / 1000)
  const score = 640 // 净专注约 10.7 分钟
  return {
    agent: 'focus',
    version: 'demo',
    phase: 'normal',
    phaseEndsAt: null,
    score,
    limitSeconds: 1200,
    baseLimitSeconds: 1200,
    policyReason: null,
    warnSeconds: 60,
    restSeconds: 300,
    active: true,
    note: '专注中 · 节奏平稳',
    paused: false,
    pausedUntil: null,
    breaksToday: 2,
    session: { start: nowSec - score, netSeconds: score },
    updatedAt: nowSec,
  }
}

/** GET /sessions：近数日约 10 段会话，含多种结束原因 */
export function buildDemoSessions() {
  const r = rng(77123)
  const nowSec = Math.floor(Date.now() / 1000)
  const reasons = ['break', 'break', 'reset', 'pause', 'break', 'sleep']
  const out = []
  // 每天 1–2 段，往前铺 7 天
  let cursor = nowSec - 3 * HOUR
  for (let i = 0; i < 10; i++) {
    const peak = Math.round(600 + r() * 900) // 10–25 分钟
    const start = cursor - peak
    const end = cursor
    out.push({
      start,
      end,
      peakNetSeconds: peak,
      endReason: reasons[i % reasons.length],
    })
    // 往前跳一段间隔（含跨天），保持时间倒序自然
    cursor = start - Math.round((2 + r() * 10) * HOUR)
  }
  return out
}

/** GET /events：约 6 条干预/状态事件 */
export function buildDemoEvents() {
  const nowSec = Math.floor(Date.now() / 1000)
  return [
    { ts: nowSec - 20 * 60, type: 'warn_shown', detail: '接近专注上限' },
    { ts: nowSec - 55 * 60, type: 'break_ended', detail: null },
    { ts: nowSec - 60 * 60, type: 'break_started', detail: '休息 5 分钟' },
    { ts: nowSec - 3 * HOUR, type: 'policy_set', detail: '窗口收紧到 18 分钟' },
    { ts: nowSec - 5 * HOUR, type: 'resumed', detail: null },
    { ts: nowSec - 6 * HOUR, type: 'paused', detail: '暂停 30 分钟' },
  ]
}

/** GET /config：护栏卡片数据 */
export function buildDemoConfig() {
  return {
    limitSeconds: 1200,
    restSeconds: 300,
    warnSeconds: 60,
    drainRatio: 1.0,
    chatSustainedSeconds: 120,
  }
}
