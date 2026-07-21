import { browser } from '$app/environment'
import { isNative, notify } from '$lib/native.js'
import { isCloudAuthorized } from '$lib/cloud.svelte.js'
import { lifeOsTodayRaw } from '$lib/lifeos.js'
import { S } from '$lib/state.svelte.js'
import { buildBriefText } from '$lib/lifeos.core.js'
import {
  canHostDailyBrief,
  nativeLocalAlertsReady,
  scheduleDailyBriefAlert,
} from '$lib/kenos/nativeLocalAlerts.js'

export { buildBriefText }

/**
 * 主动性:早晨今日简报。
 * - Tauri Mac：osascript display notification
 * - Kenos Continuity：UN 本地通知（kenos_daily_brief）
 * 到了设定时间(默认 08:00)、当天还没送过,就用跨 app 今日快照拼一句摘要。
 * 若那时 app 没开,用户当天首次打开/切回时补送(追赶)。
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

/** Tauri shell or Kenos Continuity can deliver the brief. */
export function dailyBriefDeliveryAvailable() {
  return isNative || canHostDailyBrief()
}

async function deliverBrief(brief) {
  if (await nativeLocalAlertsReady()) {
    const result = await scheduleDailyBriefAlert({
      title: brief.title,
      body: brief.body,
      dayKey: todayStr(),
    })
    return Boolean(result?.ok)
  }
  if (isNative) {
    return notify(brief.title, brief.body)
  }
  return false
}

let running = false

/**
 * 检查并(在满足条件时)送出今日简报。幂等:同一天只送一次。
 * @param {{ force?: boolean }} [opts] force 用于设置页「立即预览」,跳过时间/去重
 * @returns {Promise<'sent'|'skipped'|'no-data'|'disabled'>}
 */
export async function maybeSendDailyBrief(opts = {}) {
  if (!browser || !dailyBriefDeliveryAvailable()) return 'disabled'
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
    const ok = await deliverBrief(brief)
    if (ok && !force) markShown(todayStr())
    return ok ? 'sent' : 'no-data'
  } finally {
    running = false
  }
}

let timer = null

/** 启动运行时轮询(每 5 分钟);重复调用安全。返回停止函数。 */
export function startDailyBriefScheduler() {
  if (!browser || !dailyBriefDeliveryAvailable()) return () => {}
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
