import { S } from './state.svelte.js'
import {
  playTimerChime,
  primeFitnessAudio,
  closeFitnessAudio,
  cancelScheduledCues,
  playTenSecondWarning,
  playCountdownTick,
  previewRestCountdown,
} from './audio.js'
import { sensory } from '@life-os/platform-web/kenos-sensory'
import {
  getNativeCapabilities,
  hasNativeLocalNotifications,
  isNativeBridgeAvailable,
  nativeNotificationsCancel,
  nativeNotificationsGetStatus,
  nativeNotificationsRequestPermission,
  nativeNotificationsSchedule,
} from '@life-os/platform-web/kenos-native-bridge'

/** Stable UN dedupe — only one Training timer is active at a time. */
const NATIVE_TIMER_DEDUPE = 'training-timer-active'

/** @type {{ at: number, ready: boolean, status: string } | null} */
let nativeNotifyCache = null
const NATIVE_NOTIFY_TTL_MS = 8_000

/* ═══════════════ TIMER WIDGET STATE ═══════════════ */
export const timer = $state({
  visible: false,
  showDone: false,
  inline: false,
  name: '组间休息',
  total: 0,
  remain: 0,
  paused: false,
  status: '',
  mode: 'rest',
  context: null,
  readyPulse: false,
})

const TICK_MS = 500

let ticker = null
let hideTimeout = null
let doneShowTimeout = null
let onCompleteCallback = null
let swTimerId = null
/** 计时结束的墙钟时间戳（毫秒）。后台节流后据此重新校准剩余时间 */
let endAt = 0
/** @type {Set<string|number>} */
let playedCues = new Set()

function swController() {
  return navigator.serviceWorker?.controller
}

/** @returns {Promise<boolean>} */
async function nativeLocalNotificationsReady() {
  if (!isNativeBridgeAvailable()) {
    nativeNotifyCache = null
    return false
  }
  const now = Date.now()
  if (nativeNotifyCache && now - nativeNotifyCache.at < NATIVE_NOTIFY_TTL_MS) {
    return nativeNotifyCache.ready
  }
  const caps = await getNativeCapabilities()
  const ready = hasNativeLocalNotifications(caps)
  const status = String(caps?.status?.localNotifications || '')
  nativeNotifyCache = { at: now, ready, status }
  return ready
}

function dayIdFromContext() {
  const ctx = timer.context
  if (ctx && typeof ctx === 'object' && ctx.dayId != null) return String(ctx.dayId)
  try {
    const m = String(location?.pathname || '').match(/\/day\/([^/]+)/)
    return m?.[1] || ''
  } catch {
    return ''
  }
}

async function scheduleNativeTimer() {
  if (!(await nativeLocalNotificationsReady())) return false
  if (!endAt || timer.remain <= 0) return false
  if (S.settings.notifyRest === false) {
    await nativeNotificationsCancel({ deduplicationKey: NATIVE_TIMER_DEDUPE })
    return true
  }
  const { title, body } = notificationPayload()
  const dayId = dayIdFromContext()
  const encodedDay = dayId ? encodeURIComponent(dayId) : ''
  await nativeNotificationsSchedule({
    type: 'training_rest_end',
    safeTitle: title,
    safeBody: body,
    deepLink: encodedDay
      ? `kenos://training?path=/day/${encodedDay}/focus`
      : 'kenos://training',
    deduplicationKey: NATIVE_TIMER_DEDUPE,
    fireAt: endAt,
    fireAtMs: endAt,
    risk: 'R0',
    classification: 'personal',
  })
  return true
}

async function cancelNativeTimer() {
  if (!(await nativeLocalNotificationsReady())) return
  await nativeNotificationsCancel({ deduplicationKey: NATIVE_TIMER_DEDUPE })
}

function scheduleSwTimer() {
  const ctrl = swController()
  if (!ctrl || timer.remain <= 0 || !endAt) return
  swTimerId = `fitos-${Date.now()}`
  ctrl.postMessage({
    type: 'SCHEDULE_TIMER',
    id: swTimerId,
    endAt,
    name: timer.name,
    mode: timer.mode,
    sound: S.settings.sound,
    notify: S.settings.notifyRest !== false,
    countdown: timer.mode === 'rest' && S.settings.sound,
  })
}

function cancelSwTimer() {
  const ctrl = swController()
  if (ctrl && swTimerId) {
    ctrl.postMessage({ type: 'CANCEL_TIMER', id: swTimerId })
  }
  swTimerId = null
}

/** Continuity → native UN; PWA/browser → Service Worker. */
function scheduleBackgroundTimer() {
  void (async () => {
    if (await scheduleNativeTimer()) {
      // Avoid double-fire with SW showNotification in Continuity.
      cancelSwTimer()
      return
    }
    scheduleSwTimer()
  })()
}

function cancelBackgroundTimer() {
  cancelSwTimer()
  void cancelNativeTimer()
}

function finishTimer(fromSw = false) {
  if (timer.status === 'complete') return

  timer.remain = 0
  endAt = 0
  timer.paused = false
  clearTimers()
  cancelBackgroundTimer()
  cancelScheduledCues()
  timer.status = 'complete'
  doneShowTimeout = setTimeout(() => {
    timer.showDone = true
    doneShowTimeout = null
  }, 200)
  void playChime()
  if (!fromSw) notifyRestComplete()
  // Haptics stay on when timer sound is muted (silent switch / settings.sound).
  void sensory('pulse')

  if (onCompleteCallback) {
    onCompleteCallback(timer.context)
    onCompleteCallback = null
  }

  if (timer.inline) {
    hideTimeout = setTimeout(() => {
      hideTimeout = null
      timer.showDone = false
      timer.status = ''
      timer.visible = false
      timer.readyPulse = true
      setTimeout(() => {
        timer.readyPulse = false
      }, 1200)
      void closeFitnessAudio()
    }, 1800)
    return
  }

  hideTimeout = setTimeout(() => {
    timer.visible = false
    hideTimeout = setTimeout(() => {
      hideTimeout = null
      timer.showDone = false
      timer.status = ''
      timer.context = null
      void closeFitnessAudio()
    }, 400)
  }, 2800)
}

function clearTimers() {
  if (ticker) {
    clearInterval(ticker)
    ticker = null
  }
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }
  if (doneShowTimeout) {
    clearTimeout(doneShowTimeout)
    doneShowTimeout = null
  }
}

export function fmtTime(s) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}s`
}

export function progressFrac() {
  return timer.total ? timer.remain / timer.total : 0
}

/** 休息最后 10 秒阶段的进度环（10→6 预警，5→1 倒数） */
export function ringProgressFrac() {
  if (timer.mode !== 'rest' || timer.remain <= 0 || timer.showDone)
    return progressFrac()
  if (timer.remain <= 5) return timer.remain / 5
  if (timer.remain <= 10) return (timer.remain - 5) / 5
  return progressFrac()
}

/** @returns {'normal' | 'warn' | 'countdown' | 'complete'} */
export function restPhase() {
  if (timer.status === 'complete' || timer.showDone) return 'complete'
  if (timer.mode !== 'rest' || timer.remain <= 0) return 'normal'
  if (timer.remain <= 5) return 'countdown'
  if (timer.remain <= 10) return 'warn'
  return 'normal'
}

/**
 * @param {string | number} cue 'warn10' | 5..1
 */
function fireRestCue(cue) {
  if (timer.mode !== 'rest') return
  if (playedCues.has(cue)) return
  playedCues.add(cue)

  if (cue === 'warn10') {
    timer.status = 'urgent'
    if (S.settings.sound) void playTenSecondWarning()
    void sensory('warn')
    return
  }

  if (typeof cue === 'number' && cue >= 1 && cue <= 5) {
    timer.status = 'urgent'
    if (S.settings.sound) void playCountdownTick(cue)
    // 5→2 tick; final second warn — audio still gated by settings.sound.
    void sensory(cue === 1 ? 'warn' : 'tick')
  }
}

function handleRemainCue(remain) {
  // 用 <= 判断而非 ===，后台节流恢复后跳秒也不会漏掉预警
  if (remain <= 10) fireRestCue('warn10')
  if (remain >= 1 && remain <= 5) fireRestCue(remain)
}

function refreshStatus() {
  if (timer.remain <= 10 && timer.remain > 0) timer.status = 'urgent'
  else if (timer.remain > 10) {
    timer.status = ''
  }
}

export function startTimer(secs, name, context = null, options = {}) {
  clearTimers()
  cancelBackgroundTimer()
  cancelScheduledCues()
  playedCues = new Set()
  endAt = Date.now() + secs * 1000
  timer.total = secs
  timer.remain = secs
  timer.paused = false
  timer.name = name || '组间休息'
  timer.status = ''
  timer.mode = options.mode ?? 'rest'
  timer.showDone = false
  timer.readyPulse = false
  timer.context = context
  timer.inline = options.inline ?? false
  timer.visible = true
  onCompleteCallback = options.onComplete ?? null

  if (S.settings.sound) {
    void primeFitnessAudio()
  }

  ticker = setInterval(tick, TICK_MS)
  scheduleBackgroundTimer()
}

/** 按墙钟重算剩余秒数，后台节流/锁屏恢复后依然准确 */
function syncRemain() {
  if (!endAt || timer.status === 'complete') return
  const next = Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
  if (next === timer.remain) return
  timer.remain = next
  if (next <= 0) {
    finishTimer()
    return
  }
  refreshStatus()
  handleRemainCue(next)
}

function tick() {
  if (timer.paused) return
  syncRemain()
}

function notificationPayload() {
  const isWork = timer.mode === 'work'
  return {
    title: isWork ? '动作计时结束' : '休息结束',
    body: isWork
      ? `${timer.name} · 时间到`
      : `${timer.name} · 可以开始下一组了`,
    tag: isWork ? 'fitos-work-timer' : 'fitos-rest-timer',
  }
}

async function notifyRestComplete() {
  if (!S.settings.notifyRest) return
  if (typeof document !== 'undefined' && document.visibilityState === 'visible')
    return
  // Continuity already scheduled a UN local notification for fireAt.
  if (await nativeLocalNotificationsReady()) return

  const { title, body, tag } = notificationPayload()
  const opts = {
    body,
    icon: '/notify-192.png',
    badge: '/notify-192.png',
    tag,
    renotify: true,
    silent: !S.settings.sound,
    vibrate: S.settings.sound ? [120, 60, 120, 60, 120] : undefined,
    timestamp: Date.now(),
    data: { url: '/' },
  }

  try {
    const reg = await navigator.serviceWorker?.ready
    if (reg && Notification.permission === 'granted') {
      await reg.showNotification(title, opts)
      return
    }
  } catch {
    /* 回退到页面 Notification API */
  }

  if (
    typeof Notification !== 'undefined' &&
    Notification.permission === 'granted'
  ) {
    new Notification(title, { body, tag, silent: !S.settings.sound })
  }
}

export async function requestNotifyPermission() {
  if (await nativeLocalNotificationsReady()) {
    const result = await nativeNotificationsRequestPermission()
    const status = String(result?.status || '')
    nativeNotifyCache = {
      at: Date.now(),
      ready: true,
      status: status || 'denied',
    }
    return status === 'authorized' || status === 'granted'
  }
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

export function notificationStatus() {
  return notificationCapability().kind
}

/**
 * 区分「真不支持」与「iPhone 未加主屏幕 / 微信内置浏览器」等可恢复场景。
 * Continuity（Kenos shell）走 native local notifications。
 * @returns {{ kind: 'granted' | 'denied' | 'default' | 'unsupported' | 'ios-browser' | 'in-app', channel?: 'native' | 'web' }}
 */
export function notificationCapability() {
  // Continuity probe first (also lets unit tests mock the bridge without a DOM).
  if (isNativeBridgeAvailable()) {
    const status = nativeNotifyCache?.status
    if (status === 'authorized' || status === 'granted') {
      return { kind: 'granted', channel: 'native' }
    }
    if (status === 'denied') return { kind: 'denied', channel: 'native' }
    return { kind: 'default', channel: 'native' }
  }

  if (typeof window === 'undefined') return { kind: 'unsupported' }

  const ua = navigator.userAgent || ''
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    /** @type {{ standalone?: boolean }} */ (navigator).standalone === true
  const inApp =
    /MicroMessenger|QQ\/|WeiBo|AlipayClient|DingTalk|bytedance|Aweme/i.test(ua)

  const hasNotification = typeof Notification !== 'undefined'
  const hasSW = 'serviceWorker' in navigator

  if (inApp) return { kind: 'in-app', channel: 'web' }
  if (!hasNotification || !hasSW) {
    if (isIOS && !isStandalone) return { kind: 'ios-browser', channel: 'web' }
    return { kind: 'unsupported', channel: 'web' }
  }

  return {
    kind: /** @type {'granted'|'denied'|'default'} */ (Notification.permission),
    channel: 'web',
  }
}

/** Probe native auth status for Settings UI (safe outside Continuity). */
export async function refreshNotificationCapability() {
  if (!isNativeBridgeAvailable()) {
    nativeNotifyCache = null
    return notificationCapability()
  }
  const caps = await getNativeCapabilities()
  if (!hasNativeLocalNotifications(caps)) {
    nativeNotifyCache = { at: Date.now(), ready: false, status: 'unsupported' }
    return notificationCapability()
  }
  let status = String(caps?.status?.localNotifications || '')
  if (!status || status === 'pending') {
    const st = await nativeNotificationsGetStatus()
    status = String(st?.status || 'not_determined')
  }
  nativeNotifyCache = { at: Date.now(), ready: true, status }
  return notificationCapability()
}

/** @internal */
export function __resetNativeNotifyCacheForTests() {
  nativeNotifyCache = null
}

/** Settings toggle: drop or reschedule background alert for the active timer. */
export function applyNotifyRestSetting(enabled) {
  if (!enabled) {
    cancelBackgroundTimer()
    return
  }
  if (timer.visible && !timer.paused && timer.status !== 'complete' && endAt) {
    scheduleBackgroundTimer()
  }
}

export function cancelTimer() {
  clearTimers()
  cancelBackgroundTimer()
  cancelScheduledCues()
  void closeFitnessAudio()
  playedCues = new Set()
  onCompleteCallback = null
  endAt = 0
  timer.remain = 0
  timer.total = 0
  timer.paused = false
  timer.readyPulse = false
  timer.visible = false
  timer.inline = false
  timer.mode = 'rest'
  timer.context = null
  hideTimeout = setTimeout(() => {
    hideTimeout = null
    timer.showDone = false
    timer.status = ''
  }, 400)
}

/**
 * 提前结束休息/计时：走与自然结束相同的完成仪式（done → readyPulse），
 * 不同于 cancelTimer 的静默关闭。
 */
export function skipTimer() {
  if (!timer.visible || timer.status === 'complete') return
  finishTimer(false)
}

/** 无休息时长时仍给 CTA 一次就绪脉冲 */
export function signalReady() {
  timer.readyPulse = true
  setTimeout(() => {
    timer.readyPulse = false
  }, 1200)
}

export function pauseTimer() {
  if (!timer.visible || timer.paused || timer.status === 'complete') return
  timer.paused = true
  cancelBackgroundTimer()
  cancelScheduledCues()
}

export function resumeTimer() {
  if (!timer.visible || !timer.paused || timer.status === 'complete') return
  endAt = Date.now() + Math.max(0, timer.remain) * 1000
  timer.paused = false
  refreshStatus()
  if (timer.remain <= 0) {
    finishTimer(false)
    return
  }
  scheduleBackgroundTimer()
}

export function togglePause() {
  if (timer.paused) resumeTimer()
  else pauseTimer()
}

function reanchorEndAt() {
  endAt = Date.now() + Math.max(0, timer.remain) * 1000
}

export function addTime(delta) {
  if (timer.status === 'complete' || !timer.visible) return
  const secs = Math.max(0, Number(delta) || 0)
  if (!secs) return
  timer.remain += secs
  timer.total = Math.max(timer.total, timer.remain)
  playedCues = new Set()
  refreshStatus()
  handleRemainCue(timer.remain)
  if (timer.paused) return
  reanchorEndAt()
  scheduleBackgroundTimer()
}

export function subTime(delta) {
  if (timer.status === 'complete' || !timer.visible) return
  const secs = Math.max(0, Number(delta) || 0)
  if (!secs) return
  timer.remain = Math.max(1, timer.remain - secs)
  if (timer.remain > timer.total) timer.total = timer.remain
  playedCues = new Set()
  refreshStatus()
  handleRemainCue(timer.remain)
  if (timer.paused) return
  reanchorEndAt()
  scheduleBackgroundTimer()
}

/** 初始化 SW 消息监听与前台校准（layout onMount 调用） */
export function initTimer() {
  if (typeof navigator === 'undefined') return () => {}

  // 回到前台立即按墙钟校准，不等下一个 tick
  const onVisible = () => {
    if (
      document.visibilityState === 'visible' &&
      timer.visible &&
      !timer.paused
    ) {
      syncRemain()
    }
  }
  document.addEventListener('visibilitychange', onVisible)

  if (!navigator.serviceWorker) {
    return () => document.removeEventListener('visibilitychange', onVisible)
  }

  const onMessage = (event) => {
    const data = event.data || {}
    if (data.id !== swTimerId) return

    if (data.type === 'TIMER_CUE' && timer.visible) {
      fireRestCue(data.cue)
      return
    }

    if (data.type === 'TIMER_DONE' && timer.visible && !timer.paused) {
      finishTimer(true)
    }
  }

  navigator.serviceWorker.addEventListener('message', onMessage)
  return () => {
    document.removeEventListener('visibilitychange', onVisible)
    navigator.serviceWorker.removeEventListener('message', onMessage)
  }
}

async function playChime() {
  if (!S.settings.sound) {
    await closeFitnessAudio()
    return
  }
  await playTimerChime(timer.mode === 'work' ? 'work' : 'rest')
}

/** 设置页试听提示音 */
export async function previewTimerChime() {
  await primeFitnessAudio()
  await previewRestCountdown()
}
