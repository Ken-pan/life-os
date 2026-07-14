import { browser } from '$app/environment'
import { isNative, notify } from '$lib/native.js'
import { isCloudAuthorized } from '$lib/cloud.svelte.js'
import { lifeOsTodayRaw } from '$lib/lifeos.js'
import { S } from '$lib/state.svelte.js'

/**
 * 主动性:早晨今日简报。
 * app 开着时定时/追让式送一条 macOS 原生通知 —— 到了设定时间(默认 08:00)、
 * 当天还没送过,就用跨 app 今日快照拼一句摘要推给用户。若那时 app 没开,
 * 用户当天首次打开/切回 AIOS 时补送(追让)。纯 JS,不碰 Rust。
 *
 * 触发点(见 +layout):挂载时、窗口重新可见/聚焦时、以及运行时每 5 分钟一次。
 */

const STATE_KEY = 'aios_daily_brief_v1'

function todayStr() {
  return new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD(本地时区)
}

/** 当前是否已过设定时间(HH:MM) */
function pastBriefTime(time) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time || '08:00')
  if (!m) return true
  const now = new Date()
  const mins = now.getHours() * 60 + now.getMinutes()
  return mins >= Number(m[1]) * 60 + Number(m[2])
}

function lastShownDate() {
  if (!browser) return ''
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) || '{}')?.lastShownDate || ''
  } catch {
    return ''
  }
}

function markShown(date) {
  if (!browser) return
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({ lastShownDate: date }))
  } catch {
    /* 存不下不影响本次 */
  }
}

/** 把今日快照拼成一句摘要(标题 + 正文),无有效数据返回 null */
export function buildBriefText(data) {
  if (!data) return null
  const bits = []
  if (data.planner) {
    const { todayOpen = 0, overdue = 0 } = data.planner
    if (todayOpen || overdue) {
      bits.push(
        `${todayOpen} 项今日待办` + (overdue ? `、${overdue} 项逾期` : ''),
      )
    } else {
      bits.push('今天暂无到期待办')
    }
  }
  if (data.finance) {
    bits.push(`本月支出 ¥${data.finance.monthExpense ?? 0}`)
  }
  if (data.fitness) {
    bits.push(data.fitness.workedOutToday ? '今天已训练' : '今天还没训练')
  }
  if (!bits.length) return null
  const now = new Date()
  const title = `今日简报 · ${now.getMonth() + 1}月${now.getDate()}日`
  return { title, body: bits.join(' · ') }
}

let running = false

/**
 * 检查并(在满足条件时)送出今日简报。幂等:同一天只送一次。
 * @param {{ force?: boolean }} [opts] force 用于设置页「立即预览」,跳过时间/去重
 * @returns {Promise<'sent'|'skipped'|'no-data'|'disabled'>}
 */
export async function maybeSendDailyBrief(opts = {}) {
  if (!browser || !isNative) return 'disabled'
  const force = opts.force === true
  const cfg = S.settings.dailyBrief
  if (!force) {
    if (!cfg?.enabled) return 'disabled'
    if (!isCloudAuthorized()) return 'disabled'
    if (!pastBriefTime(cfg.time)) return 'skipped'
    if (lastShownDate() === todayStr()) return 'skipped'
  }
  if (running) return 'skipped'
  running = true
  try {
    const data = await lifeOsTodayRaw()
    const brief = buildBriefText(data)
    if (!brief) return 'no-data'
    const ok = await notify(brief.title, brief.body)
    if (ok && !force) markShown(todayStr())
    return ok ? 'sent' : 'no-data'
  } finally {
    running = false
  }
}

let timer = null

/** 启动运行时轮询(每 5 分钟);重复调用安全。返回停止函数。 */
export function startDailyBriefScheduler() {
  if (!browser || !isNative) return () => {}
  maybeSendDailyBrief()
  if (timer) return () => stopDailyBriefScheduler()
  timer = setInterval(() => {
    maybeSendDailyBrief()
  }, 5 * 60 * 1000)
  return () => stopDailyBriefScheduler()
}

export function stopDailyBriefScheduler() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
